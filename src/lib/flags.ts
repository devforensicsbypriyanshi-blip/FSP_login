/**
 * Compiled flag defaults — the floor the platform falls back to.
 *
 * The live engine is `lib/config/server.ts`, which reads `feature_flags` from
 * Postgres and is edited from /dev/config. This file is what it uses when the
 * database has no row for a key, or is unreachable. Keeping a compiled default
 * for every flag means a config outage degrades to "launch scope" rather than
 * to a blank site.
 *
 * `isEnabled()` here stays synchronous on purpose: middleware runs on the edge
 * and must not wait on a database round-trip to decide whether to let a request
 * through. Feature *modules* are resolved through the async engine; the two
 * flags below are build-time posture, not runtime product decisions.
 */

/**
 * Demo mode. **Opt-in, and off by default** (changed 2026-08-13).
 *
 * It used to be opt-OUT — demo unless NEXT_PUBLIC_SHOW_HUB=false — which made
 * sense while the portals were unauthenticated mockups being reviewed. It is
 * the wrong default now that the app holds real student data: forgetting one
 * env var on one deployment would have shipped every portal wide open.
 *
 * Secure by default means a missing or misspelled variable fails *closed*. To
 * browse without an account locally, set NEXT_PUBLIC_SHOW_HUB=true explicitly
 * and know exactly what you have turned off.
 */
export const IS_DEMO_BUILD = process.env.NEXT_PUBLIC_SHOW_HUB === 'true';

const DEMO = IS_DEMO_BUILD;

export const DEFAULTS = {
  /** `/` renders the portal hub. Off by default — sign-in is the first page. */
  'ui.public_hub': DEMO,

  /**
   * Enforce role-based route guards in middleware.
   *
   * On unless demo mode is explicitly requested. This is the front door: with
   * it on, an anonymous request to any portal is redirected to /sign-in and a
   * role mismatch gets a 403.
   *
   * Even with it off, RLS still governs all real data — this flag affects
   * navigation, never data access. But navigation is what stops a stranger
   * reading a student's name off a dashboard, so it matters.
   */
  'auth.enforce_route_guards': !DEMO,

  /* ---------------------------------------------------------------------
   * LAUNCH SCOPE (decided 2026-08-05)
   *
   * v1 goes live with three modules only: Courses, Live Classes, Calendar.
   * Everything else is built and navigable in demo mode, but ships OFF and
   * gets switched on one at a time from /dev/config once it is ready.
   *
   * This is why the flag engine had to exist before the features: turning a
   * module on becomes a toggle, not a release.
   * ------------------------------------------------------------------- */

  // --- Live at launch ---
  'module.courses': true,
  'module.live_classes': true,
  'module.calendar': true,

  // --- Built, but off until each is finished and verified ---
  'module.notes': false,
  'module.quizzes': false,
  'module.doubts': false,
  'module.store': false,
  'module.mentorship': false,
  'module.payments': false,
  'module.analytics': false,
  'module.support_desk': false,
} as const;

export type FlagKey = keyof typeof DEFAULTS;

export function isEnabled(key: FlagKey): boolean {
  return DEFAULTS[key];
}

/**
 * In demo mode every module stays visible so the full UI can be reviewed;
 * in production only launch-scope modules appear. Nav uses this rather than
 * isEnabled() directly, so an unfinished feature is never linked to but is
 * still reachable for internal review.
 */
export function isModuleVisible(key?: FlagKey): boolean {
  if (!key) return true;
  return DEMO ? true : isEnabled(key);
}
