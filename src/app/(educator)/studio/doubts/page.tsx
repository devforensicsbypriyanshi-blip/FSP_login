import { MessageCircleQuestion } from 'lucide-react';
import { DoubtsDesk } from '@/components/studio/doubts-desk';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { getDoubts } from '@/lib/data/library';

export const metadata = { title: 'Doubts Desk' };

/**
 * RLS decides what an educator sees here: `doubts: readable to course members`
 * includes `courses.created_by = auth.uid()`, so this is their own courses'
 * questions without a filter in this file. An admin sees every course, which is
 * what a hardcoded owner filter would have silently broken.
 */
export default async function StudioDoubtsPage() {
  const doubts = await getDoubts(60);
  const waiting = doubts.filter((doubt) => doubt.status === 'open').length;

  return (
    <>
      <PageHeader
        title="Doubts desk"
        description="Answer student questions with a verified reply. Your answers carry the educator badge."
      />

      <Card>
        <CardHeader>
          <CardTitle>Question queue</CardTitle>
          {waiting > 0 ? (
            <Badge variant="warning">{waiting} awaiting answer</Badge>
          ) : (
            <MessageCircleQuestion className="text-primary size-[18px]" aria-hidden />
          )}
        </CardHeader>
        <DoubtsDesk doubts={doubts} />
      </Card>
    </>
  );
}
