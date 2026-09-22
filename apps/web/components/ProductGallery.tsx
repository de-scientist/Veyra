'use client';

import { useState } from 'react';

import { ProductImage } from './ProductImage';

/**
 * Product gallery: primary image (detail delivery preset), thumbnails,
 * ArrowLeft/ArrowRight keyboard navigation, loading + fallback states.
 */
export function ProductGallery({ images, productName }: { images: string[]; productName: string }) {
  const [selected, setSelected] = useState(0);
  const current = images[selected] ?? images[0];

  const step = (delta: number) => {
    setSelected((prev) => (prev + delta + images.length) % images.length);
  };

  if (!current) {
    return (
      <div className="product-gallery__main">
        <div className="product-gallery__fallback" role="img" aria-label={`${productName} — image unavailable`}>
          Product image coming soon
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        className="product-gallery__main"
        role="region"
        aria-label={`${productName} image viewer`}
        tabIndex={images.length > 1 ? 0 : undefined}
        onKeyDown={(event) => {
          if (images.length < 2) return;
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            step(-1);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            step(1);
          }
        }}
      >
        <ProductImage key={current} src={current} alt={`${productName} — view ${selected + 1}`} eager preset="detail" />
      </div>
      {images.length > 1 ? (
        <div className="product-gallery__thumbs" role="group" aria-label="Product images">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              className={`product-gallery__thumb${index === selected ? ' is-selected' : ''}`}
              aria-pressed={index === selected}
              aria-label={`Show image ${index + 1} of ${images.length}`}
              onClick={() => setSelected(index)}
            >
              <ProductImage src={image} alt="" width={144} height={180} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
