import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Search across courses, lessons and live classes.
 *
 * Deliberately three plain ILIKE queries rather than one clever full-text setup.
 * At 200 students and a few hundred rows the index barely matters, and `ilike`
 * matches how people actually search here — partial words, mid-word ("toxic"
 * should find "Toxicology"), which `to_tsquery` would miss without extra work.
 *
 * RLS does the access control: a lesson from a course the user is not enrolled
 * in simply is not returned, so results never leak the existence of paid
 * content beyond its title.
 */

export interface SearchHit {
  kind: 'course' | 'lesson' | 'class';
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

/** Escapes the ILIKE wildcards so a query of "100%" doesn't match everything. */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function search(query: string): Promise<SearchHit[]> {
  const trimmed = query.trim();

  // One character matches nearly everything and reads as a broken page.
  if (trimmed.length < 2) return [];

  const supabase = await createClient();
  const pattern = `%${escapeLike(trimmed)}%`;

  const [courseResult, lessonResult, classResult] = await Promise.all([
    supabase
      .from('courses')
      .select('id, slug, title, subtitle')
      .ilike('title', pattern)
      .is('deleted_at', null)
      .limit(8),
    supabase
      .from('lessons')
      .select('id, title, course_id, courses(slug, title)')
      .ilike('title', pattern)
      .is('deleted_at', null)
      .limit(12),
    supabase
      .from('live_sessions')
      .select('id, title, starts_at, courses(title)')
      .ilike('title', pattern)
      .limit(8),
  ]);

  const hits: SearchHit[] = [];

  for (const course of courseResult.data ?? []) {
    hits.push({
      kind: 'course',
      id: course.id,
      title: course.title,
      subtitle: course.subtitle,
      href: `/app/learning/${course.slug}`,
    });
  }

  for (const lesson of lessonResult.data ?? []) {
    const course = lesson.courses as { slug: string; title: string } | null;
    hits.push({
      kind: 'lesson',
      id: lesson.id,
      title: lesson.title,
      subtitle: course?.title ?? null,
      href: course ? `/app/learning/${course.slug}?lesson=${lesson.id}` : '/app/learning',
    });
  }

  for (const session of classResult.data ?? []) {
    const course = session.courses as { title: string } | null;
    hits.push({
      kind: 'class',
      id: session.id,
      title: session.title,
      subtitle: course?.title ?? null,
      href: `/app/live/${session.id}`,
    });
  }

  return hits;
}
