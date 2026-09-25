/* Service Worker：PWA 离线缓存（stale-while-revalidate） */
const CACHE = 'mysite-v15';
// 运行时缓存（PRECACHE 之外的同源资源）条目上限：工具页/海报会随浏览不断
// 进缓存，不修剪的话老访客的存储无限增长；超出按写入顺序淘汰最旧的
const RUNTIME_MAX = 300;
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
                        caches.open(CACHE).then((c) => c.put(e.request, clone).then(() => trimRuntime(c)));
                    }
                    return res;
                })
                .catch(() => cached);
            return cached || fetched;
        })
    );
});

// PRECACHE 里的条目按路径后缀认（ Pages 部署在 /MySite/ 下、本地在根下，都能对上）；
// 以 / 结尾的是导航请求（对应 PRECACHE 里的 './'），也算预缓存
function isPrecached(requestUrl) {
    const path = new URL(requestUrl).pathname;
    if (path.endsWith('/')) return true;
    return PRECACHE.some((p) => p !== './' && path.endsWith(p.slice(2)));
}

function trimRuntime(cache) {
    return cache.keys().then((keys) => {
        const runtime = keys.filter((r) => !isPrecached(r.url));
        const drop = runtime.length - RUNTIME_MAX;
        if (drop <= 0) return;
        return Promise.all(runtime.slice(0, drop).map((r) => cache.delete(r)));
    });
}
