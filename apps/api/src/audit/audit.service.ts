import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { type Prisma } from '@lifeos/database';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.refresh_reuse_detected'
  | 'auth.email_verified'
  | 'auth.password_reset_requested'
  | 'auth.password_reset'
  | 'auth.password_changed'
  | 'user.data_exported'
  | 'user.deleted'
  | 'task.deleted'
  | 'goal.deleted'
  | 'project.deleted'
  | 'event.deleted'
  | 'habit.deleted'
  | 'proposal.created'
  | 'proposal.applied'
  | 'proposal.rejected'
  | 'proposal.reverted';

/**
 * Append-only audit trail for security-relevant events. Never pass secrets,
 * tokens or passwords in `metadata`. Failures are logged, never thrown, so
 * auditing can't break the user-facing request.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: {
    action: AuditAction;
    userId?: string | null;
    ipAddress?: string | undefined;
    entityType?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          userId: entry.userId ?? null,
          ipAddress: entry.ipAddress ?? null,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log for ${entry.action}`, (err as Error).stack);
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
