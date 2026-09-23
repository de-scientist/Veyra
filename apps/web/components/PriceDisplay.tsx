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
  return (
    <div className={className} aria-label={`Price ${formatPrice(price)}`}>
      <span>{formatPrice(price)}</span>
      {compareAtPrice && compareAtPrice > price ? (
        <span style={{ textDecoration: 'line-through', opacity: 0.6, marginLeft: '0.5rem' }}>
          {formatPrice(compareAtPrice)}
        </span>
      ) : null}
    </div>
  );
}
