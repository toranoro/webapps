/* Beauty 3-Block Service Worker (Network-First, Zero Stale Cache)
 * Chrome PWAインストール要件（fetchハンドラ）を満たしつつ、
 * 音声・Rangeリクエストを邪魔せず、通常のネットワーク優先で高速取得します。
 */
const SW_VERSION = '20261124-05';

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

  // Bypass audio/video & HTTP Range requests completely
  if (
    req.headers.has('range') ||
    req.destination === 'audio' ||
    req.destination === 'video' ||
    /\.(ogg|mp3|m4a|wav|aac)(\?|$)/i.test(req.url)
  ) {
    return;
  }

  // Always network-first; version query strings (?v=...) prevent stale assets
  event.respondWith(fetch(req));
});
