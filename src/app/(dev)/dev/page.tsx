import { Activity, Database, Mail, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/data-table';

export const metadata = { title: 'System Health' };

const INTEGRATIONS: [string, string][] = [
  ['Supabase', 'Database, auth and storage'],
  ['Resend', 'Transactional email and auth OTP'],
  ['Cloudinary', 'Image delivery'],
  ['Google Drive', 'Lesson video and recordings'],
];

export default function Page() {
  return (
    <>
      <PageHeader title="System health" description="Live service status and request latency." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="API latency (p95)"
          value="84ms"
          icon={<Zap className="size-5" aria-hidden />}
          tone="bg-success-bg text-success"
        />
        <KpiCard label="Error rate (5xx)" value="0.01%" icon={<Activity className="size-5" aria-hidden />} />
        <KpiCard
          label="Database size"
          value="38 MB"
          trend="of 500 MB free tier"
          icon={<Database className="size-5" aria-hidden />}
          tone="bg-info-bg text-info"
        />
        <KpiCard
          label="Emails today"
          value="22"
          trend="of 100 daily cap"
          icon={<Mail className="size-5" aria-hidden />}
          tone="bg-warning-bg text-warning"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <Badge variant="success" dot>
            All operational
          </Badge>
        </CardHeader>
        <ul className="divide-line flex flex-col divide-y">
          {INTEGRATIONS.map(([n, d]) => (
            <li key={n} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-ink font-semibold">{n}</p>
                <p className="text-ink-muted text-[12.5px]">{d}</p>
              </div>
              <Badge variant="success">Operational</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-ink-muted text-center text-xs">
        Email volume is the tightest free-tier constraint — an alert fires at 80 sends per day.
      </p>
    </>
  );
}
