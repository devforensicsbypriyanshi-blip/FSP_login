import { Bell, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { DeviceList, type DeviceRow } from '@/components/account/device-list';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { IS_DEMO_BUILD } from '@/lib/flags';
import { getDeviceId, getSessionContext } from '@/lib/session/server';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Settings' };

/**
 * Personal settings. Platform-wide configuration lives at /admin/settings and
 * /dev/config — this page only ever affects the person looking at it.
 */

/** Notification types a student can meaningfully turn off. Class reminders are
 *  not in the list on purpose: missing a live class because a toggle was flipped
 *  months ago is the one complaint no setting is worth. */
const PREF_TYPES = [
  { type: 'course.published', label: 'New course content', hint: 'When lessons or recordings are added.' },
  { type: 'announcement', label: 'Announcements', hint: 'Exam news and schedule changes.' },
  { type: 'doubt.answered', label: 'Doubt replies', hint: 'When an educator answers your question.' },
];

export default async function SettingsPage() {
  const session = await getSessionContext();

  if (!session) {
    if (!IS_DEMO_BUILD) redirect('/sign-in');
    return (
      <>
        <PageHeader title="Settings" description="Notifications and signed-in devices." />
        <Card>
          <p className="text-ink-muted text-[13.5px]">Sign in to manage your settings.</p>
        </Card>
      </>
    );
  }

  const supabase = await createClient();
  const currentDeviceId = (await getDeviceId()) ?? '';

  const [{ data: sessions }, { data: prefs }] = await Promise.all([
    supabase
      .from('user_sessions')
      .select('id, device_id, device_label, created_at, last_seen_at')
      .eq('user_id', session.userId)
      .is('revoked_at', null)
      .order('last_seen_at', { ascending: false }),
    supabase.from('notification_prefs').select('type, in_app, push, email').eq('user_id', session.userId),
  ]);

  const devices: DeviceRow[] = (sessions ?? []).map((row) => ({
    id: row.id,
    label: row.device_label,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    isCurrent: row.device_id === currentDeviceId,
  }));

  const prefByType = new Map((prefs ?? []).map((p) => [p.type, p]));

  return (
    <>
      <PageHeader title="Settings" description="Notifications and signed-in devices." />

      <Card>
        <CardHeader>
          <CardTitle>Signed-in devices</CardTitle>
          <MonitorSmartphone className="text-primary size-[18px]" aria-hidden />
        </CardHeader>
        <p className="text-ink-muted mb-4 text-[13px] leading-relaxed">
          Only one device can be signed in at a time. Signing in somewhere new automatically signs out the
          previous one — that is why you may occasionally be asked for a fresh code.
        </p>
        <DeviceList devices={devices} currentDeviceId={currentDeviceId} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <Bell className="text-primary size-[18px]" aria-hidden />
        </CardHeader>

        <p className="text-ink-muted mb-4 text-[13px] leading-relaxed">
          Reminders about live classes are always sent — they are the one thing worth interrupting you for.
          Everything else is optional.
        </p>

        <ul className="divide-line flex flex-col divide-y">
          {PREF_TYPES.map((pref) => {
            const current = prefByType.get(pref.type);
            const emailOn = current?.email ?? true;
            const inAppOn = current?.in_app ?? true;

            return (
              <li
                key={pref.type}
                className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-ink text-[13.5px] font-semibold">{pref.label}</p>
                  <p className="text-ink-muted mt-0.5 text-[12px]">{pref.hint}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <span className="border-line-medium text-ink-secondary rounded-full border px-2.5 py-1 text-[11.5px]">
                    In-app {inAppOn ? 'on' : 'off'}
                  </span>
                  <span className="border-line-medium text-ink-secondary rounded-full border px-2.5 py-1 text-[11.5px]">
                    Email {emailOn ? 'on' : 'off'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="text-ink-light mt-4 text-[12px] leading-relaxed">
          Toggling these is wired to the notification module, which ships switched off at launch. Until then
          they show the defaults every account starts with.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How sign-in works</CardTitle>
          <ShieldCheck className="text-success size-[18px]" aria-hidden />
        </CardHeader>
        <p className="text-ink-secondary text-[13.5px] leading-relaxed">
          There is no password on your account. Each time you sign in we email a six-digit code that expires
          shortly after it is sent, so there is nothing to remember and nothing that can be reused if it
          leaks. Your email address is the one thing you should keep access to.
        </p>
      </Card>
    </>
  );
}
