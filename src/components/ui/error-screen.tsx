'use client';

import { AlertOctagon, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { StatusScreen } from '@/components/ui/status-screen';

/**
 * Shared body for every error.tsx boundary.
 *
 * Two rules it exists to enforce:
 *   - the student never sees a stack trace. `error.message` in a production
 *     build is already redacted by Next, but showing it at all trains people to
 *     screenshot noise instead of telling us what they were doing.
 *   - there is always a way out. `reset()` re-renders the segment, which is
 *     enough for the common case of one failed query.
 *
 * `digest` IS shown: it is the id that ties this render to the server log, and
 * quoting it turns an unhelpful "it broke" report into a searchable one.
 */
export function ErrorScreen({
  error,
  reset,
  homeHref = '/portal',
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref?: string;
}) {
  useEffect(() => {
    // Phase 7 replaces this with Sentry.captureException(error).
    console.error('Unhandled render error', error);
  }, [error]);

  return (
    <StatusScreen
      icon={AlertOctagon}
      title="Something went wrong"
      description={
        <>
          <p>This page failed to load. It is not something you did, and nothing was lost.</p>
          {error.digest && (
            <p className="text-ink-light mt-3 font-mono text-xs">
              Reference: {error.digest}
              <br />
              <span className="font-sans">Quote this to support and we can find the exact failure.</span>
            </p>
          )}
        </>
      }
      tone="error"
    >
      <Button onClick={reset} block>
        <RotateCcw className="size-4" aria-hidden /> Try again
      </Button>
      <Button asChild variant="outline" block>
        <Link href={homeHref}>Back to safety</Link>
      </Button>
    </StatusScreen>
  );
}
