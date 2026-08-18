'use client';

import { Headphones, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isModuleVisible } from '@/lib/flags';
import { cn } from '@/lib/utils';
import { visibleNav, type PortalConfig } from './nav-config';

export function isActive(pathname: string, href: string, basePath: string) {
  // The portal root must match exactly, or it stays highlighted on every child route.
  return href === basePath ? pathname === href : pathname.startsWith(href);
}

function Brand({ portal }: { portal: PortalConfig }) {
  return (
    <Link href={portal.basePath} className="flex items-center gap-3 px-5 py-5 group">
      <img
        src="/logo.png"
        alt="Forensic Science by Priyanshi"
        className="size-10 shrink-0 rounded-xl object-contain shadow-2xs transition-transform group-hover:scale-105 bg-white border border-slate-100 p-0.5"
      />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[#6f6b85] truncate text-[9.5px] font-bold tracking-wider uppercase">
          {portal.brandEyebrow}
        </span>
        <span className="font-display text-[#1D1A39] truncate text-[15.5px] font-bold">{portal.brandName}</span>
      </span>
    </Link>
  );
}

function NavLinks({ portal, onNavigate }: { portal: PortalConfig; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-2" aria-label="Main">
      {visibleNav(portal, isModuleVisible).map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href, portal.basePath);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3.5 rounded-xl px-4 text-sm font-medium transition-all',
              active
                ? 'bg-[#f4ebf8] text-[#451952] font-bold shadow-2xs'
                : 'text-slate-600 hover:bg-[#FAF8F7] hover:text-[#1D1A39]'
            )}
          >
            <Icon className={cn('size-5 shrink-0', active ? 'text-[#451952] stroke-[2.2]' : 'text-slate-500')} aria-hidden />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SupportCard({ portal, onNavigate }: { portal: PortalConfig; onNavigate?: () => void }) {
  const isStudent = portal.role === 'student';
  const supportHref = isStudent ? '/app/support' : '/support';

  return (
    <div className="px-3 pb-3">
      <Link
        href={supportHref}
        onClick={onNavigate}
        className="group flex items-center gap-3 rounded-2xl border border-[#e6e0df] bg-[#FAF8F7] p-3 shadow-2xs transition-all hover:bg-white hover:border-[#451952]/40 hover:shadow-xs"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#e6e0df] bg-white text-[#451952] shadow-2xs transition-transform group-hover:scale-105">
          <Headphones className="size-4.5 text-[#451952]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-bold text-[#1D1A39] leading-tight">Help &amp; Support</h4>
          <p className="text-[11px] font-semibold text-[#451952] mt-0.5 group-hover:underline flex items-center gap-1">
            <span>Contact team</span>
            <span>&rarr;</span>
          </p>
        </div>
      </Link>
    </div>
  );
}

/** Desktop sidebar — hidden below lg, where the bottom bar takes over. */
export function Sidebar({ portal }: { portal: PortalConfig }) {
  return (
    <aside className="border-line-medium bg-surface sticky top-0 hidden h-dvh w-[250px] shrink-0 flex-col border-r lg:flex">
      <Brand portal={portal} />
      <NavLinks portal={portal} />
      <div className="mt-auto">
        <SupportCard portal={portal} />
      </div>
    </aside>
  );
}

/** Mobile drawer — the full nav, including items that don't fit the bottom bar. */
export function MobileDrawer({
  portal,
  open,
  onClose,
}: {
  portal: PortalConfig;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <div className={cn('lg:hidden', !open && 'pointer-events-none')} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div
        role="dialog"
        aria-modal={open}
        aria-label="Navigation menu"
        className={cn(
          'bg-surface fixed inset-y-0 left-0 z-50 flex w-[min(85vw,300px)] flex-col shadow-xl transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="border-line flex items-center justify-between border-b pr-3">
          <Brand portal={portal} />
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="text-ink-muted hover:bg-hover grid size-11 shrink-0 place-items-center rounded-full"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <NavLinks portal={portal} onNavigate={onClose} />
        <div className="mt-auto">
          <SupportCard portal={portal} onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}
