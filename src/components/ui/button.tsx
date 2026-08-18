import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Button — brand-aligned variants per FSP Brand Guidelines (Aug 2026).
 * min-h-11 (44px) on every size: the WCAG tap-target floor.
 *
 * Variant mapping to brand palette:
 *   cta       → Amber #F59F59 bg + Navy #1D1A39 text (8:1 contrast)
 *   primary   → Plum #451952 bg + white text
 *   secondary → Wine #662549 bg + white text
 *   subtle    → Blush-tinted #F6EEF8 bg + Plum text
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold whitespace-nowrap transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&_svg]:shrink-0 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white shadow-sm hover:bg-primary-hover active:bg-primary-active',
        /**
         * The brand's signature CTA: amber ground with NAVY ink (~8:1 contrast).
         * Per brand guidelines, amber is never used for body text.
         */
        cta: 'bg-cta text-cta-ink shadow-cta hover:bg-cta-hover',
        secondary: 'bg-primary-wine text-white hover:bg-[#552040]',
        outline: 'border border-line-medium bg-surface text-ink hover:bg-hover hover:border-line-dark',
        subtle: 'bg-primary-light text-primary hover:bg-primary-border',
        ghost: 'text-ink-secondary hover:bg-hover hover:text-primary',
        danger: 'bg-error text-white hover:bg-error/90',
        'danger-outline': 'border border-error-border bg-surface text-error hover:bg-error-bg',
        success: 'bg-success text-white hover:bg-success/90',
      },
      size: {
        sm: 'min-h-11 px-3.5 text-[13px]',
        md: 'min-h-11 px-4 text-sm',
        lg: 'min-h-12 px-6 text-[15px]',
        icon: 'size-11',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild = false, loading = false, children, disabled, ...props },
  ref
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden
          />
          <span>Processing…</span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
});

export { buttonVariants };
