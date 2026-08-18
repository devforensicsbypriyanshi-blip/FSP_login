import { NextResponse, type NextRequest } from 'next/server';
import { driveEmbedUrl } from '@/lib/drive';
import { createClient } from '@/lib/supabase/server';

/**
 * The single door to every piece of course media.
 *
 * Before this existed, `driveEmbedUrl(lesson.driveFileId)` was rendered into
 * the page, so the Drive file id sat in the HTML of every lesson. A student
 * could read it out of view-source and share
 * `drive.google.com/file/d/<id>/view` with anyone — permanently, and with no
 * way for us to see it happening.
 *
 * Now the iframe points here. The route re-checks access on every single view
 * and only then redirects to Drive.
 *
 * WHAT THIS DOES AND DOES NOT ACHIEVE — worth being precise, because the
 * difference decides how much to rely on it:
 *
 *   Does:      keeps file ids out of page source, out of RSC payloads and out
 *              of anything copied from the DOM. Requires a live, enrolled
 *              session per view. Gives one server-side log line per open, so
 *              unusual access is visible.
 *   Does not:  make the Drive URL unobtainable. The browser must ultimately
 *              fetch it, so it appears in the network tab. Someone determined
 *              with devtools can still find it.
 *
 * That is the same deter-and-trace posture as the watermark, and the same one
 * docs Part 1 §6 sets out: no web platform can prevent a screen recording
 * either. This raises the effort from "view source" to "understand devtools",
 * which is the honest size of the win.
 *
 * Access is decided by RLS, not by this file. Each lookup runs as the calling
 * user, so an unenrolled student's query returns no row and they get a 404 —
 * the same response as for a lesson that does not exist, so probing ids reveals
 * nothing.
 */

export const dynamic = 'force-dynamic';

type MediaKind = 'lesson' | 'recording' | 'material' | 'resource';

const KINDS: MediaKind[] = ['lesson', 'recording', 'material', 'resource'];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const { kind, id } = await params;

  if (!KINDS.includes(kind as MediaKind)) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }

  let fileId: string | null = null;

  if (kind === 'lesson') {
    // `lessons: read when preview, enrolled, owner or staff` does the work.
    const { data } = await supabase
      .from('lessons')
      .select('drive_file_id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    fileId = data?.drive_file_id ?? null;
  } else if (kind === 'recording' || kind === 'material') {
    // Explicit columns: live_sessions has join_url REVOKEd, so a star-select
    // fails outright for students.
    const { data } = await supabase
      .from('live_sessions')
      .select('recording_drive_id, material_drive_id')
      .eq('id', id)
      .maybeSingle();
    fileId = (kind === 'recording' ? data?.recording_drive_id : data?.material_drive_id) ?? null;
  } else {
    const { data } = await supabase.from('resources').select('drive_file_id').eq('id', id).maybeSingle();
    fileId = data?.drive_file_id ?? null;
  }

  if (!fileId) {
    // Covers "no such row", "RLS hid it" and "row exists but has no file".
    // One response for all three: distinguishing them would confirm to someone
    // probing that a particular paid lesson exists.
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // One line per view. This is what makes unusual access visible at all —
  // without it, sharing is undetectable rather than merely hard.
  //
  // console.info, not warn: on Vercel this is the audit trail, and filing a
  // normal page view under "warning" makes the warning level useless for the
  // things that are actually wrong.
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      level: 'info',
      event: 'media.view',
      kind,
      id,
      userId: user.id,
    })
  );

  const response = NextResponse.redirect(driveEmbedUrl(fileId), 307);

  // Never let a CDN or the browser keep this redirect: the answer depends on
  // who is asking, and a cached 307 would serve one student's authorisation to
  // the next one.
  response.headers.set('cache-control', 'private, no-store, max-age=0');
  return response;
}
