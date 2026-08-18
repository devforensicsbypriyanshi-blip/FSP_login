import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Refreshes the Supabase session cookie on every request.
 *
 * This must run in middleware: Server Components cannot write cookies, so
 * without it an expired access token is never refreshed and the user is
 * silently signed out mid-visit.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Do not remove: this call is what actually performs the refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user, supabase };
}
