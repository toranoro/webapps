/**
 * キャッシュ無効化対応 Service Worker
 * ChromeのPWAインストール要件（fetchハンドラ保有）を満たしつつ、
 * 常にキャッシュを使わずネットワークから最新を取得します。
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request, { cache: "no-store" }).catch(() => fetch(event.request))
  );
});
