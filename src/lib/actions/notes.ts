'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { parseDriveUrl } from '@/lib/drive';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from './types';

/**
 * Study material authoring.
 *
 * Three formats, and the difference matters:
 *
 *   text   Markdown written or pasted in the studio. Rendered by renderNote(),
 *          which escapes everything before emitting a fixed set of tags — so
 *          what is stored here is never treated as markup.
 *   link   An external URL (Slides, a dataset). Held in a column REVOKEd from
 *          `authenticated`, handed out only by log_resource_view().
 *   drive  An existing PDF, shown in the watermarked viewer.
 *
 * Ownership is checked inside upsert_resource(), not here.
 */

const resourceSchema = z
  .object({
    resourceId: z.string().uuid().nullable(),
    courseId: z.string().uuid('Choose which course this belongs to.'),
    title: z.string().trim().min(3, 'Give it a title.').max(160),
    kind: z.enum(['note', 'dpp', 'paper', 'solution', 'syllabus']),
    format: z.enum(['text', 'link', 'drive']),
    summary: z.string().trim().max(300).optional(),
    bodyMd: z.string().max(200_000).optional(),
    externalUrl: z.string().trim().max(2000).optional(),
    driveUrl: z.string().trim().max(2000).optional(),
    isFree: z.boolean().optional(),
  })
  // Each format needs a different field, and saying so here means the educator
  // is told which one rather than being handed a constraint violation.
  .superRefine((value, ctx) => {
    if (value.format === 'text' && !value.bodyMd?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['bodyMd'], message: 'Write or paste the content first.' });
    }
    if (value.format === 'link' && !/^https?:\/\/\S+$/i.test(value.externalUrl ?? '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['externalUrl'],
        message: 'Paste a full link starting with https://',
      });
    }
    if (value.format === 'drive' && !parseDriveUrl(value.driveUrl ?? '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['driveUrl'],
        message: 'Paste the Google Drive share link, or the file id on its own.',
      });
    }
  });

function collectFieldErrors(issues: z.ZodIssue[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function saveResource(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = resourceSchema.safeParse({
    resourceId: (formData.get('resourceId') as string) || null,
    courseId: formData.get('courseId'),
    title: formData.get('title'),
    kind: formData.get('kind'),
    format: formData.get('format'),
    summary: formData.get('summary') || undefined,
    bodyMd: (formData.get('bodyMd') as string) || undefined,
    externalUrl: (formData.get('externalUrl') as string) || undefined,
    driveUrl: (formData.get('driveUrl') as string) || undefined,
    isFree: formData.get('isFree') === 'on',
  });

  if (!parsed.success) return { ok: false, fieldErrors: collectFieldErrors(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'upsert_resource', {
    p_resource: parsed.data.resourceId,
    p_course: parsed.data.courseId,
    p_title: parsed.data.title,
    p_kind: parsed.data.kind,
    p_format: parsed.data.format,
    p_body_md: parsed.data.format === 'text' ? (parsed.data.bodyMd ?? null) : null,
    p_external_url: parsed.data.format === 'link' ? (parsed.data.externalUrl ?? null) : null,
    // The FILE ID, not the pasted URL: URLs carry tracking parameters and change
    // shape between Drive's views, where the id is stable.
    p_drive_file_id:
      parsed.data.format === 'drive' ? (parseDriveUrl(parsed.data.driveUrl ?? '')?.fileId ?? null) : null,
    p_summary: parsed.data.summary ?? null,
    p_is_free: parsed.data.isFree ?? false,
  });

  if (error) {
    const upper = error.message.toUpperCase();
    const message = upper.includes('NOT_YOUR_COURSE')
      ? 'You can only add material to your own courses.'
      : upper.includes('NOT_PERMITTED')
        ? 'Only educators can add study material.'
        : upper.includes('NOT_YOURS')
          ? 'That material belongs to someone else.'
          : 'We could not save that.';
    return { ok: false, message };
  }

  revalidatePath('/studio/notes');
  revalidatePath('/app/notes');
  return { ok: true, message: 'Saved as a draft. Publish it when you are ready.' };
}

export async function setResourcePublished(resourceId: string, published: boolean) {
  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'set_resource_published', {
    p_resource: resourceId,
    p_published: published,
  });

  if (error) {
    return {
      ok: false as const,
      message: error.message.toUpperCase().includes('NOT_YOURS')
        ? 'That material belongs to someone else.'
        : 'We could not change that.',
    };
  }

  revalidatePath('/studio/notes');
  revalidatePath('/app/notes');
  return {
    ok: true as const,
    message: published
      ? 'Published. Enrolled students have been notified.'
      : 'Unpublished. Students can no longer open it.',
  };
}

export async function deleteResource(resourceId: string) {
  const supabase = await createClient();
  const { error } = await callPendingRpc(supabase, 'delete_resource', { p_resource: resourceId });

  if (error) return { ok: false as const, message: 'We could not delete that.' };

  revalidatePath('/studio/notes');
  revalidatePath('/app/notes');
  return { ok: true as const, message: 'Deleted.' };
}
