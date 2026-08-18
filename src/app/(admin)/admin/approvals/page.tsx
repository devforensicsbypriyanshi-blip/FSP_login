import { BookCheck } from 'lucide-react';
import { ApprovalQueue } from '@/components/admin/approval-queue';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { getPendingCourses } from '@/lib/data/console';

export const metadata = { title: 'Course Approvals' };

export default async function ApprovalsPage() {
  const courses = await getPendingCourses();
  const waiting = courses.filter((course) => course.status === 'pending_review').length;

  return (
    <>
      <PageHeader title="Course approvals" description="Review courses before they go live." />

      <Card>
        <CardHeader>
          <CardTitle>Queue</CardTitle>
          {waiting > 0 ? (
            <Badge variant="warning">{waiting} awaiting review</Badge>
          ) : (
            <BookCheck className="text-primary size-[18px]" aria-hidden />
          )}
        </CardHeader>
        <ApprovalQueue courses={courses} />
      </Card>

      <p className="text-ink-muted mx-auto max-w-xl text-center text-xs leading-relaxed">
        Publishing puts a course in the public catalogue with a price on it, which is why it is an admin
        decision rather than the educator&apos;s own. Every decision is written to the audit log.
      </p>
    </>
  );
}
