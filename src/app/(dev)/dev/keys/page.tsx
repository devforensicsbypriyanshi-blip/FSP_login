import { CheckCircle2, KeyRound, MinusCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getEmailPoolHealth, getIntegrations } from '@/lib/data/system';

export const metadata = { title: 'Integrations & Secrets' };

/**
 * Not a key manager, deliberately.
 *
 * The mock-up this replaces had "Generate key" and a list of API keys with
 * Revoke buttons. This platform has no API-key system, and adding one to fill a
 * screen would mean inventing a second authentication path — with its own
 * storage, rotation and revocation to get wrong — that nothing actually needs.
 *
 * So the screen answers what a developer opens it for at 2am: is everything
 * configured, and is anything about to run out of quota. Presence only, never
 * values. The secrets live in Vercel and Supabase and are not readable from
 * this application; a console that can display a secret is a console that leaks
 * one the first time someone screen-shares it.
 */
export default async function DevKeysPage() {
  const [integrations, pools] = await Promise.all([Promise.resolve(getIntegrations()), getEmailPoolHealth()]);

  const missing = integrations.filter((entry) => !entry.configured && !entry.optional);

  return (
    <>
      <PageHeader
        title="Integrations & secrets"
        description="What is configured, and how much quota is left. Values are never shown."
      />

      {missing.length > 0 && (
        <div className="border-error-border bg-error-bg rounded-2xl border p-4">
          <p className="text-error text-[13.5px] leading-relaxed">
            <strong>
              {missing.length} required integration{missing.length === 1 ? ' is' : 's are'} not configured.
            </strong>{' '}
            {missing.map((entry) => entry.name).join(', ')} — set them in the Vercel project settings, not in
            a file.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <KeyRound className="text-primary size-[18px]" aria-hidden />
        </CardHeader>

        <ul className="divide-line flex flex-col divide-y">
          {integrations.map((entry) => (
            <li
              key={entry.name}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
            >
              <span className="shrink-0">
                {entry.configured ? (
                  <CheckCircle2 className="text-success size-5" aria-hidden />
                ) : entry.optional ? (
                  <MinusCircle className="text-ink-light size-5" aria-hidden />
                ) : (
                  <XCircle className="text-error size-5" aria-hidden />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-ink font-semibold">{entry.name}</p>
                {/* The effect, not the variable name: "RAZORPAY_KEY_SECRET
                    missing" means nothing at 2am; "students cannot pay" does. */}
                <p className="text-ink-muted text-[12.5px] leading-relaxed">
                  {entry.configured ? (entry.detail ?? 'Configured') : entry.effect}
                </p>
              </div>

              <Badge variant={entry.configured ? 'success' : entry.optional ? 'gray' : 'error'}>
                {entry.configured ? 'Set' : entry.optional ? 'Not set' : 'Missing'}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email quota</CardTitle>
          <Badge variant="gray">
            {pools.length} key{pools.length === 1 ? '' : 's'}
          </Badge>
        </CardHeader>

        {pools.length === 0 ? (
          <p className="text-ink-muted text-[13px] leading-relaxed">
            No sending keys configured. Set <code className="font-mono">EMAIL_POOLS</code> with the SES or
            Resend credentials.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {pools.map((pool) => (
              <li key={pool.id}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-ink text-[13px] font-semibold">
                    {pool.id}
                    <span className="text-ink-muted ml-1.5 font-normal">{pool.provider}</span>
                  </span>
                  <span className="text-ink-muted text-[12px] tabular-nums">
                    {pool.sentToday}/{pool.dailyCap} today · {pool.sentMonth}/{pool.monthlyCap} month
                  </span>
                </div>
                {/* Whichever budget is tighter is the one that will stop sends,
                    so the bar shows the worse of the two rather than an average
                    that would read healthy right up until delivery stopped. */}
                <Progress
                  value={Math.max(
                    (pool.sentToday / Math.max(1, pool.dailyCap)) * 100,
                    (pool.sentMonth / Math.max(1, pool.monthlyCap)) * 100
                  )}
                  showValue={false}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-ink-muted mx-auto max-w-xl text-center text-xs leading-relaxed">
        Secrets are set in Vercel and Supabase. Nothing here can read one back — not for display, not for
        copying, not for support.
      </p>
    </>
  );
}
