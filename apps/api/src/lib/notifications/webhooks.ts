import crypto from 'node:crypto';

import { env } from '../env.js';
import { HttpError } from '../errors.js';
import { applyProviderCallback } from './orchestrator.js';

export type DeliveryCallback = {
  providerMessageId: string;
  outcome: 'delivered' | 'failed';
  failureCode?: string;
  failureMessage?: string;
  eventId?: string;
};

function signatureFor(secret: string, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

/** Pure HMAC check (testable). Accepts `sha256=<hex>` or raw hex signatures. */
export function verifyWebhookSignature(secret: string | undefined, rawBody: string, signature: string | undefined): boolean {
  if (!secret || !signature) return false;
  const provided = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
  const expected = signatureFor(secret, rawBody);
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function seenEventIds(): Set<string> {
  const globalForHooks = globalThis as unknown as { __notificationWebhookEvents?: Set<string> };
  globalForHooks.__notificationWebhookEvents ??= new Set<string>();
  return globalForHooks.__notificationWebhookEvents;
}

function parseEmailCallback(body: unknown): DeliveryCallback {
  const root = body as { messageId?: unknown; event?: unknown; code?: unknown; message?: unknown; eventId?: unknown };
  if (typeof root.messageId !== 'string' || typeof root.event !== 'string') {
    throw new HttpError(400, 'WEBHOOK_INVALID_PAYLOAD', 'The delivery callback payload is invalid.');
  }
  const outcome = root.event === 'delivered' ? 'delivered' : root.event === 'failed' || root.event === 'bounced' || root.event === 'complained' ? 'failed' : null;
  if (!outcome) throw new HttpError(400, 'WEBHOOK_UNKNOWN_EVENT', 'Unsupported delivery event.');
  return {
    providerMessageId: root.messageId,
    outcome,
    failureCode: typeof root.code === 'string' ? root.code : undefined,
    failureMessage: typeof root.message === 'string' ? root.message : undefined,
    eventId: typeof root.eventId === 'string' ? root.eventId : undefined,
  };
}

function parseSmsCallback(body: unknown): DeliveryCallback {
  const root = body as { messageId?: unknown; status?: unknown; code?: unknown; description?: unknown; eventId?: unknown };
  if (typeof root.messageId !== 'string' || typeof root.status !== 'string') {
    throw new HttpError(400, 'WEBHOOK_INVALID_PAYLOAD', 'The delivery callback payload is invalid.');
  }
  const normalized = root.status.toLowerCase();
  const outcome = normalized.includes('deliver') ? 'delivered' : normalized.includes('fail') || normalized.includes('reject') || normalized.includes('undeliver') ? 'failed' : null;
  if (!outcome) throw new HttpError(400, 'WEBHOOK_UNKNOWN_EVENT', 'Unsupported delivery event.');
  return {
    providerMessageId: root.messageId,
    outcome,
    failureCode: typeof root.code === 'string' ? root.code : undefined,
    failureMessage: typeof root.description === 'string' ? root.description : undefined,
    eventId: typeof root.eventId === 'string' ? root.eventId : undefined,
  };
}

async function handleCallback(provider: 'email' | 'sms', secret: string | undefined, rawBody: string, signature: string | undefined, body: unknown) {
  if (!secret) throw new HttpError(503, 'WEBHOOK_NOT_CONFIGURED', 'Delivery callbacks are not configured.');
  if (!verifyWebhookSignature(secret, rawBody, signature)) throw new HttpError(401, 'WEBHOOK_INVALID_SIGNATURE', 'Callback signature verification failed.');
  const callback = provider === 'email' ? parseEmailCallback(body) : parseSmsCallback(body);
  const seen = seenEventIds();
  const replayKey = `${provider}:${callback.eventId ?? callback.providerMessageId}:${callback.outcome}`;
  if (seen.has(replayKey)) return { acknowledged: true, duplicate: true };
  seen.add(replayKey);
  if (seen.size > 5000) seen.clear();
  const result = await applyProviderCallback(emailOrSmsProviderName(provider), callback.providerMessageId, callback.outcome, callback.failureCode, callback.failureMessage);
  return { acknowledged: true, ...result };
}

function emailOrSmsProviderName(provider: 'email' | 'sms'): string {
  // Correlate against the provider name stored on the delivery record.
  // Log/mock providers record their own names; vendor providers record theirs.
  return provider === 'email' ? (process.env.EMAIL_PROVIDER ?? env.EMAIL_PROVIDER) : (process.env.SMS_PROVIDER ?? env.SMS_PROVIDER);
}

export async function handleEmailCallback(rawBody: string, signature: string | undefined, body: unknown) {
  return handleCallback('email', env.EMAIL_WEBHOOK_SECRET, rawBody, signature, body);
}

export async function handleSmsCallback(rawBody: string, signature: string | undefined, body: unknown) {
  return handleCallback('sms', env.SMS_WEBHOOK_SECRET, rawBody, signature, body);
}
