/* Web BASIC 2.0 Service Worker - No-Cache Network-Only Strategy
   ChromeのPWAインストール要件を満たしつつ、ブラウザキャッシュを無効化して常に最新版を取得します。 */

self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).catch(function () {
      return fetch(event.request);
    })
  );
});
