import type { Metadata } from 'next';
import { SignOutFlow } from '@/components/auth/sign-out-flow';

export const metadata: Metadata = { title: 'Sign out' };

export default function SignOutPage() {
  return <SignOutFlow />;
}
