const CACHE_NAME = 'wakulima-agrovet-v2';
const RUNTIME_CACHE = 'wakulima-runtime-v2';

// Assets to cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install service worker and cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache and caching core assets');
        return cache.addAll(PRECACHE_URLS);
      })
      .catch(err => console.error('Cache install failed:', err))
  );
  self.skipWaiting();
});

// Activate and clean up old caches
self.addEventListener('activate', (event) => {
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!currentCaches.includes(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy: Cache first for assets, Network first for API
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    // For Supabase API calls, try network first, fallback to cache
    if (url.hostname.includes('supabase.co')) {
      event.respondWith(
        fetch(request)
          .then(response => {
            // Don't cache failed responses
            if (response.status === 200) {
              const responseClone = response.clone();
              caches.open(RUNTIME_CACHE).then(cache => {
                cache.put(request, responseClone);
              });
            }
            return response;
          })
          .catch(() => {
            return caches.match(request).then(cached => {
              return cached || new Response('Offline - No cached data available', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            });
          })
      );
      return;
    }
    // Let other cross-origin requests pass through
    return;
  }

  // For same-origin requests (app assets)
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version immediately
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(request).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone and cache for future use
          const responseToCache = response.clone();
          
          caches.open(RUNTIME_CACHE).then((cache) => {
            // Cache JS, CSS, images, fonts
            if (request.method === 'GET' && 
                (request.url.endsWith('.js') || 
                 request.url.endsWith('.css') || 
                 request.url.endsWith('.woff2') ||
                 request.url.endsWith('.woff') ||
                 request.url.endsWith('.png') ||
                 request.url.endsWith('.jpg') ||
                 request.url.endsWith('.svg'))) {
              cache.put(request, responseToCache);
            }
          });

          return response;
        }).catch((error) => {
          console.error('Fetch failed:', error);
          // Return offline page or fallback
          return caches.match('/').then(fallback => {
            return fallback || new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
        });
      })
  );
});
