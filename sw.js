/* Service Worker：PWA 离线缓存（页面骨架 stale-while-revalidate + 数据文件网络优先） */
const CACHE = 'mysite-v18'; // v18: data/ 数据文件改为网络优先（3s 超时回退缓存），每日同步内容即时可见
// 运行时缓存（PRECACHE 之外的同源资源）条目上限：工具页/海报会随浏览不断
// 进缓存，不修剪的话老访客的存储无限增长；超出按写入顺序淘汰最旧的
const RUNTIME_MAX = 300;
// 数据文件网络优先：media/stars/explore/fx/日报等每日同步的内容必须即时可见，
// 网络失败或超时才回退缓存（保留离线可看）。页面骨架（HTML/CSS/JS）仍走 SWR
const DATA_NETWORK_FIRST = /\/data\/.+/;
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
    e.waitUntil((async () => {
        self.skipWaiting();
        const cache = await caches.open(CACHE);
        // 单个预缓存失败只跳过该条，别让 install 整体失败卡在旧版本；缺的运行时会补
        await Promise.all(PRECACHE.map((p) => cache.add(p).catch((err) => console.warn('预缓存跳过:', p, err))));
    })());
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

    // 数据文件：网络优先，3s 超时/失败回退缓存；成功时顺手更新缓存
    if (DATA_NETWORK_FIRST.test(url.pathname)) {
        e.respondWith((async () => {
            try {
                const fresh = await Promise.race([
                    fetch(e.request),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
                ]);
                if (fresh && fresh.status === 200) {
                    const clone = fresh.clone();
                    caches.open(CACHE)
                        .then((c) => c.put(e.request, clone).then(() => trimRuntime(c)))
                        .catch(() => { });
                    return fresh;
                }
                throw new Error('bad status');
            } catch (err) {
                const cached = await caches.match(e.request);
                if (cached) return cached;
                throw err;
            }
        })());
        return;
    }

    e.respondWith(
        caches.match(e.request).then((cached) => {
            const fetched = fetch(e.request)
                .then((res) => {
                    if (res && res.status === 200) { // 206（音频 Range）等不能进 cache.put
                        const clone = res.clone();
                        caches.open(CACHE)
                            .then((c) => c.put(e.request, clone).then(() => trimRuntime(c)))
                            .catch(() => { }); // put 失败不影响本次响应
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
