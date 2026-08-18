import 'server-only';

import { createClient } from '@/lib/supabase/server';

/** Admin reads. RLS ("read own or staff") is what limits these, not a filter here. */

export interface AdminEnrolment {
  id: string;
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  courseSlug: string;
  status: string;
  grantedAt: string;
  expiresAt: string | null;
  /** No order row means it was granted by hand rather than paid for. */
  source: 'Manual' | 'Payment';
}

export async function getEnrolments(): Promise<AdminEnrolment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('enrollments')
    .select('id, status, granted_at, expires_at, order_id, profiles(full_name, email), courses(title, slug)')
    .order('granted_at', { ascending: false })
    .limit(200);

  if (error) return [];

  return (data ?? [])
    .map((row): AdminEnrolment | null => {
      const profile = row.profiles as { full_name: string; email: string } | null;
      const course = row.courses as { title: string; slug: string } | null;
      if (!profile || !course) return null;

      return {
        id: row.id,
        studentName: profile.full_name,
        studentEmail: profile.email,
        courseTitle: course.title,
        courseSlug: course.slug,
        status: row.status,
        grantedAt: row.granted_at,
        expiresAt: row.expires_at,
        source: row.order_id ? ('Payment' as const) : ('Manual' as const),
      };
    })
    .filter((row): row is AdminEnrolment => row !== null);
}

export interface CourseOption {
  slug: string;
  title: string;
}

export async function getCourseOptions(): Promise<CourseOption[]> {
  const supabase = await createClient();

  const { data } = await supabase.from('courses').select('slug, title').is('deleted_at', null).order('title');

  return data ?? [];
}
