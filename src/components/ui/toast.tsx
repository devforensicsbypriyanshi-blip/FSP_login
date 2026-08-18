'use client';

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Toasts.
 *
 * The original HTML mockups called showToast() from everywhere; there was no
 * React equivalent, so Server Action results had nowhere to go but inline
 * paragraphs. This is that missing piece.
 *
 * Accessibility decisions that are not optional here:
 *   - The live region exists in the DOM from first render. Screen readers only
 *     announce changes *within* an existing live region; one created at the same
 *     moment as its content is silent.
 *   - `assertive` for errors, `polite` for everything else. An error interrupts;
 *     a success message waits its turn.
 *   - Errors do not auto-dismiss. A message you might have missed is not a
 *     message, and errors are the ones worth reading twice.
 */

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** Optional heading above the message. */
  title?: string;
}

interface ToastContextValue {
  toast: (input: { tone?: ToastTone; title?: string; message: string }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE: Record<ToastTone, { icon: LucideIcon; className: string; iconClass: string }> = {
  success: {
    icon: CheckCircle2,
    className: 'border-success-border bg-success-bg text-success',
    iconClass: 'text-success',
  },
  error: { icon: XCircle, className: 'border-error-border bg-error-bg text-error', iconClass: 'text-error' },
  warning: {
    icon: AlertTriangle,
    className: 'border-warning-border bg-warning-bg text-warning',
    iconClass: 'text-warning',
  },
  info: { icon: Info, className: 'border-info-border bg-info-bg text-info', iconClass: 'text-info' },
};

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback<ToastContextValue['toast']>(
    ({ tone = 'info', title, message }) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, tone, title, message }]);

      if (tone !== 'error') {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
        );
      }
    },
    [dismiss]
  );

  // Clear pending timers on unmount so a navigation mid-toast cannot fire
  // setState against a gone component.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Rendered unconditionally — see the note on live regions above. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:right-4 sm:bottom-4 sm:left-auto sm:items-end sm:pb-0"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((item) => {
          const { icon: Icon, className, iconClass } = TONE[item.tone];
          return (
            <div
              key={item.id}
              role={item.tone === 'error' ? 'alert' : 'status'}
              aria-live={item.tone === 'error' ? 'assertive' : 'polite'}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-3.5 shadow-lg',
                'motion-safe:animate-[toast-in_180ms_ease-out]',
                className
              )}
            >
              <Icon className={cn('mt-px size-[18px] shrink-0', iconClass)} aria-hidden />
              <div className="min-w-0 flex-1">
                {item.title && <p className="text-[13.5px] font-semibold">{item.title}</p>}
                <p className="text-[13px] leading-relaxed">{item.message}</p>
              </div>
              <button
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                className="-m-1.5 grid size-8 shrink-0 place-items-center rounded-full transition hover:bg-black/5"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Falls back to a no-op outside a provider rather than throwing. A missing
 * toast should never be the thing that takes a page down — the action it was
 * reporting on has already happened.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  return context ?? { toast: () => {} };
}
