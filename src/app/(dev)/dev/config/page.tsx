import { History, ToggleLeft } from 'lucide-react';
import { FlagBoard, type FlagRow } from '@/components/dev/flag-board';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { formatWhen } from '@/lib/format';
import { getSessionContext } from '@/lib/session/server';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Feature Flags & Config' };

/**
 * The runtime config console (docs Part 5 §3).
 *
 * Flags are readable by anyone signed in and writable per the `flags: write by
 * role` policy. This page does not re-implement that rule — it reads the row's
 * own `is_kill_switch` / `is_protected` markers and renders the lock, while the
 * database refuses the write regardless of what the UI allows.
 */
export default async function DevConfigPage() {
  const session = await getSessionContext();
  const supabase = await createClient();

  const [{ data: flags }, { data: history }] = await Promise.all([
    supabase
      .from('feature_flags')
      .select('key, name, description, category, enabled, is_kill_switch, is_protected')
      .order('category')
      .order('key'),
    supabase
      .from('config_history')
      .select('id, entity, entity_key, actor_email, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const rows: FlagRow[] = (flags ?? []).map((f) => ({
    key: f.key,
    name: f.name,
    description: f.description,
    category: f.category,
    enabled: f.enabled,
    isKillSwitch: f.is_kill_switch,
    isProtected: f.is_protected,
  }));

  const canEditProtected = session?.roles.includes('admin') ?? false;
  const liveCount = rows.filter((r) => r.enabled).length;

  return (
    <>
      <PageHeader
        title="Feature flags & config"
        description="Turn modules on and off without a deploy. Changes take effect within 30 seconds."
      />

      <Card>
        <CardHeader>
          <CardTitle>Flags</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="success">{liveCount} on</Badge>
            <Badge variant="gray">{rows.length - liveCount} off</Badge>
          </div>
        </CardHeader>

        {rows.length === 0 ? (
          <p className="text-ink-muted text-[13px] leading-relaxed">
            No flags are readable. Either the schema has not been applied, or you are not signed in — flags
            are only readable to signed-in users.
          </p>
        ) : (
          <FlagBoard flags={rows} canEditProtected={canEditProtected} />
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent changes</CardTitle>
          <History className="text-ink-muted size-[18px]" aria-hidden />
        </CardHeader>

        {!history?.length ? (
          <p className="text-ink-muted text-[13px]">No configuration changes recorded yet.</p>
        ) : (
          <ul className="divide-line flex flex-col divide-y">
            {history.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <ToggleLeft className="text-ink-muted size-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate font-mono text-[12.5px]">{entry.entity_key}</p>
                  <p className="text-ink-muted text-[11.5px]">
                    {entry.actor_email ?? 'system'} · {formatWhen(entry.created_at)}
                  </p>
                </div>
                <Badge variant="gray">{entry.entity}</Badge>
              </li>
            ))}
          </ul>
        )}

        <p className="text-ink-light mt-4 text-[12px] leading-relaxed">
          Every change is recorded by a database trigger, so the log cannot be bypassed by writing to the
          tables directly.
        </p>
      </Card>
    </>
  );
}
