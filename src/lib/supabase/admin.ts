import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { env, serverEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * ⚠️  SERVICE ROLE CLIENT — BYPASSES ROW LEVEL SECURITY ENTIRELY. ⚠️
 *
 * The `server-only` import above makes importing this file from a Client
 * Component a build-time error, not a production incident.
 *
 * Legitimate uses (docs Part 1 §4):
 *   - Razorpay webhook → creating enrolments
 *   - Issuing time-gated live join links
 *   - Admin actions after an explicit permission check
 *   - Cron handlers
 *
 * Never use it just to "make a query work". If RLS is blocking you, the policy
 * is wrong — fix the policy. Every call here must do its own authorisation
 * check first, because the database will no longer do it for you.
 */
export function createAdminClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv();

  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
