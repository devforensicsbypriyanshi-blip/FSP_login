import { Library } from 'lucide-react';
import { NoteManager } from '@/components/studio/note-manager';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { getAuthoredResources } from '@/lib/data/library';
import { getAuthorCourses } from '@/lib/data/studio';

export const metadata = { title: 'Study Material' };

export default async function StudioNotesPage() {
  const [resources, courses] = await Promise.all([getAuthoredResources(), getAuthorCourses()]);

  return (
    <>
      <PageHeader
        title="Study material"
        description="Paste a chapter out of a PDF, attach one you already have, or link to a slide deck."
      />

      <Card>
        <CardHeader>
          <CardTitle>Library</CardTitle>
          <Library className="text-primary size-[18px]" aria-hidden />
        </CardHeader>
        <NoteManager resources={resources} courses={courses} />
      </Card>

      <p className="text-ink-muted mx-auto max-w-xl text-center text-xs leading-relaxed">
        Every reading is watermarked with the student&apos;s name and email, and every open is logged. That
        traces a leak back to one account — it cannot stop a screenshot, and no web platform can.
      </p>
    </>
  );
}
