'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  getOrder,
  getOrderDelivery,
  getPaymentStatus,
  initiateMpesaPayment,
  queryPaymentStatus,
  submitManualPayment,
  type Delivery,
  type ManualChannel,
  type ManualPayment,
  type Order,
  type Payment,
} from '../lib/shopping-api';
import {
  JB_CONTACT_PHONE_DISPLAY,
  JB_CONTACT_PHONE_TEL,
  MPESA_ACCOUNT_NUMBER,
  MPESA_PAYBILL_NUMBER,
  MPESA_POCHI_DISPLAY,
  copyToClipboard,
  manualReferenceError,
  normalizeManualReference,
} from '../lib/business-contact';
import { JBIcon } from './JBIcons';
import { JBAlert, JBButtonLoader, JBPageLoader } from './JBLoading';
import { JBLogo } from './JBLogo';
import { PriceDisplay } from './PriceDisplay';

type Props = { orderNumber: string; confirmationToken?: string; initialMethod?: 'mpesa' | 'manual' };

type AutoPhase = 'IDLE' | 'INITIATING' | 'STK_SENT' | 'WAITING_FOR_CONFIRMATION' | 'PAID' | 'FAILED';

function phaseFor(status: Payment['status'] | undefined, busy: boolean): AutoPhase {
  if (status === 'PAID') return 'PAID';
  if (status === 'FAILED') return 'FAILED';
  if (status === 'PENDING') return busy ? 'STK_SENT' : 'WAITING_FOR_CONFIRMATION';
  return busy ? 'INITIATING' : 'IDLE';
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() {
    const ok = await copyToClipboard(value);
    setCopied(ok);
    setFailed(!ok);
    if (ok) setTimeout(() => setCopied(false), 2500);
  }
  return (
    <span className="copy-row">
      <button type="button" className="button button--secondary button--small" onClick={copy} aria-label={`${label}: ${value}. Activate to copy.`}>
        <JBIcon name="clipboard" size={14} />
        {copied ? 'Copied' : `Copy ${label}`}
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {copied ? `${label} copied to clipboard.` : ''}
      </span>
      {copied ? <span className="copy-feedback" role="status">✓ Copied</span> : null}
      {failed ? <span className="copy-feedback copy-feedback--error" role="alert">Copy failed — long-press the number to copy it manually.</span> : null}
    </span>
  );
}

