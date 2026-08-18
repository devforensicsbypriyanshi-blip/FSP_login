import { AlertCircle } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

/* Ports .form-group / .form-label / .form-input / .form-error-msg from components.css.
   text-base on mobile is deliberate: iOS Safari zooms the viewport on focus for
   any input under 16px, which visibly breaks the layout. */
const fieldBase =
  'w-full rounded-[10px] border border-line-medium bg-surface px-3.5 py-2.5 text-base text-ink transition placeholder:text-ink-light focus:border-primary focus:ring-[3px] focus:ring-primary/12 focus:outline-none disabled:bg-muted-bg disabled:opacity-60 sm:text-sm';

export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn('text-ink-secondary block text-[13px] font-semibold', className)} {...props}>
      {children}
      {required && (
        <span className="text-error ml-0.5" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(fieldBase, invalid && 'border-error focus:border-error focus:ring-error/12', className)}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(fieldBase, 'resize-y', invalid && 'border-error', className)}
      {...props}
    />
  );
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(fieldBase, 'cursor-pointer pr-9', className)} {...props} />;
  }
);

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-error flex items-center gap-1.5 text-[12.5px] font-medium" role="alert">
      <AlertCircle className="size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {hint && !error && <p className="text-ink-muted text-[12.5px]">{hint}</p>}
      <FieldError>{error}</FieldError>
    </div>
  );
}
