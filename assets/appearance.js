/* ===== 站点偏好：界面字体 + 首页时钟风格 + 天气城市 =====
   index.html（主站）与 settings.html（设置弹层 iframe）共用这一份清单，
   避免两个页面各写一遍导致选项不一致。

   字体全部是开源字体（SIL OFL），CSS 按需从 jsDelivr 拉取：每套字体都做过
   unicode-range 分片，浏览器只下载页面真正用到的那几个分片，不会一次拖走整套中文字库。 */
(function () {
    'use strict';

    // gcore 是国内可用节点（与播放器音频同一套 CDN 策略），失败自动往下一个节点回退
    const CDN_BASES = [
        'https://gcore.jsdelivr.net/npm/',
        'https://fastly.jsdelivr.net/npm/',
        'https://cdn.jsdelivr.net/npm/'
    ];

    // 界面字体清单：family 为空表示用系统字体（styles.css 里的 --font-system）
    const SITE_FONTS = [
        { id: 'system', name: '系统默认', family: '', css: [] },
        {
            id: 'noto-sans', name: '思源黑体', family: "'Noto Sans SC Variable'",
            css: ['@fontsource-variable/noto-sans-sc@5.2.5/index.css']
        },
        {
            id: 'noto-serif', name: '思源宋体', family: "'Noto Serif SC Variable'",
            css: ['@fontsource-variable/noto-serif-sc@5.2.5/index.css']
        },
        {
            id: 'lxgw', name: '霞鹜文楷', family: "'LXGW WenKai'",
            css: ['lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css', 'lxgw-wenkai-webfont@1.7.0/lxgwwenkai-bold.css']
        },
        {
            id: 'smiley', name: '得意黑', family: "'Smiley Sans Oblique'",
            css: ['cn-fontsource-smiley-sans-oblique-regular@1.0.1/font.css']
        },
        {
            id: 'zhuque', name: '朱雀仿宋', family: "'Zhuque Fangsong'",
            css: ['@free-fonts/zhuque-fangsong@1.0.0/zhuque-fangsong.css']
        }
    ];

    // 首页时钟风格：plain 为原始静态数字，其余五种都有卡片切换动画（样式见 styles.css 的 .hero-clock[data-style=…]）
    const CLOCK_STYLES = [
        { id: 'plain', name: '简约' },
        { id: 'flip', name: '翻页' },
        { id: 'slide', name: '上滑' },
        { id: 'stack', name: '叠卡' },
        { id: 'roll', name: '滚轮' },
        { id: 'cube', name: '立方' }
    ];

    const KEY_FONT = 'fontFamily', KEY_CLOCK = 'clockStyle', KEY_WEATHER = 'weatherCity', KEY_THEME = 'theme';
    const root = document.documentElement;
    const cssCache = new Map(); // path -> Promise，同一份 CSS 只注入一次
    const preconnected = new Set();

    // 第一次向某 CDN 节点发请求前先握手，省掉 DNS+TLS 往返；
    // 用系统字体的人根本不会走到这里，不白付连接成本
    function ensurePreconnect(base) {
        const origin = base.slice(0, base.indexOf('/npm/'));
        if (preconnected.has(origin)) return;
        preconnected.add(origin);
        ['preconnect', 'dns-prefetch'].forEach((rel) => {
            const link = document.createElement('link');
            link.rel = rel;
            link.href = origin;
            if (rel === 'preconnect') link.crossOrigin = 'anonymous'; // 字体文件走 CORS，握手要带上
            document.head.appendChild(link);
        });
    }

    // 外观模式：浅色 / 深色 / 跟随系统。默认跟随系统；旧版只存 'dark'/'light'，缺省或脏值当 system
    const THEME_MODES = [
        { id: 'light', name: '浅色' },
        { id: 'dark', name: '深色' },
        { id: 'system', name: '跟随系统' }
    ];

    function themeModeFromStorage() {
        const v = localStorage.getItem(KEY_THEME);
        return v === 'light' || v === 'dark' ? v : 'system';
    }

    // 应用外观模式，返回当前 mode；system 时按系统明暗决定
    function applyThemeMode() {
        const mode = themeModeFromStorage();
        const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        root.setAttribute('data-theme', dark ? 'dark' : 'light');
        return mode;
    }

    // 跟随系统时，系统切换明暗要实时跟上（非 system 模式不动）
    function watchSystemTheme(onChange) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => { if (themeModeFromStorage() === 'system') onChange(); };
        if (mq.addEventListener) mq.addEventListener('change', handler);
        else if (mq.addListener) mq.addListener(handler);
    }

    function fontById(id) {
        return SITE_FONTS.find(f => f.id === id) || SITE_FONTS[0];
    }

    function clockStyleById(id) {
        return CLOCK_STYLES.find(s => s.id === id) || CLOCK_STYLES[0];
    }

    // 注入一份 CDN 样式表；某个节点挂了（onerror）就换下一个节点重试
    function injectCss(path) {
        if (cssCache.has(path)) return cssCache.get(path);
        const task = new Promise((resolve) => {
            let base = 0;
            const attempt = () => {
                if (base >= CDN_BASES.length) return resolve(); // 全部失败：交给 --font-system 兜底
                const href = CDN_BASES[base++];
                ensurePreconnect(href);
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href + path;
                link.onload = () => resolve();
                link.onerror = () => { link.remove(); attempt(); };
                document.head.appendChild(link);
            };
            attempt();
        });
        cssCache.set(path, task);
        return task;
    }

    // 等字体真就绪再切过去：得意黑那套 CSS 没写 font-display，
    // 直接切会让整页文字在字体下载完前变空白（FOIT）
    function waitFontReady(family) {
        if (!document.fonts || !document.fonts.load) return Promise.resolve();
        const sample = '拾光集 0123456789 ABCxyz';
        const loading = document.fonts.load('400 16px ' + family, sample)
            .then(() => document.fonts.load('700 16px ' + family, sample))
            .catch(() => { /* 字体不可用就算了，回退系统字体 */ });
        const timeout = new Promise(r => setTimeout(r, 2500));
        return Promise.race([loading, timeout]);
    }

    // 应用界面字体：返回 Promise，调用方可据此显示「加载中」状态
    function applySiteFont(id) {
        const f = fontById(id);
        if (!f.css.length) {
            root.style.removeProperty('--font-ui');
            return Promise.resolve(f);
        }
        return Promise.all(f.css.map(injectCss))
            .then(() => waitFontReady(f.family))
            .then(() => {
                root.style.setProperty('--font-ui', f.family + ', var(--font-system)');
                return f;
            });
    }

    function applySiteFontFromStorage() {
        return applySiteFont(localStorage.getItem(KEY_FONT));
    }

    // 有效的时钟风格 id（script.js 重建时钟时用它挡掉 localStorage 里的脏值）
    function clockStyleFromStorage() {
        return clockStyleById(localStorage.getItem(KEY_CLOCK)).id;
    }

    // 天气城市：默认自动定位；自定义城市存 JSON（name/lat/lon/sub），脏值一律当自动定位
    function getWeatherCity() {
        const raw = localStorage.getItem(KEY_WEATHER);
        if (raw && raw !== 'auto') {
            try {
                const c = JSON.parse(raw);
                if (c && c.name && typeof c.lat === 'number' && typeof c.lon === 'number') {
                    return { auto: false, name: c.name, lat: c.lat, lon: c.lon, sub: c.sub || '' };
                }
            } catch (e) { /* 脏值落到 auto */ }
        }
        return { auto: true };
    }

    // value: 'auto' 或 { name, lat, lon, sub }
    function setWeatherCity(value) {
        localStorage.setItem(KEY_WEATHER, value === 'auto' ? 'auto' : JSON.stringify(value));
    }

    function weatherCityLabel() {
        const c = getWeatherCity();
        return c.auto ? '自动定位' : c.name;
    }

    // 原始存储串，供 script.js 判断城市是否真的变了（避免对象比较）
    function weatherCityRaw() {
        return localStorage.getItem(KEY_WEATHER) || 'auto';
    }

    window.SiteAppearance = {
        KEY_FONT: KEY_FONT,
        KEY_CLOCK: KEY_CLOCK,
        KEY_WEATHER: KEY_WEATHER,
        KEY_THEME: KEY_THEME,
        SITE_FONTS: SITE_FONTS,
        CLOCK_STYLES: CLOCK_STYLES,
        THEME_MODES: THEME_MODES,
        fontById: fontById,
        clockStyleById: clockStyleById,
        themeModeFromStorage: themeModeFromStorage,
        applyThemeMode: applyThemeMode,
        watchSystemTheme: watchSystemTheme,
        getWeatherCity: getWeatherCity,
        setWeatherCity: setWeatherCity,
        weatherCityLabel: weatherCityLabel,
        weatherCityRaw: weatherCityRaw,
        applySiteFont: applySiteFont,
        applySiteFontFromStorage: applySiteFontFromStorage,
        clockStyleFromStorage: clockStyleFromStorage
    };

    // 本文件在 <head> 里同步加载：顺手把已选字体的样式表先挂上，
    // 让字体分片在页面解析阶段就开始下载，别等到 DOMContentLoaded 才动手
    try {
        fontById(localStorage.getItem(KEY_FONT)).css.forEach(injectCss);
    } catch (e) { /* 隐私模式下 localStorage 可能不可用 */ }
})();
