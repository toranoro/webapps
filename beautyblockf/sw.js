/**
 * sw.js - Service Worker for BeautyBlock
 * ネットワーク優先（Network-First）戦略により、常に最新版を即時反映しキャッシュ事故を防止。
 * オフライン時のみキャッシュフォールバック。
 */
const CACHE_NAME = 'beautyblock-v' + Date.now();

const ASSETS_TO_PRECACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/audio.js',
    './js/particles.js',
    './js/tetris.js',
    './js/input.js',
    './js/main.js',
    './manifest.json',
    './icon.svg'
];

self.addEventListener('install', (event) => {
    // 古いSWを待たずに即時アクティブ化
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_PRECACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    // 古いキャッシュをすべてパージ
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

self.addEventListener('fetch', (event) => {
    // ネットワークファースト（キャッシュ事故防止・常に最新を優先取得）
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // 成功したらキャッシュ更新
                if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
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
