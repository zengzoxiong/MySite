/* Service Worker：PWA 离线缓存（数据文件与页面导航网络优先，其余骨架 stale-while-revalidate） */
const CACHE = 'mysite-v21'; // v21: script.js 模块化拆分（js/common|settings|cmdk.js 进预缓存）+ 工具离线包（TOOLS_CACHE 随 tools.json 的 offline 标记同步）
// 工具离线包缓存：独立于主 CACHE，activate 时白名单保留、不随版本 bump 清空。
// 条目来自 data/tools.json 里 offline:true 的工具页（scripts/check_offline.py 维护标记），
// 每次激活只补缺不重复下载，页面内容更新由访问时的 SWR 自愈；标记页离线导航
// 由 fetch 分支失败后的 caches.match 兜底（它搜全部缓存，fetch 分支零改动）。
// 注意：老访客新增 offline 工具要等下一次 sw.js 变更激活才进包（新访客即得）
const TOOLS_CACHE = 'mysite-tools-v1';
// 离线包附加资源：标记工具的本地 vendor 小库（tools.json 不含 vendor 信息，qr-generator 用）
const TOOLS_CACHE_EXTRA = ['assets/vendor/qrcodejs/qrcode.min.js'];
// 运行时缓存（PRECACHE 之外的同源资源）条目上限：工具页/海报会随浏览不断
// 进缓存，不修剪的话老访客的存储无限增长；超出按写入顺序淘汰最旧的
const RUNTIME_MAX = 300;
// 网络优先：data/ 数据文件（每日同步内容即时可见）与页面导航（改版即达）
// 都先敲网络，3s 超时或失败才回退缓存（保留离线可看）；CSS/JS 等其余骨架仍走 SWR
const NETWORK_FIRST_RE = /\/data\/.+/;
const PRECACHE = [
    './',
    './index.html',
    './settings.html',
    './styles.css',
    './script.js',
    './js/common.js',
    './js/settings.js',
    './js/cmdk.js',
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
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== TOOLS_CACHE).map((k) => caches.delete(k))))
            .then(toolsOfflineSync)
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    // 只处理同源 GET 请求；外部资源（天气/一言/GitHub API/GoatCounter/favicon）直连不缓存
    const url = new URL(e.request.url);
    if (e.request.method !== 'GET' || url.origin !== location.origin) return;

    // 网络优先（数据文件 + 页面导航）：3s 超时/失败回退缓存；成功时顺手更新缓存
    if (NETWORK_FIRST_RE.test(url.pathname) || e.request.mode === 'navigate') {
        e.respondWith((async () => {
            try {
                const fresh = await Promise.race([
                    fetch(e.request, { cache: 'no-cache' }),
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
            const fetched = fetch(e.request, { cache: 'no-cache' })
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

// PRECACHE 里的条目按路径后缀认（Pages 部署在 /MySite/ 下、本地在根下，都能对上）；
// './'（部署根导航）按 registration.scope 的路径认——不能放宽到「以 / 结尾就算」，
// 否则工具页等任意目录式 URL 一旦进运行时缓存就永久躲过 LRU 淘汰
function isPrecached(requestUrl) {
    const path = new URL(requestUrl).pathname;
    if (path === new URL(self.registration.scope).pathname) return true;
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

// 工具离线包同步：读 tools.json 取 offline:true 条目，补缺缓存并删除已撤销标记的旧条目。
// 任一失败只跳过（离线激活、tools.json 拉不到都不阻断 SW 激活），下次激活再补
async function toolsOfflineSync() {
    let manifest;
    try {
        const res = await fetch('./data/tools.json', { cache: 'no-cache' });
        manifest = await res.json();
    } catch (err) {
        manifest = await caches.match('./data/tools.json').then((c) => (c ? c.json() : null)).catch(() => null);
    }
    if (!manifest || !Array.isArray(manifest.tools)) return;
    const base = new URL(self.registration.scope);
    const urls = new Set(TOOLS_CACHE_EXTRA.map((p) => new URL(p, base).href));
    for (const t of manifest.tools) {
        if (t.offline) urls.add(new URL(`tools/${t.path.split('/')[0]}/app.html`, base).href);
    }
    const cache = await caches.open(TOOLS_CACHE);
    await Promise.all([...urls].map(async (u) => {
        if (await cache.match(u)) return; // 已缓存只跳过
        await cache.add(u).catch((err) => console.warn('离线包补缺跳过:', u, err));
    }));
    // 对账：删除清单外的旧条目（工具下线/撤销离线标记）
    const keys = await cache.keys();
    await Promise.all(keys.filter((r) => !urls.has(r.url)).map((r) => cache.delete(r)));
}
