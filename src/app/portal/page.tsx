import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session/server';
import type { Role } from '@/components/layout/nav-config';

/**
 * Role-based landing.
 *
 * Sign-in cannot know where to send someone until their roles are read, and
 * reading roles needs a server round-trip. Rather than block the auth screen on
 * that, it always redirects here and this page decides — one extra hop, but the
 * client never has to know the role→portal mapping.
 */

export const dynamic = 'force-dynamic';

const HOME: Record<Role, string> = {
  admin: '/admin',
  developer: '/dev',
  educator: '/studio',
  support: '/support',
  student: '/app',
};

export default async function PortalLandingPage() {
  const session = await getSessionContext();
  if (!session) redirect('/sign-in');

  // A student who has never finished onboarding goes there first; staff skip it,
  // since it only asks about exam preparation.
  if (!session.onboarded && session.primaryRole === 'student') redirect('/onboarding');

  redirect(HOME[session.primaryRole]);
}
