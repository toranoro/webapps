/*
 * sw.js - 中村将棋道場 PWA Service Worker
 *
 * キャッシュ無効化の要件を徹底するため、キャッシュストレージへの保存は行わず、
 * 全てのリクエストを常にネットワークへパススルーします。
 * これにより、古いファイルが残る事故を完全に防ぎつつ、
 * Android Chrome に「インストール可能なWebアプリ（PWA）」として認識させます。
 */
self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (e) {
  e.respondWith(fetch(e.request));
});
