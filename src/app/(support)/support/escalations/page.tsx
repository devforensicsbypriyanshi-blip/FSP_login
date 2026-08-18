import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';

export const metadata = { title: 'Escalations' };

export default function Page() {
  return (
    <>
      <PageHeader title="Doubt escalations" description="Route technical questions to the right educator." />

      <Card>
        <CardHeader>
          <CardTitle>Doubt #842 · GSR SEM-EDX confirmation</CardTitle>
          <Badge variant="warning">Unassigned</Badge>
        </CardHeader>
        <div className="flex flex-col gap-3">
          <p className="text-ink-muted text-[13.5px]">Forensic Ballistics · asked by Ananya Sharma</p>
          <Button size="sm" className="self-start">
            Assign to Priyanshi Verma
          </Button>
        </div>
      </Card>
    </>
  );
}
