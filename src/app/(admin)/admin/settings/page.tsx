import { Settings2, ShieldAlert } from 'lucide-react';
import { SettingsBoard, type SettingRow } from '@/components/admin/settings-board';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getSessionContext } from '@/lib/session/server';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Platform Settings' };

/**
 * Commercial and operational configuration.
 *
 * The client's requirement was that pricing, support hours and policy text be
 * changeable without a deploy — so they are rows in app_settings, and this is
 * where they are edited. Every write goes through updateSetting(), and a
 * database trigger records it in config_history with the actor's email, which
 * means the audit trail cannot be bypassed by writing to the table directly.
 *
 * Secret settings never reach this page: the `settings: readable when signed in`
 * policy excludes `is_secret`, so they are filtered by the database rather than
 * by remembering to filter them here.
 */
export default async function AdminSettingsPage() {
  const session = await getSessionContext();
  const supabase = await createClient();

  const { data } = await supabase
    .from('app_settings')
    .select('key, name, description, category, value, value_type, unit, is_protected')
    .order('category')
    .order('key');

  const settings: SettingRow[] = (data ?? []).map((row) => ({
    key: row.key,
    name: row.name,
    description: row.description,
    category: row.category,
    value: row.value,
    valueType: row.value_type,
    unit: row.unit,
    isProtected: row.is_protected,
  }));

  const canEdit = session?.roles.includes('admin') ?? false;

  return (
    <>
      <PageHeader
        title="Platform settings"
        description="Pricing, support hours and policy text — changeable without a deploy."
      />

      {!canEdit && (
        <div className="border-warning-border bg-warning-bg text-warning flex items-start gap-2.5 rounded-xl border p-4 text-[13px]">
          <ShieldAlert className="mt-px size-4 shrink-0" aria-hidden />
          <p className="leading-relaxed">
            You can read these but not change them. Protected settings require an admin — the database
            enforces that regardless of what this page allows.
          </p>
        </div>
      )}

      {settings.length === 0 ? (
        <Card>
          <EmptyState
            icon={Settings2}
            title="No settings readable"
            description="Either the schema has not been applied yet, or you are not signed in — settings are only readable to signed-in users."
          />
        </Card>
      ) : (
        <SettingsBoard settings={settings} canEdit={canEdit} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>How these are recorded</CardTitle>
        </CardHeader>
        <p className="text-ink-secondary text-[13.5px] leading-relaxed">
          Every change is written to <code className="font-mono text-[12.5px]">config_history</code> by a
          database trigger, with the previous value, the new value and your email. Because it is a trigger
          rather than application code, the log cannot be bypassed — not even by writing to the table
          directly. Changes take effect within 30 seconds; the config cache is dropped on save.
        </p>
      </Card>
    </>
  );
}
