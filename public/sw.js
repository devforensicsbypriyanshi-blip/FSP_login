/* =============================================================================
 * FSP service worker
 *
 * Hand-rolled rather than generated: the caching rules here are security
 * decisions, not build config, and they need to be readable at a glance.
 *
 * THE RULE THAT MATTERS: never cache anything authenticated or mutating.
 * A cached OTP response or join link served to the next user on a shared
 * device would be a real breach. Only GETs for static assets are cached.
 * ========================================================================== */

const VERSION = 'fsp-v1';
const STATIC_CACHE = `${VERSION}-static`;
const IMAGE_CACHE = `${VERSION}-images`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = '/offline.html';

const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Requests that must always hit the network and never be stored. */
function isNeverCacheable(request, url) {
  return (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/sign-in') ||
    url.pathname.startsWith('/register') ||
    url.searchParams.has('_rsc')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin && url.hostname !== 'res.cloudinary.com') return;
  if (isNeverCacheable(request, url)) return;

  // Navigations: network first, fall back to cache, then the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // Immutable build output: cache first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // Images: cache first, capped so a long-lived install cannot grow forever.
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(IMAGE_CACHE).then(async (cache) => {
              await cache.put(request, copy);
              const keys = await cache.keys();
              if (keys.length > 200) await cache.delete(keys[0]);
            });
            return response;
          })
      )
    );
  }
});

/* -------------------------------- Web Push -------------------------------- */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Forensic Science by Priyanshi', body: event.data?.text() ?? '' };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'FSP', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      // Same tag replaces rather than stacks — three reminders for one class
      // should not produce three alerts.
      tag: payload.tag ?? 'fsp',
      renotify: Boolean(payload.critical),
      requireInteraction: Boolean(payload.critical),
      data: { url: payload.url ?? '/app' },
      actions: payload.actions ?? [],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/app';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const path = new URL(target, self.location.origin).pathname;
      const existing = clientList.find((c) => new URL(c.url).pathname === path);
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    })
  );
});
