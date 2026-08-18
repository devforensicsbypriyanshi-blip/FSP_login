import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { openResource } from '@/lib/data/library';
import { clientIp, getDeviceId } from '@/lib/session/server';

/**
 * Issues the external URL for a link resource, and records the open.
 *
 * `resources.external_url` is REVOKEd at column level, so the link never
 * reaches a page, an RSC payload or a client bundle — this endpoint is the only
 * way to obtain it. log_resource_view() re-checks that the resource is
 * published and that the caller is enrolled (or it is free), writes the log
 * line, and only then returns the URL. There is no path that returns a URL
 * without logging it.
 *
 * POST, not GET: it has a side effect, and a GET would be prefetched — filling
 * the reading log with opens that never happened.
 */

const MESSAGES: Record<string, { status: number; message: string }> = {
  NOT_ENROLLED: { status: 403, message: 'You are not enrolled in this course.' },
  NOT_PUBLISHED: { status: 403, message: 'This material has not been published yet.' },
  NOT_FOUND: { status: 404, message: 'That material could not be found.' },
  NO_LINK: { status: 409, message: 'This material is not an external link.' },
  ERROR: { status: 500, message: 'We could not open that. Please try again.' },
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headerList = await headers();

  const result = await openResource(id, {
    deviceId: await getDeviceId(),
    ip: clientIp(headerList),
  });

  if (!result.ok) {
    const { status, message } = MESSAGES[result.reason] ?? MESSAGES.ERROR!;
    return NextResponse.json({ error: result.reason, message }, { status });
  }

  return NextResponse.json({ url: result.url });
}
