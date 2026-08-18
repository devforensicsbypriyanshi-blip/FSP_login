import { Radio } from 'lucide-react';
import { SessionManager } from '@/components/studio/session-manager';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { getStudioSessions } from '@/lib/data/studio';

export const metadata = { title: 'Live Studio' };

export default async function StudioLivePage() {
  const sessions = await getStudioSessions(30);

  return (
    <>
      <PageHeader
        title="Live studio"
        description="Attach recordings after a class, or cancel one with a reason students can see."
      />

      <Card>
        <CardHeader>
          <CardTitle>Your classes</CardTitle>
          <Radio className="text-primary size-[18px]" aria-hidden />
        </CardHeader>
        <SessionManager sessions={sessions} />
      </Card>
    </>
  );
}
