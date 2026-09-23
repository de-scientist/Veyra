import { describe, expect, it } from 'vitest';

import { toJsonLd } from './json-ld';

describe('toJsonLd (Phase I XSS hardening)', () => {
  it('serializes structured data identically for benign input', () => {
    expect(toJsonLd({ '@type': 'Product', name: 'Sneaker' })).toBe('{"@type":"Product","name":"Sneaker"}');
  });

  it('neutralizes script breakouts in merchant-controlled text', () => {
    const out = toJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c/script>');
    // Still valid JSON decoding to the original value.
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>' });
  });
});
