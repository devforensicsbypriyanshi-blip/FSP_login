import { Compass } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatusScreen } from '@/components/ui/status-screen';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <StatusScreen
      icon={Compass}
      code="404"
      title="We can't find that page"
      description="The link may be out of date, or the page may have moved. Nothing is broken on your side."
    >
      <Button asChild block>
        <Link href="/portal">Go to my dashboard</Link>
      </Button>
      <Button asChild variant="outline" block>
        <Link href="/">Home</Link>
      </Button>
    </StatusScreen>
  );
}
