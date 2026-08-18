import { CalendarPlus, Clock, FileCheck, RotateCcw, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';

export const metadata = { title: 'Tests & Quizzes' };

/**
 * Client feedback (2026-08-06): support should be able to schedule and
 * reschedule mock tests and quizzes.
 *
 * Support schedules WHEN a test opens and closes. They cannot author or edit
 * questions — that stays with educators. The split matters: scheduling is
 * logistics, authoring is academic content, and a helpdesk account should not
 * be able to change an answer key.
 */

const TESTS = [
  {
    id: '1',
    title: 'UGC NET Grand Mock Test #5',
    course: 'UGC NET 2026 Core',
    opens: 'Sat 9 Aug, 10:00',
    closes: 'Sun 10 Aug, 22:00',
    questions: 100,
    status: 'Scheduled' as const,
  },
  {
    id: '2',
    title: 'Unit 3: Forensic Serology',
    course: 'UGC NET 2026 Core',
    opens: 'Open now',
    closes: 'Fri 8 Aug, 23:59',
    questions: 50,
    status: 'Live' as const,
  },
  {
    id: '3',
    title: 'Fingerprint Classification & IAFIS',
    course: 'Ballistics Masterclass',
    opens: '—',
    closes: '—',
    questions: 30,
    status: 'Unscheduled' as const,
  },
];

const STATUS = {
  Live: 'success',
  Scheduled: 'info',
  Unscheduled: 'gray',
} as const;

export default function SupportTestsPage() {
  return (
    <>
      <PageHeader
        title="Tests & quizzes"
        description="Schedule when a test opens and closes. Questions are managed by educators."
      />

      <Card>
        <CardHeader>
          <CardTitle>Schedule a test</CardTitle>
        </CardHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Test" htmlFor="t-test">
              <Select id="t-test">
                <option>Fingerprint Classification &amp; IAFIS (30 Q)</option>
                <option>UGC NET Grand Mock Test #6 (100 Q)</option>
              </Select>
            </Field>
            <Field label="Batch" htmlFor="t-batch">
              <Select id="t-batch">
                <option>UGC NET 2026 Core</option>
                <option>Ballistics Masterclass</option>
                <option>All batches</option>
              </Select>
            </Field>
            <Field label="Opens" htmlFor="t-open">
              <Input id="t-open" type="datetime-local" />
            </Field>
            <Field label="Closes" htmlFor="t-close">
              <Input id="t-close" type="datetime-local" />
            </Field>
          </div>

          <Button size="sm" className="self-start">
            <CalendarPlus className="size-4" aria-hidden /> Schedule test
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All tests</CardTitle>
          <Badge variant="gray">{TESTS.length}</Badge>
        </CardHeader>

        <ul className="divide-line flex flex-col divide-y">
          {TESTS.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start"
            >
              <span className="bg-warning-bg text-warning grid size-10 shrink-0 place-items-center rounded-xl">
                <FileCheck className="size-[18px]" aria-hidden />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-ink font-semibold text-balance">{t.title}</p>
                  <Badge variant={STATUS[t.status]} dot={t.status === 'Live'} pulse={t.status === 'Live'}>
                    {t.status}
                  </Badge>
                </div>
                <p className="text-ink-muted mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px]">
                  <span>{t.course}</span>
                  <span aria-hidden>·</span>
                  <span>{t.questions} questions</span>
                </p>
                {t.status !== 'Unscheduled' && (
                  <p className="text-ink-muted mt-1 flex items-center gap-1.5 text-[12.5px]">
                    <Clock className="size-3.5" aria-hidden /> {t.opens} → {t.closes}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                {t.status === 'Unscheduled' ? (
                  <Button size="sm">Schedule</Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm">
                      <RotateCcw className="size-4" aria-hidden /> Reschedule
                    </Button>
                    <Button variant="danger-outline" size="sm">
                      <X className="size-4" aria-hidden /> Close early
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-ink-muted text-center text-xs">
        Rescheduling notifies every enrolled student. Attempts already submitted are never affected.
      </p>
    </>
  );
}
