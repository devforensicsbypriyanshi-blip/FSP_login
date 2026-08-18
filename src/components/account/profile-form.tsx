'use client';

import { CheckCircle2, Save } from 'lucide-react';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { updateProfile } from '@/lib/actions/profile';
import { IDLE_FORM_STATE } from '@/lib/actions/types';

/**
 * Uses useActionState rather than manual fetch state: the form still submits
 * with JavaScript disabled or still loading, which matters on the patchy mobile
 * connections a lot of these students are on.
 */

const EXAM_TARGETS = [
  { value: '', label: 'Not sure yet' },
  { value: 'ugc_net', label: 'UGC NET Forensic Science' },
  { value: 'msc', label: 'MSc / BSc Forensic Science' },
  { value: 'job', label: 'Government lab / job preparation' },
  { value: 'other', label: 'Other' },
];

export function ProfileForm({
  initial,
}: {
  initial: { fullName: string; email: string; examTarget: string | null; bio: string | null };
}) {
  const [state, action, pending] = useActionState(updateProfile, IDLE_FORM_STATE);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.ok && state.message && (
        <p
          className="border-success-border bg-success-bg text-success flex items-center gap-2 rounded-xl border p-3 text-[13px]"
          role="status"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden /> {state.message}
        </p>
      )}
      {!state.ok && state.message && (
        <p
          className="border-error-border bg-error-bg text-error rounded-xl border p-3 text-[13px]"
          role="alert"
        >
          {state.message}
        </p>
      )}

      <Field label="Full name" htmlFor="fullName" error={state.fieldErrors?.fullName} required>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          defaultValue={initial.fullName}
          invalid={!!state.fieldErrors?.fullName}
        />
      </Field>

      <Field
        label="Email address"
        htmlFor="email"
        hint="This is how you sign in. Contact support to change it."
      >
        <Input id="email" value={initial.email} readOnly disabled />
      </Field>

      <Field label="What are you preparing for?" htmlFor="examTarget">
        <Select id="examTarget" name="examTarget" defaultValue={initial.examTarget ?? ''}>
          {EXAM_TARGETS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="About you" htmlFor="bio" hint="Optional. Visible to your educator only.">
        <Textarea id="bio" name="bio" rows={3} maxLength={280} defaultValue={initial.bio ?? ''} />
      </Field>

      <Button type="submit" size="sm" className="self-start" loading={pending}>
        <Save className="size-4" aria-hidden /> Save changes
      </Button>
    </form>
  );
}
