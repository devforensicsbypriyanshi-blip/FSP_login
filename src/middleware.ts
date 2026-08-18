import { NextResponse, type NextRequest } from 'next/server';
import { isEnabled } from '@/lib/flags';
import {
  DEVICE_COOKIE,
  SESSION_CACHE_COOKIE,
  SESSION_CACHE_TTL_SECONDS,
  SIGNED_OUT_ELSEWHERE,
  type CachedSession,
} from '@/lib/session/constants';
import { signPayload, verifyPayload } from '@/lib/session/signed-cookie';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Runs on every request. Responsibilities, in order:
 *   1. Refresh the Supabase session cookie (mandatory â€” see supabase/middleware.ts)
 *   2. Attach x-request-id for log/Sentry correlation
 *   3. Guard role-scoped route prefixes
 *   4. Enforce the single-active-session device lock (docs Part 4 Â§1.4)
 *
 * On (3) and (4): this is the front door, not the lock. RLS decides what data
 * anyone can actually read. Middleware exists so a support agent who types
 * /admin gets a clean 403 rather than a dashboard full of empty panels.
 */

/** Route prefix â†’ roles permitted. Enforced again in RLS; this is just the front door. */
const PROTECTED: ReadonlyArray<{ prefix: string; roles: readonly string[] }> = [
  { prefix: '/app', roles: ['student', 'educator', 'admin', 'support', 'developer'] },
  { prefix: '/portal', roles: ['student', 'educator', 'admin', 'support', 'developer'] },
  { prefix: '/onboarding', roles: ['student', 'educator', 'admin', 'support', 'developer'] },
  { prefix: '/account', roles: ['student', 'educator', 'admin', 'support', 'developer'] },
  { prefix: '/search', roles: ['student', 'educator', 'admin', 'support', 'developer'] },
  { prefix: '/studio', roles: ['educator', 'admin'] },
  { prefix: '/admin', roles: ['admin'] },
  { prefix: '/support', roles: ['support', 'admin'] },
  { prefix: '/dev', roles: ['developer', 'admin'] },
];

function redirectToSignIn(request: NextRequest, options: { next?: string; reason?: string } = {}) {
  const url = new URL('/sign-in', request.url);
  if (options.next) url.searchParams.set('next', options.next);
  if (options.reason) url.searchParams.set('reason', options.reason);

  const response = NextResponse.redirect(url);
  response.cookies.delete(SESSION_CACHE_COOKIE);

  // Drop the Supabase auth cookies too. Without this an evicted device keeps a
  // valid JWT for up to an hour and would still look signed in anywhere the
  // guard does not cover.
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-')) response.cookies.delete(cookie.name);
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);

  response.headers.set('x-request-id', crypto.randomUUID());

  const { pathname } = request.nextUrl;

  // Demo builds skip the guard entirely so the portals stay reviewable without
  // an account. Production has this on â€” it is the whole point of the flag.
  if (!isEnabled('auth.enforce_route_guards')) return response;

  // Already signed in and asking for the sign-in screen: send them onward
  // rather than leaving them staring at a form they don't need.
  if (user && (pathname === '/sign-in' || pathname === '/register' || pathname === '/login')) {
    return NextResponse.redirect(new URL('/early-access', request.url));
  }

  const rule = PROTECTED.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) return response;

  if (!user) return redirectToSignIn(request, { next: pathname });

  const deviceId = request.cookies.get(DEVICE_COOKIE)?.value ?? '';
  const secret = process.env.SESSION_COOKIE_SECRET;

  // ---- 1. Try the cached verdict -------------------------------------------
  let state: CachedSession | null = null;

  if (secret) {
    const token = request.cookies.get(SESSION_CACHE_COOKIE)?.value;
    if (token) {
      const payload = await verifyPayload<CachedSession>(token, secret);
      // Bound to the device it was issued for, so swapping the device cookie
      // cannot carry an old verdict across.
      if (payload && payload.e > Date.now() && payload.d === deviceId) state = payload;
    }
  }

  // ---- 2. Cache miss: ask Postgres -----------------------------------------
  if (!state) {
    const [roleResult, sessionResult] = await Promise.all([
      supabase.from('user_roles').select('roles(key)').eq('user_id', user.id),
      deviceId
        ? supabase
            .from('user_sessions')
            .select('id')
            .eq('user_id', user.id)
            .eq('device_id', deviceId)
            .is('revoked_at', null)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    // A database that cannot answer must not lock everyone out. Let the request
    // through â€” RLS is still enforcing data access underneath.
    if (roleResult.error) return response;

    // No active row for a device that HAS claimed one means it was evicted by a
    // sign-in elsewhere. A browser with no device cookie at all is a different
    // case â€” cookies blocked, or the claim call failed â€” and is let through
    // rather than made permanently unusable.
    if (deviceId && !sessionResult.data) {
      return redirectToSignIn(request, { reason: SIGNED_OUT_ELSEWHERE });
    }

    const roles = (roleResult.data ?? [])
      .map((row) => (row.roles as { key: string } | null)?.key)
      .filter((key): key is string => Boolean(key));

    state = { d: deviceId, r: roles, e: Date.now() + SESSION_CACHE_TTL_SECONDS * 1000 };

    if (secret) {
      response.cookies.set(SESSION_CACHE_COOKIE, await signPayload(state, secret), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: SESSION_CACHE_TTL_SECONDS,
      });
    }
  }

  // ---- 3. Role check --------------------------------------------------------
  if (!rule.roles.some((role) => state.r.includes(role))) {
    // Rewrite, never redirect. A redirect to /403 confirms the route exists and
    // leaks the shape of the admin surface to anyone probing.
    return NextResponse.rewrite(new URL('/403', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, the service worker and the manifest.
     * Matching those would refresh the session on every image request.
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline.html|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)',
  ],
};
