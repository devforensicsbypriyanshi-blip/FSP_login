'use client';

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Eye,
  MailWarning,
  RotateCcw,
  Search,
  Send,
  ShieldOff,
} from 'lucide-react';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { lookupEmail, type EmailRecord, type LookupResult } from '@/lib/actions/support-tools';

/**
 * "I didn't get my code" — answered with evidence.
 *
 * The old mockup showed an SMS gateway lookup. That is obsolete: auth is email
 * only, with no SMS provider. Resend reports real delivery events (delivered,
 * bounced, opened, complained), which is strictly better data than any SMS
 * gateway gave us.
 *
 * Support can resend and revoke sessions. Support can NEVER see the code
 * itself — an agent who can read login codes is an account-takeover path.
 */

type EventType = 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'delayed';

/**
 * The row shapes come from the Server Action now — email_log, email_events and
 * email_suppressions, read under the `staff read` policy. Event types arrive as
 * plain strings because Resend can add new ones; anything unrecognised falls
 * back to a neutral chip rather than crashing the page.
 */
const FALLBACK_EVENT = {
  label: 'Update',
  variant: 'gray' as const,
  color: 'text-ink-muted',
  icon: Send,
};

// `color` holds a complete class name and is never interpolated. Tailwind
// scans source statically, so a class assembled as `text-${x}` generates no
// CSS at all and the icon silently renders in the inherited colour.
const EVENT_META: Record<
  EventType,
  {
    label: string;
    variant: 'success' | 'error' | 'warning' | 'info' | 'gray';
    color: string;
    icon: typeof Send;
  }
> = {
  sent: { label: 'Sent', variant: 'gray', color: 'text-ink-muted', icon: Send },
  delivered: { label: 'Delivered', variant: 'success', color: 'text-success', icon: CheckCircle2 },
  opened: { label: 'Opened', variant: 'success', color: 'text-success', icon: Eye },
  clicked: { label: 'Clicked', variant: 'success', color: 'text-success', icon: Eye },
  delayed: { label: 'Delayed', variant: 'warning', color: 'text-warning', icon: Clock },
  bounced: { label: 'Bounced', variant: 'error', color: 'text-error', icon: MailWarning },
  complained: { label: 'Marked as spam', variant: 'error', color: 'text-error', icon: ShieldOff },
};

/** The most useful thing on the page: what the agent should actually say. */
function diagnose(record: EmailRecord, suppressed: LookupResult['suppressed']) {
  if (suppressed) {
    return {
      tone: 'error' as const,
      title: 'This address is blocked',
      advice:
        'Mail to this address is suppressed after a hard bounce, so nothing is being sent. Confirm the correct spelling with the student and update their email, then release the suppression.',
    };
  }
  if (record.state === 'bounced') {
    return {
      tone: 'error' as const,
      title: 'The address rejected our email',
      advice: 'Almost always a typo in the address. Confirm it with the student and correct it.',
    };
  }
  if (record.state === 'delivered') {
    return {
      tone: 'warning' as const,
      title: 'Delivered but not opened',
      advice:
        'It reached their inbox. Ask them to check spam and search for "Forensic Science by Priyanshi". A resend will land in the same place, so check spam first.',
    };
  }
  if (record.state === 'opened' || record.state === 'clicked') {
    return {
      tone: 'success' as const,
      title: 'Delivered and opened',
      advice:
        'They received and opened it. If they still cannot sign in, the code may have expired — codes last 10 minutes. Send a fresh one.',
    };
  }
  if (record.state === 'delayed') {
    return {
      tone: 'warning' as const,
      title: 'Delayed by the receiving server',
      advice: 'Their mail provider is deferring delivery. Usually resolves within a few minutes.',
    };
  }
  return {
    tone: 'warning' as const,
    title: 'Not yet confirmed delivered',
    advice: 'We sent it but have no delivery confirmation. Wait a moment, then resend.',
  };
}

