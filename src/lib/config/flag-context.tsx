'use client';

import { createContext, useContext, useMemo } from 'react';
import type * as React from 'react';
import { DEFAULTS, IS_DEMO_BUILD, type FlagKey } from '@/lib/flags';

/**
 * Carries database-resolved flags to Client Components.
 *
 * The values are computed once per request on the server (rollout buckets and
 * role targeting need the user, which the browser must not be trusted for) and
 * handed down as a plain object. That keeps the resolution rules in one place
 * and means the client never queries feature_flags itself.
 */

const FlagContext = createContext<Record<string, boolean> | null>(null);

export function FlagProvider({
  flags,
  children,
}: {
  flags: Record<string, boolean>;
  children: React.ReactNode;
}) {
  // Freeze the identity so consumers don't re-render on every parent render.
  const value = useMemo(() => flags, [flags]);
  return <FlagContext.Provider value={value}>{children}</FlagContext.Provider>;
}

export function useFlags() {
  const resolved = useContext(FlagContext);

  return useMemo(() => {
    const isOn = (key: FlagKey): boolean => resolved?.[key] ?? DEFAULTS[key];

    return {
      isOn,
      /**
       * Nav visibility. In demo builds every module stays linked so the whole
       * UI can be reviewed before launch; in production only enabled modules
       * appear. Note this governs *navigation only* — RLS still decides whether
       * any of the data behind a link is readable.
       */
      isVisible: (key?: FlagKey): boolean => {
        if (!key) return true;
        if (IS_DEMO_BUILD) return true;
        return isOn(key);
      },
    };
  }, [resolved]);
}
