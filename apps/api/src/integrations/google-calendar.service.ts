/**
 * Google Calendar: OAuth 2.0 authorization-code flow with PKCE, encrypted
 * credentials, incremental import (sync tokens) and export of LifeOS events.
 *
 * Imported events are FIXED and read-only in spirit: the planner never moves
 * them. Events created in LifeOS are pushed to Google tagged with their LifeOS
 * id, and skipped on import so nothing is duplicated.
 */
import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { type Prisma } from '@lifeos/database';
import { type IntegrationStatusDto } from '@lifeos/shared';
import { CryptoBox } from '../common/crypto-box';
import { userTimezone } from '../common/module-helpers';
import { AppConfig } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];
export const OAUTH_COOKIE = 'lifeos_oauth';
const STATE_TTL_MS = 10 * 60_000;

interface Credentials {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
}

interface GoogleEvent {
  id: string;
  status?: string;
  etag?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

const b64url = (b: Buffer) => b.toString('base64url');

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  /** Injected in tests to stand in for Google's HTTP API. */
  fetchImpl: typeof fetch = fetch;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  private unavailableReason(): string | null {
    if (!this.config.get('GOOGLE_CLIENT_ID') || !this.config.get('GOOGLE_CLIENT_SECRET') || !this.config.get('GOOGLE_REDIRECT_URI')) {
      return 'Google OAuth client is not configured on this server (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI).';
    }
    if (!this.config.get('INTEGRATION_ENCRYPTION_KEY')) return 'INTEGRATION_ENCRYPTION_KEY is not set, so credentials cannot be stored safely.';
    return null;
  }

  private box() {
    return new CryptoBox(this.config.get('INTEGRATION_ENCRYPTION_KEY'));
  }

  private requireAvailable() {
    const reason = this.unavailableReason();
    if (reason) throw new ServiceUnavailableException({ statusCode: 503, error: 'Service Unavailable', code: 'INTEGRATION_NOT_CONFIGURED', message: reason });
  }

  async status(userId: string): Promise<IntegrationStatusDto> {
    const reason = this.unavailableReason();
    const row = await this.prisma.integration.findFirst({
      where: { userId, provider: 'GOOGLE_CALENDAR' },
      include: { syncLogs: { orderBy: { startedAt: 'desc' }, take: 1 } },
    });
    const log = row?.syncLogs[0];
    return {
      provider: 'GOOGLE_CALENDAR',
      available: !reason,
      unavailableReason: reason,
      connected: row?.status === 'CONNECTED',
      account: row?.externalAccountId ?? null,
      status: row?.status ?? null,
      lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
      lastSync: log
        ? { status: log.status, itemsProcessed: log.itemsProcessed, itemsFailed: log.itemsFailed, errorMessage: log.errorMessage, finishedAt: log.finishedAt?.toISOString() ?? null }
        : null,
    };
  }

  // ─── OAuth ────────────────────────────────────────────────────────────

  private sign(value: string) {
    return createHmac('sha256', this.config.get('JWT_ACCESS_SECRET')).update(value).digest('base64url');
  }

