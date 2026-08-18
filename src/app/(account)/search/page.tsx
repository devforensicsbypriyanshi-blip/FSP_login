import { BookOpen, PlayCircle, Radio, Search as SearchIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { search, type SearchHit } from '@/lib/data/search';

export const metadata = { title: 'Search' };

/**
 * Server-rendered search — the query lives in the URL, so a result page is
 * linkable, shareable and survives a refresh. No client state, no debounce, no
 * loading spinner to design.
 */

const KIND: Record<SearchHit['kind'], { icon: LucideIcon; label: string; tint: string }> = {
  course: { icon: BookOpen, label: 'Course', tint: 'bg-primary-light text-primary' },
  lesson: { icon: PlayCircle, label: 'Lesson', tint: 'bg-info-bg text-info' },
  class: { icon: Radio, label: 'Live class', tint: 'bg-error-bg text-error' },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();
  const hits = query ? await search(query) : [];

  return (
    <>
      <PageHeader
        title="Search"
        description={query ? `Results for “${query}”` : 'Find a course, lesson or class.'}
      />

      {/* Repeated here rather than relying on the header box, which is hidden
          below md — a search page you cannot search from would be absurd. */}
      <form
        action="/search"
        role="search"
        className="border-line-medium focus-within:border-primary focus-within:ring-primary/10 flex items-center gap-2.5 rounded-full border px-4 py-2.5 transition focus-within:ring-[3px]"
      >
        <SearchIcon className="text-ink-muted size-[18px] shrink-0" aria-hidden />
        <input
          type="search"
          name="q"
          defaultValue={query}
          autoFocus={!query}
          aria-label="Search courses, lessons and classes"
          placeholder="Search courses, lessons, classes…"
          className="text-ink placeholder:text-ink-light w-full bg-transparent text-[14px] outline-none"
        />
      </form>

      {!query ? (
        <EmptyState
          icon={SearchIcon}
          title="What are you looking for?"
          description="Search across your courses, individual lessons and scheduled live classes. Two characters is enough to start."
        />
      ) : hits.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title={`Nothing matches “${query}”`}
          description="Try a shorter or more general word. Search only covers courses you have access to, so paid content you haven't enrolled in won't appear."
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-line flex flex-col divide-y">
            {hits.map((hit) => {
              const { icon: Icon, label, tint } = KIND[hit.kind];
              return (
                <li key={`${hit.kind}-${hit.id}`}>
                  <Link href={hit.href} className="hover:bg-hover flex items-center gap-3.5 p-4 transition">
                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tint}`}>
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-ink truncate text-[13.5px] font-semibold">{hit.title}</p>
                      {hit.subtitle && (
                        <p className="text-ink-muted mt-0.5 truncate text-[12.5px]">{hit.subtitle}</p>
                      )}
                    </div>
                    <Badge variant="gray" className="shrink-0">
                      {label}
                    </Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
