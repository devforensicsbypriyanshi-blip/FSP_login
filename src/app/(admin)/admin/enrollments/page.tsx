import { EnrolmentManager } from '@/components/admin/enrolment-manager';
import { PageHeader } from '@/components/ui/card';
import { getCourseOptions, getEnrolments } from '@/lib/data/admin';

export const metadata = { title: 'Enrolments' };

export default async function AdminEnrolmentsPage() {
  const [enrolments, courses] = await Promise.all([getEnrolments(), getCourseOptions()]);

  return (
    <>
      <PageHeader
        title="Enrolments"
        description="Grant, extend and revoke course access. The primary way students get in while payments are off."
      />
      <EnrolmentManager enrolments={enrolments} courses={courses} />
    </>
  );
}
