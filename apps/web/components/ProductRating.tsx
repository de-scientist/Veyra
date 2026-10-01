import { ratingAccessibleLabel } from '../lib/product-card';

const STAR_PATH = 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

/**
 * Compact rating row: five partially-filled stars (real backend average)
 * plus numeric `4.8 (24)`. The accessible name carries the full meaning;
 * visuals are supplemental (never color-only).
 */
export function ProductRating({ average, count, productName }: { average: number; count: number; productName: string }) {
  return (
    <span className="product-card__rating" role="img" aria-label={ratingAccessibleLabel(average, count, productName)}>
      <span className="product-card__stars" aria-hidden="true">
        <span className="product-card__stars-base">
          {[1, 2, 3, 4, 5].map((index) => (
            <svg key={index} width="14" height="14" viewBox="0 0 24 24" focusable="false">
              <path d={STAR_PATH} />
            </svg>
          ))}
        </span>
        <span className="product-card__stars-fill" style={{ width: `${(average / 5) * 100}%` }}>
          {[1, 2, 3, 4, 5].map((index) => (
            <svg key={index} width="14" height="14" viewBox="0 0 24 24" focusable="false">
              <path d={STAR_PATH} />
            </svg>
          ))}
        </span>
      </span>
      <span className="product-card__rating-text" aria-hidden="true">
        {average.toFixed(1)} ({count})
      </span>
    </span>
  );
}
