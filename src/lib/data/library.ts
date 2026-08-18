import 'server-only';

import { callPendingRpc, fromPending } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';

/**
 * Notes, DPPs and the doubts forum.
 *
 * Access is entirely RLS. `resources: free or enrolled` and
 * `doubts: readable to course members` decide what comes back, so these
 * functions never filter by course — an unenrolled student simply receives
 * fewer rows, and a bug here cannot widen that.
 */

/**
 * Never add `external_url` to this list.
 *
 * That column is REVOKEd from `authenticated` — naming it makes the whole query
 * fail, which is the point. A link rendered into the page is a link that can be
 * forwarded to someone who never had access; log_resource_view() is the only
 * way to obtain one, and it writes the log line first.
 */
const RESOURCE_COLUMNS =
  'id, title, kind, format, summary, body_md, drive_file_id, storage_path, page_count, size_bytes, is_free, published_at, courses(title)';

export interface Resource {
  id: string;
  title: string;
  kind: string;
  /** 'drive' | 'text' | 'link' | 'storage' — decides which viewer renders it. */
  format: string;
  summary: string | null;
  /** Markdown, never HTML. Rendered through renderNote(). */
  bodyMd: string | null;
  courseTitle: string | null;
  driveFileId: string | null;
  storagePath: string | null;
  pageCount: number | null;
  sizeBytes: number | null;
  isFree: boolean;
  publishedAt: string | null;
}

interface ResourceRow {
  id: string;
  title: string;
  kind: string;
  format: string | null;
  summary: string | null;
  body_md: string | null;
  drive_file_id: string | null;
  storage_path: string | null;
  page_count: number | null;
  size_bytes: number | null;
  is_free: boolean;
  published_at: string | null;
  courses: { title: string } | null;
}

function toResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    // Rows written before 0028 have no format; they are all Drive files.
    format: row.format ?? 'drive',
    summary: row.summary,
    bodyMd: row.body_md,
    courseTitle: row.courses?.title ?? null,
    driveFileId: row.drive_file_id,
    storagePath: row.storage_path,
    pageCount: row.page_count,
    sizeBytes: row.size_bytes,
    isFree: row.is_free,
    publishedAt: row.published_at,
  };
}

export async function getResources(): Promise<Resource[]> {
  const supabase = await createClient();

  const { data } = await fromPending(supabase, 'resources')
    .select(RESOURCE_COLUMNS)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(200);

  return ((data ?? []) as unknown as ResourceRow[]).map(toResource);
}

/** Includes unpublished rows — RLS and the caller decide, not this function. */
export async function getResource(id: string): Promise<Resource | null> {
  const supabase = await createClient();

  const { data } = await fromPending(supabase, 'resources')
    .select(RESOURCE_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (!data) return null;
  return toResource(data as unknown as ResourceRow);
}

/** Everything the author can see, published or not. Studio side of the library. */
export async function getAuthoredResources(): Promise<Resource[]> {
  const supabase = await createClient();

  const { data } = await fromPending(supabase, 'resources')
    .select(RESOURCE_COLUMNS)
    .order('published_at', { ascending: false, nullsFirst: true })
    .limit(200);

  return ((data ?? []) as unknown as ResourceRow[]).map(toResource);
}

export type OpenResourceResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'NOT_ENROLLED' | 'NOT_PUBLISHED' | 'NOT_FOUND' | 'NO_LINK' | 'ERROR' };

/**
 * Records that someone opened a resource, and returns its external URL if it
 * has one.
 *
 * The two are one call on purpose: there is no way to obtain the URL that does
 * not also write the log line. Splitting them would leave a "get the link"
 * path that quietly bypasses the log — which is the only evidence a leak
 * investigation would have.
 */
export async function openResource(
  resourceId: string,
  context: { deviceId?: string | null; ip?: string | null } = {}
): Promise<OpenResourceResult> {
  const supabase = await createClient();

  const { data, error } = await callPendingRpc(supabase, 'log_resource_view', {
    p_resource: resourceId,
    p_device_id: context.deviceId ?? null,
    p_ip: context.ip ?? null,
  });

  if (error) {
    const message = error.message.toUpperCase();
    if (message.includes('NOT_ENROLLED')) return { ok: false, reason: 'NOT_ENROLLED' };
    if (message.includes('NOT_PUBLISHED')) return { ok: false, reason: 'NOT_PUBLISHED' };
    if (message.includes('RESOURCE_NOT_FOUND')) return { ok: false, reason: 'NOT_FOUND' };
    return { ok: false, reason: 'ERROR' };
  }

  if (!data) return { ok: false, reason: 'NO_LINK' };
  return { ok: true, url: data };
}

export interface ResourceReader {
  userId: string;
  fullName: string;
  email: string;
  views: number;
  lastRead: string;
}

/** Who has read this, and how often. Educator and staff only. */
export async function getResourceReaders(resourceId: string): Promise<ResourceReader[]> {
  const supabase = await createClient();
  const { data, error } = await callPendingRpc(supabase, 'get_resource_readers', {
    p_resource: resourceId,
  });

  if (error) return [];

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    views: row.views,
    lastRead: row.last_read,
  }));
}

export interface DoubtAnswer {
  id: string;
  body: string;
  authorName: string;
  isEducatorVerified: boolean;
  createdAt: string;
}

export interface Doubt {
  id: string;
  title: string | null;
  body: string;
  subject: string | null;
  status: string;
  createdAt: string;
  askedBy: string;
  courseTitle: string | null;
  answers: DoubtAnswer[];
}

export async function getDoubts(limit = 50): Promise<Doubt[]> {
  const supabase = await createClient();

  const { data: doubts } = await supabase
    .from('doubts')
    .select('id, title, body, subject, status, created_at, is_anonymous, profiles(full_name), courses(title)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!doubts?.length) return [];

  const { data: answers } = await supabase
    .from('doubt_answers')
    .select('id, doubt_id, body, is_educator_verified, created_at, profiles(full_name)')
    .in(
      'doubt_id',
      doubts.map((d) => d.id)
    )
    .order('created_at', { ascending: true });

  const byDoubt = new Map<string, DoubtAnswer[]>();
  for (const answer of answers ?? []) {
    byDoubt.set(answer.doubt_id, [
      ...(byDoubt.get(answer.doubt_id) ?? []),
      {
        id: answer.id,
        body: answer.body,
        authorName: (answer.profiles as { full_name: string } | null)?.full_name ?? 'Unknown',
        isEducatorVerified: answer.is_educator_verified,
        createdAt: answer.created_at,
      },
    ]);
  }

  return doubts.map((doubt) => ({
    id: doubt.id,
    title: doubt.title,
    body: doubt.body,
    subject: doubt.subject,
    status: doubt.status,
    createdAt: doubt.created_at,
    // The asker chose anonymity; the join still returned their name, so it is
    // dropped here rather than sent to the browser and hidden with CSS.
    askedBy: doubt.is_anonymous
      ? 'Anonymous'
      : ((doubt.profiles as { full_name: string } | null)?.full_name ?? 'Unknown'),
    courseTitle: (doubt.courses as { title: string } | null)?.title ?? null,
    // Verified educator answers first — that is what the asker came back for.
    answers: (byDoubt.get(doubt.id) ?? []).sort(
      (a, b) => Number(b.isEducatorVerified) - Number(a.isEducatorVerified)
    ),
  }));
}
