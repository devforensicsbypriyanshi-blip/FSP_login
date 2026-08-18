import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatusScreen } from '@/components/ui/status-screen';

export const metadata = { title: 'Not allowed' };

/**
 * Reached by rewrite from middleware, so the URL still shows the route the user
 * asked for. Deliberately vague about *why* — telling someone which role they'd
 * need is a hint worth more to an attacker than to a confused student.
 */
export default function ForbiddenPage() {
  return (
    <StatusScreen
      icon={ShieldAlert}
      code="403"
      title="You don't have access to this area"
      description="Your account isn't permitted here. If you think that's wrong, contact support and mention the page you were trying to open."
      tone="warning"
    >
      <Button asChild block>
        <Link href="/portal">Back to my dashboard</Link>
      </Button>
      <Button asChild variant="outline" block>
        <Link href="/contact">Contact support</Link>
      </Button>
    </StatusScreen>
  );
}
