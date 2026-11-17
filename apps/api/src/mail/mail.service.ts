import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Outbound email. Phase 1 ships the "log" transport only: messages (including
 * verification/reset links) are written to the API log for local development.
 * A real SMTP/provider transport is a Phase 5 task — see docs/roadmap.md.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');

  constructor(private readonly config: AppConfig) {}

  async send(message: MailMessage): Promise<void> {
    if (this.config.get('MAIL_TRANSPORT') === 'log') {
      if (this.config.get('NODE_ENV') !== 'test') {
        this.logger.log(`\n  To: ${message.to}\n  Subject: ${message.subject}\n\n${message.text}\n`);
      }
      this.sent.push(message);
      if (this.sent.length > 50) this.sent.shift();
      return;
    }
  }

  /** Last messages sent with the log transport (used by integration tests). */
  readonly sent: MailMessage[] = [];

  webUrl(path: string): string {
    return new URL(path, this.config.get('WEB_ORIGIN')).toString();
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
