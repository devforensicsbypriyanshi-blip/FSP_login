import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, LegalPage, Section } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of service for Forensic Science by Priyanshi.',
};

/**
 * Linked from the registration consent checkbox, so it must exist before
 * anyone can sign up. Also required for Razorpay merchant approval.
 *
 * NOT legal advice — this is a working draft written to describe how the
 * platform actually behaves. Have it reviewed before go-live.
 */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="6 August 2026"
      intro="These terms govern your use of Forensic Science by Priyanshi. By creating an account you agree to them."
    >
      <Section heading="1. Your account">
        <p>
          You sign in with a one-time code sent to your email address. There is no password. Keep access to
          that inbox secure — anyone who can read your email can sign in as you.
        </p>
        <p>You must provide accurate details and be responsible for activity on your account.</p>
      </Section>

      <Section heading="2. One device at a time">
        <p>
          Your account may be signed in on <strong>one device at a time</strong>. Signing in somewhere new
          automatically signs you out everywhere else. This is deliberate: it keeps paid material with the
          person who paid for it.
        </p>
        <p>
          Accounts showing repeated switching between many devices may be temporarily suspended while we check
          with you.
        </p>
      </Section>

      <Callout tone="warning">
        <strong>Do not share your account or our material.</strong> Sharing login access, redistributing
        notes, or recording and reposting classes are grounds for immediate suspension without refund.
      </Callout>

      <Section heading="3. Course material and intellectual property">
        <p>
          All lectures, notes, practice papers, test series and recordings remain our property. You get a
          personal, non-transferable licence to use them for your own preparation while your access lasts.
        </p>
        <p>
          You may not download, copy, resell, republish or share the material, or use it to teach others
          commercially. Documents you open are watermarked with your name and email so that leaked copies can
          be traced to an account.
        </p>
      </Section>

      <Section heading="4. Live classes">
        <p>
          Live classes run to a published schedule, which may change. We will notify you of any reschedule or
          cancellation. Joining links open shortly before a class begins and are tied to your enrolment — they
          are not to be forwarded.
        </p>
        <p>Recordings are made available where possible but are not guaranteed for every session.</p>
      </Section>

      <Section heading="5. Payments">
        <p>
          Fees are shown in Indian Rupees and are charged through our payment partner. Access is granted once
          payment is confirmed. Course prices and access durations are set per course and shown before you
          pay.
        </p>
        <p>
          Fees are non-refundable — see our{' '}
          <Link href="/refund-policy" className="text-primary font-semibold hover:underline">
            Refund &amp; Cancellation Policy
          </Link>
          .
        </p>
      </Section>

      <Section heading="6. Acceptable use">
        <p>
          Be civil in doubts, chats and comments. We may remove content and suspend accounts for harassment,
          spam, impersonation, cheating in tests, or attempts to break or probe the platform.
        </p>
      </Section>

      <Section heading="7. Availability">
        <p>
          We work to keep the platform available but cannot guarantee uninterrupted service. Maintenance,
          third-party outages and connectivity problems can interrupt access. No educational outcome, exam
          result or rank is guaranteed.
        </p>
      </Section>

      <Section heading="8. Suspension and termination">
        <p>
          We may suspend or close an account that breaches these terms — in particular account sharing or
          redistribution of material. Where a breach is established, fees are not refunded.
        </p>
        <p>You may close your account at any time from your profile settings.</p>
      </Section>

      <Section heading="9. Changes">
        <p>
          We may update these terms. Material changes will be notified in the app or by email. Continuing to
          use the platform after a change means you accept the updated terms.
        </p>
      </Section>

      <Section heading="10. Contact">
        <p>
          Forensic Science by Priyanshi — <strong>support@forensicbypriyanshi.com</strong>. Support hours are
          11:00–19:00 IST. These terms are governed by the laws of India.
        </p>
      </Section>
    </LegalPage>
  );
}
