/* Beauty 3-Block Service Worker (No-Cache / Network-First Strategy)
 * Chrome PWAインストール要件（fetchハンドラ）を満たしつつ、
 * ブラウザキャッシュによる古いファイルの残存を防ぐためキャッシュを使用しません。
 */
const SW_VERSION = '20261124-01';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req.url, { cache: 'no-store' }).catch(() => fetch(req))
    );
    return;
  }

  event.respondWith(
    fetch(req, { cache: 'no-store' }).catch(() => fetch(req))
  );
});
