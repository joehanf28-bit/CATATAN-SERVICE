const CACHE_NAME = 'catatan-servis-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/storage.js',
  './js/app.js',
  './js/charts.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.ico',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install: Cache all static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use addAll with error handling for CDN
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Gagal meng-cache aset:', url, err);
          })
        )
      );
    })
  );
});

// Activate: Bersihkan cache lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Tangani offline fallback & Stale-While-Revalidate untuk aset lokal
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Jangan cache panggilan Google Apps Script / eksternal POST API
  if (req.method !== 'GET' || url.hostname.includes('script.google.com') || url.hostname.includes('googleusercontent.com')) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        // Jika offline dan tidak ada di cache, coba berikan index.html untuk navigasi
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw err;
      });

      // Kembalikan cache jika ada, sambil memperbarui di latar belakang (Stale-While-Revalidate)
      return cachedResponse || fetchPromise;
    })
  );
});
