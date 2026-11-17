import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { type TokenPurpose } from '@lifeos/database';
import { DEFAULT_CATEGORIES, DEFAULT_TIMEZONE } from '@lifeos/shared';
import {
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@lifeos/validation';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicUser } from '../users/user.serializer';
import {
  dummyPasswordHash,
  generateOpaqueToken,
  hashPassword,
  sha256,
  verifyPassword,
} from './crypto';
import { type IssuedTokens, SessionService } from './session.service';

const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  EMAIL_VERIFICATION: 24 * 3_600_000,
  PASSWORD_RESET: 30 * 60_000,
};

interface ClientInfo {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async register(input: RegisterInput, client: ClientInfo) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          preferences: {
            create: {
              timezone: input.timezone ?? DEFAULT_TIMEZONE,
              locale: input.locale ?? 'en',
              workDays: [1, 2, 3, 4, 5],
            },
          },
          categories: {
            create: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sortOrder: i })),
          },
        },
      });
      return created;
    });

    await this.sendVerificationEmail(user.id, user.email);
    await this.audit.record({ action: 'auth.register', userId: user.id, ipAddress: client.ipAddress });
    const tokens = await this.sessions.createSession(user, client);
    return { user: toPublicUser(user), tokens };
  }

  async login(input: LoginInput, client: ClientInfo) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Always run Argon2 so response time doesn't reveal whether the email exists.
    const valid = await verifyPassword(user?.passwordHash ?? (await dummyPasswordHash()), input.password);
    if (!user || !valid) {
      await this.audit.record({
        action: 'auth.login_failed',
        userId: user?.id ?? null,
        ipAddress: client.ipAddress,
      });
      throw new UnauthorizedException('Incorrect email or password');
    }
    const tokens = await this.sessions.createSession(user, client);
    await this.audit.record({ action: 'auth.login', userId: user.id, ipAddress: client.ipAddress });
    return { user: toPublicUser(user), tokens };
  }

  async refresh(refreshToken: string, client: ClientInfo) {
    const tokens = await this.sessions.rotate(refreshToken, client);
    const session = await this.prisma.session.findUniqueOrThrow({
      where: { id: tokens.sessionId },
      include: { user: true },
    });
    return { user: toPublicUser(session.user), tokens };
  }

  async logout(sessionId: string | undefined, refreshToken: string | undefined, ip?: string) {
    let userId: string | null = null;
    if (refreshToken) userId = await this.sessions.revokeByRefreshToken(refreshToken);
    if (sessionId) await this.sessions.revoke(sessionId);
    if (userId) await this.audit.record({ action: 'auth.logout', userId, ipAddress: ip });
  }

  async sendVerificationEmail(userId: string, email: string) {
    const token = await this.issueToken(userId, 'EMAIL_VERIFICATION');
    await this.mail.send({
      to: email,
      subject: 'Confirm your LifeOS email',
      text: `Welcome to LifeOS.\n\nConfirm your email address:\n${this.mail.webUrl(
        `/verify-email?token=${token}`,
      )}\n\nThis link expires in 24 hours.`,
    });
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return;
    await this.sendVerificationEmail(user.id, user.email);
  }

  async verifyEmail(token: string) {
    const record = await this.consumeToken(token, 'EMAIL_VERIFICATION');
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    });
    await this.audit.record({ action: 'auth.email_verified', userId: record.userId });
  }

  /** Always resolves the same way, whether or not the email exists (no account enumeration). */
  async forgotPassword(email: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      this.logger.debug('Password reset requested for unknown email');
      return;
    }
    const token = await this.issueToken(user.id, 'PASSWORD_RESET');
    await this.mail.send({
      to: user.email,
      subject: 'Reset your LifeOS password',
      text: `Someone asked to reset your LifeOS password. If it was you, open:\n${this.mail.webUrl(
        `/reset-password?token=${token}`,
      )}\n\nThis link expires in 30 minutes. If you didn't ask, you can ignore this email.`,
    });
    await this.audit.record({
      action: 'auth.password_reset_requested',
      userId: user.id,
      ipAddress: ip,
    });
  }

  async resetPassword(input: ResetPasswordInput, ip?: string) {
    const record = await this.consumeToken(input.token, 'PASSWORD_RESET');
    const passwordHash = await hashPassword(input.password);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      // A reset proves inbox control: sign out every existing session.
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.verificationToken.updateMany({
        where: { userId: record.userId, purpose: 'PASSWORD_RESET', consumedAt: null },
        data: { consumedAt: new Date() },
      }),
    ]);
    await this.audit.record({ action: 'auth.password_reset', userId: record.userId, ipAddress: ip });
  }

  private async issueToken(userId: string, purpose: TokenPurpose): Promise<string> {
    const token = generateOpaqueToken();
    await this.prisma.$transaction([
      // Only the most recent token of a given purpose stays valid.
      this.prisma.verificationToken.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.verificationToken.create({
        data: {
          userId,
          purpose,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]),
        },
      }),
    ]);
    return token;
  }

  private async consumeToken(token: string, purpose: TokenPurpose) {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (
      !record ||
      record.purpose !== purpose ||
      record.consumedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('This link is invalid or has expired');
    }
    // Conditional update makes the token strictly single-use under concurrency.
    const { count } = await this.prisma.verificationToken.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (count !== 1) throw new UnauthorizedException('This link is invalid or has expired');
    return record;
  }
}

export type { IssuedTokens };
