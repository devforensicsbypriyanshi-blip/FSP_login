import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE, SESSION_CACHE_COOKIE } from '@/lib/session/constants';
import { clientIp } from '@/lib/session/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Claims this device as the account's single active session (docs Part 4 §1).
 *
 * Called immediately after a successful OTP verification. Everything that
 * matters happens inside claim_session(): evicting other devices, writing the
 * audit row and notifying the user are one transaction, so a crash midway
 * cannot leave two live sessions.
 *
 * The device id arrives in the body but leaves in an httpOnly cookie. That is
 * the point — middleware needs to read it on every request, and a value the
 * page can rewrite is not a lock.
 */

const bodySchema = z.object({
  deviceId: z.string().uuid(),
  label: z.string().max(80).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const { deviceId, label } = parsed.data;

  const { data, error } = await supabase.rpc('claim_session', {
    p_device_id: deviceId,
    p_label: label,
    // The generated types model these as optional, so undefined (omit the
    // argument, let the SQL default apply) rather than null.
    p_user_agent: request.headers.get('user-agent') ?? undefined,
    p_ip: clientIp(request.headers) ?? undefined,
  });

  if (error) {
    // Never surface the raw Postgres message: it leaks schema detail.
    console.error('claim_session failed', { userId: user.id, message: error.message });
    return NextResponse.json({ error: 'CLAIM_FAILED' }, { status: 500 });
  }

  const evicted = Array.isArray(data) ? (data[0]?.evicted_count ?? 0) : 0;

  const response = NextResponse.json({ ok: true, evicted });

  response.cookies.set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });

  // Drop any cached verdict from a previous account on this browser, so the
  // very next request re-reads roles rather than trusting the old ones.
  response.cookies.delete(SESSION_CACHE_COOKIE);

  return response;
}
