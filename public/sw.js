/* Lumea PWA service worker — v3.
   Freshness-first to avoid stale-shell lock-in on installed PWAs:
     - Navigations / documents (crm.html): NETWORK-ONLY. Always fetch the latest shell;
       fall back to a cached copy only when genuinely offline.
     - Versioned bundle + same-origin static assets: cache-first (URLs are version-stamped).
     - Cross-origin (Supabase, CDN, fonts) and /api/*: never intercepted.
     - Non-GET: never touched.
   Bump CACHE_VERSION to force a reinstall + purge of every old cache. */
const CACHE_VERSION = 'lumea-v5';
// respondWith must always resolve to a Response — never undefined (caused
// "Failed to convert value to 'Response'" when an uncached fetch rejected).
const swOffline = () => new Response('', { status: 504, statusText: 'Offline' });
const PRECACHE = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Document navigations → network-ONLY (always fresh shell). Offline: last-resort cache.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(fetch(req).catch(() => caches.match(req).then((m) => m || caches.match('/crm.html'))).then((res) => res || swOffline()));
    return;
  }

  // Same-origin static assets (version-stamped bundle, icons) → cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached || swOffline());
    })
  );
});


// ── Web Push: show notification on push, focus/open CRM on click ──
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Hotel Fountain';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'You have a new notification.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'lumea-booking',
    renotify: true,
    vibrate: [80, 40, 80],
    data: { url: data.url || '/crm.html' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/crm.html';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if (c.url.includes('/crm.html') && 'focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
