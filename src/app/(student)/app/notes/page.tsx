import { Eye, FileText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getResources } from '@/lib/data/library';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'Notes & DPPs' };

const KIND: Record<string, { label: string; variant: 'purple' | 'info' | 'success' | 'warning' | 'gray' }> = {
  note: { label: 'Notes', variant: 'purple' },
  dpp: { label: 'DPP', variant: 'info' },
  paper: { label: 'Past paper', variant: 'warning' },
  solution: { label: 'Solutions', variant: 'success' },
  syllabus: { label: 'Syllabus', variant: 'gray' },
};

function formatSize(bytes: number | null): string | null {
  if (!bytes) return null;
  const mb = bytes / 1_048_576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/**
 * The study library.
 *
 * Everything here is view-only — there is no download path, by design. RLS
 * (`resources: free or enrolled`) decides what appears, so an unenrolled
 * student sees the free material and nothing else rather than a locked list
 * that advertises what they are missing.
 */
export default async function NotesPage() {
  const resources = await getResources();

  return (
    <>
      <PageHeader title="Notes & DPPs" description="Study material for your enrolled courses." />

      {resources.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nothing here yet"
          description="Notes, daily practice problems and past papers appear here as your educator publishes them."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {resources.map((resource) => {
            const kind = KIND[resource.kind] ?? { label: resource.kind, variant: 'gray' as const };
            const size = formatSize(resource.sizeBytes);

            return (
              <Card key={resource.id} hover className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="bg-primary-light text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                    <FileText className="size-[18px]" aria-hidden />
                  </span>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Badge variant={kind.variant}>{kind.label}</Badge>
                    {resource.isFree && <Badge variant="success">Free</Badge>}
                  </div>
                </div>

                <div className="min-w-0">
                  <h2 className="text-ink text-[14px] leading-snug font-semibold text-balance">
                    {resource.title}
                  </h2>
                  <p className="text-ink-muted mt-1 flex flex-wrap items-center gap-x-2 text-[12px]">
                    {resource.courseTitle && <span>{resource.courseTitle}</span>}
                    {resource.pageCount && <span>{resource.pageCount} pages</span>}
                    {size && <span>{size}</span>}
                    {resource.publishedAt && <span>{formatDate(resource.publishedAt)}</span>}
                  </p>
                </div>

                <Button asChild size="sm" className="mt-auto self-start">
                  <Link href={`/app/notes/${resource.id}`}>
                    <Eye className="size-4" aria-hidden /> Open
                  </Link>
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-ink-muted flex items-center justify-center gap-1.5 text-center text-xs">
        <ShieldCheck className="size-3.5" aria-hidden />
        Material is view-only and watermarked with your name.
      </p>
    </>
  );
}
