/**
 * `cn()` — single class-composition primitive for the web app.
 *
 * Zero-dependency (falsy + array flattening) so no new JS weight is added to
 * the storefront bundle. If conditional/conflicting utilities grow complex,
 * adopt `tailwind-merge` + `clsx` here behind this same signature — call sites
 * must not change.
 */
type ClassValue = string | false | null | undefined | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (value: ClassValue): void => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const v of value) walk(v);
      return;
    }
    out.push(value);
  };
  for (const input of inputs) walk(input);
  return out.join(" ");
}
