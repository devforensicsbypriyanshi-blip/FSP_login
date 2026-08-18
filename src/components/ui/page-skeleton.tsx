/**
 * Loading placeholder for route-level loading.tsx files.
 *
 * Mirrors the real page rhythm — heading, a KPI row, then cards — so content
 * arriving does not shove the layout around. A spinner would be less work and
 * noticeably worse: it tells you to wait without telling you what for.
 *
 * aria-busy + a visually-hidden label mean a screen reader announces "loading"
 * once rather than reading out a wall of empty boxes.
 */
export function PageSkeleton({ kpis = 0, cards = 3 }: { kpis?: number; cards?: number }) {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page</span>

      <div className="flex flex-col gap-2.5">
        <div className="bg-hover h-7 w-56 rounded-lg" />
        <div className="bg-hover h-4 w-80 max-w-full rounded" />
      </div>

      {kpis > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: kpis }, (_, i) => (
            <div key={i} className="border-line-medium bg-surface h-24 rounded-xl border" />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="border-line-medium bg-surface rounded-2xl border p-5">
            <div className="bg-hover mb-3 h-5 w-40 rounded" />
            <div className="bg-hover mb-2 h-3.5 w-full rounded" />
            <div className="bg-hover h-3.5 w-2/3 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
