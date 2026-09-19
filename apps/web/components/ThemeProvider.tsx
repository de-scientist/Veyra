'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { JBIcon, type JBIconName } from './JBIcons';

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

const MODES: Array<{ value: ThemeMode; label: string; icon: JBIconName }> = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const active = MODES.find((m) => m.value === mode) ?? MODES[2];
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Move focus to the checked option when the menu opens.
    const menu = menuRef.current;
    const checked = menu?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? menu?.querySelector<HTMLElement>('button'))?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      // Tab out of the menu dismisses it (focus returns to the toggle via
      // the close path) instead of leaving a detached open menu behind.
      if (event.key === 'Tab' && menu && !menu.contains(document.activeElement)) {
        setOpen(false);
        return;
      }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && menu) {
        event.preventDefault();
        const items = Array.from(menu.querySelectorAll<HTMLElement>('button'));
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    };
    const onPointer = (event: MouseEvent) => {
      const root = toggleRef.current?.closest('.theme-toggle');
      if (root && !root.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open ]);

  return (
    <div className="theme-toggle">
      <button
        ref={toggleRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Appearance: ${active.label}. Change theme`}
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', minHeight: 44, padding: '0 0.75rem', borderRadius: 999, border: 0, background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer' }}
      >
        <JBIcon name={active.icon} />
        {!compact && <span className="header-label">{active.label}</span>}
      </button>
      {open ? (
        <div className="theme-menu" ref={menuRef} role="menu" aria-label="Appearance">
          {MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              role="menuitemradio"
              aria-checked={mode === item.value}
              onClick={() => {
                setMode(item.value);
                setOpen(false);
                toggleRef.current?.focus();
              }}
            >
              <JBIcon name={item.icon} />
              {item.label}
              {mode === item.value ? <span className="theme-menu__check" aria-hidden="true"><JBIcon name="check" size={16} /></span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