export function EmailLookup() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [pending, startLookup] = useTransition();
  const [error, setError] = useState<string>();

  function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    setError(undefined);

    startLookup(async () => {
      const outcome = await lookupEmail(query);
      setSearched(true);

      if (!outcome.ok) {
        setResult(null);
        setError(outcome.message);
        return;
      }
      setResult(outcome.result);
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Look up a student</CardTitle>
        </CardHeader>

        <form onSubmit={lookup} className="flex flex-col gap-3">
          <Field
            label="Email address"
            htmlFor="lookup"
            error={error}
            hint="The address the student signed up with. Delivery history covers the last 25 emails."
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="lookup"
                type="email"
                placeholder="student@example.com"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                invalid={!!error}
                className="flex-1"
              />
              <Button type="submit" size="sm" loading={pending}>
                <Search className="size-4" aria-hidden /> Look up
              </Button>
            </div>
          </Field>
        </form>
      </Card>

      {searched && !result && (
        <EmptyState
          icon={Search}
          title="No emails found for that address"
          description="Check the spelling, or the student may have registered with a different address."
        />
      )}

      {result?.suppressed && (
        <div className="border-error-border bg-error-bg text-error flex items-start gap-3 rounded-xl border p-4">
          <Ban className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Address blocked since {result.suppressed.at}</p>
            <p className="mt-1 text-[13px] leading-relaxed">
              {result.suppressed.detail}. We stopped sending to protect deliverability for everyone else —
              continuing to mail a dead address damages our sender reputation.
            </p>
            <Button variant="danger-outline" size="sm" className="mt-3">
              <RotateCcw className="size-4" aria-hidden /> Release block
            </Button>
          </div>
        </div>
      )}

      {result?.emails.map((record) => {
        const d = diagnose(record, result.suppressed);
        const tones = {
          success: 'border-success-border bg-success-bg text-success',
          warning: 'border-warning-border bg-warning-bg text-warning',
          error: 'border-error-border bg-error-bg text-error',
        };

        return (
          <Card key={record.id}>
            <CardHeader>
              <CardTitle>{record.subject}</CardTitle>
              <Badge variant={EVENT_META[record.state as EventType]?.variant ?? 'gray'}>
                {EVENT_META[record.state as EventType]?.label ?? record.state}
              </Badge>
            </CardHeader>

            <p className="text-ink-muted mb-4 text-[12.5px]">
              {record.category} · {record.createdAt}
            </p>

            {/* Delivery timeline */}
            <ol className="border-line-medium mb-4 flex flex-col gap-3 border-l pl-4">
              {record.events.map((ev, i) => {
                // Resend can introduce event types we have not seen; an unknown
                // one shows as a neutral chip rather than throwing.
                const meta = EVENT_META[ev.type as EventType] ?? FALLBACK_EVENT;
                const Icon = meta.icon;
                return (
                  <li key={i} className="relative flex items-center gap-2.5 text-[13px]">
                    <span className="bg-surface absolute -left-[22px] grid size-4 place-items-center rounded-full">
                      <Icon className={cn('size-3.5', meta.color)} aria-hidden />
                    </span>
                    <span className="text-ink font-medium">{meta.label}</span>
                    <span className="text-ink-muted font-mono text-[12px]">{ev.at}</span>
                  </li>
                );
              })}
            </ol>

            {record.error && (
              <p className="text-error mb-3 font-mono text-[12px] break-all">{record.error}</p>
            )}

            {/* What the agent should tell the student */}
            <div className={`flex items-start gap-2.5 rounded-xl border p-3.5 ${tones[d.tone]}`}>
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="text-[13px] font-semibold">{d.title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed">{d.advice}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm">
                <Send className="size-4" aria-hidden /> Resend code
              </Button>
              <Button variant="outline" size="sm">
                Sign out all devices
              </Button>
            </div>
          </Card>
        );
      })}

      <p className="text-ink-muted text-center text-xs">
        Support can resend a code and revoke sessions, but never sees the code itself.
      </p>
    </>
  );
}
