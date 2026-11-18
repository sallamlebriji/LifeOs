import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfig } from '../config/app-config.service';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Outbound email. "log" writes messages (including verification/reset links)
 * to the API log for local development; "smtp" delivers them via SMTP_URL.
 * Production refuses to boot with the log transport (see env.ts).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');

  private readonly transport: Transporter | null;

  constructor(private readonly config: AppConfig) {
    this.transport = config.get('MAIL_TRANSPORT') === 'smtp' ? createTransport(config.get('SMTP_URL')) : null;
  }

  async send(message: MailMessage): Promise<void> {
    if (this.config.get('MAIL_TRANSPORT') === 'log') {
      if (this.config.get('NODE_ENV') !== 'test') {
        this.logger.log(`\n  To: ${message.to}\n  Subject: ${message.subject}\n\n${message.text}\n`);
      }
      this.sent.push(message);
      if (this.sent.length > 50) this.sent.shift();
      return;
    }
    await this.transport!.sendMail({ from: this.config.get('MAIL_FROM'), to: message.to, subject: message.subject, text: message.text });
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