  /** Authorization URL plus the signed, httpOnly cookie value that binds the flow to this user. */
  connect(userId: string): { url: string; cookie: string } {
    this.requireAvailable();
    const state = b64url(randomBytes(24));
    const verifier = b64url(randomBytes(48));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    const payload = `${userId}.${state}.${verifier}.${Date.now() + STATE_TTL_MS}`;
    const url = new URL(AUTH_URL);
    url.search = new URLSearchParams({
      client_id: this.config.get('GOOGLE_CLIENT_ID'),
      redirect_uri: this.config.get('GOOGLE_REDIRECT_URI'),
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    return { url: url.toString(), cookie: `${payload}.${this.sign(payload)}` };
  }

  private async tokenRequest(params: Record<string, string>) {
    const res = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.get('GOOGLE_CLIENT_ID'),
        client_secret: this.config.get('GOOGLE_CLIENT_SECRET'),
        ...params,
      }).toString(),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; scope?: string; error?: string };
    if (!res.ok || !body.access_token) throw new BadRequestException(`Google refused the authorization (${body.error ?? res.status}).`);
    return body;
  }

  async callback(userId: string, code: string, state: string, cookie: string | undefined) {
    this.requireAvailable();
    const parts = (cookie ?? '').split('.');
    const sig = parts.pop() ?? '';
    const payload = parts.join('.');
    const [cookieUser, cookieState, verifier, expires] = parts;
    const expected = this.sign(payload);
    const valid =
      sig.length === expected.length &&
      timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) &&
      cookieUser === userId &&
      cookieState === state &&
      Number(expires) > Date.now();
    if (!valid || !verifier) throw new BadRequestException('This connection link is invalid or expired. Start again from Settings.');

    const tokens = await this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: this.config.get('GOOGLE_REDIRECT_URI'), code_verifier: verifier });
    if (!tokens.refresh_token) throw new BadRequestException('Google did not return offline access. Remove LifeOS from your Google account permissions and try again.');
    let account: string | null = null;
    if (tokens.id_token) {
      // Received directly from Google's token endpoint over TLS; only the email claim is read.
      try {
        account = (JSON.parse(Buffer.from(tokens.id_token.split('.')[1] ?? '', 'base64url').toString()) as { email?: string }).email ?? null;
      } catch {
        account = null;
      }
    }
    const creds: Credentials = { refreshToken: tokens.refresh_token, accessToken: tokens.access_token!, expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000 };
    const encryptedCredentials = this.box().encrypt(JSON.stringify(creds), userId);
    const existing = await this.prisma.integration.findFirst({ where: { userId, provider: 'GOOGLE_CALENDAR' } });
    const data = { status: 'CONNECTED' as const, externalAccountId: account, encryptedCredentials, scopes: tokens.scope ?? SCOPES.join(' '), syncCursor: null };
    const integration = existing
      ? await this.prisma.integration.update({ where: { id: existing.id }, data })
      : await this.prisma.integration.create({ data: { userId, provider: 'GOOGLE_CALENDAR', ...data } });
    return integration.id;
  }

  private async accessToken(integration: { id: string; userId: string; encryptedCredentials: string | null }) {
    if (!integration.encryptedCredentials) throw new BadRequestException('Google Calendar is not connected.');
    const creds = JSON.parse(this.box().decrypt(integration.encryptedCredentials, integration.userId)) as Credentials;
    if (creds.expiresAt - 60_000 > Date.now()) return creds.accessToken;
    const fresh = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: creds.refreshToken });
    const next: Credentials = { ...creds, accessToken: fresh.access_token!, expiresAt: Date.now() + (fresh.expires_in ?? 3600) * 1000 };
    await this.prisma.integration.update({ where: { id: integration.id }, data: { encryptedCredentials: this.box().encrypt(JSON.stringify(next), integration.userId) } });
    return next.accessToken;
  }

  private async api<T>(token: string, url: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
    const res = await this.fetchImpl(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
    const body = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, body };
  }

  // ─── Sync ─────────────────────────────────────────────────────────────

  async sync(userId: string) {
    const integration = await this.prisma.integration.findFirst({ where: { userId, provider: 'GOOGLE_CALENDAR', status: { in: ['CONNECTED', 'ERROR'] } } });
    if (!integration) throw new NotFoundException('Google Calendar is not connected.');
    const log = await this.prisma.syncLog.create({ data: { integrationId: integration.id, direction: 'BIDIRECTIONAL' } });
    let processed = 0;
    let failed = 0;
    try {
      const token = await this.accessToken(integration);
      const { timezone } = await userTimezone(this.prisma, userId);

      // Import (incremental when we have a sync token; a 410 means start over).
      let cursor = integration.syncCursor;
      let pageToken: string | undefined;
      let nextSync: string | undefined;
      for (let page = 0; page < 20; page++) {
        const params = new URLSearchParams({ singleEvents: 'true', maxResults: '250', showDeleted: 'true' });
        if (cursor) params.set('syncToken', cursor);
        else {
          params.set('timeMin', new Date(Date.now() - 7 * 86_400_000).toISOString());
          params.set('timeMax', new Date(Date.now() + 90 * 86_400_000).toISOString());
        }
        if (pageToken) params.set('pageToken', pageToken);
        const res = await this.api<{ items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }>(token, `${API}?${params}`);
        if (res.status === 410 && cursor) {
          cursor = null;
          pageToken = undefined;
          continue;
        }
        if (res.status !== 200) throw new Error(`Google Calendar answered ${res.status}`);
        for (const item of res.body.items ?? []) {
          try {
            processed += await this.importOne(userId, integration.id, timezone, item);
          } catch {
            failed++;
          }
        }
        pageToken = res.body.nextPageToken;
        nextSync = res.body.nextSyncToken ?? nextSync;
        if (!pageToken) break;
      }

      // Export LifeOS-created, non-recurring upcoming events not yet in Google.
      const toExport = await this.prisma.calendarEvent.findMany({
        where: { userId, integrationId: null, source: { in: ['MANUAL', 'AI'] }, recurrenceRule: null, endAt: { gt: new Date() }, startAt: { lt: new Date(Date.now() + 90 * 86_400_000) } },
        take: 100,
      });
      for (const e of toExport) {
        const res = await this.api<{ id?: string; etag?: string }>(token, API, {
          method: 'POST',
          body: JSON.stringify({
            summary: e.title,
            description: e.description ?? undefined,
            location: e.location ?? undefined,
            start: e.allDay ? { date: e.startAt.toISOString().slice(0, 10) } : { dateTime: e.startAt.toISOString() },
            end: e.allDay ? { date: e.endAt.toISOString().slice(0, 10) } : { dateTime: e.endAt.toISOString() },
            extendedProperties: { private: { lifeosId: e.id } },
          }),
        });
        if (res.status === 200 && res.body.id) {
          await this.prisma.calendarEvent.update({ where: { id: e.id }, data: { integrationId: integration.id, externalId: res.body.id, externalEtag: res.body.etag ?? null } });
          processed++;
        } else failed++;
      }

      await this.prisma.integration.update({ where: { id: integration.id }, data: { syncCursor: nextSync ?? integration.syncCursor, lastSyncedAt: new Date(), status: 'CONNECTED' } });
      await this.prisma.syncLog.update({ where: { id: log.id }, data: { status: failed ? 'PARTIAL' : 'SUCCESS', itemsProcessed: processed, itemsFailed: failed, finishedAt: new Date() } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      this.logger.warn(`Google sync failed for integration ${integration.id}: ${message}`);
      await this.prisma.integration.update({ where: { id: integration.id }, data: { status: 'ERROR' } });
      await this.prisma.syncLog.update({ where: { id: log.id }, data: { status: 'FAILED', itemsProcessed: processed, itemsFailed: failed, errorMessage: message.slice(0, 1000), finishedAt: new Date() } });
    }
    return this.status(userId);
  }

  /** Applies one Google event locally. Returns 1 if something changed. */
  private async importOne(userId: string, integrationId: string, timezone: string, item: GoogleEvent): Promise<number> {
    if (item.extendedProperties?.private?.lifeosId) return 0; // our own export
    const key = { integrationId_externalId: { integrationId, externalId: item.id } };
    if (item.status === 'cancelled') {
      const { count } = await this.prisma.calendarEvent.deleteMany({ where: { userId, integrationId, externalId: item.id, source: 'EXTERNAL' } });
      return count;
    }
    const allDay = !!item.start?.date && !item.start.dateTime;
    const start = allDay ? new Date(`${item.start!.date}T00:00:00Z`) : new Date(item.start?.dateTime ?? '');
    const end = allDay ? new Date(`${item.end?.date}T00:00:00Z`) : new Date(item.end?.dateTime ?? '');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
    const data: Prisma.CalendarEventUncheckedUpdateInput = {
      title: (item.summary ?? '(No title)').slice(0, 300),
      description: item.description ?? null,
      location: item.location?.slice(0, 300) ?? null,
      startAt: start,
      endAt: end,
      allDay,
      externalEtag: item.etag ?? null,
    };
    const existing = await this.prisma.calendarEvent.findUnique({ where: key, select: { userId: true, externalEtag: true } });
    if (existing && existing.userId !== userId) return 0;
    if (existing?.externalEtag && existing.externalEtag === item.etag) return 0;
    await this.prisma.calendarEvent.upsert({
      where: key,
      update: { ...data, version: { increment: 1 } },
      create: { ...(data as Prisma.CalendarEventUncheckedCreateInput), userId, integrationId, externalId: item.id, source: 'EXTERNAL', flexibility: 'FIXED', timezone },
    });
    return 1;
  }

  async disconnect(userId: string) {
    const integration = await this.prisma.integration.findFirst({ where: { userId, provider: 'GOOGLE_CALENDAR' } });
    if (!integration) throw new NotFoundException('Google Calendar is not connected.');
    if (integration.encryptedCredentials && !this.unavailableReason()) {
      try {
        const creds = JSON.parse(this.box().decrypt(integration.encryptedCredentials, userId)) as Credentials;
        await this.fetchImpl(`${REVOKE_URL}?token=${encodeURIComponent(creds.refreshToken)}`, { method: 'POST' });
      } catch {
        /* revocation is best effort; local credentials are deleted regardless */
      }
    }
    await this.prisma.$transaction([
      this.prisma.calendarEvent.deleteMany({ where: { userId, integrationId: integration.id, source: 'EXTERNAL' } }),
      this.prisma.calendarEvent.updateMany({ where: { userId, integrationId: integration.id }, data: { integrationId: null, externalId: null, externalEtag: null } }),
      this.prisma.integration.delete({ where: { id: integration.id } }),
    ]);
  }

  /** Worker entry point. */
  async syncAll() {
    const rows = await this.prisma.integration.findMany({ where: { provider: 'GOOGLE_CALENDAR', status: 'CONNECTED' }, select: { userId: true } });
    for (const r of rows) await this.sync(r.userId);
    return rows.length;
  }
}
