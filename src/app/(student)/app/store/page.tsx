import { BookOpen, CheckCircle2, ShoppingBag, Users } from 'lucide-react';
import Link from 'next/link';
import { CheckoutButton } from '@/components/store/checkout-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { isFeatureEnabled } from '@/lib/config/server';
import { getCatalogue } from '@/lib/data/orders';
import { formatRupees } from '@/lib/format';
import { getSessionContext } from '@/lib/session/server';

export const metadata = { title: 'Courses & Store' };

/**
 * The catalogue.
 *
 * When `module.payments` is off — which it is at launch — the buy button is
 * replaced with a route to support rather than hidden. A student who wants to
 * pay should never hit a dead end; manual enrolment is the path until Razorpay
 * is approved.
 */
export default async function StorePage() {
  const session = await getSessionContext();

  const [courses, paymentsOn] = await Promise.all([
    getCatalogue(session?.userId ?? null),
    isFeatureEnabled('module.payments', {
      userId: session?.userId,
      roles: session?.roles,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Courses"
        description="Everything available to enrol in, with what you already own marked."
      />

      {!paymentsOn && (
        <div className="border-info-border bg-info-bg text-info rounded-xl border p-4 text-[13px] leading-relaxed">
          Online payment is not switched on yet. Pick the course you want and message support — they will
          enrol you the same day, during 11 AM to 7 PM IST.
        </div>
      )}

      {courses.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No courses published yet"
          description="Courses appear here once they are published. Check back shortly."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {courses.map((course) => {
            const saving = course.mrpInr && course.mrpInr > course.priceInr ? course.mrpInr : null;

            return (
              <Card key={course.id} hover className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="purple">{course.category ?? 'Course'}</Badge>
                  {course.owned && (
                    <Badge variant="success">
                      <CheckCircle2 className="size-3" aria-hidden /> Enrolled
                    </Badge>
                  )}
                </div>

                <div className="min-w-0">
                  <h2 className="font-display text-ink text-[15px] leading-snug font-bold text-balance">
                    {course.title}
                  </h2>
                  {course.subtitle && (
                    <p className="text-ink-muted mt-1 text-[12.5px] leading-relaxed">{course.subtitle}</p>
                  )}
                </div>

                <p className="text-ink-muted flex flex-wrap items-center gap-x-3 text-[12px]">
                  <span className="flex items-center gap-1">
                    <BookOpen className="size-3.5" aria-hidden /> {course.lessonCount} lessons
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" aria-hidden /> {course.studentCount} enrolled
                  </span>
                </p>

                <p className="flex items-baseline gap-2">
                  <span className="font-display text-ink text-lg font-bold">
                    {course.isFree ? 'Free' : formatRupees(course.priceInr)}
                  </span>
                  {saving && (
                    <>
                      <span className="text-ink-light text-[13px] line-through">{formatRupees(saving)}</span>
                      <span className="text-success text-[12px] font-semibold">
                        {Math.round(((saving - course.priceInr) / saving) * 100)}% off
                      </span>
                    </>
                  )}
                </p>

                <div className="mt-auto">
                  {course.owned ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/app/learning/${course.slug}`}>Go to course</Link>
                    </Button>
                  ) : paymentsOn && session ? (
                    <CheckoutButton
                      courseIds={[course.id]}
                      priceInr={course.priceInr}
                      student={{ name: session.fullName, email: session.email }}
                    />
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link href="/contact">Ask support to enrol me</Link>
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
