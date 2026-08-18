import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-line-medium bg-hover flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
      <div className="bg-primary-light text-primary grid size-12 place-items-center rounded-2xl">
        <Icon className="size-6" aria-hidden />
      </div>
      <div>
        <h3 className="font-display text-ink text-base font-bold">{title}</h3>
        {description && <p className="text-ink-muted mx-auto mt-1 max-w-sm text-sm">{description}</p>}
      </div>
      {children}
    </div>
  );
}
