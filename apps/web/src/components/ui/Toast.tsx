'use client';

import { CircleAlert, CircleCheck, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type ToastTone = 'success' | 'error' | 'neutral';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<{ show: (message: string, tone?: ToastTone) => void } | null>(null);

/**
 * Dark slate toast, bottom-centre, 4 seconds — for brief confirmations only. Important outcomes
 * must also appear on the page (DESIGN.md Toasts). The live region stays mounted so screen
 * readers announce every message.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (message: string, tone: ToastTone = 'neutral') => {
      const id = next.current++;
      setItems((xs) => [...xs.slice(-2), { id, message, tone }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-xs px-md"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-[480px] items-center gap-xs rounded-md bg-text-strong px-md py-sm text-body-md text-on-primary shadow-2"
          >
            {t.tone === 'success' && <CircleCheck className="size-4 shrink-0" aria-hidden />}
            {t.tone === 'error' && <CircleAlert className="size-4 shrink-0" aria-hidden />}
            <span>{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-mr-1 ml-xs rounded p-0.5 hover:bg-on-primary/10">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
