/* Lumea PWA service worker — v4.
   Freshness-first to avoid stale-shell lock-in on installed PWAs:
     - Navigations / documents (crm.html): NETWORK-ONLY. Always fetch the latest shell;
       fall back to a cached copy only when genuinely offline.
     - Immutable static assets (/_next/static, icons, images, bundle): cache-first.
     - EVERYTHING ELSE (RSC prefetches, dynamic fetches, /api/*, cross-origin): NEVER
       intercepted. v3 answered any failed same-origin GET with a synthetic
       "504 Offline", which turned silently-aborted route prefetches into loud
       "Failed to load resource: 504 (Offline)" console errors on every visit.
     - Non-GET: never touched.
   Bump CACHE_VERSION to force a reinstall + purge of every old cache. */
const CACHE_VERSION = 'lumea-v7';
// Last-resort offline page for document navigations (respondWith must resolve
// to a real Response when we're genuinely offline with nothing cached).
const swOfflinePage = () => new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#07090E;color:#F4EFE6;font-family:system-ui,sans-serif;text-align:center"><div><div style="font-size:34px;margin-bottom:10px">&#9729;</div><h1 style="font-size:18px;margin:0 0 6px">You&rsquo;re offline</h1><p style="font-size:13px;color:#9A907C;margin:0">Reconnect and pull to refresh.</p></div>',
  { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/html; charset=utf-8' } }
);
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

// Immutable / version-stamped assets — the only things worth serving cache-first.
const STATIC_RE = /\.(?:png|jpe?g|webp|gif|svg|ico|woff2?)$/;
function isStaticAsset(pathname) {
  return pathname.startsWith('/_next/static/')
    || pathname.startsWith('/icons/')
    || pathname.startsWith('/images/')
    || pathname.startsWith('/logo')
    || pathname === '/crm-bundle.js'
    || pathname === '/manifest.webmanifest'
    || STATIC_RE.test(pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Document navigations → network-ONLY (always fresh shell). Offline: cached copy,
  // then the branded offline page — never an empty synthetic error body.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .catch(() => caches.match(req).then((m) => m || caches.match('/crm.html')))
        .then((res) => res || swOfflinePage())
    );
    return;
  }

  // Anything that isn't an immutable asset (RSC prefetches, dynamic data, analytics)
  // is NOT intercepted: the browser handles success, failure and aborts natively,
  // so cancelled prefetches stay silent instead of logging a fake 504.
  if (!isStaticAsset(url.pathname)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      // If this rejects (offline / aborted), the request fails exactly as it would
      // without a service worker — no synthetic Response, no console 504.
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
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
