'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

type ToastItem = { id: number; type: ToastType; title?: string; message: string };

const ToastContext = createContext<{
  notify: (type: ToastType, message: string, title?: string) => void;
  notifyCard: (type: ToastType, title: string, description: string) => void;
}>({
  notify: () => undefined,
  notifyCard: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const lastKey = useRef<{ key: string; at: number } | null>(null);

  const push = useCallback((type: ToastType, message: string, title?: string) => {
    // One notification per completed action: collapse an identical
    // toast fired within 500ms (mutation hook + caller double-notify).
    const key = `${type}|${title ?? ''}|${message}`;
    const now = Date.now();
    if (lastKey.current && lastKey.current.key === key && now - lastKey.current.at < 500) return;
    lastKey.current = { key, at: now };
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-2), { id, type, title, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  const notify = useCallback(
    (type: ToastType, message: string, title?: string) => push(type, message, title),
    [push],
  );

  const notifyCard = useCallback(
    (type: ToastType, title: string, description: string) => push(type, description, title),
    [push],
  );

  return (
    <ToastContext.Provider value={{ notify, notifyCard }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.type}`}>
            {toast.title ? (
              <span className="toast__body">
                <strong className="toast__title">{toast.title}</strong>
                <span className="toast__message">{toast.message}</span>
              </span>
            ) : (
              toast.message
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
