import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';

export function AuthCard({
  icon: Icon,
  title,
  description,
  children,
  footer,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-[420px] mx-auto">
      <div className="mb-5 text-center flex flex-col items-center">
        {Icon && (
          <div className="mb-3 flex size-14 items-center justify-center rounded-full bg-[#F9F0EF] text-[#451952] ring-6 ring-[#F9F0EF]/60">
            <Icon className="size-6" aria-hidden="true" strokeWidth={2} />
          </div>
        )}
        <h1 className="text-[#1D1A39] text-2xl sm:text-[28px] font-serif font-bold tracking-tight mb-1">
          {title}
        </h1>
        {description && (
          <div className="text-slate-500 text-xs sm:text-sm leading-relaxed">
            {description}
          </div>
        )}
      </div>

      <div className="w-full">
        {children}
      </div>

      {footer && (
        <div className="mt-5 text-center text-xs sm:text-sm">
          {footer}
        </div>
      )}
    </div>
  );
}
