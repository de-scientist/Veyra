import { NotificationChannel } from '@prisma/client';

import { prisma } from '../prisma.js';
import type { NotificationEventType } from './events.js';

export type TemplateVariables = Record<string, string | number | null | undefined>;

export type ResolvedTemplate = {
  key: string;
  channel: NotificationChannel;
  version: number;
  subject: string | null;
  body: string;
  htmlBody: string | null;
};

type ChannelTemplates = Partial<Record<NotificationChannel, { subject?: string; body: string; htmlBody?: string }>>;

function orderLine(v: TemplateVariables) {
  return `Order ${v.orderNumber} (${v.currency} ${v.orderTotal}).`;
}

const TEMPLATE_DEFAULTS: Record<NotificationEventType, ChannelTemplates> = {
  ORDER_PLACED: {
    IN_APP: { body: 'Thank you {{customerName}}. Your order {{orderNumber}} has been received. {{orderLine}} View your order to pay and track it.' },
    EMAIL: { subject: 'Order {{orderNumber}} received', body: 'Hi {{customerName}},\n\nThank you for shopping with {{brand}}. Your order {{orderNumber}} has been received.\n\nTotal: {{currency}} {{orderTotal}}\n\nView your order: {{orderUrl}}\n\nIf you did not place this order, please contact support.', htmlBody: '<p>Hi {{customerName}},</p><p>Thank you for shopping with {{brand}}. Your order <strong>{{orderNumber}}</strong> has been received.</p><p>Total: {{currency}} {{orderTotal}}</p><p><a href="{{orderUrl}}">View your order</a></p>' },
    SMS: { body: '{{brand}}: Hi {{customerName}}, your order {{orderNumber}} ({{currency}} {{orderTotal}}) was received. Track it in your account: {{orderUrl}}' },
  },
  PAYMENT_CONFIRMED: {
    IN_APP: { body: 'Payment confirmed for order {{orderNumber}}. Amount: {{currency}} {{orderTotal}}. Your order is now being prepared.' },
    EMAIL: { subject: 'Payment confirmed for {{orderNumber}}', body: 'Hi {{customerName}},\n\nYour payment for order {{orderNumber}} has been confirmed.\n\nAmount: {{currency}} {{orderTotal}}\nReference: {{providerReference}}\n\nView your order: {{orderUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>Your payment for order <strong>{{orderNumber}}</strong> has been confirmed.</p><p>Amount: {{currency}} {{orderTotal}}</p><p><a href="{{orderUrl}}">View your order</a></p>' },
    SMS: { body: '{{brand}}: Payment of {{currency}} {{orderTotal}} for {{orderNumber}} confirmed. Thank you.' },
  },
  PAYMENT_FAILED: {
    IN_APP: { body: 'Your payment for order {{orderNumber}} was not successful. No money was taken by this attempt. Please try again from your order.' },
    EMAIL: { subject: 'Payment unsuccessful for {{orderNumber}}', body: 'Hi {{customerName}},\n\nYour payment attempt for order {{orderNumber}} was unsuccessful. You can safely try again.\n\nView your order: {{orderUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>Your payment attempt for order <strong>{{orderNumber}}</strong> was unsuccessful. You can safely try again.</p><p><a href="{{orderUrl}}">View your order</a></p>' },
    SMS: { body: '{{brand}}: Your payment for {{orderNumber}} was unsuccessful. Please try again from your account.' },
  },
  ORDER_PROCESSING: {
    IN_APP: { body: 'Order {{orderNumber}} is now being prepared by our team.' },
    EMAIL: { subject: 'Order {{orderNumber}} is being prepared', body: 'Hi {{customerName}},\n\nGood news: order {{orderNumber}} is now being prepared.\n\nTrack it here: {{trackingUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>Order <strong>{{orderNumber}}</strong> is now being prepared.</p><p><a href="{{trackingUrl}}">Track your order</a></p>' },
    SMS: { body: '{{brand}}: Order {{orderNumber}} is now being prepared.' },
  },
  ORDER_PACKED: {
    IN_APP: { body: 'Order {{orderNumber}} has been packed and will ship soon.' },
    EMAIL: { subject: 'Order {{orderNumber}} packed', body: 'Hi {{customerName}},\n\nOrder {{orderNumber}} has been packed and will ship soon.\n\nTrack it here: {{trackingUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>Order <strong>{{orderNumber}}</strong> has been packed and will ship soon.</p><p><a href="{{trackingUrl}}">Track your order</a></p>' },
    SMS: { body: '{{brand}}: Order {{orderNumber}} is packed and will ship soon.' },
  },
  ORDER_SHIPPED: {
    IN_APP: { body: 'Order {{orderNumber}} has shipped. Tracking: {{trackingNumber}}. Follow its journey from your account.' },
    EMAIL: { subject: 'Order {{orderNumber}} has shipped', body: 'Hi {{customerName}},\n\nYour order {{orderNumber}} has shipped.\n\nTracking number: {{trackingNumber}}\nTrack it here: {{trackingUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>Your order <strong>{{orderNumber}}</strong> has shipped.</p><p>Tracking number: {{trackingNumber}}</p><p><a href="{{trackingUrl}}">Track your order</a></p>' },
    SMS: { body: '{{brand}}: Order {{orderNumber}} has shipped. Tracking: {{trackingNumber}}. {{trackingUrl}}' },
  },
  ORDER_OUT_FOR_DELIVERY: {
    IN_APP: { body: 'Order {{orderNumber}} is out for delivery. Please keep your phone reachable.' },
    EMAIL: { subject: 'Order {{orderNumber}} out for delivery', body: 'Hi {{customerName}},\n\nOrder {{orderNumber}} is out for delivery. Please keep your phone reachable.\n\nTrack it here: {{trackingUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>Order <strong>{{orderNumber}}</strong> is out for delivery.</p><p><a href="{{trackingUrl}}">Track your order</a></p>' },
    SMS: { body: '{{brand}}: Order {{orderNumber}} is out for delivery. Please keep your phone reachable.' },
  },
  ORDER_DELIVERED: {
    IN_APP: { body: 'Order {{orderNumber}} has been delivered. Enjoy your purchase. Need anything? Returns can be requested from your order.' },
    EMAIL: { subject: 'Order {{orderNumber}} delivered', body: 'Hi {{customerName}},\n\nOrder {{orderNumber}} has been delivered. Enjoy!\n\nView your order: {{orderUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>Order <strong>{{orderNumber}}</strong> has been delivered. Enjoy!</p><p><a href="{{orderUrl}}">View your order</a></p>' },
    SMS: { body: '{{brand}}: Order {{orderNumber}} has been delivered. Thank you for shopping with us.' },
  },
  DELIVERY_FAILED: {
    IN_APP: { body: 'We could not complete delivery of order {{orderNumber}}. Our team will retry or contact you. Track progress in your account.' },
    EMAIL: { subject: 'Delivery update for {{orderNumber}}', body: 'Hi {{customerName}},\n\nWe could not complete delivery of order {{orderNumber}} this time. We will retry or contact you shortly.\n\nTrack it here: {{trackingUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>We could not complete delivery of order <strong>{{orderNumber}}</strong>. We will retry or contact you shortly.</p><p><a href="{{trackingUrl}}">Track your order</a></p>' },
    SMS: { body: '{{brand}}: Delivery of {{orderNumber}} was unsuccessful. We will retry or contact you.' },
  },
  RETURN_REQUESTED: {
    IN_APP: { body: 'Return {{returnNumber}} for order {{orderNumber}} was received. We will review it and keep you updated.' },
    EMAIL: { subject: 'Return {{returnNumber}} received', body: 'Hi {{customerName}},\n\nYour return request {{returnNumber}} for order {{orderNumber}} was received and is under review.\n\nView it here: {{returnUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>Your return request <strong>{{returnNumber}}</strong> for order {{orderNumber}} is under review.</p><p><a href="{{returnUrl}}">View your return</a></p>' },
    SMS: { body: '{{brand}}: Return {{returnNumber}} for {{orderNumber}} received and under review.' },
  },
  RETURN_APPROVED: {
    IN_APP: { body: 'Return {{returnNumber}} was approved. Follow the return instructions shared by our team.' },
    EMAIL: { subject: 'Return {{returnNumber}} approved', body: 'Hi {{customerName}},\n\nReturn {{returnNumber}} for order {{orderNumber}} was approved.\n\nView it here: {{returnUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>Return <strong>{{returnNumber}}</strong> was approved.</p><p><a href="{{returnUrl}}">View your return</a></p>' },
    SMS: { body: '{{brand}}: Return {{returnNumber}} approved.' },
  },
  RETURN_REJECTED: {
    IN_APP: { body: 'Return {{returnNumber}} could not be approved. Reason: {{rejectionReason}}. Contact support if you need help.' },
    EMAIL: { subject: 'Update on return {{returnNumber}}', body: 'Hi {{customerName}},\n\nReturn {{returnNumber}} for order {{orderNumber}} could not be approved. Reason: {{rejectionReason}}\n\nView it here: {{returnUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>Return <strong>{{returnNumber}}</strong> could not be approved. Reason: {{rejectionReason}}</p><p><a href="{{returnUrl}}">View your return</a></p>' },
    SMS: { body: '{{brand}}: Return {{returnNumber}} could not be approved. See your account for details.' },
  },
  RETURN_RECEIVED: {
    IN_APP: { body: 'We received the items for return {{returnNumber}}. Inspection is next; we will update you once complete.' },
    EMAIL: { subject: 'Items received for {{returnNumber}}', body: 'Hi {{customerName}},\n\nWe received your returned items for {{returnNumber}} (order {{orderNumber}}). Inspection is next.\n\nView it here: {{returnUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>We received your returned items for <strong>{{returnNumber}}</strong>. Inspection is next.</p><p><a href="{{returnUrl}}">View your return</a></p>' },
    SMS: { body: '{{brand}}: Items for return {{returnNumber}} received. Inspection is next.' },
  },
  RETURN_RESOLVED: {
    IN_APP: { body: 'Return {{returnNumber}} is now resolved. Thank you for your patience.' },
    EMAIL: { subject: 'Return {{returnNumber}} resolved', body: 'Hi {{customerName}},\n\nReturn {{returnNumber}} for order {{orderNumber}} is now resolved.\n\nView it here: {{returnUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>Return <strong>{{returnNumber}}</strong> is now resolved.</p><p><a href="{{returnUrl}}">View your return</a></p>' },
    SMS: { body: '{{brand}}: Return {{returnNumber}} resolved.' },
  },
  EXCHANGE_REQUESTED: {
    IN_APP: { body: 'Exchange request {{returnNumber}} for order {{orderNumber}} was received and is under review.' },
    EMAIL: { subject: 'Exchange {{returnNumber}} received', body: 'Hi {{customerName}},\n\nYour exchange request {{returnNumber}} for order {{orderNumber}} was received.\n\nView it here: {{returnUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>Your exchange request <strong>{{returnNumber}}</strong> was received.</p><p><a href="{{returnUrl}}">View your return</a></p>' },
    SMS: { body: '{{brand}}: Exchange {{returnNumber}} received and under review.' },
  },
  EXCHANGE_APPROVED: {
    IN_APP: { body: 'Exchange {{returnNumber}} was approved. We will prepare your replacement item.' },
    EMAIL: { subject: 'Exchange {{returnNumber}} approved', body: 'Hi {{customerName}},\n\nExchange {{returnNumber}} for order {{orderNumber}} was approved. We will prepare your replacement.\n\nView it here: {{returnUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>Exchange <strong>{{returnNumber}}</strong> was approved.</p><p><a href="{{returnUrl}}">View your return</a></p>' },
    SMS: { body: '{{brand}}: Exchange {{returnNumber}} approved.' },
  },
  REFUND_REQUESTED: {
    IN_APP: { body: 'A refund of {{currency}} {{refundAmount}} for order {{orderNumber}} was initiated. We will notify you once complete.' },
    EMAIL: { subject: 'Refund initiated for {{orderNumber}}', body: 'Hi {{customerName}},\n\nA refund of {{currency}} {{refundAmount}} for order {{orderNumber}} was initiated (reference {{refundNumber}}).\n\nView it here: {{refundUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>A refund of {{currency}} {{refundAmount}} for order <strong>{{orderNumber}}</strong> was initiated.</p><p><a href="{{refundUrl}}">View your refunds</a></p>' },
    SMS: { body: '{{brand}}: Refund of {{currency}} {{refundAmount}} for {{orderNumber}} initiated.' },
  },
  REFUND_SUCCEEDED: {
    IN_APP: { body: 'Refund of {{currency}} {{refundAmount}} for order {{orderNumber}} completed successfully (reference {{refundNumber}}).' },
    EMAIL: { subject: 'Refund completed for {{orderNumber}}', body: 'Hi {{customerName}},\n\nYour refund of {{currency}} {{refundAmount}} for order {{orderNumber}} completed successfully (reference {{refundNumber}}).\n\nView it here: {{refundUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>Your refund of {{currency}} {{refundAmount}} for order <strong>{{orderNumber}}</strong> completed successfully.</p><p><a href="{{refundUrl}}">View your refunds</a></p>' },
    SMS: { body: '{{brand}}: Refund of {{currency}} {{refundAmount}} for {{orderNumber}} completed.' },
  },
  REFUND_FAILED: {
    IN_APP: { body: 'The refund of {{currency}} {{refundAmount}} for order {{orderNumber}} could not be completed. Our team will review it and update you.' },
    EMAIL: { subject: 'Refund update for {{orderNumber}}', body: 'Hi {{customerName}},\n\nThe refund of {{currency}} {{refundAmount}} for order {{orderNumber}} could not be completed automatically. Our team will review it.\n\nView it here: {{refundUrl}}', htmlBody: '<p>Hi {{customerName}},</p><p>The refund for order <strong>{{orderNumber}}</strong> needs manual review. Our team is on it.</p><p><a href="{{refundUrl}}">View your refunds</a></p>' },
    SMS: { body: '{{brand}}: Refund for {{orderNumber}} needs review. We will update you.' },
  },
  PASSWORD_CHANGED: {
    IN_APP: { body: 'Your account password was changed. If this was not you, secure your account and contact support immediately.' },
    EMAIL: { subject: 'Your password was changed', body: 'Hi {{customerName}},\n\nYour {{brand}} account password was just changed. If this was not you, please reset your password and contact support immediately.', htmlBody: '<p>Hi {{customerName}},</p><p>Your {{brand}} account password was just changed. If this was not you, please act immediately.</p>' },
    SMS: { body: '{{brand}} security alert: your password was changed. If this was not you, contact support.' },
  },
  ACCOUNT_DEACTIVATED: {
    IN_APP: { body: 'Your account has been deactivated as requested. Contact support if you need to reactivate it.' },
    EMAIL: { subject: 'Your account was deactivated', body: 'Hi {{customerName}},\n\nYour {{brand}} account has been deactivated as requested. Contact support if this was a mistake.', htmlBody: '<p>Hi {{customerName}},</p><p>Your {{brand}} account has been deactivated as requested.</p>' },
  },
  LOW_STOCK_DETECTED: {
    IN_APP: { body: 'Low stock: {{sku}} has {{availableQuantity}} units available (threshold {{lowStockThreshold}}).' },
  },
};

