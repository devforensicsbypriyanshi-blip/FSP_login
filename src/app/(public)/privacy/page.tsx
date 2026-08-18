import type { Metadata } from 'next';
import { Callout, LegalPage, Section } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Forensic Science by Priyanshi collects, uses and protects your personal data.',
};

/**
 * Linked from the registration consent checkbox. Written to describe what the
 * platform actually does — the data listed here matches the profiles,
 * user_sessions, email_log and audit_logs tables.
 *
 * NOT legal advice. Have it reviewed against the DPDP Act before go-live.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="6 August 2026"
      intro="This policy explains what personal data we collect, why we collect it, and what control you have over it."
    >
      <Callout>
        We collect the minimum needed to run the platform. We do <strong>not</strong> ask for your phone
        number to sign up, and we never sell your data.
      </Callout>

      <Section heading="1. What we collect">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Account</strong> — your name, email address and what you are preparing for.
          </li>
          <li>
            <strong>Learning activity</strong> — courses you are enrolled in, lessons opened, live classes
            attended, test attempts and scores, doubts you post.
          </li>
          <li>
            <strong>Devices and sessions</strong> — a device label, browser type and IP address, used to
            enforce the one-device-at-a-time rule and to show you where your account is signed in.
          </li>
          <li>
            <strong>Email delivery</strong> — whether the emails we send you were delivered, opened or
            bounced, so support can help when a sign-in code does not arrive.
          </li>
          <li>
            <strong>Payments</strong> — order and transaction records. Card and UPI details are handled
            entirely by our payment partner; <strong>we never see or store your card number</strong>.
          </li>
          <li>
            <strong>Shipping</strong> — a postal address and phone number, only if you order a physical book.
          </li>
        </ul>
      </Section>

      <Section heading="2. Why we use it">
        <p>
          To give you access to what you enrolled in, run and remind you about live classes, answer your
          doubts, process payments, provide support, keep accounts secure, and understand which material is
          working so we can improve it.
        </p>
        <p>We do not use your data for advertising and we do not sell it to anyone.</p>
      </Section>

      <Section heading="3. Who else is involved">
        <p>We use a small number of service providers to run the platform:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Database, sign-in and file storage hosting</li>
          <li>Email delivery for sign-in codes and notifications</li>
          <li>Payment processing</li>
          <li>Image delivery, and Google Drive and Google Meet for lessons and live classes</li>
        </ul>
        <p>
          They process data on our behalf under their own terms. Some are located outside India, so your data
          may be processed abroad.
        </p>
      </Section>

      <Section heading="4. How long we keep it">
        <p>
          Account and learning records are kept while your account is open. Payment and invoice records are
          kept as long as tax and accounting rules require. Security and audit logs are kept for a limited
          period and are not editable, including by us.
        </p>
      </Section>

      <Section heading="5. Your rights">
        <p>Under India&rsquo;s Digital Personal Data Protection Act you may:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Ask for a copy of the personal data we hold about you</li>
          <li>Ask us to correct anything inaccurate</li>
          <li>Delete your account, and with it your personal data</li>
          <li>Withdraw consent, which ends your access to paid material</li>
        </ul>
        <p>
          Export and deletion are available from your profile settings. Deletion removes your personal data;
          some financial records must be retained by law.
        </p>
      </Section>

      <Section heading="6. Security">
        <p>
          Data is encrypted in transit. Access rules are enforced at the database level, so one student cannot
          read another&rsquo;s records. Study material is served through short-lived links rather than public
          files. Sign-in uses a one-time emailed code, so there is no password to be stolen or reused.
        </p>
        <p>No system is perfectly secure, but we will tell you promptly if a breach affects your data.</p>
      </Section>

      <Section heading="7. Children">
        <p>
          The platform is intended for students preparing for postgraduate and competitive examinations. If
          you are under 18, a parent or guardian should agree to these terms on your behalf.
        </p>
      </Section>

      <Section heading="8. Contact">
        <p>
          For any privacy question or request, write to <strong>support@forensicbypriyanshi.com</strong>.
          Support hours are 11:00–19:00 IST.
        </p>
      </Section>
    </LegalPage>
  );
}
