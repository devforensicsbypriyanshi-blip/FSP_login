import { CalendarPlus, Clock, Radio, Star, TrendingUp, Video } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/data-table';

export const metadata = { title: 'Overview' };

/**
 * Client feedback (2026-08-06): "Active Enrolled Students" and "Total Video
 * Watch Hours" removed — neither is actionable for an educator. Enrolment is
 * an admin concern, and watch hours cannot be measured honestly anyway while
 * video is served from a Drive iframe that reports no playback position.
 *
 * What replaced them answers questions an educator actually has before a
 * class: what am I teaching next, and is anyone showing up?
 */

const TODAY = [
  {
    id: '1',
    title: 'Forensic Toxicology: Poisons & Extraction',
    batch: 'UGC NET 2026 Core',
    time: '4:00 PM IST',
    primary: true,
  },
  {
    id: '2',
    title: '1:1 Mentorship — Ananya Sharma',
    batch: 'Paper II strategy',
    time: '6:00 PM IST',
    primary: false,
  },
];

export default function StudioOverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="Welcome back, Priyanshi.">
        <Button asChild variant="outline" size="sm">
          <Link href="/studio/schedule">
            <CalendarPlus className="size-4" aria-hidden /> Schedule
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/studio/live">
            <Radio className="size-4" aria-hidden /> Go live
          </Link>
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Classes this week"
          value="4"
          trend="Mon · Wed · Fri · Sun"
          icon={<Video className="size-5" aria-hidden />}
          tone="bg-info-bg text-info"
        />
        <KpiCard
          label="Next class"
          value="4:00 PM"
          trend="Toxicology · today"
          icon={<Clock className="size-5" aria-hidden />}
        />
        <KpiCard
          label="Avg live attendance"
          value="63%"
          trend="~124 of 196 join live"
          icon={<TrendingUp className="size-5" aria-hidden />}
          tone="bg-success-bg text-success"
        />
        <KpiCard
          label="Class rating"
          value="4.96"
          trend="Based on 218 ratings"
          icon={<Star className="size-5" aria-hidden />}
          tone="bg-warning-bg text-warning"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today&rsquo;s schedule</CardTitle>
          <Badge variant="purple">{TODAY.length} sessions</Badge>
        </CardHeader>

        <div className="flex flex-col gap-3">
          {TODAY.map((s) => (
            <div
              key={s.id}
              className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${
                s.primary ? 'border-primary-border bg-primary-ultra' : 'border-line-medium'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-ink font-semibold text-balance">{s.title}</p>
                <p className="text-ink-muted mt-0.5 flex items-center gap-1.5 text-[12.5px]">
                  <Clock className="size-3.5" aria-hidden /> {s.batch} · {s.time}
                </p>
              </div>
              <Button asChild size="sm" variant={s.primary ? 'primary' : 'outline'}>
                <Link href="/studio/live">{s.primary ? 'Launch studio' : 'Open'}</Link>
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
