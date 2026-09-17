import crypto from 'node:crypto';

import { env } from '../env.js';
import { PaymentProviderError, type InitializePaymentInput, type PaymentProvider, type ProviderInitiation } from './provider.js';

const sandboxBaseUrl = 'https://sandbox.safaricom.co.ke';
const productionBaseUrl = 'https://api.safaricom.co.ke';
let accessToken: { value: string; expiresAt: number } | undefined;

function configuration() {
  const values = [env.MPESA_CONSUMER_KEY, env.MPESA_CONSUMER_SECRET, env.MPESA_SHORTCODE, env.MPESA_PASSKEY, env.MPESA_CALLBACK_URL];
  if (values.some((value) => !value || value === 'replace-me')) {
    throw new PaymentProviderError('MPESA_NOT_CONFIGURED', 'M-Pesa payment configuration is incomplete.', false);
  }
  if (env.NODE_ENV === 'production' && (!env.MPESA_CALLBACK_URL?.startsWith('https://') || env.MPESA_ENVIRONMENT !== 'production')) {
    throw new PaymentProviderError('MPESA_PRODUCTION_CONFIGURATION', 'Production M-Pesa requires production mode and an HTTPS callback URL.', false);
  }
  return {
    consumerKey: env.MPESA_CONSUMER_KEY,
    consumerSecret: env.MPESA_CONSUMER_SECRET,
    shortcode: env.MPESA_SHORTCODE,
    passkey: env.MPESA_PASSKEY,
    callbackUrl: env.MPESA_CALLBACK_URL,
    baseUrl: env.MPESA_ENVIRONMENT === 'production' ? productionBaseUrl : sandboxBaseUrl,
  };
}

async function readResponse(response: Response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { return { raw: text }; }
}

async function requestJson(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await readResponse(response);
    if (!response.ok) throw new PaymentProviderError('MPESA_REQUEST_FAILED', 'M-Pesa could not process the request.', response.status >= 500, body);
    return body;
  } catch (error) {
    if (error instanceof PaymentProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new PaymentProviderError('MPESA_TIMEOUT', 'M-Pesa did not respond in time.', true);
    throw new PaymentProviderError('MPESA_PROVIDER_UNAVAILABLE', 'M-Pesa is temporarily unavailable.', true);
  } finally {
    clearTimeout(timeout);
  }
}

async function getAccessToken() {
  const config = configuration();
  if (accessToken && accessToken.expiresAt > Date.now() + 30_000) return accessToken.value;
  const encoded = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
  const body = await requestJson(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: { Authorization: `Basic ${encoded}` },
  });
  const token = typeof body.access_token === 'string' ? body.access_token : undefined;
  const expiresIn = Number(body.expires_in ?? 3599);
  if (!token) throw new PaymentProviderError('MPESA_AUTH_FAILED', 'M-Pesa authentication failed.', false, body);
  accessToken = { value: token, expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000 };
  return token;
}

function timestamp() {
  const date = new Date();
  const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
  return parts.map((part) => String(part).padStart(2, '0')).join('');
}

function phoneForMpesa(phone: string) {
  const compact = phone.replace('+', '');
  if (!/^254[17]\d{8}$/.test(compact)) throw new PaymentProviderError('MPESA_INVALID_PHONE', 'The payment phone number is invalid.', false);
  return compact;
}

export class MpesaPaymentProvider implements PaymentProvider {
  async initialize(input: InitializePaymentInput): Promise<ProviderInitiation> {
    const config = configuration();
    if (input.currency !== 'KES') throw new PaymentProviderError('MPESA_INVALID_CURRENCY', 'M-Pesa payments must use KES.', false);
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new PaymentProviderError('MPESA_INVALID_AMOUNT', 'The order amount must be a positive whole KES amount.', false);
    const token = await getAccessToken();
    const requestTimestamp = timestamp();
    const password = Buffer.from(`${config.shortcode}${config.passkey}${requestTimestamp}`).toString('base64');
    const body = await requestJson(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: config.shortcode,
        Password: password,
        Timestamp: requestTimestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: input.amount,
        PartyA: phoneForMpesa(input.phone),
        PartyB: config.shortcode,
        PhoneNumber: phoneForMpesa(input.phone),
        CallBackURL: config.callbackUrl,
        AccountReference: input.accountReference.slice(0, 20),
        TransactionDesc: input.transactionDescription.slice(0, 13),
      }),
    });

    const responseCode = String(body.ResponseCode ?? '');
    const accepted = responseCode === '0';
    return {
      accepted,
      providerRequestId: typeof body.CheckoutRequestID === 'string' ? body.CheckoutRequestID : null,
      providerMerchantRequestId: typeof body.MerchantRequestID === 'string' ? body.MerchantRequestID : null,
      customerMessage: typeof body.CustomerMessage === 'string' ? body.CustomerMessage : accepted ? 'Payment request sent.' : 'M-Pesa could not start the payment.',
      rawResponse: body,
    };
  }
}

export function buildPaymentCorrelationKey(orderId: string, idempotencyKey: string) {
  return crypto.createHash('sha256').update(`${orderId}:${idempotencyKey}`).digest('hex');
}
