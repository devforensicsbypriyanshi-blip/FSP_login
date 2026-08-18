import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Never cached — an uptime probe must reflect the current instant.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/health
 *
 * Target for Better Stack / UptimeRobot (docs Part 3 §5.3) and the
 * post-deploy smoke test in CI. Returns 503 on any dependency failure so the
 * monitor alerts instead of seeing a cheerful 200 with a broken database.
 */
export async function GET() {
  const startedAt = Date.now();
  const checks: Record<string, { ok: boolean; ms: number; error?: string }> = {};

  // --- Database ---------------------------------------------------------
  const dbStart = Date.now();
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.getSession();
    if (error) throw error;
    checks.database = { ok: true, ms: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      ok: false,
      ms: Date.now() - dbStart,
      error: error instanceof Error ? error.message : 'unknown',
    };
  }

  const healthy = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      environment: process.env.VERCEL_ENV ?? 'development',
      totalMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'cache-control': 'no-store, max-age=0' },
    }
  );
}
