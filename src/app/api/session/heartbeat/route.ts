import { NextResponse } from 'next/server';
import { DEVICE_COOKIE } from '@/lib/session/constants';
import { callPendingRpc } from '@/lib/supabase/rpc';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

/**
 * Liveness ping from the open tab.
 *
 * Two jobs, both needed:
 *   - refreshes last_seen_at, which is what the idle sweep reads
 *   - answers "am I still the active device?" so a browser that was evicted
 *     finds out in seconds instead of at its next navigation
 *
 * Middleware remains the enforcement point. A student could block this request
 * and keep the tab open; they would still be stopped on the next page load.
 */
export async function POST() {
  if (process.env.NEXT_PUBLIC_SHOW_HUB === 'true') {
    return NextResponse.json({ active: true }, { status: 200 });
  }

  const store = await cookies();
  const deviceId = store.get(DEVICE_COOKIE)?.value;

  if (!deviceId) {
    return NextResponse.json({ active: false, reason: 'NO_DEVICE' }, { status: 200 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ active: false, reason: 'NOT_AUTHENTICATED' }, { status: 200 });
  }

  const { data, error } = await callPendingRpc(supabase, 'touch_session', { p_device_id: deviceId });

  if (error) {
    // A failed heartbeat must not sign anyone out — the network is not the
    // authority here. Report active and let middleware decide on the next hop.
    console.error('touch_session failed', { message: error.message });
    return NextResponse.json({ active: true, degraded: true }, { status: 200 });
  }

  return NextResponse.json({ active: data === true });
}
