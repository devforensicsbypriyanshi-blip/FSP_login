'use client';

import { useEffect, useState } from 'react';

/**
 * A text note, rendered for one identified reader.
 *
 * The HTML arrives already rendered by renderNote() on the server, which
 * escapes every character of the stored Markdown before emitting a fixed set of
 * tags. That is what makes dangerouslySetInnerHTML safe here — not trust in the
 * educator who wrote it.
 *
 * The watermark carries the reader's name and email and is tiled behind the
 * text at low opacity. It survives a screenshot, a phone photo of the screen,
 * and a print — the print stylesheet in globals.css keeps it deliberately.
 *
 * What none of this does is *prevent* a copy. No browser API can stop a screen
 * recording or a camera, and the selection blocking below is a speed bump, not
 * a lock. The honest description is deter and trace: a leaked page identifies
 * the account it came from.
 */
export function WatermarkedReading({
  html,
  viewer,
  title,
}: {
  /** Pre-rendered by renderNote(). Never raw user input. */
  html: string;
  viewer: { name: string; email: string };
  title: string;
}) {
  const [obscured, setObscured] = useState(false);

  useEffect(() => {
    const block = (event: Event) => event.preventDefault();
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === 's' || key === 'c')) event.preventDefault();
      // PrintScreen cannot be prevented, only reacted to.
      if (key === 'printscreen') setObscured(true);
    };
    const onVisibility = () => setObscured(document.hidden);
    const onBlur = () => setObscured(true);
    const onFocus = () => setObscured(false);

    document.addEventListener('contextmenu', block);
    document.addEventListener('copy', block);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('copy', block);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const stamp = `${viewer.name} · ${viewer.email}`;

  return (
    <div className="border-line-medium bg-surface relative overflow-hidden rounded-2xl border">
      <div
        aria-hidden
        className="watermark-layer pointer-events-none absolute inset-0 z-10 flex flex-wrap content-start gap-x-12 gap-y-16 overflow-hidden p-6 opacity-[0.07]"
      >
        {Array.from({ length: 60 }).map((_, index) => (
          <span
            key={index}
            className="text-ink rotate-[-24deg] font-mono text-[10px] whitespace-nowrap sm:text-[11px]"
          >
            {stamp}
          </span>
        ))}
      </div>

      {obscured && (
        <div className="bg-surface/95 absolute inset-0 z-20 grid place-items-center px-6 text-center">
          <div>
            <p className="font-display text-ink text-base font-bold">Content hidden</p>
            <p className="text-ink-muted mt-1 text-[13px]">Return to this tab to continue reading {title}.</p>
          </div>
        </div>
      )}

      <article
        className="note-body relative z-0 p-5 select-none md:p-7"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
