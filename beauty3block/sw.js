/* Beauty 3-Block Service Worker (No-Cache / Network-First Strategy)
 * Chrome PWAインストール要件（fetchハンドラ）を満たしつつ、
 * ブラウザキャッシュによる古いファイルの残存を防ぐためキャッシュを使用しません。
 * 音声・Rangeリクエストはネイティブ再生パイプラインへ直接スルーします。
 */
const SW_VERSION = '20261124-04';

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

  // Bypass audio/video & HTTP Range requests to prevent mobile media pipeline stalls
  if (
    req.headers.has('range') ||
    req.destination === 'audio' ||
    req.destination === 'video' ||
    /\.(ogg|mp3|m4a|wav|aac)(\?|$)/i.test(req.url)
  ) {
    return;
  }

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
