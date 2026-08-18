'use client';

import { Lock, RotateCcw, Save } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { updateSetting } from '@/lib/actions/config';
import { cn } from '@/lib/utils';

/**
 * Platform settings.
 *
 * The client's requirement was that pricing, support hours and policy text are
 * changeable without a deploy. So these are rows, not constants — and this
 * screen is the only place they are edited.
 *
 * Each row saves independently. A single "Save all" button across thirty
 * unrelated settings means one validation failure blocks twenty-nine good
 * changes, and makes the config_history entry meaningless as an audit record.
 */

export interface SettingRow {
  key: string;
  name: string;
  description: string;
  category: string;
  value: unknown;
  valueType: string;
  unit: string | null;
  isProtected: boolean;
}

/** jsonb comes back typed; the input needs a string, and the write needs it back. */
function toInput(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function fromInput(raw: string, valueType: string): unknown {
  if (valueType === 'number' || valueType === 'integer') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (valueType === 'boolean') return raw === 'true';
  if (valueType === 'json' || valueType === 'array') {
    try {
      return JSON.parse(raw);
    } catch {
      // Let the database reject it rather than guessing at intent.
      return raw;
    }
  }
  return raw;
}

function SettingField({ setting, canEdit }: { setting: SettingRow; canEdit: boolean }) {
  const [value, setValue] = useState(() => toInput(setting.value));
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const original = toInput(setting.value);
  const dirty = value !== original;
  const locked = setting.isProtected && !canEdit;

  function save() {
    start(async () => {
      const result = await updateSetting(setting.key, fromInput(value, setting.valueType));
      toast({ tone: result.ok ? 'success' : 'error', message: result.message });
    });
  }

  const isBoolean = setting.valueType === 'boolean';
  const isLong = setting.valueType === 'text' && original.length > 60;

  return (
    <li className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
            {setting.name}
            {setting.isProtected && (
              <Badge variant="warning">
                <Lock className="size-3" aria-hidden /> Protected
              </Badge>
            )}
          </p>
          <p className="text-ink-muted mt-0.5 text-[12px] leading-relaxed">{setting.description}</p>
          <code className="text-ink-light mt-1 block font-mono text-[11px]">{setting.key}</code>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isBoolean ? (
          <Select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={locked}
            aria-label={setting.name}
            className="max-w-[10rem]"
          >
            <option value="true">On</option>
            <option value="false">Off</option>
          </Select>
        ) : (
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={locked}
            aria-label={setting.name}
            inputMode={setting.valueType === 'number' ? 'numeric' : undefined}
            className={cn(isLong ? 'flex-1' : 'max-w-[18rem]')}
          />
        )}

        {setting.unit && <span className="text-ink-muted text-[12px]">{setting.unit}</span>}

        {dirty && !locked && (
          <>
            <Button size="sm" loading={pending} onClick={save}>
              <Save className="size-4" aria-hidden /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setValue(original)}>
              <RotateCcw className="size-4" aria-hidden /> Reset
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export function SettingsBoard({ settings, canEdit }: { settings: SettingRow[]; canEdit: boolean }) {
  const byCategory = new Map<string, SettingRow[]>();
  for (const setting of settings) {
    byCategory.set(setting.category, [...(byCategory.get(setting.category) ?? []), setting]);
  }

  return (
    <div className="flex flex-col gap-5">
      {[...byCategory.entries()].map(([category, rows]) => (
        <section key={category} className="border-line-medium bg-surface rounded-2xl border p-5">
          <h2 className="font-display text-ink mb-1 text-sm font-bold capitalize">{category}</h2>
          <ul className="divide-line divide-y">
            {rows.map((setting) => (
              <SettingField key={setting.key} setting={setting} canEdit={canEdit} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
