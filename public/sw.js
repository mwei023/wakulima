const CACHE_NAME = 'wakulima-agrovet-v2';
const urlsToCache = [];

// Install service worker
self.addEventListener('install', (event) => {
  // No pre-caching to avoid addAll failures in preview
  self.skipWaiting();
});

// Network-first fetch with cache fallback (offline)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Activate: clean old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => (name !== CACHE_NAME ? caches.delete(name) : Promise.resolve()))
      );
      await self.clients.claim();
    })()
  );
});