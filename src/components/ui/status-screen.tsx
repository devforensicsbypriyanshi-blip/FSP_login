import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Full-page outcome screen: 403, 404, offline, unexpected error.
 *
 * One component for all of them so the tone stays consistent. Each says what
 * happened, then offers a way out — a dead end with no route back is the thing
 * that makes people close the tab.
 */
export function StatusScreen({
  icon: Icon,
  code,
  title,
  description,
  tone = 'neutral',
  children,
}: {
  icon: LucideIcon;
  /** Shown above the title. Omit for states that are not an HTTP status. */
  code?: string;
  title: string;
  description: React.ReactNode;
  tone?: 'neutral' | 'error' | 'warning';
  children?: React.ReactNode;
}) {
  const toneClass = {
    neutral: 'bg-primary-light text-primary',
    error: 'bg-error-bg text-error',
    warning: 'bg-warning-bg text-warning',
  }[tone];

  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <div className={cn('mb-5 grid size-16 place-items-center rounded-2xl', toneClass)}>
        <Icon className="size-8" aria-hidden />
      </div>

      {code && (
        <p className="text-ink-muted mb-1.5 text-xs font-semibold tracking-widest uppercase">{code}</p>
      )}

      <h1 className="font-display text-ink text-xl font-bold sm:text-2xl">{title}</h1>

      <div className="text-ink-muted mt-2.5 text-sm leading-relaxed">{description}</div>

      {children && <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">{children}</div>}
    </div>
  );
}
