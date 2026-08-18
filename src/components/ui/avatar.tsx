import { cn, initials } from '@/lib/utils';

const sizes = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-[11px]',
  md: 'size-10 text-[13px]',
  lg: 'size-12 text-[15px]',
  xl: 'size-20 text-2xl',
} as const;

/**
 * Initials avatar. There are no Google profile pictures — OAuth was removed
 * (docs Part 5 §1) — so initials are the primary representation, not a fallback.
 */
export function Avatar({
  name,
  size = 'md',
  color,
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold text-white select-none',
        sizes[size],
        !color && 'bg-primary',
        className
      )}
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
