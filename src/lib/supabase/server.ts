import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Server client for RSC, Route Handlers and Server Actions.
 * Still uses the anon key — RLS remains in force, which is what we want for
 * anything acting on behalf of a signed-in user.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // middleware.ts refreshes the session, so this is safe to swallow.
        }
      },
    },
  });
}

/**
 * The authenticated user, or null.
 * Always uses getUser() (which revalidates against Supabase) rather than
 * getSession() (which trusts the cookie and can be spoofed).
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
