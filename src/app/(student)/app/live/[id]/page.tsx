import { ArrowLeft, CalendarDays, FileText, Video } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

import { formatDate, formatTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

/**
 * A single class: its recording, its material, and what it covered.
 *
 * Note the explicit column list — live_sessions has join_url REVOKEd from
 * `authenticated`, so `select('*')` fails outright for a student. The recording
 * id is safe to select; the join URL is not, and is never fetched here.
 */

async function getSession(id: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('live_sessions')
    .select(
      'id, title, description, starts_at, ends_at, status, recording_drive_id, material_drive_id, courses(title, slug), profiles!live_sessions_educator_id_fkey(full_name)'
    )
    .eq('id', id)
    .maybeSingle();

  return data as unknown as {
    id: string;
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string;
    status: string;
    recording_drive_id: string | null;
    material_drive_id: string | null;
    courses: { title: string; slug: string } | null;
    profiles: { full_name: string } | null;
  } | null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession(id);
  return { title: session?.title ?? 'Class' };
}

export default async function LiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession(id);

  // Null covers both "no such class" and "RLS hid it from this student".
  if (!session) notFound();

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/app/live">
            <ArrowLeft className="size-4" aria-hidden /> Back to classroom
          </Link>
        </Button>
        <h1 className="font-display text-ink text-xl font-bold text-balance md:text-2xl">{session.title}</h1>
        <p className="text-ink-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          {session.courses && <span>{session.courses.title}</span>}
          <span aria-hidden>·</span>
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5" aria-hidden />
            {formatDate(session.starts_at)}, {formatTime(session.starts_at)}
          </span>
          {session.profiles && (
            <>
              <span aria-hidden>·</span>
              <span>{session.profiles.full_name}</span>
            </>
          )}
        </p>
      </div>

      {session.recording_drive_id ? (
        <div className="bg-navy-deep aspect-video w-full overflow-hidden rounded-2xl">
          <iframe
            src={`/api/media/recording/${session.id}`}
            title={`Recording — ${session.title}`}
            allow="autoplay; encrypted-media"
            allowFullScreen
            className="size-full border-0"
          />
        </div>
      ) : (
        <Card>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="bg-primary-light text-primary grid size-12 place-items-center rounded-2xl">
              <Video className="size-6" aria-hidden />
            </span>
            <p className="text-ink font-semibold">The recording isn&apos;t ready yet</p>
            <p className="text-ink-muted max-w-sm text-[13px] leading-relaxed">
              Recordings are uploaded after the class ends and usually appear within a few hours. You&apos;ll
              get a notification when this one is available.
            </p>
          </div>
        </Card>
      )}

      {session.description && (
        <Card>
          <CardHeader>
            <CardTitle>What this class covered</CardTitle>
          </CardHeader>
          <p className="text-ink-secondary text-[13.5px] leading-relaxed whitespace-pre-line">
            {session.description}
          </p>
        </Card>
      )}

      {session.material_drive_id && (
        <Card>
          <CardHeader>
            <CardTitle>Class material</CardTitle>
            <Badge variant="gray">PDF</Badge>
          </CardHeader>
          <div className="h-[520px] overflow-hidden rounded-xl">
            <iframe
              src={`/api/media/material/${session.id}`}
              title={`Material — ${session.title}`}
              className="size-full border-0"
            />
          </div>
          <p className="text-ink-muted mt-3 flex items-center gap-1.5 text-xs">
            <FileText className="size-3.5" aria-hidden />
            View only — this material is not downloadable.
          </p>
        </Card>
      )}
    </>
  );
}
