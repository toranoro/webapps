/**
 * バックギャモン道場 (bgdojo) - Service Worker
 * sw.js
 * 
 * キャッシュ無効化 & 常時最新化戦略 (Network First)
 * + オフライン動作保証
 */

const CACHE_NAME = 'bgdojo-cache-v20261123-1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/main.js',
  './js/bg-rules.js',
  './js/board-ui.js',
  './js/ai-engine.js',
  './js/audio.js',
  './manual/index.html',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// インストール: 新しいSWを即時待機なしでアクティブ化
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Pre-cache partial failure:', err);
      });
    })
  );
});

// アクティベート: 古いバージョンのキャッシュを完全破棄
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('Purging old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// フェッチ: Network First (常に最新リソースを優先取得してキャッシュ更新)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, resClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // オフライン時のフォールバック
        return caches.match(event.request);
      })
  );
});
