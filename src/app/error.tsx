'use client';

import { ErrorScreen } from '@/components/ui/error-screen';

/**
 * Catches anything the portal-level boundaries don't — public pages, /portal,
 * /onboarding. Those are reachable while signed out, so this one sends people
 * home rather than to a dashboard they may not have.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} homeHref="/" />;
}