export function OrderConfirmationClient({ orderNumber, confirmationToken, initialMethod = 'mpesa' }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [querying, setQuerying] = useState(false);
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const [paymentAttemptKey, setPaymentAttemptKey] = useState(() => `payment-${orderNumber}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [method, setMethod] = useState<'mpesa' | 'manual'>(initialMethod);
  const [manualRevealed, setManualRevealed] = useState(initialMethod === 'manual');
  const [manualChannel, setManualChannel] = useState<ManualChannel>('PAYBILL');
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [manualResult, setManualResult] = useState<ManualPayment | null>(null);
  const [manualReplayed, setManualReplayed] = useState(false);
  const manualAlertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getOrder(orderNumber, confirmationToken).then(setOrder).catch((reason) => setError(reason instanceof Error ? reason.message : 'We could not load this order.'));
    getOrderDelivery(orderNumber, confirmationToken).then(setDelivery).catch(() => undefined);
  }, [confirmationToken, orderNumber]);

  // Backend-authoritative polling while an automated attempt is pending.
  // Never marks anything paid locally — the server state decides.
  useEffect(() => {
    if (!payment || payment.status === 'PAID' || payment.status === 'FAILED') return undefined;
    const timer = setInterval(() => {
      getPaymentStatus(payment.id, confirmationToken).then((next) => {
        setPayment(next);
        if (next.status === 'FAILED') {
          setManualRevealed(true);
          setPaymentMessage('M-Pesa payment was not completed. You can try automated M-Pesa again or use our manual M-Pesa payment option below.');
          setPaymentAttemptKey(`payment-${orderNumber}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        }
        if (next.status === 'PAID') {
          getOrder(orderNumber, confirmationToken).then(setOrder).catch(() => undefined);
        }
      }).catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [confirmationToken, orderNumber, payment]);

  const phase: AutoPhase = payment?.status === 'PAID' || order?.paymentStatus === 'PAID' ? 'PAID' : phaseFor(payment?.status, paymentBusy);
  const paid = phase === 'PAID';
  const failed = phase === 'FAILED';
  const waiting = phase === 'STK_SENT' || phase === 'WAITING_FOR_CONFIRMATION';
  const waitingLong = waiting && waitingSince !== null && Date.now() - waitingSince > 60_000;

  async function startPayment() {
    setPaymentBusy(true);
    setPaymentMessage('');
    try {
      const result = await initiateMpesaPayment(orderNumber, paymentAttemptKey, confirmationToken);
      setPayment(result.payment);
      setPaymentMessage(result.customerMessage);
      if (result.payment.status === 'PENDING') setWaitingSince(Date.now());
      if (result.payment.status === 'FAILED') {
        setManualRevealed(true);
        setPaymentAttemptKey(`payment-${orderNumber}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      }
    } catch (reason) {
      setPaymentMessage(reason instanceof Error ? reason.message : 'We could not start the M-Pesa payment.');
    } finally {
      setPaymentBusy(false);
    }
  }

  async function checkStatus() {
    if (!payment || querying) return;
    setQuerying(true);
    try {
      const result = await queryPaymentStatus(payment.id, confirmationToken);
      setPayment(result.payment);
      if (result.payment.status === 'FAILED') {
        setManualRevealed(true);
        setPaymentMessage('M-Pesa payment was not completed. You can try automated M-Pesa again or use our manual M-Pesa payment option below.');
        setPaymentAttemptKey(`payment-${orderNumber}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      } else {
        setPaymentMessage(result.refreshed ? 'Payment status updated.' : result.pending ? 'Still waiting for M-Pesa confirmation. You can wait, check again shortly, or use another payment option below.' : '');
      }
      if (result.payment.status === 'PAID') getOrder(orderNumber, confirmationToken).then(setOrder).catch(() => undefined);
    } catch (reason) {
      setPaymentMessage(reason instanceof Error ? reason.message : 'We could not check the payment status right now.');
    } finally {
      setQuerying(false);
    }
  }

  async function submitManual(event: { preventDefault: () => void }) {
    event.preventDefault();
    const validation = manualReferenceError(manualCode);
    if (validation) {
      setManualError(validation);
      manualAlertRef.current?.focus();
      return;
    }
    setManualBusy(true);
    setManualError('');
    try {
      const result = await submitManualPayment(
        { orderNumber, transactionCode: normalizeManualReference(manualCode), channel: manualChannel },
        confirmationToken,
      );
      setManualResult(result.payment);
      setManualReplayed(result.replayed);
    } catch (reason) {
      setManualError(reason instanceof Error ? reason.message : 'We could not submit your payment details. Please try again.');
      manualAlertRef.current?.focus();
    } finally {
      setManualBusy(false);
    }
  }

  if (error) return <div className="empty-state"><h1>Order unavailable</h1><p>{error}</p><Link className="button" href="/shop">Continue shopping</Link></div>;
  if (!order) return <JBPageLoader message="Loading your confirmation…" />;

  return (
    <div className="confirmation-layout confirmation-layout--payment">
      <section className="confirmation-card" aria-labelledby="payment-heading">
        <p className="eyebrow">Order created</p>
        <h1 id="payment-heading">Thank you, {order.customerName?.split(' ')[0] ?? 'there'}.</h1>
        <p>Your order number is <strong>{order.orderNumber}</strong>.</p>
        <div className="status-row">
          <span>Payment <strong>{paid ? 'PAID' : (payment?.status ?? order.paymentStatus)}</strong></span>
          <span>Fulfillment <strong>{order.fulfillmentStatus}</strong></span>
        </div>

        {paid ? (
          <JBAlert
            tone="success"
            title="Payment successful"
            message={`Your payment has been confirmed. Order ${order.orderNumber} · Amount paid: KES ${order.grandTotal.toLocaleString('en-KE')}${payment?.providerReference ? ` · Ref ${payment.providerReference}` : ''}.`}
          />
        ) : (
          <>
            <h2>Payment method</h2>
            <div className="choice-list" role="radiogroup" aria-label="Payment method">
              <label className="choice">
                <input type="radio" name="pay-method" checked={method === 'mpesa'} onChange={() => setMethod('mpesa')} />
                <span><strong>M-Pesa</strong><small>Pay automatically via STK Push — a prompt is sent to your phone.</small></span>
              </label>
              <label className="choice">
                <input type="radio" name="pay-method" checked={method === 'manual'} onChange={() => { setMethod('manual'); setManualRevealed(true); }} />
                <span><strong>Manual M-Pesa</strong><small>Use Paybill or Pochi La Biashara if automatic payment does not work.</small></span>
              </label>
            </div>

            {method === 'mpesa' ? (
              <div className="payment-pane">
                {waiting ? (
                  <div className="payment-processing" role="status" aria-live="polite" aria-label="M-Pesa payment is being processed">
                    <span className="payment-processing__mark" aria-hidden="true"><JBLogo variant="compact" alt="" height={32} /></span>
                    <strong>Waiting for M-Pesa confirmation…</strong>
                    <p className="muted-copy">Please check your phone and enter your M-Pesa PIN. Do not close or refresh this page while payment is being processed.</p>
                    <p className="muted-copy">{paymentMessage || 'STK Push sent. Waiting for confirmation…'}</p>
                    <div className="cta-row">
                      <button type="button" className="button button--secondary" disabled={querying} onClick={checkStatus} aria-busy={querying}>
                        {querying ? <JBButtonLoader label="Checking…" /> : 'Check status'}
                      </button>
                    </div>
                    {waitingLong ? (
                      <JBAlert tone="info" title="Still waiting for confirmation" message="You can keep waiting, check again, or use the manual M-Pesa option below — your order is safe and no duplicate order will be created." />
                    ) : null}
                  </div>
                ) : (
                  <>
                    {failed || paymentMessage ? (
                      <JBAlert
                        tone={failed ? 'error' : 'info'}
                        title={failed ? 'M-Pesa payment unsuccessful' : 'Payment update'}
                        message={paymentMessage || 'Payment was not completed. You can try again.'}
                      />
                    ) : null}
                    {failed ? (
                      <div className="cta-row">
                        <button type="button" className="button" disabled={paymentBusy} aria-busy={paymentBusy} onClick={startPayment}>
                          {paymentBusy ? <JBButtonLoader label="Starting M-Pesa…" /> : 'Try M-Pesa again'}
                        </button>
                        <button type="button" className="button button--secondary" onClick={() => { setMethod('manual'); setManualRevealed(true); }}>
                          Use manual M-Pesa payment
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="button" disabled={paymentBusy} aria-busy={paymentBusy} onClick={startPayment}>
                        {paymentBusy ? <JBButtonLoader label="Starting M-Pesa payment…" /> : 'Pay with M-Pesa'}
                      </button>
                    )}
                    {payment && !failed ? (
                      <button type="button" className="text-button" disabled={querying} onClick={checkStatus}>
                        {querying ? 'Checking…' : 'Check status'}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {method === 'manual' || manualRevealed ? (
              <div className="payment-pane payment-pane--manual" id="manual-mpesa">
                <h3>Pay manually via M-Pesa</h3>
                <p className="muted-copy">If automatic M-Pesa payment does not work, you can complete your payment manually using either of the options below.</p>

                <div className="manual-amount" role="status" aria-label="Amount to pay">
                  <span>Amount to pay</span>
                  <strong><PriceDisplay price={order.grandTotal} /></strong>
                </div>

                <div className="manual-options">
                  <div className="manual-option">
                    <h4>M-Pesa Paybill</h4>
                    <dl>
                      <div><dt>Paybill Number</dt><dd><strong>{MPESA_PAYBILL_NUMBER}</strong></dd></div>
                      <div><dt>Account Number</dt><dd><strong>{MPESA_ACCOUNT_NUMBER}</strong></dd></div>
                    </dl>
                    <div className="cta-row">
                      <CopyButton value={MPESA_PAYBILL_NUMBER} label="Paybill number" />
                      <CopyButton value={MPESA_ACCOUNT_NUMBER} label="Account number" />
                    </div>
                  </div>
                  <p className="manual-divider" aria-hidden="true">OR</p>
                  <div className="manual-option">
                    <h4>Pochi La Biashara</h4>
                    <dl>
                      <div><dt>Send Money To</dt><dd><strong>{MPESA_POCHI_DISPLAY}</strong></dd></div>
                    </dl>
                    <div className="cta-row">
                      <CopyButton value={MPESA_POCHI_DISPLAY} label="Pochi La Biashara number" />
                      <a className="button button--secondary button--small" href="tel:+254741298268">Call JB Mercantile</a>
                    </div>
                  </div>
                </div>

                <div className="manual-how">
                  <h4>How to pay</h4>
                  <ol>
                    <li>Open M-Pesa on your phone.</li>
                    <li>Select Lipa na M-Pesa.</li>
                    <li>Choose Pay Bill.</li>
                    <li>Enter Paybill Number: {MPESA_PAYBILL_NUMBER}.</li>
                    <li>Enter Account Number: {MPESA_ACCOUNT_NUMBER}.</li>
                    <li>Enter the amount shown above.</li>
                    <li>Complete the M-Pesa payment.</li>
                    <li>Keep your M-Pesa confirmation message.</li>
                  </ol>
                  <p className="muted-copy">Prefer Pochi La Biashara? Send Money to {MPESA_POCHI_DISPLAY}, then keep the confirmation message.</p>
                </div>

                {manualResult ? (
                  <div ref={manualAlertRef} tabIndex={-1}>
                    <JBAlert
                      tone="success"
                      title={manualReplayed ? 'Payment details already received' : 'Payment details submitted'}
                      message={`Reference ${manualResult.providerReference} is awaiting staff verification for order ${order.orderNumber}. Your order is NOT marked as paid yet — we will confirm it after verification. Need help? Call ${JB_CONTACT_PHONE_DISPLAY}.`}
                    />
                  </div>
                ) : (
                  <form onSubmit={submitManual} className="manual-form" aria-label="Submit manual payment details">
                    <h4>Submit your payment for verification</h4>
                    <div className="choice-list" role="radiogroup" aria-label="Manual payment channel">
                      <label className="choice">
                        <input type="radio" name="manual-channel" checked={manualChannel === 'PAYBILL'} onChange={() => setManualChannel('PAYBILL')} />
                        <span><strong>Paybill</strong><small>{MPESA_PAYBILL_NUMBER} · Account {MPESA_ACCOUNT_NUMBER}</small></span>
                      </label>
                      <label className="choice">
                        <input type="radio" name="manual-channel" checked={manualChannel === 'POCHI'} onChange={() => setManualChannel('POCHI')} />
                        <span><strong>Pochi La Biashara</strong><small>Send Money to {MPESA_POCHI_DISPLAY}</small></span>
                      </label>
                    </div>
                    <label>M-Pesa transaction code
                      <input
                        value={manualCode}
                        onChange={(event) => setManualCode((event.target as unknown as { value: string }).value)}
                        placeholder="e.g. QHX123ABC"
                        autoComplete="off"
                        maxLength={12}
                        aria-describedby="manual-code-hint"
                        aria-invalid={manualError ? true : undefined}
                      />
                      <small id="manual-code-hint">From your M-Pesa confirmation message — 6–12 letters and numbers.</small>
                    </label>
                    {manualError ? (
                      <div ref={manualAlertRef} tabIndex={-1}>
                        <JBAlert tone="error" title="We could not accept that code" message={manualError} />
                      </div>
                    ) : null}
                    <button type="submit" className="button" disabled={manualBusy} aria-busy={manualBusy}>
                      {manualBusy ? <JBButtonLoader label="Submitting…" /> : 'Submit payment details'}
                    </button>
                    <p className="muted-copy">Submitting your details does not mark the order as paid. JB Mercantile verifies every manual payment before confirming your order. After completing the payment, you can also contact us on <a href={JB_CONTACT_PHONE_TEL}>{JB_CONTACT_PHONE_DISPLAY}</a> with your order number and M-Pesa transaction code.</p>
                  </form>
                )}
              </div>
            ) : null}

            <div className="payment-trust">
              <JBIcon name="lock" size={16} />
              <p className="muted-copy"><strong>Secure payment.</strong> Your order is only marked as paid after payment is confirmed. Need help? <a href={JB_CONTACT_PHONE_TEL}>{JB_CONTACT_PHONE_DISPLAY}</a></p>
            </div>
          </>
        )}

        <div className="cta-row">
          <Link className="button button--secondary" href="/shop">Continue shopping</Link>
          <Link className="button button--secondary" href={`/account/orders`}>Track in My Orders</Link>
        </div>
      </section>

      <section className="confirmation-card" aria-label="Order summary">
        <h2>Order summary</h2>
        {order.items.map((item) => (
          <div className="summary-line" key={`${item.sku}-${item.quantity}`}>
            <span>{item.productName}<small>{item.variantDescription} × {item.quantity}</small></span>
            <PriceDisplay price={item.total} />
          </div>
        ))}
        <div className="summary-total"><span>Subtotal</span><PriceDisplay price={order.subtotal} /></div>
        {order.discountTotal ? <div className="summary-line"><span>Discount</span><span>−<PriceDisplay price={order.discountTotal} /></span></div> : null}
        <div className="summary-line"><span>Delivery</span><PriceDisplay price={order.shippingTotal} /></div>
        <div className="summary-total"><span>Total</span><PriceDisplay price={order.grandTotal} /></div>
        {delivery ? (
          <div className="delivery-timeline">
            <h2>Delivery</h2>
            <div className="timeline-entry"><span>{delivery.method?.name ?? 'Delivery'}</span><small>{delivery.status.replace(/_/g, ' ')}</small></div>
            {delivery.trackingNumber ? <div className="timeline-entry"><span>Tracking</span><small>{delivery.trackingNumber}</small></div> : null}
          </div>
        ) : null}
        <div className="payment-trust">
          <JBIcon name="truck" size={16} />
          <p className="muted-copy">We deliver across Kenya. M-Pesa available. Questions? <a href={JB_CONTACT_PHONE_TEL}>{JB_CONTACT_PHONE_DISPLAY}</a></p>
        </div>
      </section>
    </div>
  );
}
