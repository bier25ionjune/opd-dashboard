// BRH OPD Dashboard - Service Worker (PWA)
// Optimized for zero impact on Supabase API queries

const CACHE_NAME = 'brh-opd-v1.1.0';

const STATIC_ASSETS = [
  './',
  './index.html',
  './quality.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.svg',
  './icons/favicon-32.png',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800;900&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/apexcharts@3.49.1',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// Install Event
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some assets failed to precache:', err);
      });
    })
  );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Critical Strategy:
// 1. SUPABASE API REQUESTS: ALWAYS Network-First (or Network-Only)
//    Ensures zero impact on realtime medical database queries!
// 2. Static Assets: Cache-First / Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // If request is to Supabase (Database / Auth / Storage), bypass cache to keep data 100% accurate
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch((err) => {
        console.error('[SW] Supabase offline network failure:', err);
        return new Response(JSON.stringify({ error: 'Network unavailable. Supabase offline.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Non-GET requests (e.g. POST, PUT, DELETE) -> Network only
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML navigation requests: Network-First with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  // Static Assets: Cache-First, then network update
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache for next time (Stale-While-Revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        return networkResponse;
      }).catch(() => {
        // Fallback for images if needed
        return null;
      });
    })
  );
});
