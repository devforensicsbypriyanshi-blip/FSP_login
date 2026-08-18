'use client';

import {
  Bell,
  CalendarDays,
  CheckCheck,
  FileText,
  Grid,
  LogOut,
  Megaphone,
  Menu,
  Search,
  Settings,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { PortalConfig } from './nav-config';

interface HeaderNotification {
  id: string;
  type: 'class.starting' | 'course.published' | 'class.reminder' | 'announcement';
  title: string;
  body: string;
  timeAgo: string;
  read: boolean;
  href?: string;
}

const INITIAL_NOTIFICATIONS: HeaderNotification[] = [
  {
    id: 'n1',
    type: 'class.starting',
    title: 'Live Class Starting Soon',
    body: 'Forensic Toxicology & Extraction begins in 15 minutes with Dr. Priyanshi.',
    timeAgo: '15m ago',
    read: false,
    href: '/app/live',
  },
  {
    id: 'n2',
    type: 'course.published',
    title: 'New DPP & Study Notes',
    body: 'Forensic Biology (Set 3) practice questions now available in Notes.',
    timeAgo: '2h ago',
    read: false,
    href: '/app/notes',
  },
  {
    id: 'n3',
    type: 'class.reminder',
    title: 'Upcoming Lecture Tomorrow',
    body: 'Questioned Documents & Forgery at 6:00 PM IST with Prof. Rajesh Sharma.',
    timeAgo: '1d ago',
    read: true,
    href: '/app/calendar',
  },
  {
    id: 'n4',
    type: 'announcement',
    title: 'NTA Exam Calendar Update',
    body: 'UGC NET & CUET PG 2026 tentative dates published.',
    timeAgo: '2d ago',
    read: true,
    href: '/app',
  },
];

export function AppHeader({
  portal,
  user,
  unreadCount = 2,
  onMenu,
}: {
  portal: PortalConfig;
  user: { name: string; email: string };
  unreadCount?: number;
  onMenu: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);

  const wrapRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadTotal = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuOpen && !wrapRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (notifOpen && !notifRef.current?.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen, notifOpen]);

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function markSingleRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  function getNotifIcon(type: HeaderNotification['type']) {
    switch (type) {
      case 'class.starting':
        return <CalendarDays className="size-4 text-[#AF445A]" />;
      case 'course.published':
        return <FileText className="size-4 text-[#451952]" />;
      case 'class.reminder':
        return <CalendarDays className="size-4 text-[#662549]" />;
      case 'announcement':
        return <Megaphone className="size-4 text-[#F59F59]" />;
      default:
        return <Bell className="size-4 text-slate-500" />;
    }
  }

  return (
    <header className="pt-safe border-line-medium bg-surface/95 sticky top-0 z-30 border-b backdrop-blur-lg">
      <div className="flex items-center gap-2 px-3 py-2.5 md:gap-4 md:px-6 md:py-3">
        <button
          onClick={onMenu}
          aria-label="Open navigation menu"
          className="text-ink-secondary hover:bg-hover grid size-11 shrink-0 place-items-center rounded-full lg:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>

        {/* Search collapses to an icon button below md */}
        <Link
          href={`${portal.basePath}/search`}
          aria-label="Search"
          className="text-ink-secondary hover:bg-hover grid size-11 shrink-0 place-items-center rounded-full md:hidden"
        >
          <Search className="size-5" aria-hidden />
        </Link>

        <div className="border-line-medium focus-within:border-primary focus-within:bg-surface focus-within:ring-primary/10 hidden max-w-md flex-1 items-center gap-2.5 rounded-full border bg-[#FAFAFA] px-4 py-2.5 transition focus-within:ring-[3px] md:flex">
          <Search className="text-ink-muted size-[18px] shrink-0" aria-hidden />
          <input
            type="search"
            placeholder="Search courses, lectures, notes…"
            className="text-ink placeholder:text-ink-light w-full bg-transparent text-[13.5px] outline-none"
          />
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <Link
            href={`${portal.basePath}/hub`}
            className="border border-[#e6e0df] bg-[#FAF8F7] hover:bg-white text-slate-700 hover:text-[#1D1A39] hidden items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition md:flex shadow-2xs"
          >
            <Grid className="size-4 text-slate-600" aria-hidden />
            <span>Hub</span>
          </Link>

          {/* Notifications Button & Dropdown */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => {
                setNotifOpen((v) => !v);
                setMenuOpen(false);
              }}
              aria-label={`Notifications${unreadTotal ? `, ${unreadTotal} unread` : ''}`}
              aria-expanded={notifOpen}
              className={cn(
                'border border-[#e6e0df] bg-white text-slate-600 hover:bg-[#FAF8F7] hover:text-[#1D1A39] relative grid size-10 place-items-center rounded-full transition shadow-2xs cursor-pointer',
                notifOpen && 'bg-[#FAF8F7] ring-2 ring-[#451952]/20'
              )}
            >
              <Bell className="size-4.5" aria-hidden />
              {unreadTotal > 0 && (
                <span className="bg-[#AF445A] absolute top-1.5 right-1.5 size-2.5 rounded-full ring-2 ring-white animate-pulse" />
              )}
            </button>

            {/* Notification Popover Dropdown */}
            <div
              className={cn(
                'absolute right-0 z-50 mt-2 w-80 sm:w-96 origin-top-right overflow-hidden rounded-2xl border border-slate-200/90 bg-white/98 shadow-2xl backdrop-blur-xl transition-all duration-200',
                notifOpen ? 'visible scale-100 opacity-100' : 'invisible scale-95 opacity-0 pointer-events-none'
              )}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 bg-[#FAF8F7]/80">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-[#1D1A39] text-sm">Notifications</h3>
                  {unreadTotal > 0 && (
                    <span className="rounded-full bg-[#451952] px-2 py-0.5 text-[10px] font-extrabold text-white">
                      {unreadTotal} new
                    </span>
                  )}
                </div>
                {unreadTotal > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-[11.5px] font-semibold text-[#451952] hover:text-[#1D1A39] transition cursor-pointer"
                  >
                    <CheckCheck className="size-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                {notifications.map((n) => (
                  <Link
                    key={n.id}
                    href={n.href ?? `${portal.basePath}/notifications`}
                    onClick={() => {
                      markSingleRead(n.id);
                      setNotifOpen(false);
                    }}
                    className={cn(
                      'flex items-start gap-3 p-3.5 transition hover:bg-[#FAF8F7] text-left block',
                      !n.read && 'bg-[#FAF8F7]/60'
                    )}
                  >
                    <div className="grid size-8.5 shrink-0 place-items-center rounded-xl bg-slate-100 mt-0.5">
                      {getNotifIcon(n.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className={cn('text-xs font-bold truncate', !n.read ? 'text-[#1D1A39]' : 'text-slate-700')}>
                          {n.title}
                        </p>
                        <span className="text-[10.5px] text-slate-400 shrink-0">{n.timeAgo}</span>
                      </div>
                      <p className="text-[11.5px] text-slate-500 leading-snug line-clamp-2 mt-0.5">
                        {n.body}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="size-2 rounded-full bg-[#AF445A] shrink-0 mt-1.5" />
                    )}
                  </Link>
                ))}
              </div>

              <div className="border-t border-slate-100 p-2.5 text-center bg-[#FAF8F7]/40">
                <Link
                  href={`${portal.basePath}/notifications`}
                  onClick={() => setNotifOpen(false)}
                  className="text-xs font-bold text-[#451952] hover:text-[#1D1A39] transition"
                >
                  View full history →
                </Link>
              </div>
            </div>
          </div>

          {/* User Profile Menu */}
          <div className="relative" ref={wrapRef}>
            <button
              onClick={() => {
                setMenuOpen((v) => !v);
                setNotifOpen(false);
              }}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="border border-[#e6e0df] bg-white hover:bg-[#FAF8F7] flex min-h-10 items-center gap-2 rounded-full pl-1 pr-3 py-1 transition shadow-2xs cursor-pointer"
            >
              <div className="size-7 rounded-full bg-[#1D1A39] text-white flex items-center justify-center text-[10px] font-extrabold tracking-wider">
                {user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'DS'}
              </div>
              <span className="text-[#1D1A39] hidden text-xs font-bold md:inline">
                {user.name.split(' ')[0]}
              </span>
              <svg className="size-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            <div
              role="menu"
              className={cn(
                'border-line-medium bg-surface absolute right-0 z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-2xl border shadow-xl transition-all duration-150',
                menuOpen ? 'visible scale-100 opacity-100' : 'invisible scale-95 opacity-0 pointer-events-none'
              )}
            >
              <div className="border-line bg-hover flex items-center gap-3 border-b p-4">
                <Avatar name={user.name} size="md" color={portal.accent} />
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-semibold">{user.name}</p>
                  <p className="text-ink-muted truncate text-xs">{user.email}</p>
                </div>
              </div>

              <div className="p-1.5">
                <Link
                  href={`${portal.basePath}/profile`}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="text-ink-secondary hover:bg-hover flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm"
                >
                  <User className="text-primary size-4" aria-hidden /> Profile
                </Link>
                <Link
                  href={`${portal.basePath}/settings`}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="text-ink-secondary hover:bg-hover flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm"
                >
                  <Settings className="text-ink-muted size-4" aria-hidden /> Settings &amp; devices
                </Link>
                <div className="bg-line my-1.5 h-px" />
                <Link
                  href="/sign-out"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="text-error hover:bg-error-bg flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm"
                >
                  <LogOut className="size-4" aria-hidden /> Sign out
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
