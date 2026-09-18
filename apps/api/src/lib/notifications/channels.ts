import crypto from 'node:crypto';

import { NotificationChannel } from '@prisma/client';

import { env } from '../env.js';
import { logger } from '../logger.js';

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  templateKey: string;
  notificationId: string;
};

export type SmsMessage = {
  to: string;
  body: string;
  senderId: string;
  templateKey: string;
  notificationId: string;
};

export type ProviderResult = {
  accepted: boolean;
  providerMessageId: string | null;
  retryable: boolean;
  failureCode?: string;
  failureMessage?: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<ProviderResult>;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<ProviderResult>;
}

function mockMessageId(prefix: string) {
  return `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
}

/** Development/test email provider: logs instead of delivering. Never used with production credentials. */
export class LogEmailProvider implements EmailProvider {
  readonly name = 'log';
  async send(message: EmailMessage): Promise<ProviderResult> {
    logger.info({ to: message.to, subject: message.subject, templateKey: message.templateKey, notificationId: message.notificationId }, 'Email dispatch (log provider)');
    return { accepted: true, providerMessageId: mockMessageId('eml'), retryable: false };
  }
}

/** Test double: records sends in memory for assertions. */
export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock';
  readonly sent: EmailMessage[] = [];
  failNext: { retryable: boolean; failureCode: string; failureMessage: string } | null = null;
  async send(message: EmailMessage): Promise<ProviderResult> {
    this.sent.push(message);
    if (this.failNext) {
      const failure = this.failNext;
      this.failNext = null;
      return { accepted: false, providerMessageId: null, retryable: failure.retryable, failureCode: failure.failureCode, failureMessage: failure.failureMessage };
    }
    return { accepted: true, providerMessageId: mockMessageId('eml'), retryable: false };
  }
}

/** Placeholder email provider boundary for a future SMTP/API provider. Not wired to any vendor. */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  async send(message: EmailMessage): Promise<ProviderResult> {
    logger.warn({ to: message.to, templateKey: message.templateKey }, 'SMTP provider not configured; email held');
    void message;
    return { accepted: false, providerMessageId: null, retryable: false, failureCode: 'EMAIL_PROVIDER_NOT_CONFIGURED', failureMessage: 'No email provider is configured.' };
  }
}

/** Test double for SMS. */
export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';
  readonly sent: SmsMessage[] = [];
  failNext: { retryable: boolean; failureCode: string; failureMessage: string } | null = null;
  async send(message: SmsMessage): Promise<ProviderResult> {
    this.sent.push(message);
    if (this.failNext) {
      const failure = this.failNext;
      this.failNext = null;
      return { accepted: false, providerMessageId: null, retryable: failure.retryable, failureCode: failure.failureCode, failureMessage: failure.failureMessage };
    }
    return { accepted: true, providerMessageId: mockMessageId('sms'), retryable: false };
  }
}

/** Development SMS provider: logs instead of delivering. */
export class LogSmsProvider implements SmsProvider {
  readonly name = 'log';
  async send(message: SmsMessage): Promise<ProviderResult> {
    logger.info({ to: message.to, senderId: message.senderId, templateKey: message.templateKey, notificationId: message.notificationId }, 'SMS dispatch (log provider)');
    return { accepted: true, providerMessageId: mockMessageId('sms'), retryable: false };
  }
}

let emailProviderOverride: EmailProvider | null = null;
let smsProviderOverride: SmsProvider | null = null;

export function setEmailProviderForTests(provider: EmailProvider | null) {
  emailProviderOverride = provider;
}

export function setSmsProviderForTests(provider: SmsProvider | null) {
  smsProviderOverride = provider;
}

export function emailProvider(): EmailProvider {
  if (emailProviderOverride) return emailProviderOverride;
  if (env.EMAIL_PROVIDER === 'mock') return new MockEmailProvider();
  if (env.EMAIL_PROVIDER === 'smtp') return new SmtpEmailProvider();
  return new LogEmailProvider();
}

export function smsProvider(): SmsProvider {
  if (smsProviderOverride) return smsProviderOverride;
  if (env.SMS_PROVIDER === 'log') return new LogSmsProvider();
  return new MockSmsProvider();
}

/**
 * SMS is only selectable when a real delivery path exists. The default `mock`
 * provider is a no-op recorder, NOT a production path — production requires an
 * approved vendor integration (UNKNOWN — REQUIRES BUSINESS/PROVIDER DECISION).
 */
export function isSmsChannelAvailable(): boolean {
  if (smsProviderOverride) return true;
  if (env.NODE_ENV === 'production') return false;
  return env.SMS_PROVIDER === 'log';
}

export function channelProviderName(channel: NotificationChannel): string {
  if (channel === 'EMAIL') return emailProvider().name;
  if (channel === 'SMS') return smsProvider().name;
  return 'internal';
}
