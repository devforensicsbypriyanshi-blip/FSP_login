import type { Metadata } from 'next';
import { RegisterFlow } from '@/components/auth/register-flow';

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Join Forensic Science by Priyanshi — UGC NET & Forensic Science exam preparation.',
};

export default function RegisterPage() {
  return <RegisterFlow />;
}
