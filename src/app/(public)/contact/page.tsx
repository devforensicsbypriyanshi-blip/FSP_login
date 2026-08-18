import { Clock, Mail } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Section } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Contact & Support',
  description: 'How to reach Forensic Science by Priyanshi.',
};

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact & Support"
      updated="6 August 2026"
      intro="Reach us for anything about your account, a class or a payment."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border-line-medium bg-surface flex flex-col gap-1.5 rounded-xl border p-4">
          <span className="text-primary flex items-center gap-2 text-[12.5px] font-semibold">
            <Mail className="size-4" aria-hidden /> Email
          </span>
          <a
            href="mailto:support@forensicbypriyanshi.com"
            className="text-ink font-semibold break-all hover:underline"
          >
            support@forensicbypriyanshi.com
          </a>
        </div>

        <div className="border-line-medium bg-surface flex flex-col gap-1.5 rounded-xl border p-4">
          <span className="text-primary flex items-center gap-2 text-[12.5px] font-semibold">
            <Clock className="size-4" aria-hidden /> Support hours
          </span>
          <span className="text-ink font-semibold">11:00 – 19:00 IST</span>
          <span className="text-ink-muted text-[12.5px]">Monday to Saturday</span>
        </div>
      </div>

      <Section heading="Before you write in">
        <p>Two things solve most queries faster than an email:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>No sign-in code?</strong> Check your spam folder first, then request a new code. Codes
            expire after 10 minutes.
          </li>
          <li>
            <strong>Signed out unexpectedly?</strong> Your account allows one device at a time — signing in
            elsewhere ends the earlier session.
          </li>
        </ul>
      </Section>

      <Section heading="Payments and access">
        <p>
          Quote the payment reference from your receipt so we can trace the transaction quickly. Our{' '}
          <Link href="/refund-policy" className="text-primary font-semibold hover:underline">
            refund policy
          </Link>{' '}
          explains what we can and cannot do after a purchase.
        </p>
      </Section>
    </LegalPage>
  );
}
