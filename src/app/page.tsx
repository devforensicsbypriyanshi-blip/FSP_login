import {
  ArrowRight,
  BellRing,
  GraduationCap,
  Headphones,
  Presentation,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isEnabled } from '@/lib/flags';

/**
 * Platform hub — a development/demo launcher, not a production page.
 *
 * Gated on the `ui.public_hub` flag: while building, `/` shows every portal so
 * you can jump between them. For production the flag goes off and `/` redirects
 * to /sign-in, making login the first thing anyone sees.
 *
 * Preview production behaviour locally with NEXT_PUBLIC_SHOW_HUB=false.
 * Phase 1 moves this flag into the database so it flips from /dev/config
 * without a redeploy (docs Part 5 §3).
 *
 * Ports index.html's gradient hero, but mobile-first: the original used a
 * fixed 48px horizontal padding and a 340px-minimum grid that overflowed
 * below ~380px. See docs Part 0 §F4.
 */

const PORTALS = [
  {
    href: '/app',
    title: 'Student Dashboard',
    tag: 'Learning',
    description: 'Courses, live classroom, mock tests, notes & DPPs, doubts forum, store and 1:1 mentorship.',
    icon: GraduationCap,
    accent: 'var(--color-role-student)',
  },
  {
    href: '/studio',
    title: 'Educator Studio',
    tag: 'Teaching',
    description:
      'Schedule live classes, upload lectures, answer doubts, build quizzes and track student performance.',
    icon: Presentation,
    accent: 'var(--color-role-educator)',
  },
  {
    href: '/admin',
    title: 'Admin Console',
    tag: 'God Mode',
    description: 'Platform KPIs, RBAC, course approvals, payments, refunds, coupons and audit logs.',
    icon: ShieldAlert,
    accent: 'var(--color-role-admin)',
  },
  {
    href: '/support',
    title: 'Support Desk',
    tag: 'Helpdesk',
    description: 'Ticket queue with SLA tracking, live chat, account recovery and doubt escalation.',
    icon: Headphones,
    accent: 'var(--color-role-support)',
  },
  {
    href: '/dev',
    title: 'Developer Console',
    tag: 'System',
    description: 'Service health, API keys, webhook replay, live request logs and feature flags.',
    icon: Terminal,
    accent: 'var(--color-role-developer)',
  },
  {
    href: '/app/notifications',
    title: 'Notification Center',
    tag: 'Alerts',
    description: 'Live class alerts, verified doubt answers, new mock tests and announcements.',
    icon: BellRing,
    accent: 'var(--color-rose)',
  },
] as const;

export default function HubPage() {
  if (!isEnabled('ui.public_hub')) redirect('/sign-in');

  return (
    <div className="bg-brand-gradient min-h-dvh text-white">
      <header className="pt-safe sticky top-0 z-30 border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="bg-primary font-display shadow-purple grid size-11 shrink-0 place-items-center rounded-xl text-lg font-extrabold">
              FS
            </div>
            <div className="leading-tight">
              <div className="text-primary-border text-[10px] font-semibold tracking-wider uppercase">
                Forensic Science by
              </div>
              <div className="font-display text-lg font-bold">Priyanshi</div>
            </div>
          </div>

          <Link
            href="/sign-in"
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/20 transition hover:bg-white/20"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1240px] px-4 pt-10 pb-20 md:px-8 md:pt-16">
        <section className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
          <span className="border-primary/50 bg-primary/25 text-primary-border inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold">
            <span className="bg-success size-2 rounded-full" />
            Phase 0 · Foundations
          </span>

          <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl md:text-[38px]">
            One Unified Platform.
            <br />
            <span className="from-amber to-peach bg-gradient-to-r bg-clip-text text-transparent">
              Five Role-Based Dashboards.
            </span>
          </h1>

          <p className="text-peach/85 text-[15px] leading-relaxed text-balance">
            UGC NET &amp; Forensic Science exam preparation — live classes, recorded lectures, mock tests,
            notes and 1:1 mentorship. Installable on any device.
          </p>
        </section>

        <section className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PORTALS.map(({ href, title, tag, description, icon: Icon, accent }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col justify-between gap-5 rounded-2xl border border-white/15 bg-white/[0.06] p-6 backdrop-blur-lg transition duration-200 hover:-translate-y-1 hover:border-white/30 hover:bg-white/10 focus-visible:-translate-y-1"
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div
                    className="grid size-12 place-items-center rounded-[14px]"
                    style={{ backgroundColor: accent }}
                  >
                    <Icon className="size-6" aria-hidden />
                  </div>
                  <span className="text-peach rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold">
                    {tag}
                  </span>
                </div>

                <div>
                  <h2 className="font-display text-xl font-bold">{title}</h2>
                  <p className="text-peach/80 mt-1.5 text-sm leading-relaxed">{description}</p>
                </div>
              </div>

              <div className="text-peach flex items-center justify-between border-t border-white/10 pt-4 text-[13px] font-semibold">
                <span>Open</span>
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </div>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
