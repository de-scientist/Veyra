/**
 * Safe JSON-LD serialization (Phase I hardening).
 *
 * `JSON.stringify` does not escape `<`, so a `</script>` sequence inside
 * merchant-controlled text (product names, descriptions, collection copy)
 * could break out of the `<script type="application/ld+json">` container.
 * Escaping `<` as `\u003c` is valid JSON and neutralizes the vector while
 * leaving every consumer-visible value identical.
 */
export function toJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
