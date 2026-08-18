import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/field';

export const metadata = { title: 'Live Chat' };

export default function Page() {
  return (
    <>
      <PageHeader title="Live support chat" description="Conversation with Ananya Sharma · TCK-1048." />

      <Card>
        <CardHeader>
          <CardTitle>Conversation</CardTitle>
          <Badge variant="success" dot>
            Active now
          </Badge>
        </CardHeader>
        <div className="flex flex-col gap-3">
          <div className="bg-hover max-w-[85%] self-start rounded-xl px-4 py-2.5">
            <p className="text-ink-muted mb-1 text-[11.5px] font-semibold">Ananya · 14:32</p>
            <p className="text-[13.5px]">I never got the login code, I&apos;ve tried three times.</p>
          </div>
          <div className="bg-primary-ultra border-primary-border max-w-[85%] self-end rounded-xl border px-4 py-2.5">
            <p className="text-primary mb-1 text-[11.5px] font-semibold">Support · 14:34</p>
            <p className="text-[13.5px]">Checking the delivery log now — one moment.</p>
          </div>
          <div className="flex gap-2 pt-2">
            <Input placeholder="Type a reply…" className="flex-1" />
            <Button size="sm">Send</Button>
          </div>
        </div>
      </Card>
    </>
  );
}
