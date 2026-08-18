'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { AuthCard } from './auth-card';

/**
 * Sign-out is a confirmation, not a link that fires on hover-prefetch.
 *
 * It also cannot be a GET: a prefetch or an <img> on some other site would then
 * be able to sign a student out. The actual work happens in POST
 * /api/session/end, which revokes the session row before dropping the token.
 */
export function SignOutFlow() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);

    try {
      await fetch('/api/session/end', { method: 'POST' });
    } catch {
      // Offline, or the request was blocked. Clearing the local session below
      // still gets them out of the app on this device, which is what they asked
      // for; the server row is reaped by the idle sweep.
    }

    // Clears the tokens the browser client holds in storage. The route handler
    // already cleared the cookies; this handles the in-memory copy.
    await createClient().auth.signOut();

    router.replace('/sign-in');
    router.refresh();
  }

  return (
    <AuthCard icon={LogOut} title="Sign out?" description="You'll need a new email code to get back in.">
      <div className="flex flex-col gap-3">
        <Button size="lg" block loading={pending} onClick={signOut}>
          Yes, sign me out
        </Button>
        <Button size="lg" block variant="outline" asChild>
          <Link href="/portal">Stay signed in</Link>
        </Button>
      </div>
    </AuthCard>
  );
}
