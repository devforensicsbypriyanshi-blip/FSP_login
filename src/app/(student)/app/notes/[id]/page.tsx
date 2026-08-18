import { ArrowLeft, Clock, ExternalLink, FileWarning } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { OpenLinkButton } from '@/components/player/open-link-button';
import { ProtectedDocument } from '@/components/player/protected-document';
import { WatermarkedReading } from '@/components/player/watermarked-reading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { getResource } from '@/lib/data/library';
import { formatDate } from '@/lib/format';
import { readingMinutes, renderNote } from '@/lib/notes/markdown';
import { getSessionContext } from '@/lib/session/server';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resource = await getResource(id);
  return { title: resource?.title ?? 'Reading' };
}

/**
 * The document viewer, in three shapes.
 *
 *   text   Rendered here from Markdown by renderNote(), watermarked in place.
 *   drive  The existing PDF viewer, unchanged.
 *   link   A button, not an anchor — the URL is column-REVOKEd and issued only
 *          by the server after it has written the log line.
 *
 * The watermark identity comes from the session, never from props or the URL.
 * That is the entire point of a watermark: the reader cannot choose whose name
 * appears on it.
 *
 * Access is RLS: `resources: free or enrolled` returns nothing for a resource
 * the student has no claim to, and null renders 404 rather than a "locked"
 * screen, so probing ids reveals nothing about what exists.
 */
export default async function NoteViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [resource, session] = await Promise.all([getResource(id), getSessionContext()]);

  if (!resource) notFound();
  if (!session) redirect('/sign-in');

  // Unpublished material is visible to its author through RLS. Students reach
  // this only if it is published — and 404, not "not yet available", because
  // the existence of a draft is not theirs to learn.
  if (!resource.publishedAt && !resource.isFree) {
    const authored = session.roles.includes('educator') || session.roles.includes('admin');
    if (!authored) notFound();
  }

  const meta = [
    resource.courseTitle,
    resource.format === 'text' && resource.bodyMd
      ? `${readingMinutes(resource.bodyMd)} min read`
      : resource.pageCount
        ? `${resource.pageCount} pages`
        : null,
    resource.publishedAt ? `Published ${formatDate(resource.publishedAt)}` : 'Draft',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-3 self-start">
        <Link href="/app/notes">
          <ArrowLeft className="size-4" aria-hidden /> All notes
        </Link>
      </Button>

      <PageHeader title={resource.title} description={meta}>
        <Badge variant="info">{resource.kind}</Badge>
      </PageHeader>

      {resource.summary && (
        <p className="text-ink-secondary -mt-2 text-[14px] leading-relaxed">{resource.summary}</p>
      )}

      {resource.format === 'text' && resource.bodyMd ? (
        <WatermarkedReading
          html={renderNote(resource.bodyMd)}
          viewer={{ name: session.fullName, email: session.email }}
          title={resource.title}
        />
      ) : resource.format === 'link' ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="bg-primary-light text-primary grid size-12 place-items-center rounded-2xl">
              <ExternalLink className="size-6" aria-hidden />
            </span>
            <p className="text-ink font-semibold">This opens outside the app</p>
            <p className="text-ink-muted max-w-sm text-[13px] leading-relaxed">
              Slides and other external material live where your educator put them. Opening it is recorded
              against your account.
            </p>
            <OpenLinkButton resourceId={resource.id} label="Open material" />
          </div>
        </Card>
      ) : resource.driveFileId ? (
        <ProtectedDocument
          src={`/api/media/resource/${resource.id}`}
          viewer={{ name: session.fullName, email: session.email }}
          title={resource.title}
        />
      ) : (
        <Card>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="bg-warning-bg text-warning grid size-12 place-items-center rounded-2xl">
              <FileWarning className="size-6" aria-hidden />
            </span>
            <p className="text-ink font-semibold">This document isn&apos;t viewable yet</p>
            <p className="text-ink-muted max-w-sm text-[13px] leading-relaxed">
              It was uploaded to private storage rather than Drive. Signed-URL delivery for those files is
              still to come — ask support and they can send it to you directly.
            </p>
          </div>
        </Card>
      )}

      <p className="text-ink-muted flex items-center justify-center gap-1.5 text-center text-xs">
        <Clock className="size-3.5" aria-hidden />
        Watermarked with your name and email, and this open has been recorded.
      </p>
    </>
  );
}
