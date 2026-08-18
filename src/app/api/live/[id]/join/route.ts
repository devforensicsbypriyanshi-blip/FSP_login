import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getJoinUrl } from '@/lib/data/live';
import { clientIp, getDeviceId } from '@/lib/session/server';

/**
 * Issues the Google Meet link for a live class.
 *
 * The URL is never sent to the browser with the session list — join_url is
 * REVOKEd at column level, and this endpoint is the only way to obtain it. All
 * the checks (active enrolment, the T-15m → T+30m window, recording attendance)
 * happen inside join_live_session(), so this handler stays a thin translation
 * from Postgres error codes to something a student can read.
 *
 * The device id, IP and user agent read here are the attendance evidence. They
 * are taken from the request server-side, never from the body: a client that
 * could name its own device id could make one shared account look like one
 * diligent student, which is exactly what this is meant to detect.
 *
 * POST, not GET: it has a side effect — it writes the attendance row — and a
 * GET would be prefetchable, marking students present for classes they never
 * opened.
 */

const GENERIC = { status: 500, message: 'We could not open the class. Please try again.' };

const MESSAGES: Record<string, { status: number; message: string }> = {
  TOO_EARLY: {
    status: 425,
    message: 'This class has not opened yet. The room unlocks 15 minutes before it starts.',
  },
  SESSION_ENDED: {
    status: 410,
    message: 'This class has finished. The recording will appear here once it is uploaded.',
  },
  NOT_ENROLLED: { status: 403, message: 'You are not enrolled in this course.' },
  NOT_FOUND: { status: 404, message: 'That class could not be found.' },
  ERROR: GENERIC,
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headerList = await headers();

  const result = await getJoinUrl(id, {
    deviceId: await getDeviceId(),
    ip: clientIp(headerList),
    userAgent: headerList.get('user-agent')?.slice(0, 400) ?? null,
  });

  if (!result.ok) {
    const { status, message } = MESSAGES[result.reason] ?? GENERIC;
    return NextResponse.json({ error: result.reason, message }, { status });
  }

  return NextResponse.json({ url: result.url });
}
