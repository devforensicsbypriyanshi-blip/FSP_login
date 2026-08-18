import type * as React from 'react';

/** Shared chrome so every legal page reads consistently. */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-ink text-2xl font-bold md:text-3xl">{title}</h1>
        <p className="text-ink-muted text-[12.5px]">Last updated {updated}</p>
        {intro && <p className="text-ink-secondary text-[15px] leading-relaxed">{intro}</p>}
      </header>
      <div className="flex flex-col gap-6">{children}</div>
    </article>
  );
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-ink text-base font-bold md:text-lg">{heading}</h2>
      <div className="text-ink-secondary flex flex-col gap-2 text-[14.5px] leading-relaxed">{children}</div>
    </section>
  );
}

/** Highlighted callout for the parts people actually need to notice. */
export function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning';
  children: React.ReactNode;
}) {
  const styles =
    tone === 'warning'
      ? 'border-warning-border bg-warning-bg text-warning'
      : 'border-primary-border bg-primary-ultra text-primary-plum';
  return <div className={`rounded-xl border p-4 text-[14px] leading-relaxed ${styles}`}>{children}</div>;
}
