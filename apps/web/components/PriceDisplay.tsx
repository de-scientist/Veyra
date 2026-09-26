type PriceDisplayProps = {
  price: number;
  compareAtPrice?: number;
  className?: string;
};

const formatPrice = (value: number) =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(value);

export function PriceDisplay({ price, compareAtPrice, className = '' }: PriceDisplayProps) {
  // Renders a <span> (phrasing content), never a <div>: callers embed this
  // inside <p>, <span>, and <small> (e.g. the storefront product summary).
  // A <div> root there produces "In HTML, <div> cannot be a descendant of
  // <p>" hydration failures. No suppressHydrationWarning is used — server
  // and client markup are naturally identical.
  return (
    <span className={className} aria-label={`Price ${formatPrice(price)}`}>
      <span>{formatPrice(price)}</span>
      {compareAtPrice && compareAtPrice > price ? (
        <span style={{ textDecoration: 'line-through', opacity: 0.6, marginLeft: '0.5rem' }}>
          {formatPrice(compareAtPrice)}
        </span>
      ) : null}
    </span>
  );
}
