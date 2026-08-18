'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { SIGNED_OUT_ELSEWHERE } from '@/lib/session/constants';

/**
 * Keeps the open tab honest about the single-active-session rule (docs Part 4 §1).
 *
 * Renders nothing. Two behaviours:
 *   - a heartbeat every 45s, which refreshes last_seen_at (feeding the idle
 *     sweep) and asks whether this device still holds the session
 *   - an immediate re-check when the tab regains focus, which is when a student
 *     who signed in on their phone comes back to their laptop
 *
 * This is a *courtesy*, not the enforcement. Middleware checks the same thing on
 * every navigation, so blocking these requests gains nothing. Getting told
 * within a minute simply beats discovering it on the next click.
 *
 * Polling rather than Realtime: user_sessions is not in the realtime publication,
 * and for 200 students one lightweight request per device per 45s is cheaper to
 * run and far less to go wrong than a websocket that must be re-authorised on
 * every token refresh.
 */

const HEARTBEAT_MS = 45_000;

export function SessionWatcher() {
  const router = useRouter();
  const evicted = useRef(false);

  useEffect(() => {
    // In demo mode or when route guards are not enforced, do not poll or evict
    if (process.env.NEXT_PUBLIC_SHOW_HUB === 'true') return;

    let cancelled = false;

    async function check() {
      if (cancelled || evicted.current) return;
      // Nothing useful to learn while the tab is hidden, and mobile browsers
      // throttle background timers anyway.
      if (document.visibilityState !== 'visible') return;

      try {
        const response = await fetch('/api/session/heartbeat', { method: 'POST' });
        if (!response.ok) return;

        const body = (await response.json()) as { active: boolean; degraded?: boolean };
        if (body.active || body.degraded) return;

        evicted.current = true;
        router.replace(`/sign-in?reason=${SIGNED_OUT_ELSEWHERE}`);
        router.refresh();
      } catch {
        // Offline. Say nothing — a dropped connection is not an eviction, and
        // showing "you were signed out" to someone in a tunnel is just wrong.
      }
    }

    const timer = setInterval(check, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', check);
    void check();

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [router]);

  return null;
}
