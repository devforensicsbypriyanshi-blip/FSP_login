import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Badge — brand-aligned variants per FSP Brand Guidelines (Aug 2026). */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold leading-none',
  {
    variants: {
      variant: {
        /** Plum — default brand badge (was "purple") */
        purple: 'bg-primary-light text-primary',
        /** Amber — for LIVE, NEW, IMPORTANT badges. Navy text for contrast. */
        amber: 'bg-amber text-[#1D1A39]',
        /** Plum solid — Plum bg with white text */
        plum: 'bg-primary text-white',
        /** Blush — subtle emphasis, light blush background */
        blush: 'bg-blush-light text-[#1D1A39]',
        /** Rose — decorative attention badge */
        rose: 'bg-rose text-white',
        /** Wine — highlight badge */
        wine: 'bg-wine text-white',
        success: 'bg-success-bg text-success',
        error: 'bg-error-bg text-error',
        warning: 'bg-warning-bg text-warning',
        info: 'bg-info-bg text-info',
        gray: 'bg-muted-bg text-ink-muted',
        outline: 'border border-line-medium text-ink-secondary',
      },
    },
    defaultVariants: { variant: 'purple' },
  }
);

const dotColors: Record<string, string> = {
  purple: 'bg-primary',
  amber: 'bg-amber',
  plum: 'bg-primary',
  blush: 'bg-blush',
  rose: 'bg-rose',
  wine: 'bg-wine',
  success: 'bg-success',
  error: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-info',
  gray: 'bg-ink-light',
  outline: 'bg-ink-light',
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Leading status dot. Set `pulse` for live indicators. */
  dot?: boolean;
  pulse?: boolean;
}

export function Badge({ className, variant = 'purple', dot, pulse, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span className="relative flex size-1.5" aria-hidden>
          {pulse && (
            <span
              className={cn(
                'absolute inline-flex size-full animate-ping rounded-full opacity-75',
                dotColors[variant ?? 'purple']
              )}
            />
          )}
          <span
            className={cn('relative inline-flex size-1.5 rounded-full', dotColors[variant ?? 'purple'])}
          />
        </span>
      )}
      {children}
    </span>
  );
}
