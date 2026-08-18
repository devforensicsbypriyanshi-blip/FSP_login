'use client';

import { Radio } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ButtonProps } from '@/components/ui/button';

/**
 * Opens a live class.
 *
 * The tab is opened *synchronously*, before the fetch. Browsers only allow
 * window.open() during a user gesture, so opening it after the network call
 * returns gets it blocked as a popup — which reads to the student as "the join
 * button is broken".
 */
export function JoinClassButton({
  sessionId,
  children = 'Join class',
  ...buttonProps
}: { sessionId: string; children?: React.ReactNode } & Omit<ButtonProps, 'onClick' | 'loading'>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function join() {
    setError(undefined);
    setPending(true);

    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;

    try {
      const response = await fetch(`/api/live/${sessionId}/join`, { method: 'POST' });
      const body = (await response.json()) as { url?: string; message?: string };

      if (!response.ok || !body.url) {
        tab?.close();
        setError(body.message ?? 'We could not open the class.');
        return;
      }

      if (tab) tab.location.href = body.url;
      else window.location.href = body.url;
    } catch {
      tab?.close();
      setError('You appear to be offline. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-2 sm:w-auto">
      <Button {...buttonProps} loading={pending} onClick={join}>
        <Radio className="size-4" aria-hidden /> {children}
      </Button>
      {error && (
        <p className="text-error max-w-xs text-center text-[12.5px] leading-relaxed" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
