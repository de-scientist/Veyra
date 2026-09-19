/**
 * Reusable JB Mercantile logo. A geometric royal-blue lettermark (SVG) plus
 * an optional wordmark lockup. Theme-aware via currentColor/CSS variables —
 * use everywhere instead of ad-hoc text logos.
 */

export function JBMark({ size = 36, label = 'JB' }: { size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      className="jb-logo__mark"
    >
      <rect x="2" y="2" width="60" height="60" rx="15" fill="var(--jb-primary)" />
      <rect x="2" y="2" width="60" height="60" rx="15" fill="none" stroke="var(--jb-border-strong)" strokeWidth="1.5" opacity="0.5" />
      <path
        d="M25 18v22.5c0 5.2-3.4 8.5-8 8.5-2 0-3.9-.7-5.2-1.9l2.6-3.4c.8.7 1.8 1.1 2.8 1.1 2.2 0 3.6-1.5 3.6-4.3V18H25Z"
        fill="var(--jb-primary-foreground)"
      />
      <path
        d="M32 18h9.5c4.6 0 7.7 2.4 7.7 6.2 0 2.6-1.5 4.5-3.8 5.3 3 .8 5 3 5 6.1 0 4.3-3.4 7-8.3 7H32V18Zm4.2 4v7.2h4.6c2.5 0 4-1.3 4-3.6s-1.5-3.6-4-3.6h-4.6Zm0 11.2v7.6h5.4c2.7 0 4.3-1.4 4.3-3.8s-1.6-3.8-4.3-3.8h-5.4Z"
        fill="var(--jb-primary-foreground)"
      />
    </svg>
  );
}

export function JBLogo({
  size = 36,
  showWordmark = true,
  descriptor = 'Fashion • Footwear • Kitchen & Home',
}: {
  size?: number;
  showWordmark?: boolean;
  descriptor?: string | null;
}) {
  return (
    <span className="jb-logo">
      <JBMark size={size} label="JB Mercantile logo" />
      {showWordmark ? (
        <span className="jb-logo__wordmark">
          <span className="jb-logo__name">JB MERCANTILE</span>
          {descriptor ? <span className="jb-logo__descriptor">{descriptor}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
