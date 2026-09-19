'use client';

/**
 * Single consistent JB interface icon system: 24px grid, 1.8px stroke,
 * round caps/joins, currentColor. Decorative by default (aria-hidden);
 * interactive usages get their accessible name from the wrapping button.
 */

const PATHS: Record<string, string[]> = {
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35'],
  user: ['M20 21a8 8 0 0 0-16 0', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M10.3 21a2 2 0 0 0 3.4 0'],
  heart: ['M19 14c1.5-1.5 3-3.3 3-5.5A4.5 4.5 0 0 0 17.5 4c-1.8 0-3.4 1-4.5 2.5C11.9 5 10.3 4 8.5 4A4.5 4.5 0 0 0 4 8.5c0 2.2 1.5 4 3 5.5l5 5Z'],
  cart: ['M6 7h15l-1.5 9h-12ZM6 7 5 4H2', 'M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z'],
  home: ['M4 11l8-7 8 7', 'M6 10v10h12V10'],
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  box: ['M21 8l-9-5-9 5v8l9 5 9-5V8Z', 'M3 8l9 5 9-5', 'M12 13v8'],
  pin: ['M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
  refresh: ['M20 11A8 8 0 0 0 5.6 6.6L4 8m0 0V4m0 4h4', 'M4 13a8 8 0 0 0 14.4 4.4L20 16m0 0v4m0-4h-4'],
  card: ['M2 7h20v10H2z', 'M2 10h20'],
  cash: ['M2 7h20v10H2z', 'M16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z'],
  lock: ['M6 11h12v10H6z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  sliders: ['M4 6h16', 'M4 12h16', 'M4 18h16', 'M15 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M9 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
  chart: ['M5 20v-6', 'M11 20V6', 'M17 20v-9', 'M3 20h18'],
  truck: ['M1 5h13v11H1z', 'M14 9h4l4 4v3h-8', 'M6 19a1.6 1.6 0 1 0 0-.01', 'M18 19a1.6 1.6 0 1 0 0-.01'],
  tag: ['M20.59 13.41 11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.83Z', 'M7 7h.01'],
  clipboard: ['M8 2h8v4H8z', 'M6 4H4v18h16V4h-2', 'M9 12h6', 'M9 16h6'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  star: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z'],
  ticket: ['M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6Z', 'M13 5v2', 'M13 11v2', 'M13 17v2'],
  doc: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z', 'M14 2v6h6', 'M9 13h6', 'M9 17h6'],
  sun: ['M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 16v2M4.2 4.2l1.4 1.4m11.2 11.2 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M17.8 6.4l1.4-1.4'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z'],
  monitor: ['M8 21h8', 'M12 17v4', 'M2 3h20v14H2z'],
  check: ['M20 6L9 17l-5-5'],
  chevron: ['M6 9l6 6 6-6'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  filter: ['M22 3H2l8 9.5V19l4 2v-8.5L22 3Z'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'],
};

export type JBIconName = keyof typeof PATHS;

export function JBIcon({ name, size = 18, label }: { name: JBIconName; size?: number; label?: string }) {
  const paths = PATHS[name];
  if (!paths) return null;
  if (label) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label}>
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
