import nodemailer from 'nodemailer';
import { env } from '@/lib/env';
import { log } from '@/lib/log';

/**
 * Outgoing mail: password resets and e-mail verification.
 *
 * `MAIL_DRIVER=log` (the development default) writes the whole message to the log instead of
 * sending it, so the reset link can be copied from `logs/app-*.log`. `smtp` sends through
 * the configured server. Nothing else in the app knows which is in use.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

const transport =
  env.MAIL_DRIVER === 'smtp'
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE === 'true',
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
      })
    : null;

// A production server that sends no mail cannot reset a password or verify an address; the
// link is then only in the local log file (never in Sentry — lib/sentry.ts scrubs it).
if (!transport && env.NODE_ENV === 'production') {
  log.warn('MAIL_DRIVER=log in production: reset and verification mails are written to the log, not sent');
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (!transport) {
    log.info('mail (not sent: MAIL_DRIVER=log)', { to: message.to, subject: message.subject, text: message.text });
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, to: message.to, subject: message.subject, text: message.text });
  log.info('mail sent', { to: message.to, subject: message.subject });
}
