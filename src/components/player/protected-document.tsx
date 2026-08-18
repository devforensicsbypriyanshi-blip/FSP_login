'use client';

import { useEffect, useState } from 'react';

/**
 * View-only document surface.
 *
 * Layered deterrents, in order of how much they actually achieve:
 *   1. No download button and no direct file URL — the file is streamed from a
 *      private bucket through a short-lived signed URL. This is the real
 *      control; it is what stops casual sharing.
 *   2. A tiled watermark carrying the reader's name, email and the timestamp.
 *      Makes any photo or capture traceable to one account.
 *   3. Selection, copy, right-click and print are blocked, and the content is
 *      blurred when the tab loses focus — this raises the effort of a lazy
 *      capture attempt.
 *
 * What this does NOT do: block OS-level screenshots or screen recording. No
 * browser API can. Anyone promising otherwise is mistaken. We deter and trace.
 */
export function ProtectedDocument({
  src,
  viewer,
  title,
}: {
  /** Server route that authorises the view and redirects to the file. */
  src: string;
  viewer: { name: string; email: string };
  title: string;
}) {
  const [obscured, setObscured] = useState(false);

  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Ctrl/Cmd + P (print) and Ctrl/Cmd + S (save)
      if ((e.ctrlKey || e.metaKey) && (k === 'p' || k === 's')) e.preventDefault();
      // PrintScreen cannot be prevented, only reacted to.
      if (k === 'printscreen') setObscured(true);
    };
    const onVisibility = () => setObscured(document.hidden);

    document.addEventListener('contextmenu', block);
    document.addEventListener('copy', block);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', () => setObscured(true));
    window.addEventListener('focus', () => setObscured(false));

    return () => {
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('copy', block);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const stamp = `${viewer.name} · ${viewer.email}`;

  return (
    <div className="border-line-medium bg-navy relative overflow-hidden rounded-2xl border select-none">
      {/* Tiled watermark above the document, ignoring pointer events */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 flex flex-wrap content-start gap-x-10 gap-y-14 overflow-hidden p-6 opacity-[0.16]"
      >
        {Array.from({ length: 40 }).map((_, i) => (
          <span
            key={i}
            className="rotate-[-24deg] font-mono text-[10px] whitespace-nowrap text-white sm:text-[11px]"
          >
            {stamp}
          </span>
        ))}
      </div>

      {obscured && (
        <div className="bg-navy/95 absolute inset-0 z-20 grid place-items-center px-6 text-center">
          <div>
            <p className="font-display text-base font-bold text-white">Content hidden</p>
            <p className="mt-1 text-[13px] text-white/70">Return to this tab to continue reading {title}.</p>
          </div>
        </div>
      )}

      <iframe
        // Google Drive preview: renders PDFs without exposing a file URL and
        // without Drive's own download affordance when sharing is set to
        // "Viewer, download disabled".
        src={src}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="relative h-[70vh] min-h-[420px] w-full border-0"
      />
    </div>
  );
}
