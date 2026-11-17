import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  type ChangePasswordInput,
  type DeleteAccountInput,
  type UpdateProfileInput,
} from '@lifeos/validation';
import { AuditService } from '../audit/audit.service';
import { hashPassword, verifyPassword } from '../auth/crypto';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../prisma/prisma.service';
import { toPreferencesDto, toPublicUser } from './user.serializer';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { preferences: true },
    });
    return {
      user: toPublicUser(user),
      preferences: user.preferences ? toPreferencesDto(user.preferences) : null,
    };
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: input });
    return toPublicUser(user);
  }

  async changePassword(userId: string, sessionId: string, input: ChangePasswordInput) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    // Keep this device signed in, sign out everywhere else.
    await this.sessions.revokeAllForUser(userId, sessionId);
    await this.audit.record({ action: 'auth.password_changed', userId });
  }

  /** GDPR-style export of everything the user owns (no secrets, no token hashes). */
  async exportData(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        preferences: true,
        categories: true,
        goals: { include: { milestones: true } },
        projects: true,
        tasks: { include: { schedules: true } },
        events: true,
        availabilityRules: true,
        habits: { include: { logs: true } },
        studySubjects: { include: { sessions: true } },
        trips: { include: { activities: true } },
        proposals: { include: { changes: true } },
        aiConversations: { include: { messages: true } },
        notifications: true,
        integrations: {
          select: {
            id: true,
            provider: true,
            status: true,
            externalAccountId: true,
            scopes: true,
            lastSyncedAt: true,
            createdAt: true,
          },
        },
      },
    });
    await this.audit.record({ action: 'user.data_exported', userId });
    const { passwordHash: _omit, ...rest } = user;
    return { exportedAt: new Date().toISOString(), format: 'lifeos-export/v1', data: rest };
  }

  async deleteAccount(userId: string, input: DeleteAccountInput) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Password is incorrect');
    }
    // Audit first (userId is nulled by FK on delete; we keep the id in metadata).
    await this.audit.record({ action: 'user.deleted', metadata: { deletedUserId: userId } });
    await this.prisma.user.delete({ where: { id: userId } }); // cascades to all owned rows
  }
}
