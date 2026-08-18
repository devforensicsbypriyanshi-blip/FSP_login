import { History, Megaphone, Users } from 'lucide-react';
import { BroadcastComposer } from '@/components/studio/broadcast-composer';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getAuthorCourses, getBroadcasts } from '@/lib/data/studio';
import { formatWhen } from '@/lib/format';

export const metadata = { title: 'Broadcasts' };

export default async function BroadcastsPage() {
  const [courses, sent] = await Promise.all([getAuthorCourses(), getBroadcasts(20)]);

  return (
    <>
      <PageHeader
        title="Broadcast announcement"
        description="Send a push notification and an email to everyone enrolled on a course."
      />

      <Card>
        <CardHeader>
          <CardTitle>Compose</CardTitle>
          <Megaphone className="text-primary size-[18px]" aria-hidden />
        </CardHeader>
        <BroadcastComposer courses={courses} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Already sent</CardTitle>
          <History className="text-ink-muted size-[18px]" aria-hidden />
        </CardHeader>

        {/* Without this list the same announcement goes out twice — the sender
            has no other way to check, since the queue is not theirs to read. */}
        {sent.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="Nothing sent yet"
            description="Announcements you send appear here with their delivery count."
          />
        ) : (
          <ul className="divide-line flex flex-col divide-y">
            {sent.map((broadcast) => (
              <li key={broadcast.id} className="flex flex-col gap-1 py-3.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-ink font-semibold">{broadcast.title}</p>
                  <Badge variant="gray">
                    <Users className="size-3.5" aria-hidden /> {broadcast.recipients}
                  </Badge>
                </div>
                {broadcast.body && (
                  <p className="text-ink-secondary text-[13px] leading-relaxed">{broadcast.body}</p>
                )}
                <p className="text-ink-muted text-[12.5px]">
                  {broadcast.courseTitle ?? 'Course removed'} · {formatWhen(broadcast.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-ink-muted text-center text-xs">
        Announcements are queued, not sent inline — the worker drains them within a minute and respects the
        per-key email quota.
      </p>
    </>
  );
}
