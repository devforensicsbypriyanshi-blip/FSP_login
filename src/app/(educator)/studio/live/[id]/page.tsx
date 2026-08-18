import { ArrowLeft, MonitorSmartphone, UserCheck, UserX, Users } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { DataTable, KpiCard, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { getSessionAttendance, getSessionById, type AttendanceRow } from '@/lib/data/live';
import { formatTime, formatWhen } from '@/lib/format';

export const metadata = { title: 'Class attendance' };

/**
 * The register for one class.
 *
 * Two numbers per student, and they mean different things:
 *
 * - **Joins** is how many times they clicked through to the room. High is normal
 *   — a dropped connection on Indian mobile data costs three joins in a minute.
 * - **Devices** is how many distinct browsers did it. High is not normal. One
 *   person is one or two devices; five is one login being passed around.
 *
 * Neither is proof on its own, which is why both are shown rather than a verdict.
 * A student on hostel wifi and a shared account can produce the same join count;
 * they rarely produce the same device count.
 *
 * Absent students are listed too. "Who is missing" is the question this screen
 * exists to answer, and a list of attendees cannot answer it.
 */

/** More devices than this on one class is worth a look, not an accusation. */
const DEVICE_CONCERN = 3;

function AttendanceBadge({ row }: { row: AttendanceRow }) {
  if (row.joinCount === 0) return <Badge variant="gray">Absent</Badge>;
  if (row.deviceCount >= DEVICE_CONCERN) return <Badge variant="warning">{row.deviceCount} devices</Badge>;
  return <Badge variant="success">Present</Badge>;
}

const columns: Column<AttendanceRow & { id: string }>[] = [
  {
    key: 'student',
    header: 'Student',
    primary: true,
    render: (row) => (
      <div className="min-w-0">
        <p className="text-ink truncate font-semibold">{row.fullName}</p>
        <p className="text-ink-muted truncate text-[12.5px]">{row.email}</p>
      </div>
    ),
  },
  { key: 'status', header: 'Status', render: (row) => <AttendanceBadge row={row} /> },
  {
    key: 'first',
    header: 'First joined',
    render: (row) =>
      row.firstJoined ? (
        <span className="text-ink-secondary tabular-nums">{formatTime(row.firstJoined)}</span>
      ) : (
        <span className="text-ink-light">—</span>
      ),
  },
  {
    key: 'last',
    header: 'Last seen',
    render: (row) =>
      row.lastSeen ? (
        <span className="text-ink-secondary tabular-nums">{formatTime(row.lastSeen)}</span>
      ) : (
        <span className="text-ink-light">—</span>
      ),
  },
  {
    key: 'joins',
    header: 'Joins',
    render: (row) => <span className="text-ink tabular-nums">{row.joinCount}</span>,
  },
  {
    key: 'devices',
    header: 'Devices',
    render: (row) => (
      <span
        className={
          row.deviceCount >= DEVICE_CONCERN
            ? 'text-warning font-semibold tabular-nums'
            : 'text-ink tabular-nums'
        }
      >
        {row.deviceCount}
      </span>
    ),
  },
];

export default async function SessionAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSessionById(id);
  if (!session) notFound();

  const roster = await getSessionAttendance(id);

  const present = roster.filter((r) => r.joinCount > 0);
  const flagged = present.filter((r) => r.deviceCount >= DEVICE_CONCERN);
  const rate = roster.length ? Math.round((present.length / roster.length) * 100) : 0;

  return (
    <>
      <PageHeader
        title={session.title}
        description={`${session.courseTitle ?? 'Live class'} · ${formatWhen(session.startsAt)} IST`}
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/studio/live">
            <ArrowLeft className="size-4" aria-hidden /> All classes
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Attended"
          value={`${present.length} of ${roster.length}`}
          trend={`${rate}% of enrolled students`}
          icon={<UserCheck className="size-5" aria-hidden />}
        />
        <KpiCard
          label="Absent"
          value={String(roster.length - present.length)}
          trend="Enrolled but never opened the room"
          icon={<UserX className="size-5" aria-hidden />}
          tone="bg-hover text-ink-muted"
        />
        <KpiCard
          label="Total joins"
          value={String(present.reduce((sum, r) => sum + r.joinCount, 0))}
          trend="Reconnections included"
          icon={<Users className="size-5" aria-hidden />}
        />
        <KpiCard
          label="Multi-device"
          value={String(flagged.length)}
          trend={`${DEVICE_CONCERN}+ devices on this class`}
          icon={<MonitorSmartphone className="size-5" aria-hidden />}
          tone={flagged.length ? 'bg-warning-bg text-warning' : 'bg-hover text-ink-muted'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Register</CardTitle>
          <Badge variant="gray">{roster.length} enrolled</Badge>
        </CardHeader>

        <DataTable
          columns={columns}
          rows={roster.map((row) => ({ ...row, id: row.userId }))}
          empty={
            <EmptyState
              icon={Users}
              title="Nobody is enrolled yet"
              description="Attendance appears here once students are enrolled in this course and the class opens."
            />
          }
        />

        <p className="text-ink-muted mt-4 text-[12.5px] leading-relaxed">
          <strong className="text-ink-secondary">Reading this table:</strong> a high join count usually means
          a dropped connection, not a problem. A high <em>device</em> count is the one worth asking about —
          one person is one or two devices. Neither is proof on its own.
        </p>
      </Card>
    </>
  );
}
