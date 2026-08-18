import Link from 'next/link';
import type * as React from 'react';

/**
 * Public legal pages. No auth, no app shell.
 *
 * Razorpay requires a merchant to publish Terms, Privacy and a Refund /
 * Cancellation policy before the account is approved, and those links must be
 * reachable without signing in — hence a route group outside the
 * middleware-protected prefixes.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-app flex min-h-dvh flex-col">
      <header className="border-line-medium bg-surface border-b">
        <div className="mx-auto flex max-w-[760px] items-center justify-between gap-4 px-4 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="bg-primary font-display grid size-9 place-items-center rounded-[10px] text-sm font-extrabold text-white">
              FS
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-ink-muted text-[10px] font-semibold tracking-wider uppercase">
                Forensic Science by
              </span>
              <span className="font-display text-ink text-[15px] font-bold">Priyanshi</span>
            </span>
          </Link>

          <Link href="/sign-in" className="text-primary text-[13px] font-semibold hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[760px] flex-1 px-4 py-8 md:px-8 md:py-12">{children}</main>

      <footer className="border-line-medium bg-surface border-t">
        <div className="mx-auto flex max-w-[760px] flex-col gap-3 px-4 py-6 md:flex-row md:items-center md:justify-between md:px-8">
          <p className="text-ink-muted text-xs">© {new Date().getFullYear()} Forensic Science by Priyanshi</p>
          <nav className="flex flex-wrap gap-4 text-xs">
            <Link href="/terms" className="text-ink-secondary hover:text-primary">
              Terms
            </Link>
            <Link href="/privacy" className="text-ink-secondary hover:text-primary">
              Privacy
            </Link>
            <Link href="/refund-policy" className="text-ink-secondary hover:text-primary">
              Refund policy
            </Link>
            <Link href="/contact" className="text-ink-secondary hover:text-primary">
              Contact
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
