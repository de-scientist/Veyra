import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PriceDisplay } from '../components/PriceDisplay';

// PriceDisplay.tsx relies on the automatic JSX runtime (no React import),
// while vitest compiles it with the classic transform: provide the global.
(globalThis as { React?: typeof React }).React = React;

describe('PriceDisplay valid HTML structure', () => {
  it('renders a span root — never a div — so it can nest inside <p>', () => {
    const html = renderToStaticMarkup(createElement(PriceDisplay, { price: 1500 }));
    expect(html.startsWith('<span')).toBe(true);
    expect(html).not.toContain('<div');
    expect(html).toContain('1,500');
  });

  it('renders discounted prices without introducing block elements', () => {
    const html = renderToStaticMarkup(
      createElement(PriceDisplay, { price: 1200, compareAtPrice: 2000 }),
    );
    expect(html.startsWith('<span')).toBe(true);
    expect(html).not.toContain('<div');
    expect(html).toContain('line-through');
  });

  it('matches the storefront composition: price inside a paragraph', () => {
    const html = renderToStaticMarkup(
      createElement('p', { className: 'muted-copy' }, 'From ', createElement(PriceDisplay, { price: 999 })),
    );
    expect(html.startsWith('<p')).toBe(true);
    expect(html).not.toContain('<div');
  });
});
