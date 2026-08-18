import { DoubtBoard } from '@/components/doubts/doubt-board';
import { PageHeader } from '@/components/ui/card';
import { getMyCourses } from '@/lib/data/courses';
import { getDoubts } from '@/lib/data/library';
import { getSessionContext } from '@/lib/session/server';

export const metadata = { title: 'Doubts & Forum' };

export default async function DoubtsPage() {
  const session = await getSessionContext();

  const [doubts, courses] = await Promise.all([
    getDoubts(),
    session ? getMyCourses(session.userId) : Promise.resolve([]),
  ]);

  // Anyone on the course may reply; only an educator's reply gets the verified
  // badge, and that decision is made in the database, not here.
  const canAnswer = Boolean(session);

  return (
    <>
      <PageHeader
        title="Doubts & forum"
        description="Ask your batch and your educator. Answers stay here for everyone."
      />
      <DoubtBoard
        doubts={doubts}
        courses={courses.map((c) => ({ id: c.id, title: c.title }))}
        canAnswer={canAnswer}
      />
    </>
  );
}
