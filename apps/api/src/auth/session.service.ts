import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateOpaqueToken, sha256 } from './crypto';

export interface IssuedTokens {
  sessionId: string;
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  role: 'USER' | 'ADMIN';
}

interface ClientInfo {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

/**
 * Session & token lifecycle.
 *  - Access token: short-lived HS256 JWT bound to a session id.
 *  - Refresh token: opaque, single-use, stored hashed; rotated on every refresh.
 *  - Reuse of an already-rotated refresh token revokes the whole token family
 *    (stolen-token detection, OAuth 2.0 Security BCP §4.14).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  async createSession(
    user: { id: string; role: 'USER' | 'ADMIN' },
    client: ClientInfo,
    familyId: string = randomUUID(),
  ): Promise<IssuedTokens> {
    const refreshToken = generateOpaqueToken();
    const refreshExpiresAt = new Date(
      Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS') * 86_400_000,
    );
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: client.userAgent?.slice(0, 255) ?? null,
        ipAddress: client.ipAddress ?? null,
      },
    });
    return { sessionId: session.id, refreshToken, refreshExpiresAt, ...this.signAccess(user, session.id) };
  }

  signAccess(user: { id: string; role: 'USER' | 'ADMIN' }, sessionId: string) {
    const ttl = this.config.get('JWT_ACCESS_TTL_SECONDS');
    const payload: AccessTokenPayload = { sub: user.id, sid: sessionId, role: user.role };
    return {
      accessToken: this.jwt.sign(payload, { expiresIn: ttl }),
      accessExpiresAt: new Date(Date.now() + ttl * 1000),
    };
  }

  async rotate(refreshToken: string, client: ClientInfo): Promise<IssuedTokens> {
    const existing = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { select: { id: true, role: true } } },
    });
    if (!existing) throw new UnauthorizedException('Invalid session');

    if (existing.revokedAt) {
      // A rotated (or logged-out) token was presented again: assume theft.
      await this.prisma.session.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record({
        action: 'auth.refresh_reuse_detected',
        userId: existing.userId,
        ipAddress: client.ipAddress,
        entityType: 'Session',
        entityId: existing.id,
      });
      throw new UnauthorizedException('Session expired, please sign in again');
    }
    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expired, please sign in again');
    }

    return this.prisma.$transaction(async (tx) => {
      // Conditional update guards against two concurrent refreshes both succeeding.
      const revoked = await tx.session.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date(), lastUsedAt: new Date() },
      });
      if (revoked.count !== 1) throw new UnauthorizedException('Session already rotated');

      const nextToken = generateOpaqueToken();
      const next = await tx.session.create({
        data: {
          userId: existing.userId,
          familyId: existing.familyId,
          tokenHash: sha256(nextToken),
          // Absolute lifetime is preserved across rotations (no infinite sliding).
          expiresAt: existing.expiresAt,
          userAgent: client.userAgent?.slice(0, 255) ?? existing.userAgent,
          ipAddress: client.ipAddress ?? existing.ipAddress,
        },
      });
      await tx.session.update({ where: { id: existing.id }, data: { replacedById: next.id } });
      return {
        sessionId: next.id,
        refreshToken: nextToken,
        refreshExpiresAt: next.expiresAt,
        ...this.signAccess(existing.user, next.id),
      };
    });
  }

  /** True when the session behind an access token is still active. */
  async isActive(sessionId: string, userId: string): Promise<boolean> {
    const s = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true, revokedAt: true, expiresAt: true },
    });
    return !!s && s.userId === userId && !s.revokedAt && s.expiresAt.getTime() > Date.now();
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeByRefreshToken(refreshToken: string): Promise<string | null> {
    const s = await this.prisma.session.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!s) return null;
    await this.revoke(s.id);
    return s.userId;
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }
}
