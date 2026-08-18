import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { DEVICE_COOKIE, SESSION_CACHE_COOKIE } from '@/lib/session/constants';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';

/**
 * Sign out.
 *
 * Order matters: revoke the session row first, then drop the Supabase session.
 * Do it the other way round and auth.uid() is already null inside end_session(),
 * so the row survives and the account stays "in use" on a device nobody is
 * holding — which then blocks the next real sign-in for no reason.
 */
export async function POST() {
  const store = await cookies();
  const deviceId = store.get(DEVICE_COOKIE)?.value;

  const supabase = await createClient();

  if (deviceId) {
    const { error } = await callPendingRpc(supabase, 'end_session', { p_device_id: deviceId });
    if (error) console.error('end_session failed', { message: error.message });
  }

  await supabase.auth.signOut();

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_CACHE_COOKIE);
  // The device id itself is kept: it is not a credential, and reusing it means
  // signing back in on this browser reclaims the same row instead of growing
  // the device list by one every time.
  return response;
}
