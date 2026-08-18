'use client';

import { Plus } from 'lucide-react';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { addModule } from '@/lib/actions/studio';
import { IDLE_FORM_STATE } from '@/lib/actions/types';

/** One field, so it stays inline rather than hiding behind a disclosure. */
export function ModuleForm({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState(addModule, IDLE_FORM_STATE);

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <input type="hidden" name="courseId" value={courseId} />

      <div className="flex-1">
        <Field label="Section title" htmlFor="m-title" error={state.fieldErrors?.title}>
          <Input
            id="m-title"
            name="title"
            placeholder="Unit 8 · Forensic Toxicology"
            invalid={!!state.fieldErrors?.title}
          />
        </Field>
      </div>

      <Button type="submit" size="sm" variant="outline" className="sm:mt-7" loading={pending}>
        <Plus className="size-4" aria-hidden /> Add section
      </Button>
    </form>
  );
}
