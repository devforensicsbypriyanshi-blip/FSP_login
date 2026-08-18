'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef } from 'react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Modal dialog.
 *
 * Four things a modal must do that a styled div does not, all of them here:
 *
 *   1. Trap focus. Tab from the last control must return to the first, or the
 *      user tabs into the page behind and cannot see where they are.
 *   2. Close on Escape.
 *   3. Lock body scroll — and preserve the scrollbar width, or the page shifts
 *      sideways as the dialog opens.
 *   4. Return focus to whatever opened it. Without this a keyboard user is
 *      dumped back at the top of the document.
 *
 * On mobile it is a bottom sheet, because a centred box on a 375px screen with
 * the keyboard up leaves almost nothing visible.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    // Replace the scrollbar's width with padding, or the page jumps left.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    document.addEventListener('keydown', handleKeyDown);

    // Focus the panel itself, not the first control: reading the title before
    // landing on "Delete" is the difference between informed and startled.
    const focusTimer = setTimeout(() => panelRef.current?.focus(), 0);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
      clearTimeout(focusTimer);
      restoreTo.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg' }[size];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-sm motion-safe:animate-[fade-in_150ms_ease-out]"
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'bg-surface relative flex max-h-[90dvh] w-full flex-col rounded-t-3xl shadow-2xl outline-none sm:rounded-2xl',
          'motion-safe:animate-[sheet-up_180ms_ease-out]',
          width
        )}
      >
        <div className="border-line flex items-start gap-3 border-b p-5 pb-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-ink text-base font-bold">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="text-ink-muted mt-1.5 text-[13px] leading-relaxed">
                {description}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-ink-muted hover:bg-hover -m-2 grid size-11 shrink-0 place-items-center rounded-full"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {children && <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>}

        {footer && (
          <div className="border-line flex flex-col-reverse gap-2 border-t p-5 pt-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