export function defaultTemplateFor(eventType: NotificationEventType, channel: NotificationChannel) {
  return TEMPLATE_DEFAULTS[eventType]?.[channel] ?? null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Render `{{variable}}` placeholders. HTML bodies are escaped per-variable so
 * customer-controlled values (names, reasons, notes) can never inject markup
 * or scripts. Unknown variables render as empty strings; required-variable
 * mismatches are detected by `missingVariables`.
 */
export function renderText(template: string, variables: TemplateVariables): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, name: string) => {
    const value = variables[name];
    return value === null || value === undefined ? '' : String(value);
  });
}

export function renderHtml(template: string, variables: TemplateVariables): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, name: string) => {
    const value = variables[name];
    return value === null || value === undefined ? '' : escapeHtml(String(value));
  });
}

export function templateVariableNames(template: { body: string; htmlBody?: string | null; subject?: string | null }): string[] {
  const names = new Set<string>();
  for (const part of [template.body, template.htmlBody ?? '', template.subject ?? '']) {
    for (const match of part.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) names.add(match[1]);
  }
  return [...names];
}

export function missingVariables(template: { body: string; htmlBody?: string | null; subject?: string | null }, variables: TemplateVariables): string[] {
  return templateVariableNames(template).filter((name) => variables[name] === null || variables[name] === undefined || variables[name] === '');
}

export async function resolveTemplate(eventType: NotificationEventType, channel: NotificationChannel): Promise<ResolvedTemplate> {
  const stored = await prisma.notificationTemplate.findFirst({
    where: { key: eventType, channel, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
  if (stored) {
    return { key: stored.key, channel: stored.channel, version: stored.version, subject: stored.subject, body: stored.body, htmlBody: stored.htmlBody };
  }
  const fallback = defaultTemplateFor(eventType, channel) ?? { body: `${eventType} update for your account.` };
  return { key: eventType, channel, version: 1, subject: fallback.subject ?? null, body: fallback.body, htmlBody: fallback.htmlBody ?? null };
}

export { orderLine };
