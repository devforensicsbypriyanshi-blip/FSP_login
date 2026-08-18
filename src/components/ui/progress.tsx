import { cn } from '@/lib/utils';

/**
 * Progress bar.
 *
 * Note: at v1 this reflects *lesson-level* completion (completed / total),
 * not seconds watched — the Google Drive iframe emits no playback events.
 * See docs Part 0 §F3.
 */
export function Progress({
  value,
  label,
  className,
  showValue = true,
}: {
  value: number;
  label?: string;
  className?: string;
  showValue?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between text-[13px]">
          {label && <span className="text-ink-muted">{label}</span>}
          {showValue && <span className="text-primary font-bold">{pct}%</span>}
        </div>
      )}
      <div
        className="bg-line-medium h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
