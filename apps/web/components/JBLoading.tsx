'use client';

import { JBLogo } from './JBLogo';

/**
 * Shared storefront loading primitives. The branded identity is the official
 * JB logo (never a generic spinner); structural placeholders use skeleton
 * geometry that approximates the real content. All motion is CSS-driven and
 * disabled under `prefers-reduced-motion` in globals.css.
 */

/** Branded page loader — JB mark with a subtle pulse + loading text. */
export function JBPageLoader({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="jb-loader" role="status" aria-live="polite" aria-label={message}>
      <span className="jb-loader__mark" aria-hidden="true">
        <JBLogo variant="compact" alt="" height={36} />
      </span>
      <span className="jb-loader__text">{message}</span>
    </div>
  );
}

/** Inline button progress label — callers set `aria-busy` + `disabled`. */
export function JBButtonLoader({ label = 'Working…' }: { label?: string }) {
  return (
    <span className="jb-button-loader" aria-hidden="true">
      <span className="jb-button-loader__dots">
        <span />
        <span />
        <span />
      </span>
      {label}
    </span>
  );
}

function SkeletonBlock({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

/** Skeleton matching `ProductCard` geometry (4:5 media + text lines + CTA). */
export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true" className="product-card product-card--skeleton">
      <SkeletonBlock className="product-card__media-skeleton" />
      <div className="product-card__body">
        <SkeletonBlock style={{ height: '0.7rem', width: '55%' }} />
        <SkeletonBlock style={{ height: '1rem', width: '90%' }} />
        <SkeletonBlock style={{ height: '1rem', width: '70%' }} />
        <SkeletonBlock style={{ height: '1.1rem', width: '45%' }} />
        <SkeletonBlock style={{ height: '44px', borderRadius: 'var(--jb-radius-pill)' }} />
      </div>
    </div>
  );
}

/** Grid of card skeletons with a polite loading announcement. */
export function ProductGridSkeleton({ count = 8, label = 'Loading products…' }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label}>
      <span className="visually-hidden">{label}</span>
      <div className="product-grid" aria-hidden="true">
        {Array.from({ length: count }).map((_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

/** Skeleton matching the PDP two-column layout (gallery + summary). */
export function ProductDetailSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading product…">
      <span className="visually-hidden">Loading product…</span>
      <div className="product-layout" aria-hidden="true">
        <div style={{ display: 'grid', gap: '1rem' }}>
          <SkeletonBlock style={{ aspectRatio: '4 / 5', borderRadius: 'var(--jb-radius-lg)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBlock key={i} style={{ aspectRatio: '4 / 5', borderRadius: 12 }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gap: '0.8rem', alignContent: 'start' }}>
          <SkeletonBlock style={{ height: '0.75rem', width: '40%' }} />
          <SkeletonBlock style={{ height: '2rem', width: '85%' }} />
          <SkeletonBlock style={{ height: '1rem', width: '50%' }} />
          <SkeletonBlock style={{ height: '1.5rem', width: '35%' }} />
          <SkeletonBlock style={{ height: '4rem' }} />
          <SkeletonBlock style={{ height: '44px', borderRadius: 'var(--jb-radius-pill)' }} />
          <SkeletonBlock style={{ height: '44px', borderRadius: 'var(--jb-radius-pill)' }} />
        </div>
      </div>
    </div>
  );
}

/** Skeleton matching the cart layout (items + summary). */
export function CartSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading your cart…">
      <span className="visually-hidden">Loading your cart…</span>
      <div className="cart-layout" aria-hidden="true">
        <div style={{ display: 'grid', gap: '1rem' }}>
          {[0, 1].map((i) => (
            <div key={i} className="cart-item">
              <SkeletonBlock style={{ width: 110, aspectRatio: '4 / 5', borderRadius: 12 }} />
              <div style={{ display: 'grid', gap: '0.6rem', alignContent: 'start', flex: 1 }}>
                <SkeletonBlock style={{ height: '1.1rem', width: '60%' }} />
                <SkeletonBlock style={{ height: '0.85rem', width: '40%' }} />
                <SkeletonBlock style={{ height: '44px', width: '12rem', borderRadius: 'var(--jb-radius-pill)' }} />
              </div>
            </div>
          ))}
        </div>
        <div className="cart-summary">
          <SkeletonBlock style={{ height: '1.2rem', width: '50%' }} />
          <SkeletonBlock style={{ height: '1.6rem', width: '70%' }} />
          <SkeletonBlock style={{ height: '44px', borderRadius: 'var(--jb-radius-pill)' }} />
        </div>
      </div>
    </div>
  );
}

/** Persistent contextual alert (shadcn-Alert pattern, JB tokens). */
export function JBAlert({
  tone = 'error',
  title,
  message,
  actionLabel,
  onAction,
}: {
  tone?: 'error' | 'warning' | 'info' | 'success';
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={`jb-alert jb-alert--${tone}`} role="alert">
      <div>
        <strong>{title}</strong>
        {message ? <p>{message}</p> : null}
      </div>
      {actionLabel && onAction ? (
        <button type="button" className="button button--secondary button--small" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Accessible quantity stepper: decrement/increment buttons + labelled input,
 * min/max clamping from authoritative stock, busy guard against race
 * conditions, full keyboard support via native controls.
 */
export function QuantityStepper({
  id = 'quantity',
  label = 'Quantity',
  value,
  min = 1,
  max,
  disabled = false,
  onChange,
}: {
  id?: string;
  label?: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const upper = max !== undefined && max > 0 ? max : undefined;
  const clamp = (next: number) => {
    if (!Number.isFinite(next)) return min;
    return Math.max(min, upper !== undefined ? Math.min(upper, Math.trunc(next)) : Math.trunc(next));
  };
  return (
    <div className="quantity-stepper">
      <span className="quantity-stepper__label" id={`${id}-label`}>
        {label}
      </span>
      <div className="quantity-stepper__control" role="group" aria-labelledby={`${id}-label`}>
        <button
          type="button"
          className="quantity-stepper__button"
          aria-label="Decrease quantity"
          disabled={disabled || value <= min}
          onClick={() => onChange(clamp(value - 1))}
        >
          −
        </button>
        <input
          id={id}
          type="number"
          min={min}
          max={upper}
          value={value}
          disabled={disabled}
          aria-describedby={upper !== undefined ? `${id}-max` : undefined}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
        />
        <button
          type="button"
          className="quantity-stepper__button"
          aria-label="Increase quantity"
          disabled={disabled || (upper !== undefined && value >= upper)}
          onClick={() => onChange(clamp(value + 1))}
        >
          +
        </button>
      </div>
      {upper !== undefined ? (
        <span className="muted-copy" id={`${id}-max`}>
          Max {upper} available
        </span>
      ) : null}
    </div>
  );
}
