'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'jb-mercantile-theme';

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
}

/** Blocking inline script — runs before first paint, prevents theme flash. */
export function ThemeScript() {
  const code = `(function(){try{var m=localStorage.getItem('${STORAGE_KEY}')||'system';var r=(m==='dark'||(m!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches))?'dark':'light';document.documentElement.setAttribute('data-theme',r);document.documentElement.style.colorScheme=r;}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

const ThemeContext = createContext<{ mode: ThemeMode; resolved: ResolvedTheme; setMode: (mode: ThemeMode) => void }>({
  mode: 'system',
  resolved: 'light',
  setMode: () => undefined,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial: ThemeMode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    setModeState(initial);
    setResolved(resolveTheme(initial));
  }, []);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    if (mode !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(query.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
    setResolved(resolveTheme(next));
  }, []);

  return <ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>;
}

const MODES: Array<{ value: ThemeMode; label: string; icon: string }> = [
  { value: 'light', label: 'Light', icon: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 16v2M4.2 4.2l1.4 1.4m11.2 11.2 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M17.8 6.4l1.4-1.4' },
  { value: 'dark', label: 'Dark', icon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z' },
  { value: 'system', label: 'System', icon: 'M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm2 13h12' },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const active = MODES.find((m) => m.value === mode) ?? MODES[2];

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open ]);

  return (
    <div className="theme-toggle">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Appearance: ${active.label}. Change theme`}
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', minHeight: 44, padding: '0 0.75rem', borderRadius: 999, border: 0, background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={active.icon} />
        </svg>
        {!compact && <span className="header-label">{active.label}</span>}
      </button>
      {open ? (
        <div className="theme-menu" role="menu" aria-label="Appearance">
          {MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              role="menuitemradio"
              aria-checked={mode === item.value}
              onClick={() => {
                setMode(item.value);
                setOpen(false);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={item.icon} />
              </svg>
              {item.label}
              {mode === item.value ? <span className="theme-menu__check" aria-hidden="true">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
