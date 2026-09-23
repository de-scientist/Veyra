'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { HERO_AUTOPLAY_MS, HERO_SLIDES } from '../lib/hero-slides';
import { JBIcon } from './JBIcons';

/**
 * JB Mercantile promotional hero carousel.
 * JB brand system + department imagery; functional UX reference only —
 * no third-party branding, assets, or copy.
 */
export function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const regionRef = useRef<HTMLElement>(null);
  const touchX = useRef<number | null>(null);
  const count = HERO_SLIDES.length;

  const goTo = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count);
    },
    [count],
  );
  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);

  // Reduced-motion: disable autoplay entirely.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // Autoplay: ~6s, paused on hover/focus/hidden/reduced-motion/interaction.
  useEffect(() => {
    if (paused || reducedMotion || count < 2) return;
    const onVisibility = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % count);
    }, HERO_AUTOPLAY_MS);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [paused, reducedMotion, count]);

  // Keyboard navigation on the region.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goPrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goNext();
    } else if (e.key === 'Home') {
      e.preventDefault();
      goTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      goTo(count - 1);
    }
  };

  return (
    <section
      ref={regionRef}
      className="jb-hero-carousel"
      aria-roledescription="carousel"
      aria-label="Featured departments"
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const endX = e.changedTouches[0]?.clientX ?? touchX.current;
        const delta = endX - touchX.current;
        touchX.current = null;
        if (Math.abs(delta) < 40) return;
        if (delta < 0) goNext();
        else goPrev();
      }}
    >
      <div className="jb-hero-carousel__viewport">
        <ul className="jb-hero-carousel__track" aria-live={reducedMotion ? 'polite' : 'off'}>
          {HERO_SLIDES.map((slide, i) => (
            <li
              key={slide.id}
              className={`jb-hero-carousel__slide${i === index ? ' is-active' : ''}`}
              aria-hidden={i !== index}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}: ${slide.title}`}
            >
              <div className="hero hero--carousel">
                <div className="hero__content">
                  <p className="eyebrow">{slide.eyebrow}</p>
                  <h1 id={i === 0 ? 'jb-hero-heading' : undefined}>{slide.title}</h1>
                  <p>{slide.description}</p>
                  <div className="cta-row">
                    <Link
                      href={slide.href as never}
                      className="button"
                      tabIndex={i === index ? 0 : -1}
                    >
                      {slide.ctaLabel}
                    </Link>
                    <Link
                      href={'/shop' as never}
                      className="button button--secondary"
                      tabIndex={i === index ? 0 : -1}
                    >
                      Browse all
                    </Link>
                  </div>
                </div>
                <div className="hero__media hero__media--single" aria-hidden={i !== index}>
                  <Image
                    src={slide.image}
                    alt={i === index ? slide.imageAlt : ''}
                    width={900}
                    height={640}
                    priority={i === 0}
                    sizes="(max-width: 768px) 100vw, 45vw"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="jb-hero-carousel__controls">
        <button
          type="button"
          className="jb-hero-carousel__arrow"
          onClick={goPrev}
          aria-label="Previous slide"
        >
          <JBIcon name="chevron-left" size={20} />
        </button>
        <div className="jb-hero-carousel__dots" role="group" aria-label="Choose slide">
          {HERO_SLIDES.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              className={`jb-hero-carousel__dot${i === index ? ' is-active' : ''}`}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}: ${slide.title}`}
              aria-current={i === index ? 'true' : undefined}
            />
          ))}
        </div>
        <button
          type="button"
          className="jb-hero-carousel__arrow"
          onClick={goNext}
          aria-label="Next slide"
        >
          <JBIcon name="chevron-right" size={20} />
        </button>
      </div>
      <span className="visually-hidden" role="status">
        Showing slide {index + 1} of {count}
      </span>
    </section>
  );
}
