/* Lumea PWA service worker — v3.
   Freshness-first to avoid stale-shell lock-in on installed PWAs:
     - Navigations / documents (crm.html): NETWORK-ONLY. Always fetch the latest shell;
       fall back to a cached copy only when genuinely offline.
     - Versioned bundle + same-origin static assets: cache-first (URLs are version-stamped).
     - Cross-origin (Supabase, CDN, fonts) and /api/*: never intercepted.
     - Non-GET: never touched.
   Bump CACHE_VERSION to force a reinstall + purge of every old cache. */
const CACHE_VERSION = 'lumea-v3';
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
    event.respondWith(fetch(req).catch(() => caches.match(req).then((m) => m || caches.match('/crm.html'))));
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
      }).catch(() => cached);
    })
  );
});
