import { redirect } from 'next/navigation';
import type * as React from 'react';
import { resolveAllFlags } from '@/lib/config/server';
import { IS_DEMO_BUILD } from '@/lib/flags';
import { getSessionContext, getUnreadCount } from '@/lib/session/server';
import { AppShell } from './app-shell';
import type { Role } from './nav-config';

/**
 * Server half of every portal layout: resolves who is signed in, what flags
 * apply to them, and how many notifications are waiting — then hands all three
 * to the client shell.
 *
 * All five portals share this so the answer to "who am I?" is computed once,
 * the same way, everywhere.
 */

/**
 * Pre-launch, the portals are browsable without an account so the client can
 * review the whole UI. In a production build (NEXT_PUBLIC_SHOW_HUB=false) there
 * is no such fallback and an anonymous visitor is sent to sign in.
 *
 * This is a *convenience*, not a hole: RLS still returns nothing to an
 * anonymous request, so a demo visitor sees the chrome and empty states, never
 * another student's data.
 */
const DEMO_USERS: Record<Role, { name: string; email: string }> = {
  student: { name: 'Demo Student', email: 'student@example.com' },
  educator: { name: 'Priyanshi Verma', email: 'priyanshi.verma@forensicbypriyanshi.com' },
  admin: { name: 'Platform Admin', email: 'admin@forensicbypriyanshi.com' },
  support: { name: 'Support Lead', email: 'support@forensicbypriyanshi.com' },
  developer: { name: 'Lead Developer', email: 'developer@forensicbypriyanshi.com' },
};

export async function PortalLayout({ role, children }: { role: Role; children: React.ReactNode }) {
  const session = await getSessionContext();

  if (!session) {
    if (!IS_DEMO_BUILD) redirect('/sign-in');

    const flags = await resolveAllFlags();
    return (
      <AppShell role={role} user={DEMO_USERS[role]} unreadCount={0} flags={flags}>
        {children}
      </AppShell>
    );
  }

  const [unreadCount, flags] = await Promise.all([
    getUnreadCount(session.userId),
    resolveAllFlags({ userId: session.userId, roles: session.roles }),
  ]);

  return (
    <AppShell
      role={role}
      user={{ name: session.fullName, email: session.email }}
      unreadCount={unreadCount}
      flags={flags}
    >
      {children}
    </AppShell>
  );
}
