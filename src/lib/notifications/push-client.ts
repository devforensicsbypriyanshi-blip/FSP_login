'use client';

import { describeDevice } from '@/lib/session/device';

/**
 * Browser side of Firebase Cloud Messaging.
 *
 * The `firebase/messaging` SDK is imported dynamically, and only after the user
 * has actually agreed to notifications. It is ~90 KB — loading it eagerly would
 * make every student pay for it, including the majority who never enable push
 * and the iPhone users for whom it does nothing at all until the app is
 * installed to the home screen.
 *
 * `firebase` is an optional dependency. If it is not installed the import
 * fails, we return a clear reason, and the rest of the app is unaffected —
 * email reminders keep working, which is the channel that actually reaches
 * everyone.
 */

export type PushSetupResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason: 'unsupported' | 'denied' | 'not-configured' | 'sdk-missing' | 'failed';
      message: string;
    };

const MESSAGES: Record<Exclude<PushSetupResult & { ok: false }, { ok: true }>['reason'], string> = {
  unsupported:
    'This browser cannot show notifications. On an iPhone, add this site to your home screen first — Safari only allows them for installed apps.',
  denied:
    'Notifications are blocked in your browser settings. You will still get every reminder by email, so nothing is missed.',
  'not-configured': 'Push notifications are not set up on this deployment yet.',
  'sdk-missing': 'Push notifications are not available in this build.',
  failed: 'We could not turn on notifications. Please try again.',
};

function fail(reason: Exclude<PushSetupResult & { ok: false }, { ok: true }>['reason']): PushSetupResult {
  return { ok: false, reason, message: MESSAGES[reason] };
}

export function pushIsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export async function enablePush(): Promise<PushSetupResult> {
  if (!pushIsSupported()) return fail('unsupported');

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const senderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!vapidKey || !apiKey || !projectId || !senderId || !appId) return fail('not-configured');

  // Ask only now — in context, after the user pressed a button that says what
  // this is for. A prompt on page load is how you earn a permanent "Block".
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return fail('denied');

  try {
    const [{ initializeApp, getApps }, { getMessaging, getToken, isSupported }] = await Promise.all([
      import('firebase/app'),
      import('firebase/messaging'),
    ]);

    if (!(await isSupported())) return fail('unsupported');

    const app = getApps()[0] ?? initializeApp({ apiKey, projectId, messagingSenderId: senderId, appId });

    // Our own service worker already exists (offline support, caching). FCM is
    // told to reuse it rather than register a second one — two service workers
    // on one scope is a fight neither wins.
    const registration = await navigator.serviceWorker.ready;

    const token = await getToken(getMessaging(app), {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) return fail('failed');

    const response = await fetch('/api/push/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, deviceLabel: describeDevice() }),
    });

    if (!response.ok) return fail('failed');

    return { ok: true, token };
  } catch (error) {
    // A missing optional dependency looks like a module resolution error.
    const message = String(error);
    if (message.includes('firebase') && message.includes('resolve')) return fail('sdk-missing');
    return fail('failed');
  }
}
