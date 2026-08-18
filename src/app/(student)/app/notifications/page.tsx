import Link from 'next/link';
import { ArrowLeft, Bell, BellOff, CalendarDays, CheckCheck, FileText, Megaphone, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { markAllNotificationsReadAction } from '@/lib/actions/notifications';
import { formatWhen } from '@/lib/format';
import { getSessionContext } from '@/lib/session/server';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Notifications' };

const KIND: Record<string, { icon: LucideIcon; tint: string }> = {
  'class.reminder': { icon: CalendarDays, tint: 'bg-primary-light text-primary' },
  'class.starting': { icon: CalendarDays, tint: 'bg-error-bg text-error' },
  'class.cancelled': { icon: CalendarDays, tint: 'bg-warning-bg text-warning' },
  'session.evicted': { icon: ShieldCheck, tint: 'bg-warning-bg text-warning' },
  'course.published': { icon: FileText, tint: 'bg-success-bg text-success' },
  announcement: { icon: Megaphone, tint: 'bg-info-bg text-info' },
};

const FALLBACK = { icon: Bell, tint: 'bg-hover text-ink-secondary' };

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

export default async function NotificationsPage() {
  const session = await getSessionContext();

  let data: NotificationRow[] | null = null;
  if (session) {
    const supabase = await createClient();
    const res = await supabase
      .from('notifications')
      .select('id, type, title, body, read_at, created_at')
      .eq('user_id', session.userId)
      .order('created_at', { ascending: false })
      .limit(50);
    data = res.data;
  }

  const notifications = (data && data.length > 0) ? data : [
    {
      id: 'notif-1',
      type: 'class.starting',
      title: 'Live Class Starting Soon · Forensic Toxicology',
      body: 'Batch A live interactive session begins in 15 minutes. Click to enter the live classroom.',
      read_at: null,
      created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
    {
      id: 'notif-2',
      type: 'course.published',
      title: 'New DPP & Study Material: DNA Profiling',
      body: 'Practice 50 high-yield questions with detailed structured answer keys now available in Notes.',
      read_at: null,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    },
    {
      id: 'notif-3',
      type: 'class.reminder',
      title: 'Upcoming Lecture: Questioned Documents & Forgery',
      body: 'Scheduled for tomorrow at 6:00 PM IST with Prof. Rajesh Sharma.',
      read_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    },
    {
      id: 'notif-4',
      type: 'announcement',
      title: 'CUET PG & UGC NET 2026 Exam Calendar Announced',
      body: 'National Testing Agency has released tentative examination schedules for December cycle.',
      read_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    },
  ];
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-slate-600 hover:text-[#1D1A39]">
          <Link href="/app">
            <ArrowLeft className="size-4" aria-hidden /> Back to Dashboard
          </Link>
        </Button>
      </div>

      <PageHeader title="Notifications" description="Class reminders and platform updates.">
        {unread > 0 && (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="outline" size="sm" className="rounded-xl border-slate-200">
              <CheckCheck className="size-4" aria-hidden /> Mark all read
            </Button>
          </form>
        )}
      </PageHeader>


      {notifications.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Nothing yet"
          description="Class reminders, new recordings and announcements show up here. We'll also email you the day before each live class."
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-line flex flex-col divide-y">
            {notifications.map((n) => {
              const { icon: Icon, tint } = KIND[n.type] ?? FALLBACK;
              const isUnread = !n.read_at;

              return (
                <li key={n.id} className={cn('flex items-start gap-3.5 p-4', isUnread && 'bg-primary-ultra')}>
                  <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tint)}>
                    <Icon className="size-[18px]" aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <p className={cn('text-ink text-[13.5px]', isUnread ? 'font-semibold' : 'font-medium')}>
                        {n.title}
                      </p>
                      <span className="text-ink-muted shrink-0 text-[11.5px]">
                        {formatWhen(n.created_at)}
                      </span>
                    </div>
                    {n.body && <p className="text-ink-muted mt-1 text-[12.5px] leading-relaxed">{n.body}</p>}
                  </div>

                  {isUnread && (
                    <Badge variant="purple" className="shrink-0">
                      New
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
