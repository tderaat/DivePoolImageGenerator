// ============================================================
// Service worker: makes the generator work offline.
// ------------------------------------------------------------
// Bump CACHE_VERSION whenever index.html, style.css, script.js
// or any image changes, so clients pick the new files up.
// ============================================================

const CACHE_VERSION = 'v1';
const CACHE_NAME = `dive-pool-${CACHE_VERSION}`;

// Paths are relative to the service worker, so the app works both at a
// domain root and under a GitHub Pages project subpath.
const PRECACHE = [
  './',
  'index.html',
  'style.css',
  'script.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  ...Array.from({ length: 22 }, (_, i) => `images/blocks/${i + 1}.png`),
  ...'ABCDEFGHJKLMNOPQ'.split('').map((code) => `images/randoms/${code}.png`),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE.map((path) => new Request(path, { cache: 'reload' })))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // e.g. YouTube links

  // Navigations: try the network first so a deployed update lands quickly,
  // fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request)
          .then((cached) => cached || caches.match('index.html'))
          .then((cached) => cached || caches.match('./')))
    );
    return;
  }

  // Assets: cache first, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
