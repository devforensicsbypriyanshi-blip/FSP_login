'use client';

import { Lock, Search, ShieldAlert } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { toggleFlag } from '@/lib/actions/config';
import { cn } from '@/lib/utils';

/**
 * The switchboard the whole platform is built around: every feature ships
 * behind one of these, so turning a module on is a toggle rather than a release.
 *
 * Kill switches are rendered but not operable by developers — the RLS policy
 * enforces that, and the lock icon simply reflects it. Showing them greyed out
 * rather than hiding them is deliberate: an operator needs to know a switch
 * exists even when they cannot flip it.
 */

export interface FlagRow {
  key: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  isKillSwitch: boolean;
  isProtected: boolean;
}

export function FlagBoard({ flags, canEditProtected }: { flags: FlagRow[]; canEditProtected: boolean }) {
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? flags.filter(
        (f) =>
          f.key.toLowerCase().includes(needle) ||
          f.name.toLowerCase().includes(needle) ||
          f.category.toLowerCase().includes(needle)
      )
    : flags;

  const byCategory = new Map<string, FlagRow[]>();
  for (const flag of visible) {
    byCategory.set(flag.category, [...(byCategory.get(flag.category) ?? []), flag]);
  }

  function flip(flag: FlagRow, next: boolean) {
    setOptimistic((prev) => ({ ...prev, [flag.key]: next }));
    startTransition(async () => {
      const result = await toggleFlag(flag.key, next);
      setFeedback(result);
      if (!result.ok) {
        // Put it back. A switch that stays flipped after a refused write is
        // worse than no feedback at all.
        setOptimistic((prev) => ({ ...prev, [flag.key]: !next }));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {feedback && (
        <p
          className={
            feedback.ok
              ? 'border-success-border bg-success-bg text-success rounded-xl border p-3 text-[13px]'
              : 'border-error-border bg-error-bg text-error rounded-xl border p-3 text-[13px]'
          }
          role={feedback.ok ? 'status' : 'alert'}
        >
          {feedback.message}
        </p>
      )}

      <div className="border-line-medium bg-surface flex items-center gap-2.5 rounded-full border px-4 py-2.5">
        <Search className="text-ink-muted size-[18px] shrink-0" aria-hidden />
        <input
          type="search"
          placeholder="Filter flags…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter feature flags"
          className="text-ink placeholder:text-ink-light w-full bg-transparent text-[13.5px] outline-none"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No flags match"
          description="Try a shorter search, or clear it to see every flag."
        />
      ) : (
        [...byCategory.entries()].map(([category, rows]) => (
          <section key={category}>
            <h3 className="text-ink-muted mb-2 text-[11px] font-semibold tracking-wide uppercase">
              {category}
            </h3>
            <ul className="divide-line border-line-medium divide-y rounded-xl border">
              {rows.map((flag) => {
                const locked = (flag.isKillSwitch || flag.isProtected) && !canEditProtected;
                const on = optimistic[flag.key] ?? flag.enabled;

                return (
                  <li key={flag.key} className="flex items-start gap-3 p-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-ink flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                        {flag.name}
                        {flag.isKillSwitch && (
                          <Badge variant="error">
                            <ShieldAlert className="size-3" aria-hidden /> Kill switch
                          </Badge>
                        )}
                        {flag.isProtected && !flag.isKillSwitch && <Badge variant="warning">Protected</Badge>}
                      </p>
                      <p className="text-ink-muted mt-0.5 text-[12px] leading-relaxed">{flag.description}</p>
                      <code className="text-ink-light mt-1 block font-mono text-[11px]">{flag.key}</code>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${flag.name} — ${on ? 'on' : 'off'}`}
                      disabled={locked || pending}
                      onClick={() => flip(flag, !on)}
                      className={cn(
                        'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
                        on ? 'bg-success' : 'bg-line-dark',
                        locked && 'cursor-not-allowed opacity-50'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
                          on ? 'left-[22px]' : 'left-0.5'
                        )}
                      />
                    </button>

                    {locked && <Lock className="text-ink-light mt-1 size-4 shrink-0" aria-hidden />}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
