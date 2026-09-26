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

export type TransactionQueryInput = {
  providerRequestId: string;
  providerMerchantRequestId?: string | null;
};

export type TransactionQueryResult = {
  /** Provider-side lookup completed (network + auth + schema OK). */
  found: boolean;
  /** Daraja ResultCode when the provider has a concluded outcome; absent while still pending/unknown. */
  resultCode?: number;
  resultDesc?: string;
  amount?: number;
  receipt?: string;
  rawResponse: unknown;
};

export interface PaymentProvider {
  initialize(input: InitializePaymentInput): Promise<ProviderInitiation>;
  /** Recovery probe for delayed/missing callbacks. Never throws for UNKNOWN states — reports them. */
  queryTransaction(input: TransactionQueryInput): Promise<TransactionQueryResult>;
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
