/* Lumea PWA service worker — offline shell + same-origin asset cache.
   Scope is deliberately conservative to never break the live CRM:
     - Navigations (HTML): network-first, fall back to cached /crm.html when offline.
     - Same-origin static assets (JS/CSS/img/font/icons): cache-first.
     - Cross-origin (Supabase, CDN libs, Google Fonts) and /api/*: NOT intercepted —
       served directly by the browser so auth stays live and the site CSP is respected.
     - Non-GET: never touched.
   Bump CACHE_VERSION to force clients to refresh the precache. */
const CACHE_VERSION = 'lumea-v1';
const PRECACHE = [
  '/crm.html',
  '/crm-config.js',
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

  // Only ever handle same-origin GETs. Everything cross-origin (Supabase, CDN, fonts)
  // and /api/* is left to the browser so live auth/data and the page CSP are untouched.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Navigations / documents → network-first, offline fallback to cached shell.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('/crm.html')))
    );
    return;
  }

  // Same-origin static assets → cache-first, populate on miss.
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
