import { EmailLookup } from '@/components/support/email-lookup';
import { PageHeader } from '@/components/ui/card';

export const metadata = { title: 'Account & Email Helper' };

export default function SupportAccountsPage() {
  return (
    <>
      <PageHeader
        title="Account & email helper"
        description="Trace a sign-in code, diagnose a delivery problem, and unblock a student."
      />
      <EmailLookup />
    </>
  );
}
