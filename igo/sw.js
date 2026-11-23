/**
 * Service Worker (sw.js)
 * キャッシュ対策: Network-First 戦略により常に最新ファイルを配信
 */

const CACHE_NAME = 'igo-dojo-v1.0.1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/main.js',
    './js/igo-engine.js',
    './js/board-ui.js',
    './js/ai-engine.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './manual/index.html',
    './manual/manual.css'
];

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// アクティベート時に古いキャッシュを即時破棄
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

// ネットワーク優先（Network-First）戦略
// 常に最新のリソースを取得し、オフライン時のみキャッシュを使用
self.addEventListener('fetch', (event) => {
    // 開発中のリクエストやPOST等は除外
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // 成功したらキャッシュも最新に更新
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // ネットワーク切断・オフライン時のみキャッシュから返す
                return caches.match(event.request);
            })
    );
});
