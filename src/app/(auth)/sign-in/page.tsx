import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignInFlow } from '@/components/auth/sign-in-flow';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Forensic Science by Priyanshi with a one-time code sent to your email.',
};

/**
 * The Suspense boundary is required, not decorative: SignInFlow reads
 * useSearchParams() for `next` and `reason`, and Next refuses to build a page
 * that does so without one.
 */
export default function SignInPage() {
  return (
    <Suspense fallback={<div className="border-line-medium bg-surface h-[420px] rounded-3xl border" />}>
      <SignInFlow />
    </Suspense>
  );
}
