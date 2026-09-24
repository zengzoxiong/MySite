/* Service Worker：PWA 离线缓存（stale-while-revalidate） */
const CACHE = 'mysite-v14';
const PRECACHE = [
    './',
    './index.html',
    './settings.html',
    './styles.css',
    './script.js',
    './assets/appearance.js',
    './data/links.json',
    './data/tools.json',
    './data/media.json',
    './data/agent-plugins.json',
    './data/playlist.json',
    './data/stars.json',
    './manifest.json',
    './assets/icon.svg'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    // 只处理同源 GET 请求；外部资源（天气/一言/GitHub API/不蒜子/favicon）直连不缓存
    const url = new URL(e.request.url);
    if (e.request.method !== 'GET' || url.origin !== location.origin) return;

    e.respondWith(
        caches.match(e.request).then((cached) => {
            const fetched = fetch(e.request)
                .then((res) => {
                    if (res && res.ok) {
                        const clone = res.clone();
                        caches.open(CACHE).then((c) => c.put(e.request, clone));
                    }
                    return res;
                })
                .catch(() => cached);
            return cached || fetched;
        })
    );
});
