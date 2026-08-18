'use client';

import { Download, Share, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'fsp:install-dismissed';
const VISITS_KEY = 'fsp:visits';

/**
 * Registers the service worker and offers installation.
 *
 * Two deliberate choices:
 *
 * 1. The prompt appears on the SECOND visit, not the first. Prompting
 *    immediately converts worse and trains people to dismiss.
 * 2. iOS gets separate instructions. Safari has no beforeinstallprompt event,
 *    and — critically — iOS delivers NO web push at all until the app is added
 *    to the home screen. Roughly a third of Indian students are on iPhone, so
 *    this is a feature requirement, not polish (docs Part 4 §4.2).
 */
export function PwaProvider() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Registration failing must never break the app.
      });
    }

    const visits = Number(localStorage.getItem(VISITS_KEY) ?? '0') + 1;
    localStorage.setItem(VISITS_KEY, String(visits));

    const alreadyInstalled =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;

    if (alreadyInstalled || localStorage.getItem(DISMISSED_KEY) || visits < 2) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) setShowIosHint(true);

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDeferred(null);
    setShowIosHint(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (!deferred && !showIosHint) return null;

  return (
    <div
      role="dialog"
      aria-label="Install the app"
      className="pb-safe fixed inset-x-0 bottom-0 z-50 p-3 lg:left-auto lg:max-w-sm"
    >
      <div className="border-line-medium bg-surface flex items-start gap-3 rounded-2xl border p-4 shadow-xl">
        <span className="bg-primary font-display grid size-11 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white">
          FS
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-ink font-semibold">Install FSP</p>
          <p className="text-ink-muted mt-0.5 text-[13px] leading-relaxed">
            {showIosHint ? (
              <>
                Tap <Share className="inline size-3.5 align-text-bottom" aria-hidden /> Share, then{' '}
                <strong className="text-ink">Add to Home Screen</strong> — required on iPhone to get class
                reminders.
              </>
            ) : (
              'Add it to your home screen for faster access and class reminders.'
            )}
          </p>

          {deferred && (
            <button
              onClick={install}
              className="bg-primary hover:bg-primary-hover mt-3 inline-flex min-h-11 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold text-white"
            >
              <Download className="size-4" aria-hidden /> Install
            </button>
          )}
        </div>

        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="text-ink-muted hover:bg-hover grid size-11 shrink-0 place-items-center rounded-lg"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
