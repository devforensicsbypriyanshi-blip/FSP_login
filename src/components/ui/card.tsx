import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Card — ports .card / .card-hover / .card-header from components.css. */
export function Card({
  className,
  hover = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        'border-line-medium bg-surface rounded-2xl border p-5 shadow-xs md:p-6',
        hover &&
          'hover:border-primary-border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mb-4 flex flex-wrap items-center justify-between gap-3 md:mb-5', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('font-display text-ink text-base font-bold md:text-[17px]', className)} {...props} />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-ink-muted text-[13.5px] leading-relaxed', className)} {...props} />;
}

/** Page heading + optional actions. Stacks on mobile, splits on desktop. */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-ink text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
        {description && <p className="text-ink-muted mt-1 text-sm">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
