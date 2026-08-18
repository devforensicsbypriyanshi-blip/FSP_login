import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, LegalPage, Section } from '@/components/legal/legal-page';
import { getSetting } from '@/lib/config/server';

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy',
  description: 'Refund and cancellation policy for Forensic Science by Priyanshi.',
};

const DEFAULT_STANCE =
  'Course fees are non-refundable once payment is complete, because access to course material is granted to you immediately.';

/**
 * Required by Razorpay before a merchant account is approved. A no-refund
 * stance is permitted, but it must be published and reachable without signing
 * in — which is why this lives outside the protected route prefixes.
 *
 * The headline stance is bound to app_settings `payments.refund_policy_text`, so
 * the owner can change it from the admin console. The numbered clauses stay in
 * code deliberately: this is a legal document a payment processor reviews, and
 * making the whole body a settings string would mean either storing HTML — an
 * injection route into a public page — or losing the structure that makes it
 * reviewable.
 */
export default async function RefundPolicyPage() {
  // Plain text, rendered as a React child, so it is escaped and cannot carry
  // markup into this page.
  const stance = await getSetting<string>('payments.refund_policy_text', DEFAULT_STANCE);

  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      updated="6 August 2026"
      intro="This policy explains what happens after you pay for a course, subscription or study material on Forensic Science by Priyanshi."
    >
      <Callout tone="warning">
        <strong>All sales are final.</strong> {stance}
      </Callout>

      <Section heading="1. No refunds">
        <p>
          We do not offer refunds, whole or partial, once a payment has been completed and access has been
          granted. This applies to live batches, recorded courses, notes, practice papers, test series and
          one-to-one mentorship sessions.
        </p>
        <p>
          Digital course material is delivered instantly and cannot be returned, which is why fees are
          non-refundable. Please review the course description, syllabus and any free preview lessons before
          purchasing.
        </p>
      </Section>

      <Section heading="2. Cancellation">
        <p>
          You may stop using the platform at any time, and you may delete your account from your profile
          settings. Cancelling or deleting your account does not entitle you to a refund of fees already paid,
          and it ends your access to purchased material.
        </p>
      </Section>

      <Section heading="3. Where we will put things right">
        <p>
          The policy above concerns change of mind. It does not apply when we have failed to deliver what you
          paid for. Contact support and we will resolve the following:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Duplicate payment</strong> — you were charged more than once for the same purchase.
          </li>
          <li>
            <strong>Payment taken but no access</strong> — the money left your account and the course was not
            unlocked.
          </li>
          <li>
            <strong>Course cancelled by us</strong> — we cancel a batch before it begins and cannot offer a
            replacement.
          </li>
        </ul>
        <p>
          In these cases we will restore your access or return the amount, whichever is appropriate. Write to
          us within 7 days of the charge so we can trace the transaction.
        </p>
      </Section>

      <Section heading="4. Rescheduled or cancelled classes">
        <p>
          Live classes may occasionally be rescheduled. A rescheduled class is not a cancelled service — you
          will be notified in advance and a recording is made available where possible. Rescheduling does not
          create a right to a refund.
        </p>
      </Section>

      <Section heading="5. How to raise a request">
        <p>
          Email <strong>support@forensicbypriyanshi.com</strong> from the address registered to your account,
          quoting the payment reference from your receipt. Support is available 11:00–19:00 IST.
        </p>
        <p>
          Where a return of funds is approved, it is processed to the original payment method through our
          payment partner and typically takes 5–7 working days to appear, depending on your bank.
        </p>
      </Section>

      <Section heading="6. Contact">
        <p>
          Questions about this policy? Reach us at <strong>support@forensicbypriyanshi.com</strong> or through
          the{' '}
          <Link href="/contact" className="text-primary font-semibold hover:underline">
            contact page
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
