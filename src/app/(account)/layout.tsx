import type * as React from 'react';
import { PortalLayout } from '@/components/layout/portal-layout';
import { getSessionContext } from '@/lib/session/server';

/**
 * Account and search live outside the five portals, because they are the same
 * for everyone — a person has one profile, not one per role they hold.
 *
 * The shell still adapts: whichever portal the user belongs to is what wraps
 * these pages, so an admin sees the admin sidebar around their profile and a
 * student sees theirs. Signed-out demo visitors get the student shell.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  return <PortalLayout role={session?.primaryRole ?? 'student'}>{children}</PortalLayout>;
}
