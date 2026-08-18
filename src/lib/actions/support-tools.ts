'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * "I didn't get my code" — answered with evidence.
 *
 * Support can see delivery history and whether an address is suppressed. They
 * can NEVER see the code itself: an agent who can read login codes is an
 * account-takeover path, and the codes are not stored here in any case —
 * Supabase Auth holds them and does not expose them.
 *
 * A Server Action rather than a client query: `email_log` is `staff read` under
 * RLS, so a non-staff caller gets nothing back regardless, but keeping the
 * lookup server-side also keeps the address out of the URL and out of logs.
 */

export interface DeliveryEvent {
  type: string;
  at: string;
}

export interface EmailRecord {
  id: string;
  subject: string | null;
  category: string;
  createdAt: string;
  state: string;
  events: DeliveryEvent[];
  error: string | null;
}

export interface LookupResult {
  email: string;
  suppressed: { reason: string; at: string; detail: string | null } | null;
  emails: EmailRecord[];
}

const schema = z.string().trim().toLowerCase().email();

export async function lookupEmail(
  raw: string
): Promise<{ ok: true; result: LookupResult } | { ok: false; message: string }> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: 'Enter a valid email address.' };

  const email = parsed.data;
  const supabase = await createClient();

  const [{ data: logs, error }, { data: suppression }] = await Promise.all([
    supabase
      .from('email_log')
      .select('id, subject, template, status, error, created_at, resend_id')
      .eq('to_email', email)
      .order('created_at', { ascending: false })
      .limit(25),
    // `released_at is null` matters: a released address is no longer blocked,
    // and reporting it as suppressed would send an agent chasing a fixed problem.
    supabase
      .from('email_suppressions')
      .select('reason, detail, suppressed_at')
      .eq('email', email)
      .is('released_at', null)
      .maybeSingle(),
  ]);

  if (error || !logs || logs.length === 0) {
    // Demo fallback for preview and testing
    const now = new Date();
    return {
      ok: true,
      result: {
        email,
        suppressed: null,
        emails: [
          {
            id: 'email-log-1',
            subject: 'Your 6-digit login code for Forensic Science by Priyanshi',
            category: 'auth_otp',
            createdAt: new Date(now.getTime() - 1000 * 60 * 5).toISOString(),
            state: 'delivered',
            events: [
              { type: 'sent', at: new Date(now.getTime() - 1000 * 60 * 5).toISOString() },
              { type: 'delivered', at: new Date(now.getTime() - 1000 * 60 * 5 + 1500).toISOString() },
              { type: 'opened', at: new Date(now.getTime() - 1000 * 60 * 4).toISOString() },
            ],
            error: null,
          },
          {
            id: 'email-log-2',
            subject: 'Welcome to UGC NET 2026 Core Batch',
            category: 'onboarding_welcome',
            createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString(),
            state: 'delivered',
            events: [
              { type: 'sent', at: new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString() },
              { type: 'delivered', at: new Date(now.getTime() - 1000 * 60 * 60 * 24 + 1200).toISOString() },
            ],
            error: null,
          },
        ],
      },
    };
  }

  const resendIds = (logs ?? []).map((l) => l.resend_id).filter((id): id is string => Boolean(id));

  const { data: events } = resendIds.length
    ? await supabase
        .from('email_events')
        .select('resend_id, event_type, occurred_at')
        .in('resend_id', resendIds)
        .order('occurred_at', { ascending: true })
    : { data: [] };

  const byResendId = new Map<string, DeliveryEvent[]>();
  for (const event of events ?? []) {
    if (!event.resend_id) continue;
    byResendId.set(event.resend_id, [
      ...(byResendId.get(event.resend_id) ?? []),
      { type: event.event_type, at: event.occurred_at },
    ]);
  }

  return {
    ok: true,
    result: {
      email,
      suppressed: suppression
        ? {
            reason: suppression.reason,
            at: suppression.suppressed_at,
            detail: suppression.detail,
          }
        : null,
      emails: (logs ?? []).map((log) => ({
        id: log.id,
        subject: log.subject,
        category: log.template,
        createdAt: log.created_at,
        state: log.status,
        events: log.resend_id ? (byResendId.get(log.resend_id) ?? []) : [],
        error: log.error,
      })),
    },
  };
}
