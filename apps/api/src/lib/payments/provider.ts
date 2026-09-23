export type PaymentProviderName = 'MPESA';

export type InitializePaymentInput = {
  amount: number;
  currency: string;
  phone: string;
  accountReference: string;
  transactionDescription: string;
  idempotencyKey: string;
};

export type ProviderInitiation = {
  accepted: boolean;
  providerRequestId: string | null;
  providerMerchantRequestId: string | null;
  customerMessage: string;
  rawResponse: unknown;
};

export interface PaymentProvider {
  initialize(input: InitializePaymentInput): Promise<ProviderInitiation>;
}

export class PaymentProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly rawResponse?: unknown;

  constructor(code: string, message: string, retryable: boolean, rawResponse?: unknown) {
    super(message);
    this.name = 'PaymentProviderError';
    this.code = code;
    this.retryable = retryable;
    this.rawResponse = rawResponse;
  }
}
