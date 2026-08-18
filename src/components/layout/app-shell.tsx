'use client';

import { useEffect, useState } from 'react';
import type * as React from 'react';
import { SessionWatcher } from '@/components/session/session-watcher';
import { ToastProvider } from '@/components/ui/toast';
import { FlagProvider } from '@/lib/config/flag-context';
import { AppHeader } from './app-header';
import { BottomNav } from './bottom-nav';
import { MobileDrawer, Sidebar } from './sidebar-nav';
import { PORTALS, type Role } from './nav-config';

/**
 * Responsive app shell shared by all five portals.
 *
 *   < lg : header + bottom tab bar + slide-in drawer
 *   ≥ lg : header + persistent 250px sidebar (the reference design)
 *
 * pb-20 on <main> keeps content clear of the fixed bottom bar; lg:pb-0 drops it
 * once the bar is gone.
 *
 * Takes a `role` string rather than the resolved PortalConfig: the config holds
 * Lucide icon components, which are forwardRef objects and therefore cannot be
 * serialised across the Server→Client boundary. Resolving it here keeps the
 * icons entirely on the client.
 */
export function AppShell({
  role,
  user,
  unreadCount,
  flags,
  children,
}: {
  role: Role;
  user: { name: string; email: string };
  unreadCount?: number;
  /** Database-resolved feature flags, computed server-side once per request. */
  flags: Record<string, boolean>;
  children: React.ReactNode;
}) {
  const portal = PORTALS[role];
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Lock body scroll while the drawer is open, or the page scrolls behind it.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  return (
    <FlagProvider flags={flags}>
      <ToastProvider>
        <div className="bg-surface flex min-h-dvh">
          <SessionWatcher />
          <Sidebar portal={portal} />
          <MobileDrawer portal={portal} open={drawerOpen} onClose={() => setDrawerOpen(false)} />

          <div className="flex min-w-0 flex-1 flex-col">
            <AppHeader
              portal={portal}
              user={user}
              unreadCount={unreadCount}
              onMenu={() => setDrawerOpen(true)}
            />

            <main className="flex-1 pb-20 lg:pb-0">
              <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-4 md:gap-5 md:px-6 md:py-4">
                {children}
              </div>
            </main>

            <BottomNav portal={portal} onMore={() => setDrawerOpen(true)} />
          </div>
        </div>
      </ToastProvider>
    </FlagProvider>
  );
}
