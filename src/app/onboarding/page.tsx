import { redirect } from 'next/navigation';
import { OnboardingFlow } from '@/components/account/onboarding-flow';
import { getSessionContext } from '@/lib/session/server';

export const metadata = { title: 'Welcome' };

/**
 * Runs once, straight after registration. Deliberately outside the app shell:
 * a sidebar full of links to places they have no content in yet is a distraction
 * from the three questions this page asks.
 */
export default async function OnboardingPage() {
  const session = await getSessionContext();
  if (!session) redirect('/sign-in');

  // Already done. Sending them back through it would be a small insult.
  if (session.onboarded) redirect('/portal');

  return <OnboardingFlow initialName={session.fullName} initialTarget={session.examTarget} />;
}
