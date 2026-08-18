'use client';

import { AlertTriangle, Ban, Check, RotateCcw, Search, UserPlus } from 'lucide-react';
import { useActionState, useState, useTransition } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { grantCourseAccess, setEnrolmentStatus } from '@/lib/actions/admin';
import { IDLE_FORM_STATE } from '@/lib/actions/types';
import type { AdminEnrolment, CourseOption } from '@/lib/data/admin';
import { formatDate } from '@/lib/format';

/**
 * Manual enrolment.
 *
 * The most important screen in the admin console at launch: payments ship
 * disabled, so granting access by hand is the ONLY way a student gets into a
 * course. If this is broken, nothing else matters.
 *
 * Deliberate constraints, every one of them also enforced in the database:
 *   - Granting requires a reason. Free access to paid material should never be
 *     anonymous, and "who let this person in?" gets asked months later.
 *   - Revoking is reversible — status changes, the row stays, so progress and
 *     attempt history survive.
 *   - Expiry is explicit. "Lifetime" must be chosen, never defaulted into.
 */

const STATUS_META: Record<string, { label: string; variant: 'success' | 'gray' | 'error' }> = {
  active: { label: 'Active', variant: 'success' },
  expired: { label: 'Expired', variant: 'gray' },
  refunded: { label: 'Refunded', variant: 'gray' },
  suspended: { label: 'Revoked', variant: 'error' },
};

export function EnrolmentManager({
  enrolments,
  courses,
}: {
  enrolments: AdminEnrolment[];
  courses: CourseOption[];
}) {
  const [state, action, pending] = useActionState(grantCourseAccess, IDLE_FORM_STATE);
  const [busy, startTransition] = useTransition();
  const { toast } = useToast();

  const [filter, setFilter] = useState('');
  const [granting, setGranting] = useState(false);
  const [reason, setReason] = useState('');

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? enrolments.filter(
        (e) =>
          e.studentName.toLowerCase().includes(needle) ||
          e.studentEmail.toLowerCase().includes(needle) ||
          e.courseTitle.toLowerCase().includes(needle)
      )
    : enrolments;

  function toggleStatus(id: string, status: string) {
    startTransition(async () => {
      const result = await setEnrolmentStatus(id, status === 'suspended' ? 'active' : 'suspended');
      toast({ tone: result.ok ? 'success' : 'error', message: result.message });
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Grant access</CardTitle>
          <Button size="sm" onClick={() => setGranting((v) => !v)}>
            <UserPlus className="size-4" aria-hidden /> {granting ? 'Close' : 'New enrolment'}
          </Button>
        </CardHeader>

        {granting ? (
          <form action={action} className="flex flex-col gap-4">
            <div className="border-info-border bg-info-bg text-info rounded-xl border p-3.5 text-[12.5px] leading-relaxed">
              Payments are disabled for launch, so this is how students get access. Every grant is written to
              the audit log with your name against it, and the student is notified.
            </div>

            {state.message && (
              <p
                className={
                  state.ok
                    ? 'border-success-border bg-success-bg text-success flex items-center gap-2 rounded-xl border p-3 text-[13px]'
                    : 'border-error-border bg-error-bg text-error flex items-start gap-2 rounded-xl border p-3 text-[13px]'
                }
                role={state.ok ? 'status' : 'alert'}
              >
                {state.ok ? (
                  <Check className="size-4 shrink-0" aria-hidden />
                ) : (
                  <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
                )}
                {state.message}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Student email" htmlFor="g-email" error={state.fieldErrors?.email} required>
                <Input
                  id="g-email"
                  name="email"
                  type="email"
                  placeholder="student@example.com"
                  invalid={!!state.fieldErrors?.email}
                />
              </Field>

              <Field label="Course" htmlFor="g-course" error={state.fieldErrors?.slug} required>
                <Select id="g-course" name="slug">
                  {courses.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.title}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Access duration" htmlFor="g-duration">
                <Select id="g-duration" name="days" defaultValue="365">
                  <option value="30">30 days</option>
                  <option value="180">6 months</option>
                  <option value="365">1 year</option>
                  <option value="lifetime">Lifetime</option>
                </Select>
              </Field>
            </div>

            <Field
              label="Reason"
              htmlFor="g-reason"
              required
              hint="Why does this student get access without a payment record? Minimum 10 characters."
              error={
                state.fieldErrors?.reason ??
                (reason.length > 0 && reason.trim().length < 10
                  ? 'Please be a bit more specific.'
                  : undefined)
              }
            >
              <Input
                id="g-reason"
                name="reason"
                placeholder="e.g. Paid by UPI to business account, ref 8821"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                invalid={!!state.fieldErrors?.reason}
              />
            </Field>

            <Button
              type="submit"
              size="sm"
              className="self-start"
              loading={pending}
              disabled={reason.trim().length < 10}
            >
              <Check className="size-4" aria-hidden /> Grant access
            </Button>
          </form>
        ) : (
          <p className="text-ink-muted text-[13px] leading-relaxed">
            Give a student access to a course without a payment. Used for offline payments, scholarships and
            trials. The student must already have an account — you cannot pre-enrol someone.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All enrolments</CardTitle>
          <Badge variant="gray">{visible.length}</Badge>
        </CardHeader>

        {enrolments.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="Nobody is enrolled yet"
            description="Once a student registers you can grant them course access above, and it will appear here."
          />
        ) : (
          <>
            <div className="border-line-medium bg-surface mb-4 flex items-center gap-2.5 rounded-full border px-4 py-2.5">
              <Search className="text-ink-muted size-[18px] shrink-0" aria-hidden />
              <input
                type="search"
                placeholder="Search by student, email or course…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Filter enrolments"
                className="text-ink placeholder:text-ink-light w-full bg-transparent text-[13.5px] outline-none"
              />
            </div>

            <ul className="divide-line flex flex-col divide-y">
              {visible.map((row) => {
                const meta = STATUS_META[row.status] ?? { label: row.status, variant: 'gray' as const };
                const revoked = row.status === 'suspended';

                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start"
                  >
                    <Avatar name={row.studentName} size="md" />

                    <div className="min-w-0 flex-1">
                      <p className="text-ink text-[13.5px] font-semibold">{row.studentName}</p>
                      <p className="text-ink-muted truncate text-[12.5px]">{row.studentEmail}</p>
                      <p className="text-ink-secondary mt-1 text-[12.5px]">{row.courseTitle}</p>
                      <p className="text-ink-muted mt-0.5 text-[11.5px]">
                        {row.source} · granted {formatDate(row.grantedAt)} ·{' '}
                        {row.expiresAt ? `expires ${formatDate(row.expiresAt)}` : 'lifetime'}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <Button
                        variant={revoked ? 'outline' : 'danger-outline'}
                        size="sm"
                        loading={busy}
                        onClick={() => toggleStatus(row.id, row.status)}
                      >
                        {revoked ? (
                          <>
                            <RotateCcw className="size-4" aria-hidden /> Restore
                          </>
                        ) : (
                          <>
                            <Ban className="size-4" aria-hidden /> Revoke
                          </>
                        )}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
