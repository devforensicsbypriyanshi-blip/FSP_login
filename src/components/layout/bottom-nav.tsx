'use client';

import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useFlags } from '@/lib/config/flag-context';
import { cn } from '@/lib/utils';
import { isActive } from './sidebar-nav';
import { visibleNav, type PortalConfig } from './nav-config';

/**
 * Mobile bottom tab bar — the fix for the reference UI having no mobile
 * navigation at all (docs Part 0 §F4).
 *
 * Four primary destinations plus "More", which opens the full drawer. Five is
 * the practical ceiling before labels truncate at 360px.
 */
export function BottomNav({ portal, onMore }: { portal: PortalConfig; onMore: () => void }) {
  const pathname = usePathname();
  const { isVisible } = useFlags();
  const primary = visibleNav(portal, isVisible)
    .filter((i) => i.primary)
    .slice(0, 4);

  return (
    <nav
      className="pb-safe border-line-medium bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-lg lg:hidden"
      aria-label="Primary"
    >
      <div className="grid grid-cols-5">
        {primary.map(({ href, label, shortLabel, icon: Icon }) => {
          const active = isActive(pathname, href, portal.basePath);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors',
                active ? 'text-primary' : 'text-ink-muted active:bg-hover'
              )}
            >
              <Icon className={cn('size-5 shrink-0', active && 'stroke-[2.5]')} aria-hidden />
              <span className={cn('truncate text-[10px] leading-none', active && 'font-semibold')}>
                {shortLabel ?? label}
              </span>
            </Link>
          );
        })}

        <button
          onClick={onMore}
          className="text-ink-muted active:bg-hover flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2"
          aria-label="More navigation options"
        >
          <MoreHorizontal className="size-5 shrink-0" aria-hidden />
          <span className="text-[10px] leading-none">More</span>
        </button>
      </div>
    </nav>
  );
}
