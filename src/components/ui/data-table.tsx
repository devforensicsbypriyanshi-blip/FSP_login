import type * as React from 'react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** Shown as the card title on mobile. Exactly one column should set this. */
  primary?: boolean;
  /** Drop this column from the mobile card entirely (e.g. redundant IDs). */
  hideOnMobile?: boolean;
  className?: string;
}

/**
 * Renders a real <table> at md+ and a stack of labelled cards below it.
 *
 * The reference UI used six-column tables with `overflow-x: auto`, which on a
 * 375px screen means horizontal scrolling to read a single row. Cards keep every
 * field visible and tappable. See docs Part 0 §F4.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: React.ReactNode;
}) {
  if (!rows.length && empty) return <>{empty}</>;

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);

  return (
    <>
      {/* Desktop */}
      <div className="border-line-medium hidden overflow-hidden rounded-2xl border md:block">
        <table className="w-full border-collapse text-left">
          <thead className="bg-hover">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className="text-ink-muted px-4 py-3 text-[12px] font-semibold tracking-wide uppercase"
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-hover transition">
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3 align-middle text-sm', c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <div key={row.id} className="border-line-medium bg-surface rounded-2xl border p-4">
            <div className="text-ink mb-3 font-semibold">{primary?.render(row)}</div>
            <dl className="flex flex-col gap-2">
              {rest.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3">
                  <dt className="text-ink-muted text-[12px] font-medium tracking-wide uppercase">
                    {c.header}
                  </dt>
                  <dd className="text-ink min-w-0 text-right text-[13.5px]">{c.render(row)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}

/** KPI stat card used across the admin, educator and developer overviews. */
export function KpiCard({
  label,
  value,
  trend,
  icon,
  tone = 'bg-primary-light text-primary',
}: {
  label: string;
  value: string;
  trend?: string;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="border-line-medium bg-surface rounded-2xl border p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-ink-muted text-[12.5px] font-medium">{label}</span>
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tone)}>{icon}</span>
      </div>
      <p className="font-display text-ink mt-2 text-xl font-bold md:text-2xl">{value}</p>
      {trend && <p className="text-ink-muted mt-1 text-[12.5px]">{trend}</p>}
    </div>
  );
}
