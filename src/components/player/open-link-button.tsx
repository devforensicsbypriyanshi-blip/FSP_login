'use client';

import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Opens an external resource.
 *
 * Same shape as the live-class join button, for the same reason: the URL is in
 * a column REVOKEd from `authenticated`, so it is not in the page, not in the
 * RSC payload, and not in anything anyone can forward. The server hands it over
 * only after checking enrolment and writing the log line.
 *
 * The tab is opened *synchronously*, before the fetch. Browsers only allow
 * window.open() during a user gesture, so opening it after the network call
 * returns gets it blocked as a popup — which reads to the student as a broken
 * button.
 */
export function OpenLinkButton({ resourceId, label = 'Open' }: { resourceId: string; label?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function open() {
    setError(undefined);
    setPending(true);

    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;

    try {
      const response = await fetch(`/api/resource/${resourceId}/open`, { method: 'POST' });
      const body = (await response.json()) as { url?: string; message?: string };

      if (!response.ok || !body.url) {
        tab?.close();
        setError(body.message ?? 'We could not open that.');
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
    <div className="flex flex-col gap-2">
      <Button loading={pending} onClick={open} className="self-start">
        <ExternalLink className="size-4" aria-hidden /> {label}
      </Button>
      {error && (
        <p className="text-error text-[12.5px] leading-relaxed" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
