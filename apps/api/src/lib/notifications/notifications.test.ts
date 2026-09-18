import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { isSmsChannelAvailable, MockEmailProvider, MockSmsProvider, setEmailProviderForTests, setSmsProviderForTests } from './channels.js';
import { buildEvent, buildEventId, deterministicEventId, NOTIFICATION_EVENT_TYPES } from './events.js';
import { categoryForEvent, isChannelEnabled } from './preferences.js';
import { classifyFailure, computeBackoffMs, shouldRetry } from './retry.js';
import { defaultTemplateFor, missingVariables, renderHtml, renderText, templateVariableNames } from './templates.js';
import { verifyWebhookSignature } from './webhooks.js';

describe('notification events', () => {
  it('builds unique event ids', () => {
    expect(buildEventId()).not.toBe(buildEventId());
    expect(buildEventId()).toMatch(/^EVT-/);
  });

  it('produces stable deterministic ids for callback deduplication', () => {
    expect(deterministicEventId('payment', 'tx-1', 'cr-1', 0)).toBe(deterministicEventId('payment', 'tx-1', 'cr-1', 0));
    expect(deterministicEventId('payment', 'tx-1', 'cr-1', 0)).not.toBe(deterministicEventId('payment', 'tx-2', 'cr-1', 0));
  });

  it('builds minimal versioned events without database payloads', () => {
    const event = buildEvent('ORDER_PLACED', 'Order', 'order-1', { orderNumber: 'ORD-1' }, 'user-1');
    expect(event.eventVersion).toBe(1);
    expect(event.payload).toEqual({ orderNumber: 'ORD-1' });
    expect(event.userId).toBe('user-1');
  });
});

describe('notification templates', () => {
  it('provides an in-app default for every event type', () => {
    for (const eventType of NOTIFICATION_EVENT_TYPES) {
      expect(defaultTemplateFor(eventType, 'IN_APP'), eventType).not.toBeNull();
    }
  });

  it('substitutes variables and blanks unknown ones', () => {
    expect(renderText('Hi {{customerName}}, {{orderNumber}} {{missing}}', { customerName: 'Mark', orderNumber: 'ORD-1' })).toBe('Hi Mark, ORD-1 ');
  });

  it('escapes customer-controlled values in HTML', () => {
    const rendered = renderHtml('<p>{{customerName}}</p>', { customerName: '<script>alert(1)</script>' });
    expect(rendered).not.toContain('<script>');
    expect(rendered).toContain('&lt;script&gt;');
  });

  it('detects missing required variables', () => {
    expect(missingVariables({ body: 'Order {{orderNumber}}' }, {})).toEqual(['orderNumber']);
    expect(missingVariables({ body: 'Order {{orderNumber}}' }, { orderNumber: 'ORD-1' })).toEqual([]);
  });

  it('collects variable names across subject, body, and html', () => {
    expect(templateVariableNames({ subject: 'Hi {{a}}', body: '{{b}}', htmlBody: '{{c}}' }).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('retry policy', () => {
  it('classifies transient and permanent failures', () => {
    expect(classifyFailure('PROVIDER_TIMEOUT')).toBe('transient');
    expect(classifyFailure('RATE_LIMITED')).toBe('transient');
    expect(classifyFailure('503')).toBe('transient');
    expect(classifyFailure('INVALID_PHONE')).toBe('permanent');
    expect(classifyFailure('404')).toBe('permanent');
    expect(classifyFailure(null)).toBe('transient');
  });

  it('backs off exponentially within configured bounds', () => {
    const first = computeBackoffMs(0, () => 0);
    const second = computeBackoffMs(1, () => 0);
    expect(second).toBe(first * 2);
    expect(computeBackoffMs(100, () => 0)).toBeLessThanOrEqual(3600000);
  });

  it('retries transient failures below the attempt limit only', () => {
    expect(shouldRetry(1, 'transient')).toBe(true);
    expect(shouldRetry(99, 'transient')).toBe(false);
    expect(shouldRetry(1, 'permanent')).toBe(false);
  });
});

describe('preference evaluation', () => {
  it('maps events to transactional or security categories', () => {
    expect(categoryForEvent('ORDER_PLACED')).toBe('TRANSACTIONAL');
    expect(categoryForEvent('REFUND_SUCCEEDED')).toBe('TRANSACTIONAL');
    expect(categoryForEvent('PASSWORD_CHANGED')).toBe('SECURITY');
  });

  it('locks critical in-app notifications on', () => {
    expect(isChannelEnabled('ORDER_PLACED', 'IN_APP', [{ category: 'TRANSACTIONAL', channel: 'IN_APP', enabled: false }], null)).toBe(true);
    expect(isChannelEnabled('PASSWORD_CHANGED', 'IN_APP', [], null)).toBe(true);
  });

  it('honours explicit opt-outs and legacy email flags', () => {
    expect(isChannelEnabled('ORDER_PLACED', 'EMAIL', [{ category: 'TRANSACTIONAL', channel: 'EMAIL', enabled: false }], null)).toBe(false);
    expect(isChannelEnabled('ORDER_PLACED', 'EMAIL', [], { emailOrderUpdates: false, emailDelivery: true, emailReturns: true, emailMarketing: false })).toBe(false);
    expect(isChannelEnabled('ORDER_PLACED', 'EMAIL', [], null)).toBe(true);
  });

  it('keeps marketing off by default', () => {
    expect(isChannelEnabled('ORDER_PLACED', 'SMS', [], null)).toBe(true);
  });
});

describe('provider test doubles', () => {
  it('records email sends and replays scripted failures', async () => {
    const provider = new MockEmailProvider();
    setEmailProviderForTests(provider);
    try {
      await provider.send({ to: 'a@example.com', subject: 'Hi', text: 'Hello', templateKey: 'ORDER_PLACED', notificationId: 'n-1' });
      expect(provider.sent).toHaveLength(1);
      provider.failNext = { retryable: true, failureCode: 'PROVIDER_TIMEOUT', failureMessage: 'timeout' };
      const result = await provider.send({ to: 'a@example.com', subject: 'Hi', text: 'Hello', templateKey: 'ORDER_PLACED', notificationId: 'n-1' });
      expect(result.accepted).toBe(false);
      expect(result.retryable).toBe(true);
    } finally {
      setEmailProviderForTests(null);
    }
  });

  it('records SMS sends', async () => {
    const provider = new MockSmsProvider();
    setSmsProviderForTests(provider);
    try {
      expect(isSmsChannelAvailable()).toBe(true);
      await provider.send({ to: '+254700000000', body: 'Hi', senderId: 'VEYRA', templateKey: 'ORDER_PLACED', notificationId: 'n-1' });
      expect(provider.sent).toHaveLength(1);
    } finally {
      setSmsProviderForTests(null);
    }
  });
});

describe('webhook verification', () => {
  it('accepts valid HMAC signatures and rejects forgeries', () => {
    const secret = 'test-webhook-secret-1234567890';
    const rawBody = '{"messageId":"sms-1","status":"delivered"}';
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    expect(verifyWebhookSignature(secret, rawBody, signature)).toBe(true);
    expect(verifyWebhookSignature(secret, `${rawBody} `, signature)).toBe(false);
    expect(verifyWebhookSignature(secret, rawBody, 'sha256=deadbeef')).toBe(false);
    expect(verifyWebhookSignature(undefined, rawBody, signature)).toBe(false);
    expect(verifyWebhookSignature(secret, rawBody, undefined)).toBe(false);
  });
});
