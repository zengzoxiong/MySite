// 全局状态
let allLinks = [];
let linkHealth = {}; // 死链体检结果（工作流每周写 data/link-health.json），失效链接出角标
let allTools = [];
let mediaData = { types: [], items: [] };
let pluginsData = { skills: { groups: [] }, mcps: [] };
let starsData = { updated: '', repos: [] };
let starsSort = 'date-desc'; // 星标仓库排序
let currentCategory = '';
let currentToolCategory = '';
let currentMediaType = '番剧';
let currentSort = 'rating-desc'; // 六向排序，见 SORT_OPTIONS
let currentView = 'home'; // 'home' | 'links' | 'tools' | 'media' | 'skills' | 'search'
let currentPluginCat = '';
let currentStatusFilter = ''; // '' = 全部
let searchFrom = 'home'; // 全域搜索前所在视图，清空搜索后恢复
const SORT_OPTIONS = [
    ['rating-desc', '按评分（高 → 低）'],
    ['rating-asc', '按评分（低 → 高）'],
    ['release-desc', '按上映时间（新 → 旧）'],
    ['release-asc', '按上映时间（旧 → 新）'],
    ['title-asc', '按名称 A-Z'],
    ['title-desc', '按名称 Z-A']
];

// 影视类型对应的渐变占位海报
const TYPE_GRADIENTS = {
    '番剧': 'linear-gradient(160deg, #a855f7, #6366f1)',
    '电影': 'linear-gradient(160deg, #f59e0b, #ef4444)',
    '综艺': 'linear-gradient(160deg, #10b981, #0ea5e9)',
    '电视剧': 'linear-gradient(160deg, #3b82f6, #8b5cf6)',
    '默认': 'linear-gradient(160deg, #64748b, #334155)'
};

// DOM 元素
const sidebar = document.getElementById('sidebar');
const searchInput = document.getElementById('searchInput');
const sidebarTools = document.getElementById('sidebarTools');
const sidebarCategories = document.getElementById('sidebarCategories');
const linksGrid = document.getElementById('linksGrid');
const emptyState = document.getElementById('emptyState');
const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const dashboard = document.getElementById('dashboard');
const homeNav = document.getElementById('homeNav');
const mediaGrid = document.getElementById('mediaGrid');
const sidebarMedia = document.getElementById('sidebarMedia');
const sidebarPlugin = document.getElementById('sidebarPlugin');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsBackdrop = document.getElementById('settingsBackdrop');
const settingsClose = document.getElementById('settingsClose');
const cmdk = document.getElementById('cmdk');
const cmdkInput = document.getElementById('cmdkInput');
const cmdkList = document.getElementById('cmdkList');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadLinks();
    initTheme();
    initAnimSetting();
    applyFontFromStorage();
    initSettingsModal();
    initPalette();
    initMusicPlayer();
    initSidebar();
    initEventListeners();
    initDashboard();
});

// ===== 首页仪表盘 =====
function initDashboard() {
    homeNav.classList.add('active');
    initClock();
    initWeather();
    initQuote();
    initCheckin();
    initProgress();
    initGitHubStats();
    initTodo();
    initSectionToggles();

    // 点击天气区域手动刷新
    const heroWeather = document.getElementById('heroWeather');
    heroWeather.addEventListener('click', () => initWeather(true));
    heroWeather.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            initWeather(true);
        }
    });
}

// --- 时钟（6 种风格，清单在 assets/appearance.js 的 CLOCK_STYLES）---
const CLOCK_WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
let clockEl = null;
let clockDateEl = null;
let clockStyle = '';
let clockDigits = []; // 6 个数字单元，与 HHMMSS 一一对应
let clockTimer = 0;

function initClock() {
    clockEl = document.getElementById('clockTime');
    clockDateEl = document.getElementById('clockDate');
    applyClockStyle();
    if (!clockTimer) clockTimer = setInterval(clockTick, 1000);
}

// 按 localStorage.clockStyle 重建数字单元；风格没变时只刷一次时间
function applyClockStyle() {
    if (!clockEl) return;
    const style = window.SiteAppearance ? SiteAppearance.clockStyleFromStorage() : 'plain';
    if (style === clockStyle) { clockTick(); return; }
    clockDigits.forEach(c => { clearTimeout(c._ckTimer); c._ckDone = null; }); // 拆掉旧单元上的兜底定时器
    clockStyle = style;
    clockEl.dataset.style = style;
    clockDigits = [];
    if (style === 'plain') {
        clockEl.textContent = '--:--:--';
    } else {
        clockEl.textContent = '';
        const frag = document.createDocumentFragment();
        for (let i = 0; i < 6; i++) {
            if (i === 2 || i === 4) frag.appendChild(buildClockSep());
            const cell = buildClockCell(style);
            frag.appendChild(cell);
            clockDigits.push(cell);
        }
        clockEl.appendChild(frag);
    }
    clockTick();
}

function buildClockSep() {
    const sep = document.createElement('span');
    sep.className = 'ck-sep';
    sep.textContent = ':';
    return sep;
}

function buildClockCell(style) {
    const cell = document.createElement('span');
    cell.className = 'ck-cell';
    if (style === 'roll') {
        const reel = document.createElement('span');
        reel.className = 'ck-reel';
        for (let i = 0; i <= 10; i++) { // 0-9 之后多补一个 0，跨 9→0 才能继续往下滚
            const item = document.createElement('i');
            item.textContent = String(i % 10);
            reel.appendChild(item);
        }
        cell.appendChild(reel);
    } else {
        const a = document.createElement('span');
        a.className = 'ck-a';
        const b = document.createElement('span');
        b.className = 'ck-b';
        cell.appendChild(a);
        cell.appendChild(b);
        if (style === 'flip') {
            // 分页翻页钟的两片半页：上片翻走旧值上半、下片落下新值下半
            const top = document.createElement('span');
            top.className = 'ff-top';
            top.appendChild(document.createElement('i'));
            const bot = document.createElement('span');
            bot.className = 'ff-bot';
            bot.appendChild(document.createElement('i'));
            cell.appendChild(top);
            cell.appendChild(bot);
        }
    }
    return cell;
}

function clockTick() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const t = pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    const shown = `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4)}`;
    if (clockStyle === 'plain') {
        clockEl.textContent = shown;
    } else {
        for (let i = 0; i < clockDigits.length; i++) clockSetDigit(clockDigits[i], t[i]);
    }
    // 卡片风格下 textContent 是新旧两层叠出来的（复制会拿到重复数字），统一用 aria-label 报时
    clockEl.setAttribute('aria-label', shown);
    clockDateEl.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 星期${CLOCK_WEEKDAYS[now.getDay()]}`;
}

// 关掉动画（或系统要求减少动效）时必须走瞬时替换：
// 此时 animationend / transitionend 不会触发，单元会永远卡在动画中间态
function clockAnimOff() {
    return document.body.classList.contains('no-anim')
        || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clockSetDigit(cell, ch) {
    if (!cell || cell.dataset.v === ch) return; // 没变的位不动，免得每秒六位一起闪
    const prev = cell.dataset.v;
    cell.dataset.v = ch;
    const instant = prev === undefined || clockAnimOff();
    if (clockStyle === 'roll') { clockRollTo(cell, ch, prev, instant); return; }

    const a = cell.children[0], b = cell.children[1];
    if (cell._ckDone) cell._ckDone(); // 上一次动画没落定就先落定，别让两层叠在一起
    if (instant) { a.textContent = ch; b.textContent = ch; return; }
    b.textContent = ch;
    if (clockStyle === 'flip') {
        cell.children[2].firstChild.textContent = a.textContent; // 上片=旧值上半
        cell.children[3].firstChild.textContent = ch;            // 下片=新值下半
    }
    void cell.offsetWidth; // 与上面 _ckDone 移除 .anim 之间隔一次回流，同名动画否则不会重新起跑
    cell.classList.add('anim');
    // animationend 必须挂在真正带动画的元素上：翻页的两段在翻片上，.ck-b 只有
    // clip-path、永远等不到事件，只能靠 1600ms 兜底——.anim 会跨到下一秒，
    // 移除再加回在同一帧内完成导致动画不重播、数字瞬变
    const endEl = clockStyle === 'flip' ? cell.children[3] : b;
    const done = () => {
        clearTimeout(cell._ckTimer);
        endEl.removeEventListener('animationend', done);
        cell.classList.remove('anim');
        a.textContent = ch;
        cell._ckDone = null;
    };
    cell._ckDone = done;
    endEl.addEventListener('animationend', done, { once: true });
    cell._ckTimer = setTimeout(done, 1600); // 后台标签页动画被节流时的兜底
}

function clockRollTo(cell, ch, prev, instant) {
    const reel = cell.children[0];
    const n = reel.children.length; // 11
    let idx = Number(ch);
    if (!instant && prev === '9' && ch === '0') idx = n - 1; // 借末尾那份 0 继续向下滚
    if (instant) {
        reel.classList.add('snap');
        reel.style.transform = `translateY(${-100 * idx / n}%)`;
        void reel.offsetWidth;
        reel.classList.remove('snap');
        return;
    }
    reel.style.transform = `translateY(${-100 * idx / n}%)`;
    if (idx !== n - 1) return;
    // 滚完补位的那个 0 之后瞬移回第一个 0（无过渡），下一轮才能接着往下滚
    const reset = () => {
        clearTimeout(cell._ckTimer);
        reel.removeEventListener('transitionend', reset);
        reel.classList.add('snap');
        reel.style.transform = 'translateY(0)';
        void reel.offsetWidth;
        reel.classList.remove('snap');
        cell._ckDone = null;
    };
    cell._ckDone = reset;
    reel.addEventListener('transitionend', reset, { once: true });
    cell._ckTimer = setTimeout(reset, 1600);
}

// --- 天气（Open-Meteo 免费接口，无需密钥；城市在设置里选，默认西安，也可自动定位） ---
const WMO_CODES = {
    0: ['晴', '☀️'], 1: ['多云转晴', '🌤️'], 2: ['多云', '⛅'], 3: ['阴', '☁️'],
    45: ['雾', '🌫️'], 48: ['雾凇', '🌫️'],
    51: ['小毛毛雨', '🌦️'], 53: ['毛毛雨', '🌦️'], 55: ['大毛毛雨', '🌧️'],
    56: ['冻毛毛雨', '🌧️'], 57: ['冻毛毛雨', '🌧️'],
    61: ['小雨', '🌧️'], 63: ['中雨', '🌧️'], 65: ['大雨', '🌧️'],
    66: ['冻雨', '🌧️'], 67: ['冻雨', '🌧️'],
    71: ['小雪', '🌨️'], 73: ['中雪', '🌨️'], 75: ['大雪', '❄️'], 77: ['雪粒', '🌨️'],
    80: ['小阵雨', '🌦️'], 81: ['阵雨', '🌦️'], 82: ['强阵雨', '⛈️'],
    85: ['小阵雪', '🌨️'], 86: ['阵雪', '🌨️'],
    95: ['雷阵雨', '⛈️'], 96: ['雷阵雨伴冰雹', '⛈️'], 99: ['雷阵雨伴冰雹', '⛈️']
};

const FALLBACK_CITY = { name: '西安', lat: 34.34, lon: 108.94 }; // 自动定位拿不到坐标时的兜底
let lastWeatherRaw = ''; // 最近一次发起查询的城市存储串，设置变更时据此判断要不要重拉

// 自动定位：拿设备坐标；拒绝授权 / 不支持 / 超时都 reject，由调用方回退西安
function locatePosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('浏览器不支持定位'));
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            reject,
            { timeout: 8000, maximumAge: 10 * 60 * 1000 } // 10 分钟内的定位缓存够用
        );
    });
}

// 反向地理编码：把定位坐标换成真实地名。Open-Meteo 只有正向搜索，
// 反向走 BigDataCloud 客户端接口（免费免密钥、支持 CORS，zh-Hans 出简体）；
// locality 即最低一级的市/县（区），不拼省市全链。按坐标圆整缓存并落 localStorage，
// 冷启动同坐标不重复敲接口
const reverseGeoCache = new Map();
async function reversePlaceName(lat, lon) {
    const key = `reverseGeo:${lat.toFixed(2)},${lon.toFixed(2)}`;
    if (reverseGeoCache.has(key)) return reverseGeoCache.get(key);
    let name = '';
    try { name = localStorage.getItem(key) || ''; } catch (e) { /* 隐私模式忽略 */ }
    if (!name) {
        try {
            const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh-Hans`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const d = await res.json();
            name = d.locality || d.city || d.principalSubdivision || '';
            // 去掉市/县/区后缀，与城市搜索的无后缀风格对齐；自治县/自治旗与单字名保留
            if (name.length >= 3 && /[市县区]$/.test(name) && !name.endsWith('自治县') && !name.endsWith('自治旗')) name = name.slice(0, -1);
            try { localStorage.setItem(key, name); } catch (e) { /* 忽略 */ }
        } catch (e) {
            console.error('反向地理编码失败:', e);
        }
    }
    reverseGeoCache.set(key, name);
    return name;
}

// 天气快照：坐标+地名+渲染结果落 localStorage（10 分钟 TTL）。冷启动先铺快照
// 再决定是否敲接口，定位弹窗 / 接口慢都不再拖首屏，外部请求也减半
const WEATHER_TTL = 10 * 60 * 1000;
function readWeatherSnap() {
    try { return JSON.parse(localStorage.weatherSnap || 'null'); } catch (e) { return null; }
}
function writeWeatherSnap(snap) {
    try { localStorage.weatherSnap = JSON.stringify(snap); } catch (e) { /* 忽略 */ }
}

function paintWeather(w) {
    const heroWeather = document.getElementById('heroWeather');
    heroWeather.title = w.label ? `点击刷新${w.label}天气` : '点击刷新天气';
    heroWeather.setAttribute('aria-label', heroWeather.title);
    document.getElementById('weatherIcon').textContent = w.icon;
    document.getElementById('weatherTemp').textContent = w.temp;
    document.getElementById('weatherDesc').textContent = w.desc;
    document.getElementById('weatherExtra').textContent = w.extra;
}

async function initWeather(manual = false) {
    const city = window.SiteAppearance ? SiteAppearance.getWeatherCity() : { auto: true };
    lastWeatherRaw = window.SiteAppearance ? SiteAppearance.weatherCityRaw() : 'auto';

    const snap = readWeatherSnap();
    const snapMine = !!(snap && snap.raw === lastWeatherRaw);
    const ctx = { manual, painted: snapMine };
    // 新鲜快照直接用，一次外部请求都不发；过期快照先铺上当占位，下面继续拉新
    if (snapMine) paintWeather(snap);
    if (snapMine && !manual && Date.now() - snap.ts < WEATHER_TTL) return;

    if (manual) document.getElementById('weatherIcon').classList.add('refreshing');
    try {
        await fetchWeather(city, ctx);
    } finally {
        document.getElementById('weatherIcon').classList.remove('refreshing');
    }
}

// 拉一次天气并渲染+落快照。auto 时定位不阻塞首屏：有上次坐标就直接用，
// 没有则给定位 1.5s 预算、超了先用西安；定位晚到且坐标确实变了再后台校正
async function fetchWeather(city, ctx) {
    let lat, lon, labelP;
    if (!city.auto) {
        lat = city.lat;
        lon = city.lon;
        labelP = Promise.resolve(city.name);
    } else {
        const snap = readWeatherSnap();
        const geo = locatePosition().catch(() => null);
        if (snap && snap.auto) {
            lat = snap.lat;
            lon = snap.lon;
        } else {
            const pos = await Promise.race([geo, new Promise(r => setTimeout(r, 1500))]);
            if (pos) { lat = pos.lat; lon = pos.lon; }
            else { lat = FALLBACK_CITY.lat; lon = FALLBACK_CITY.lon; }
        }
        labelP = reversePlaceName(lat, lon);
        // 定位比预算晚到、且和已用坐标不是一处时，后台补一次校正（不 await）
        geo.then(pos => {
            if (pos && (Math.abs(pos.lat - lat) > 0.05 || Math.abs(pos.lon - lon) > 0.05)) {
                fetchWeatherAt(pos.lat, pos.lon, reversePlaceName(pos.lat, pos.lon), true, { manual: false, painted: true });
            }
        });
    }
    await fetchWeatherAt(lat, lon, labelP, city.auto, ctx);
}

// 天气与反向地名并行：地名只影响标题文案，不该让天气等它
async function fetchWeatherAt(lat, lon, labelP, fromAuto, ctx) {
    const [w, l] = await Promise.allSettled([fetchWeatherData(lat, lon), labelP]);
    const label = l.status === 'fulfilled' ? l.value : '';
    if (w.status !== 'fulfilled') {
        if (!ctx.painted && !ctx.manual) {
            document.getElementById('weatherDesc').textContent = label ? `${label} · 天气获取失败` : '天气获取失败';
        }
        console.error('天气加载失败:', w.reason);
        return;
    }
    const { icon, temp, extra, text } = w.value;
    const desc = label ? `${label} · ${text}` : text;
    paintWeather({ icon, temp, desc, extra, label });
    writeWeatherSnap({ raw: lastWeatherRaw, auto: fromAuto, lat, lon, label, icon, temp, desc, extra, ts: Date.now() });
}

async function fetchWeatherData(lat, lon) {
    // timezone=auto 让 Open-Meteo 按坐标推当地时区，preset / 定位都适用
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m' +
        '&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const cur = data.current;
    const [text, icon] = WMO_CODES[cur.weather_code] || ['未知', '🌡️'];
    const daily = data.daily;
    return {
        text, icon,
        temp: `${Math.round(cur.temperature_2m)}°C`,
        extra: `今日 ${Math.round(daily.temperature_2m_min[0])}° ~ ${Math.round(daily.temperature_2m_max[0])}° · 湿度 ${cur.relative_humidity_2m}% · 风速 ${Math.round(cur.wind_speed_10m)}km/h`
    };
}

// --- 今日一言（Hitokoto 免费接口） ---
async function loadQuote() {
    const quoteText = document.getElementById('quoteText');
    const quoteMeta = document.getElementById('quoteMeta');
    try {
        // _t nonce 破缓存：hitokoto 对同 IP 短窗缓存，不加时「换一句」会拿回同一句
        const res = await fetch(`https://v1.hitokoto.cn/?c=i&c=k&c=d&max_length=42&_t=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        quoteText.textContent = data.hitokoto;
        quoteMeta.textContent = data.from ? `—— ${data.from}` : '';
    } catch (e) {
        quoteText.textContent = '生活明朗，万物可爱。';
        quoteMeta.textContent = '—— 每日一句';
        console.error('一言加载失败:', e);
    }
}

function initQuote() {
    // 一言要签到后才解锁：未签到不敲 hitokoto，省一次外部请求
    if (isCheckedInToday()) loadQuote();
    const btn = document.getElementById('quoteRefresh');
    const corner = document.querySelector('.quote-corner');
    btn.addEventListener('click', () => {
        if (corner.classList.contains('switching')) return;
        btn.classList.remove('spinning');
        void btn.offsetWidth; // 重置旋转动画
        btn.classList.add('spinning');
        corner.classList.add('switching');
        setTimeout(async () => {
            await loadQuote();
            corner.classList.remove('switching');
        }, 250);
    });
}

// ===== 首页签到（拾光签） =====
// 一言卡片在未签到时是封签面板：签到才解锁今日一言，并弹出一张长方形签到符
// （每日吉凶 + 当日信息 + 一句话 + 每日生成图），可保存/复制为 PNG。
// 签面内容全部由日期种子决定：同一天任何时刻抽到同一支签。

// 农历表 1900-2100：bit4-16 为十二个月大小、bit0-3 为闰月号、bit16 为闰月大小。
// 锚点自检过：2026-09-25=八月十五、2026-02-17 与 2025-01-29=正月初一
const LUNAR_INFO = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
    0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x0d0b6, 0x0d250, 0x0d520, 0x0dd45,
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
    0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
    0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
    0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
    0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
    0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
    0x0d520
];
const LUNAR_MONTH_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const LUNAR_DAY_CN = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

function lunarLeapMonth(y) { return LUNAR_INFO[y - 1900] & 0xf; }
function lunarLeapDays(y) { return lunarLeapMonth(y) ? ((LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29) : 0; }
function lunarMonthDays(y, m) { return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29; }
function lunarYearDays(y) {
    let s = 348;
    for (let i = 0x8000; i > 0x8; i >>= 1) s += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
    return s + lunarLeapDays(y);
}

function solarToLunar(y, m, d) {
    let offset = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1900, 0, 31)) / 86400000);
    let ly = 1900;
    for (; ly < 2101 && offset >= lunarYearDays(ly); ly++) offset -= lunarYearDays(ly);
    const leap = lunarLeapMonth(ly);
    let lm = 1, isLeap = false;
    for (; lm <= 12; lm++) {
        let days;
        if (leap > 0 && lm === leap + 1 && !isLeap) { lm--; isLeap = true; days = lunarLeapDays(ly); }
        else days = lunarMonthDays(ly, lm);
        if (isLeap && lm === leap + 1) isLeap = false;
        if (offset < days) break;
        offset -= days;
    }
    return {
        year: ly, month: lm, day: offset + 1, isLeap,
        monthCn: (isLeap ? '闰' : '') + LUNAR_MONTH_CN[lm - 1] + '月',
        dayCn: LUNAR_DAY_CN[offset]
    };
}

function julianDayNumber(y, m, d) {
    const a = Math.floor((14 - m) / 12), y2 = y + 4800 - a, m2 = m + 12 * a - 3;
    return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4)
        - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
}

// 干支日：以 2026-09-25=壬寅日（六十甲子第 38，0 基）为锚定偏移
const DAY_GZ_OFFSET = ((38 - julianDayNumber(2026, 9, 25) % 60) % 60 + 60) % 60;
function dayGanzhi(y, m, d) {
    const i = (julianDayNumber(y, m, d) + DAY_GZ_OFFSET) % 60;
    return GAN[i % 10] + ZHI[i % 12];
}
function yearGanzhi(ly) { return GAN[(ly - 4) % 10] + ZHI[(ly - 4) % 12]; }

// 节日：农历优先，再补公历
const LUNAR_FESTIVALS = { '1-1': '春节', '1-15': '元宵', '5-5': '端午', '7-7': '七夕', '8-15': '中秋', '9-9': '重阳', '12-8': '腊八', '12-30': '除夕' };
const SOLAR_FESTIVALS = { '1-1': '元旦', '2-14': '情人节', '5-1': '劳动节', '6-1': '儿童节', '10-1': '国庆节', '12-25': '圣诞' };

// 种子随机：FNV-1a 出种子，mulberry32 出序列，同一天全球同签
function fnvSeed(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
}
function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// 吉凶权重合计 100：大吉 16 / 中吉 20 / 小吉 16 / 吉 16 / 末吉 12 / 凶 12 / 大凶 8
const LUCK_POOL = [['大吉', 16], ['中吉', 20], ['小吉', 16], ['吉', 16], ['末吉', 12], ['凶', 12], ['大凶', 8]];
const SIGN_SENTENCES = [
    '把今天过成值得回忆的一天。', '慢一点，比较快。', '心之所向，素履以往。', '日拱一卒，功不唐捐。',
    '万物有灵，且美。', '留白处自有风景。', '把小事做稳，就是大事。', '风会记得每一朵花的香。',
    '不急不躁，日子自有答案。', '今天也值得被认真对待。', '行到水穷处，坐看云起时。', '把期待降低，把依赖变少。',
    '光落在你脸上，可爱一如往常。', '山高水长，怕什么来不及。', '一寸光阴一寸金。', '温柔是世间最强的力量。',
    '别慌，月亮也正在大海某处迷茫。', '把每一天当作作品来打磨。', '静水流深，仓促的人看不见。', '好运藏在努力里。',
    '今日事，今日毕。', '低头一步是人间，抬头三尺有神明。', '慢慢来，谁都有一个努力的过程。', '天高地迥，觉宇宙之无穷。'
];

function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isCheckedInToday() {
    try { return !!localStorage.getItem('checkin:' + todayKey()); } catch (e) { return false; }
}

function buildTodayFortune() {
    const now = new Date();
    const key = todayKey(now);
    const rnd = mulberry32(fnvSeed('shiguang-sign-' + key));
    let roll = rnd() * 100, luck = LUCK_POOL[LUCK_POOL.length - 1][0];
    for (const [name, w] of LUCK_POOL) { if (roll < w) { luck = name; break; } roll -= w; }
    const sentence = SIGN_SENTENCES[Math.floor(rnd() * SIGN_SENTENCES.length)];
    const lunar = solarToLunar(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const festival = LUNAR_FESTIVALS[`${lunar.month}-${lunar.day}`] || SOLAR_FESTIVALS[`${now.getMonth() + 1}-${now.getDate()}`] || '';
    return {
        key, luck, sentence, festival,
        year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(),
        lunarText: `${lunar.monthCn}${lunar.dayCn}`,
        dateText: `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`,
        weekday: `星期${CLOCK_WEEKDAYS[now.getDay()]}`
    };
}

// 连续签到：昨天签过就 +1，断了重计
function peekCheckinStreak() {
    const today = todayKey();
    const last = localStorage.getItem('checkinLast');
    const stored = Number(localStorage.getItem('checkinStreak') || 0);
    if (last === today) return stored || 1;
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    return last === todayKey(yest) ? stored + 1 : 1;
}
function recordCheckin() {
    const streak = peekCheckinStreak();
    const today = todayKey();
    try {
        localStorage.setItem('checkin:' + today, String(Date.now()));
        localStorage.setItem('checkinLast', today);
        localStorage.setItem('checkinStreak', String(streak));
    } catch (e) { /* 隐私模式下签不了也照样出签，只是不记 */ }
    return streak;
}

// --- 签到符画布：380×680 竖长方形，导出按 2x 分辨率 ---
// 画布是 artwork，配色自成一套（纸/墨/朱砂），不跟站点主题变量走，但明暗各一套
function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// 竖排标点：横排标点竖写时换竖式字形，免得歪在字面中间
const VERTICAL_PUNCT = { '，': '︐', '。': '︒', '、': '︑', '！': '︕', '？': '︖', '：': '︓', '；': '︔', '（': '︵', '）': '︶' };

// 竖写一列：自上而下；调用前需设好 textAlign=center / textBaseline=top。返回末字底 y
function drawVertical(ctx, text, x, y, advance, maxChars) {
    let cy = y;
    let n = 0;
    for (const ch of text) {
        if (maxChars && n >= maxChars) break;
        ctx.fillText(VERTICAL_PUNCT[ch] || ch, x, cy);
        cy += advance;
        n++;
    }
    return cy;
}

// 每日生成图配色盘：六套手工调的 HSL（暗色基调），亮色整体提亮降饱；种子选一套，
// 保证任何一天抽到的都是协调色，而不是随机 hue 碰运气
const SCENE_PALETTES = [
    { sky: [[222, 45, 16], [268, 40, 34], [18, 72, 58]], ridge: [262, 30], sun: [38, 92, 74], stars: true },  // 暮紫
    { sky: [[198, 58, 14], [186, 48, 34], [42, 82, 62]], ridge: [204, 32], sun: [48, 95, 78], stars: false }, // 海日
    { sky: [[340, 44, 14], [352, 50, 34], [22, 74, 56]], ridge: [348, 30], sun: [32, 92, 72], stars: true },  // 绛霞
    { sky: [[152, 34, 12], [162, 38, 30], [48, 62, 54]], ridge: [168, 26], sun: [52, 82, 74], stars: false }, // 松烟
    { sky: [[215, 50, 10], [224, 44, 26], [206, 34, 46]], ridge: [214, 26], sun: [46, 60, 82], stars: true }, // 月夜
    { sky: [[268, 40, 13], [288, 42, 30], [322, 52, 52]], ridge: [282, 28], sun: [40, 92, 78], stars: true }   // 紫夜
];
const hsl = (h, s, l, a) => (a === undefined ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`);

// 平滑山脊：种子控制点 + 二次贝塞尔过中点，比硬折线柔和
function ridgePath(ctx, W, baseY, amp, rnd, bottomY) {
    const n = 4 + Math.floor(rnd() * 3);
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push([W * i / n, baseY - rnd() * amp]);
    ctx.beginPath();
    ctx.moveTo(0, bottomY);
    ctx.lineTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2;
        const my = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    ctx.lineTo(W, pts[pts.length - 1][1]);
    ctx.lineTo(W, bottomY);
    ctx.closePath();
}

// 每日生成图（网易云日签海报式全幅背景）：种子选配色盘与构图（山/湖），
// 同一天同一张图；上下再压暗角渐变保白字可读
function drawTalismanScene(ctx, W, H, rnd, dark) {
    const p = SCENE_PALETTES[Math.floor(rnd() * SCENE_PALETTES.length)];
    const lift = dark ? 0 : 24; // 亮色提亮
    const dsat = dark ? 0 : -8; // 亮色稍降饱
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    p.sky.forEach(([h, s, l], i) => {
        const stop = i === 2 ? 1 : i * 0.5 + 0.05;
        sky.addColorStop(stop, hsl(h, Math.max(s + dsat, 20), Math.min(l + lift, 90)));
    });
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // 星点：大小/亮度不一，只在夜空或暗色主题出
    if (p.stars || dark) {
        const n = 30 + Math.floor(rnd() * 22);
        for (let i = 0; i < n; i++) {
            const big = rnd() > 0.86;
            ctx.fillStyle = `rgba(255,255,255,${(0.3 + rnd() * 0.55).toFixed(2)})`;
            const sz = big ? 2 : 1.2;
            ctx.fillRect(rnd() * W, rnd() * H * 0.52, sz, sz);
        }
    }
    // 日月 + 光晕：放在中左偏下，避开左上日期块与左侧题头
    const [sh, ss, sl] = p.sun;
    const cx = W * (0.26 + rnd() * 0.12), cy = H * (0.34 + rnd() * 0.12), r = 20 + rnd() * 12;
    const halo = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 3.4);
    halo.addColorStop(0, hsl(sh, ss, sl, dark ? 0.5 : 0.4));
    halo.addColorStop(1, hsl(sh, ss, sl, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(cx - r * 3.4, cy - r * 3.4, r * 6.8, r * 6.8);
    ctx.fillStyle = hsl(sh, ss, Math.min(sl + (dark ? 6 : 4), 92));
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // 飞鸟：左半天空两三点，国画味
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.5)' : 'rgba(30,32,48,0.38)';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    const birds = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < birds; i++) {
        const bx = W * (0.1 + rnd() * 0.34), by = H * (0.16 + rnd() * 0.2), bs = 5 + rnd() * 4;
        ctx.beginPath();
        ctx.moveTo(bx - bs, by);
        ctx.quadraticCurveTo(bx - bs / 2, by - bs * 0.7, bx, by);
        ctx.quadraticCurveTo(bx + bs / 2, by - bs * 0.7, bx + bs, by);
        ctx.stroke();
    }
    // 山脊四层 + 层间雾；种子决定要不要把最下层换成湖面
    const lake = rnd() < 0.45;
    const horizon = lake ? H * 0.78 : H;
    const [rh, rs] = p.ridge;
    for (let layer = 0; layer < 4; layer++) {
        const base = H * (0.5 + layer * 0.09) + (lake ? -H * 0.06 : 0);
        const amp = H * (0.16 - layer * 0.028);
        const l = dark ? 15 - layer * 3 : 34 - layer * 7;
        ridgePath(ctx, W, base, amp, rnd, horizon);
        ctx.fillStyle = hsl(rh, Math.max(rs + dsat, 16), Math.max(l + lift * 0.4, 6));
        ctx.fill();
        // 层间雾：山脊上方一条两端渐隐的亮带，拉出空气透视（顶端不渐隐会露硬边）
        const fog = ctx.createLinearGradient(0, base - amp, 0, base + 34);
        fog.addColorStop(0, hsl(rh, 24, dark ? 62 : 92, 0));
        fog.addColorStop(0.35, hsl(rh, 24, dark ? 62 : 92, 0.12));
        fog.addColorStop(1, hsl(rh, 24, dark ? 62 : 92, 0));
        ctx.fillStyle = fog;
        ctx.fillRect(0, base - amp, W, amp + 34);
    }
    // 湖面：水色接天色不戛黑块，满幅细漱波光 + 日月倒影光斑
    if (lake) {
        // 水色取中天色相压暗：用地平暖色相会在暗色下跳成一整块芥末黄
        const wh = p.sky[1][0];
        const wg = ctx.createLinearGradient(0, horizon, 0, H);
        wg.addColorStop(0, hsl(wh, 26, dark ? 14 : 30));
        wg.addColorStop(1, hsl(wh, 30, dark ? 5 : 14));
        ctx.fillStyle = wg;
        ctx.fillRect(0, horizon, W, H - horizon);
        ctx.fillStyle = hsl(sh, ss, sl, 0.08);
        for (let i = 0; i < 6; i++) {
            const yy = horizon + 8 + i * (H - horizon - 16) / 6;
            const ww = W * (0.45 + rnd() * 0.4);
            ctx.fillRect(W / 2 - ww / 2, yy, ww, 1.4);
        }
        ctx.fillStyle = hsl(sh, ss, sl, 0.26);
        for (let i = 0; i < 6; i++) {
            const yy = horizon + 6 + i * (H - horizon - 12) / 6;
            const ww = r * (2.2 - i * 0.26) * (0.6 + rnd() * 0.7);
            ctx.fillRect(cx - ww / 2, yy, ww, 1.8);
        }
        ctx.fillStyle = hsl(sh, ss, sl, 0.4);
        ctx.fillRect(0, horizon - 1, W, 1.2);
    }
    // 上暗角保日期白字；下暗角只留一点压住画面重心（底部已无文字）
    const top = ctx.createLinearGradient(0, 0, 0, H * 0.34);
    top.addColorStop(0, 'rgba(0,0,0,0.38)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, H * 0.34);
    const bot = ctx.createLinearGradient(0, H * 0.8, 0, H);
    bot.addColorStop(0, 'rgba(0,0,0,0)');
    bot.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = bot;
    ctx.fillRect(0, H * 0.8, W, H * 0.2);
}

// 签到符：网易云日签海报式——全幅生成图打底，左上大日期、吉凶居中竖写+列尾朱印、
// 右起竖排毛笔签句、左侧竖题头；底部不再放字，留给画面本身
function drawTalisman(canvas, f) {
    const W = 380, H = 680, S = 2;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    canvas.width = W * S;
    canvas.height = H * S;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(S, 0, 0, S, 0, 0);
    const site = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const family = `'Ma Shan Zheng', ${site}`;
    const main = 'rgba(255,255,255,0.96)';
    const subc = 'rgba(255,255,255,0.74)';
    drawTalismanScene(ctx, W, H, mulberry32(fnvSeed('shiguang-art-' + f.key)), dark);
    ctx.textBaseline = 'top';
    // 左上日期块：小字公历+星期，大字农历（毛笔）
    ctx.textAlign = 'left';
    ctx.font = `12px ${site}`; ctx.fillStyle = subc;
    ctx.fillText(`${f.dateText} · ${f.weekday}`, 36, 40);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 1;
    ctx.font = `40px ${family}`; ctx.fillStyle = main;
    ctx.fillText(f.lunarText, 34, 62);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (f.festival) {
        ctx.font = `12px ${site}`; ctx.fillStyle = subc;
        ctx.fillText(f.festival, 36, 116);
    }
    // 右起竖排毛笔签句：均分列长（不留下孤字尾列），列首避开句读
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 1;
    const sentAdv = 30, sentY = 168;
    const maxPer = Math.floor((H * 0.62 - sentY) / sentAdv);
    const chars = Array.from(f.sentence);
    const colsN = Math.min(3, Math.max(1, Math.ceil(chars.length / maxPer)));
    const per = Math.ceil(chars.length / colsN);
    const chunks = [];
    for (let i = 0; i < chars.length; i += per) chunks.push(chars.slice(i, i + per).join(''));
    for (let i = 1; i < chunks.length; i++) {
        if (/^[，。、！？；：）]/.test(chunks[i])) {
            chunks[i] = chunks[i - 1].slice(-1) + chunks[i];
            chunks[i - 1] = chunks[i - 1].slice(0, -1);
        }
    }
    ctx.font = `20px ${family}`; ctx.fillStyle = main;
    chunks.forEach((ck, i) => drawVertical(ctx, ck, W - 44 - i * 32, sentY, sentAdv));
    // 左侧竖题头
    ctx.font = `24px ${family}`;
    drawVertical(ctx, '拾光签', 44, 176, 34);
    // 吉凶居中竖写：毛笔大字
    const luckChars = Array.from(f.luck).length;
    const luckAdv = 56;
    const luckY = H * 0.42 - luckChars * luckAdv / 2;
    ctx.font = `44px ${family}`; ctx.fillStyle = main; ctx.textAlign = 'center';
    drawVertical(ctx, f.luck, W / 2, luckY, luckAdv);
    // 左下角吉凶小字标注：标签+结果两截，压在底部暗角上
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 1;
    ctx.font = `12px ${site}`; ctx.fillStyle = subc;
    ctx.fillText('吉凶', 36, H - 50);
    ctx.font = `15px ${site}`; ctx.fillStyle = main;
    ctx.fillText(f.luck, 68, H - 52);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
}

function saveTalismanPng(canvas, key) {
    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `拾光签-${key}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
}

function copyTalismanPng(canvas) {
    return new Promise((resolve, reject) => {
        if (!navigator.clipboard || !window.ClipboardItem) return reject(new Error('浏览器不支持复制图片'));
        canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('导出失败'));
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(resolve, reject);
        }, 'image/png');
    });
}

// --- 签到面板 / 签到符弹层 ---
let talismanLastFocus = null;

// 把签面会用到的字凑成样串喂给 fonts.load，触发毛笔字对应 unicode-range 分片下载
function talismanFontSample(f) {
    return ['拾光签', f.luck, f.sentence, f.lunarText, f.weekday, f.festival].join('');
}

async function openTalisman() {
    const modal = document.getElementById('talismanModal');
    const f = buildTodayFortune();
    // 毛笔字就绪再画，否则 canvas 会拿回退字体定型
    if (window.SiteAppearance && SiteAppearance.loadBrushFont) {
        await SiteAppearance.loadBrushFont(talismanFontSample(f));
    }
    drawTalisman(document.getElementById('talismanCanvas'), f);
    talismanLastFocus = document.activeElement;
    modal.hidden = false;
    void modal.offsetHeight; // 同步回流后再加类，后台标签页也能播过渡
    modal.classList.add('open');
    document.body.classList.add('modal-open');
    document.getElementById('talismanClose').focus();
}

function closeTalisman() {
    const modal = document.getElementById('talismanModal');
    if (modal.hidden) return;
    modal.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(() => { modal.hidden = true; }, 200);
    if (talismanLastFocus && talismanLastFocus.focus) talismanLastFocus.focus();
}

function initCheckin() {
    const panel = document.getElementById('checkinPanel');
    const body = document.getElementById('quoteBody');
    const btn = document.getElementById('checkinBtn');
    const tip = document.getElementById('checkinTip');
    const modal = document.getElementById('talismanModal');

    const revealQuote = () => {
        panel.hidden = true;
        body.hidden = false;
        loadQuote();
    };
    if (isCheckedInToday()) {
        revealQuote();
        tip.textContent = '';
    } else {
        const streak = peekCheckinStreak();
        tip.textContent = streak > 1 ? `今日尚未签到 · 已连续 ${streak - 1} 天` : '今日尚未签到 · 签后解锁今日一言';
    }

    btn.addEventListener('click', () => {
        recordCheckin();
        revealQuote();
        openTalisman();
    });
    // 已签到后一言卡片上的小按钮：重看今日签
    document.getElementById('quoteTalisman').addEventListener('click', () => {
        openTalisman();
    });

    document.getElementById('talismanClose').addEventListener('click', closeTalisman);
    document.getElementById('talismanBackdrop').addEventListener('click', closeTalisman);
    document.getElementById('talismanSave').addEventListener('click', () => {
        saveTalismanPng(document.getElementById('talismanCanvas'), todayKey());
    });
    const copyBtn = document.getElementById('talismanCopy');
    copyBtn.addEventListener('click', () => {
        const old = copyBtn.textContent;
        copyTalismanPng(document.getElementById('talismanCanvas'))
            .then(() => { copyBtn.textContent = '已复制'; })
            .catch(() => { copyBtn.textContent = '不支持复制'; });
        setTimeout(() => { copyBtn.textContent = old; }, 1600);
    });
    // ESC 只关签符弹层，不触发全局“回首页”
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hidden) {
            closeTalisman();
            e.stopImmediatePropagation();
        }
    });
}

// --- 时光进度（年 / 月 / 周） ---
function animateValue(el, target, duration, fmt) {
    const start = performance.now();
    function frame(t) {
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        el.textContent = fmt(target * eased);
        if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

function initProgress() {
    const now = new Date();

    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear() + 1, 0, 1);
    const yearPct = (now - startOfYear) / (endOfYear - startOfYear) * 100;

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthPct = (now - startOfMonth) / (endOfMonth - startOfMonth) * 100;

    const dayIdx = (now.getDay() + 6) % 7; // 周一为 0
    const weekPct = ((dayIdx + now.getHours() / 24 + now.getMinutes() / 1440) / 7) * 100;

    [
        ['fillYear', 'pctYear', yearPct],
        ['fillMonth', 'pctMonth', monthPct],
        ['fillWeek', 'pctWeek', weekPct]
    ].forEach(([fillId, pctId, pct]) => {
        const v = Math.min(100, Math.max(0, pct));
        const fill = document.getElementById(fillId);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            fill.style.width = v + '%';
        }));
        animateValue(document.getElementById(pctId), v, 1100, x => x.toFixed(1) + '%');
    });
}

// --- GitHub 传送门 + 实时数据 ---
async function initGitHubStats() {
    try {
        const res = await fetch('https://api.github.com/users/zengzoxiong');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        animateValue(document.getElementById('ghRepos'), data.public_repos || 0, 900, v => String(Math.round(v)));
        animateValue(document.getElementById('ghFollowers'), data.followers || 0, 900, v => String(Math.round(v)));
    } catch (e) {
        document.getElementById('githubStats').style.display = 'none';
        console.error('GitHub 数据加载失败:', e);
    }
}

// --- 待办清单（localStorage 持久化） ---
const TODO_KEY = 'dashboardTodos';

function getTodos() {
    try {
        return JSON.parse(localStorage.getItem(TODO_KEY)) || [];
    } catch {
        return [];
    }
}

function saveTodos(todos) {
    localStorage.setItem(TODO_KEY, JSON.stringify(todos));
}

function todoItemHtml(t) {
    return `<li class="todo-item ${t.done ? 'done' : ''}" data-id="${t.id}">
        <input type="checkbox" class="todo-check" ${t.done ? 'checked' : ''} title="完成">
        <span class="todo-text">${escapeHtml(t.text)}</span>
        <button class="todo-del" title="删除">✕</button>
    </li>`;
}

function updateTodoCount() {
    const todos = getTodos();
    const left = todos.filter(t => !t.done).length;
    document.getElementById('todoCount').textContent = todos.length ? `${left}/${todos.length} 待完成` : '';
}

function initTodo() {
    const list = document.getElementById('todoList');
    const form = document.getElementById('todoForm');
    const input = document.getElementById('todoInput');

    list.innerHTML = getTodos().map(todoItemHtml).join('');
    updateTodoCount();

    function addTodo() {
        const text = input.value.trim();
        if (!text) return;
        const todo = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, done: false };
        const todos = getTodos();
        todos.unshift(todo);
        saveTodos(todos);
        const tmp = document.createElement('template');
        tmp.innerHTML = todoItemHtml(todo).trim();
        list.prepend(tmp.content.firstElementChild);
        input.value = '';
        updateTodoCount();
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        addTodo();
    });

    // 显式监听回车，避免个别环境不触发表单隐式提交
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTodo();
        }
    });

    list.addEventListener('change', (e) => {
        const check = e.target.closest('.todo-check');
        if (!check) return;
        const item = check.closest('.todo-item');
        const todos = getTodos();
        const todo = todos.find(t => t.id === item.dataset.id);
        if (todo) {
            todo.done = check.checked;
            saveTodos(todos);
            item.classList.toggle('done', todo.done);
            updateTodoCount();
        }
    });

    list.addEventListener('click', (e) => {
        const btn = e.target.closest('.todo-del');
        if (!btn) return;
        const item = btn.closest('.todo-item');
        item.classList.add('leaving');
        setTimeout(() => {
            saveTodos(getTodos().filter(t => t.id !== item.dataset.id));
            item.remove();
            updateTodoCount();
        }, 220);
    });
}

// ===== 一级菜单折叠（收藏 / 工具，状态持久化） =====
function initSectionToggles() {
    document.querySelectorAll('.sidebar-section-title[data-section]').forEach(btn => {
        const section = btn.closest('.sidebar-section');
        const key = 'sidebarSection_' + btn.dataset.section;
        if (localStorage.getItem(key) !== 'expanded') {
            // 默认收起，只有显式保存过 expanded 才展开
            section.classList.add('section-collapsed');
        }
        btn.addEventListener('click', () => {
            section.classList.toggle('section-collapsed');
            localStorage.setItem(key, section.classList.contains('section-collapsed') ? 'collapsed' : 'expanded');
        });
    });
}

// ===== 点击涟漪效果 =====
function spawnRipple(host, e) {
    if (document.body.classList.contains('no-anim')) return; // 动画关闭时跳过，避免节点永不回收
    const rect = host.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const x = (e.clientX || rect.left + rect.width / 2) - rect.left - size / 2;
    const y = (e.clientY || rect.top + rect.height / 2) - rect.top - size / 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    host.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
}

// ===== 视图控制 =====
function goHome() {
    currentView = 'home';
    searchFrom = 'home';
    searchInput.value = '';
    currentCategory = '';
    currentToolCategory = '';
    currentMediaType = '';
    currentStatusFilter = '';
    currentPluginCat = '';
    sidebarCategories.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    sidebarTools.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    sidebarMedia.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    sidebarPlugin.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    homeNav.classList.add('active');
    renderLinks();
    searchInput.blur();
    if (window.innerWidth <= 768) {
        closeMobileMenu();
    }
}

// 按视图渲染对应内容
function renderCurrentView(animate = false) {
    if (currentView === 'tools') renderTools(animate);
    else if (currentView === 'media') renderMedia(animate);
    else if (currentView === 'plugin') renderPluginCat(currentPluginCat);
    else if (currentView === 'ghstars') renderGhStars(animate);
    else renderLinks(animate);
}

// 渲染 GitHub Stars（工作流每日同步的星标仓库）
function renderGhStars(animate = false) {
    dashboard.classList.add('hidden');
    linksGrid.style.display = 'none';
    emptyState.style.display = 'none';
    mediaGrid.style.display = 'block';

    const repos = [...(starsData.repos || [])];
    const byDate = (a, b) => (a.starred_at || '').localeCompare(b.starred_at || '');
    if (starsSort === 'date-asc') repos.sort(byDate);
    else if (starsSort === 'date-desc') repos.sort((a, b) => byDate(b, a));
    else if (starsSort === 'stars-asc') repos.sort((a, b) => (a.stars || 0) - (b.stars || 0));
    else repos.sort((a, b) => (b.stars || 0) - (a.stars || 0));
    const cards = repos.map(starCardHtml).join('');

    const sortOptions = [
        ['date-desc', '按星标时间（新 → 旧）'],
        ['date-asc', '按星标时间（旧 → 新）'],
        ['stars-desc', '按星数（多 → 少）'],
        ['stars-asc', '按星数（少 → 多）']
    ].map(([v, label]) =>
        `<option value="${v}"${v === starsSort ? ' selected' : ''}>${label}</option>`
    ).join('');

    mediaGrid.innerHTML = `
        <div class="media-filters" style="justify-content:flex-end;margin-bottom:8px">
            <label class="media-sort">排序
                <select id="starsSort">${sortOptions}</select>
            </label>
        </div>
        <div class="media-count" style="margin-bottom:14px">共 ${repos.length} 个星标仓库${starsData.updated ? ' · 最近同步 ' + starsData.updated : ''}</div>
        <div class="skills-cards">${cards || '<p class="empty-state">还没有星标仓库</p>'}</div>
    `;
    recalcMarquee();
}

// ===== 首页迷你音乐播放器 =====
const mp = {
    tracks: [], playlist: [], explore: null, idx: 0, playing: false, busy: false, loaded: false, open: false,
    mode: 'loop', fails: 0,
    lyricOn: false, lyricMap: null, lyricLines: null, lyricIdx: -1,
    audio: new Audio(),
    el: {}
};

function fmtTime(sec) {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function mpTimeText() {
    const t = mp.tracks[mp.idx] || {};
    mp.el.time.textContent = mp.busy ? '缓冲中…'
        : `${fmtTime(mp.audio.currentTime)} / ${fmtTime(mp.audio.duration || t.dur)}`;
}

// 只更新界面，不碰 audio —— 真正拉流推迟到点播放
function mpRenderNow() {
    const t = mp.tracks[mp.idx];
    if (!t) return;
    const name = escapeHtml(t.artist ? `${t.title} - ${t.artist}` : t.title);
    mp.el.title.innerHTML = `<span class="t"><span class="r">${name}</span><span class="r dup" aria-hidden="true">${name}</span></span>`;
    recalcMarquee(mp.el.wrap);
    mp.el.song.textContent = t.title;
    mp.el.artist.textContent = t.artist || '';
    if (t.cover) mp.el.cover.src = t.cover;
    mp.el.time.textContent = `0:00 / ${fmtTime(t.dur)}`;
    mp.el.fill.style.width = '0%';
    mp.el.list.querySelectorAll('.on').forEach(n => n.classList.remove('on'));
    const row = mp.el.list.children[mp.idx];
    if (row) {
        row.classList.add('on');
        if (mp.open) row.scrollIntoView({ block: 'nearest' });
    }
    if (mp.lyricOn) mpRenderLyric();
}

function mpListHtml() {
    return mp.tracks.map((t, i) => `
        <button class="mp-item" data-idx="${i}">
            <span class="mp-item-no">${String(i + 1).padStart(2, '0')}</span>
            <span class="mp-item-name">${escapeHtml(t.title)}</span>
            <span class="mp-item-artist">${escapeHtml(t.artist || '')}</span>
            <span class="mp-item-dur">${fmtTime(t.dur)}</span>
        </button>`).join('');
}

function mpLoad(idx, autoplay) {
    if (!mp.tracks.length) return;
    mp.idx = (idx + mp.tracks.length) % mp.tracks.length;
    mp.loaded = false;
    mp.busy = false;
    mpRenderNow();
    if (autoplay) mpPlayToggle(true);
}

function mpPlayToggle(force) {
    if (!mp.tracks.length) return;
    const want = force !== undefined ? force : !mp.playing;
    if (!want) { mp.audio.pause(); return; }
    if (!mp.loaded) {
        mp.audio.src = mp.tracks[mp.idx].src;
        mp.loaded = true;
    }
    mp.audio.play().catch(() => {});
}

function mpSyncUI() {
    mp.playing = !mp.audio.paused;
    // 迷你条与控制区各有一套播放/暂停图标，一起同步
    document.querySelectorAll('.mp-ic-play').forEach(n => { n.style.display = mp.playing ? 'none' : ''; });
    document.querySelectorAll('.mp-ic-pause').forEach(n => { n.style.display = mp.playing ? '' : 'none'; });
}

function mpSetBusy(on) {
    mp.busy = on;
    mpTimeText();
}

function mpTogglePanel(open) {
    mp.open = open === undefined ? !mp.open : open;
    mp.el.wrap.classList.toggle('mp-open', mp.open);
    mp.el.toggle.setAttribute('aria-expanded', String(mp.open));
    mp.el.toggle.title = mp.open ? '收起歌单' : '展开歌单';
    mp.el.openIcon.style.display = mp.open ? 'none' : '';
    mp.el.closeIcon.style.display = mp.open ? '' : 'none';
    if (mp.open) {
        const row = mp.el.list.children[mp.idx];
        if (row) row.scrollIntoView({ block: 'nearest' });
    }
    recalcMarquee(mp.el.wrap);
}

// 播放模式：列表循环 / 单曲循环 / 列表随机 / 探索（随机 + 每日榜单）
const MP_MODES = ['loop', 'one', 'shuffle', 'explore'];
const MP_MODE_NAME = { loop: '列表循环', one: '单曲循环', shuffle: '列表随机', explore: '每日探索' };

function mpStep(dir) {
    const n = mp.tracks.length;
    if (n < 2) return 0;
    if (mp.mode === 'shuffle' || mp.mode === 'explore') {
        let r = mp.idx;
        while (r === mp.idx) r = Math.floor(Math.random() * n);
        return r;
    }
    return (mp.idx + dir + n) % n;
}

function mpShowMode() {
    // SVG 元素没有反射的 hidden 属性，必须用 toggleAttribute 改 DOM 属性，否则图标不会切换
    MP_MODES.forEach((m) => { mp.el.modeIcons[m].toggleAttribute('hidden', m !== mp.mode); });
    mp.el.mode.title = MP_MODE_NAME[mp.mode];
    mp.audio.loop = mp.mode === 'one';
}

function mpUseList(list, autoplay) {
    mp.tracks = list;
    mp.el.list.innerHTML = mpListHtml();
    mpLoad(autoplay === undefined ? 0 : autoplay, mp.playing);
}

function mpSetMode(mode) {
    mp.mode = mode;
    mp.fails = 0;
    localStorage.setItem('mpMode', mode);
    mpShowMode();
    if (mode === 'explore') mpLoadExplore();
    else mpUseList(mp.playlist);
}

function mpLoadExplore() {
    if (mp.explore) {
        mp.tracks = mp.explore;
        mp.el.list.innerHTML = mpListHtml();
        mpLoad(Math.floor(Math.random() * mp.explore.length), mp.playing);
        return;
    }
    fetch('data/explore.json')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(d => {
            mp.explore = (d.tracks || []).filter(t => t && t.src);
            if (!mp.explore.length) throw new Error('empty');
            if (mp.mode !== 'explore') return;
            mp.tracks = mp.explore;
            mp.el.list.innerHTML = mpListHtml();
            mpLoad(Math.floor(Math.random() * mp.explore.length), mp.playing);
        })
        .catch(() => {
            mp.explore = [];
            if (mp.mode === 'explore') mpSetMode('loop');
        });
}

// ===== 歌词（点圆形封面切换；data/lyrics.json 由 scripts/sync_lyrics.py 每日生成）=====
function mpSongId(t) {
    const m = /id=(\d+)\./.exec((t && t.src) || '');
    return m ? m[1] : null;
}

function mpParseLrc(text) {
    const lines = [];
    (text || '').split('\n').forEach((row) => {
        const marks = [...row.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
        if (!marks.length) return;
        const words = row.replace(/\[[^\]]*\]/g, '').trim();
        if (!words) return;
        marks.forEach((m) => {
            const frac = m[3] ? Number(('' + m[3]).padEnd(3, '0')) : 0;
            lines.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac / 1000, s: words });
        });
    });
    return lines.sort((a, b) => a.t - b.t);
}

function mpRenderLyric() {
    const box = mp.el.lyricInner;
    mp.lyricLines = null;
    mp.lyricIdx = -1;
    box.innerHTML = '';
    if (!mp.lyricMap) { box.innerHTML = '<div class="mp-ly-empty">歌词加载中…</div>'; return; }
    const parsed = mpParseLrc(mp.lyricMap[mpSongId(mp.tracks[mp.idx])] || '');
    if (!parsed.length) { box.innerHTML = '<div class="mp-ly-empty">暂无歌词</div>'; return; }
    mp.lyricLines = parsed;
    const frag = document.createDocumentFragment();
    parsed.forEach((l, i) => {
        const d = document.createElement('div');
        d.className = 'mp-ly-line';
        d.dataset.i = i;
        d.textContent = l.s;
        frag.appendChild(d);
    });
    box.appendChild(frag);
}

// 高亮当前行并居中；用 rect 差值算滚动量，不依赖定位父级
function mpSyncLyric() {
    if (!mp.lyricOn || !mp.lyricLines) return;
    const now = mp.audio.currentTime;
    let idx = -1;
    for (let i = 0; i < mp.lyricLines.length; i++) {
        if (mp.lyricLines[i].t <= now + 0.2) idx = i; else break;
    }
    if (idx === mp.lyricIdx) return;
    const box = mp.el.lyricInner;
    const prev = box.children[mp.lyricIdx];
    if (prev && prev.classList) prev.classList.remove('on');
    const cur = box.children[idx];
    if (cur) {
        cur.classList.add('on');
        box.scrollTop += cur.getBoundingClientRect().top - box.getBoundingClientRect().top
            - box.clientHeight / 2 + cur.clientHeight / 2;
    }
    mp.lyricIdx = idx;
}

function mpFetchLyrics() {
    if (mp.lyricMap) { mpRenderLyric(); return; }
    fetch('data/lyrics.json')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(d => { mp.lyricMap = d || {}; mpRenderLyric(); })
        .catch(() => { mp.lyricMap = {}; mpRenderLyric(); });
}

function mpToggleLyric(on) {
    mp.lyricOn = on === undefined ? !mp.lyricOn : on;
    mp.el.wrap.classList.toggle('lyric', mp.lyricOn);
    mp.el.disc.title = mp.lyricOn ? '返回封面' : '查看歌词';
    mp.el.disc.setAttribute('aria-pressed', String(mp.lyricOn));
    if (mp.lyricOn) { mpFetchLyrics(); mpSyncLyric(); }
}

function initMusicPlayer() {
    mp.el.title = document.getElementById('mpTitle');
    mp.el.time = document.getElementById('mpTime');
    mp.el.fill = document.getElementById('mpFill');
    mp.el.progress = document.getElementById('mpProgress');
    mp.el.wrap = document.getElementById('musicWrap');
    mp.el.toggle = document.getElementById('mpToggle');
    mp.el.openIcon = document.querySelector('.mp-ic-open');
    mp.el.closeIcon = document.querySelector('.mp-ic-close');
    mp.el.song = document.getElementById('mpSong');
    mp.el.artist = document.getElementById('mpArtist');
    mp.el.cover = document.getElementById('mpCover');
    mp.el.disc = document.getElementById('mpDisc');
    mp.el.lyricInner = document.getElementById('mpLyricInner');
    mp.el.list = document.getElementById('mpList');
    mp.el.listToggle = document.getElementById('mpListToggle');
    mp.el.vol = document.getElementById('mpVol');
    mp.el.volWrap = document.getElementById('mpVolWrap');
    mp.el.mode = document.getElementById('mpMode');
    mp.el.modeIcons = {
        loop: document.querySelector('.mi-loop'),
        one: document.querySelector('.mi-one'),
        shuffle: document.querySelector('.mi-shuffle'),
        explore: document.querySelector('.mi-explore')
    };

    mp.audio.preload = 'none';

    // 音量：无滑块圆点，靠填充深浅 + 喇叭音波道数（0/1/2/3）表达大小
    const syncVol = () => {
        const v = Number(mp.el.vol.value);
        mp.el.vol.style.setProperty('--v', v);
        mp.el.volWrap.dataset.lv = v <= 0 ? 0 : v < 0.34 ? 1 : v < 0.67 ? 2 : 3;
    };
    const savedVol = localStorage.getItem('mpVolume');
    mp.audio.volume = savedVol === null ? 1 : Number(savedVol);
    mp.el.vol.value = mp.audio.volume;
    syncVol();
    mp.el.vol.addEventListener('input', () => {
        mp.audio.volume = Number(mp.el.vol.value);
        localStorage.setItem('mpVolume', mp.el.vol.value);
        syncVol();
    });

    const savedMode = localStorage.getItem('mpMode');
    if (MP_MODES.includes(savedMode)) mp.mode = savedMode;
    mpShowMode();
    mp.el.mode.addEventListener('click', () => mpSetMode(MP_MODES[(MP_MODES.indexOf(mp.mode) + 1) % MP_MODES.length]));

    // 迷你条与展开控制区各有一组按钮，按类名一起绑定
    const bindAll = (sel, fn) => document.querySelectorAll(sel).forEach(b => b.addEventListener('click', fn));
    bindAll('.mp-playbtn', () => mpPlayToggle());
    bindAll('.mp-prev', () => mpLoad(mpStep(-1), mp.playing));
    bindAll('.mp-next', () => mpLoad(mpStep(1), mp.playing));

    mp.el.toggle.addEventListener('click', () => mpTogglePanel());
    const mpSetListClosed = (closed) => {
        mp.el.wrap.classList.toggle('list-closed', closed);
        mp.el.listToggle.setAttribute('aria-expanded', String(!closed));
    };
    mp.el.listToggle.addEventListener('click', () => {
        // 歌词态下列表被 .lyric 规则强制收起，此时点列表键要先退回封面态再展开
        if (mp.lyricOn) { mpToggleLyric(false); mpSetListClosed(false); return; }
        mpSetListClosed(!mp.el.wrap.classList.contains('list-closed'));
    });
    mp.el.list.addEventListener('click', (e) => {
        const row = e.target.closest('.mp-item');
        if (row) mpLoad(Number(row.dataset.idx), true);
    });

    // 点封面切歌词；点歌词行跳到该时间播放
    mp.el.disc.addEventListener('click', () => mpToggleLyric());
    mp.el.lyricInner.addEventListener('click', (e) => {
        const line = e.target.closest('.mp-ly-line');
        if (!line || !mp.lyricLines) return;
        const l = mp.lyricLines[Number(line.dataset.i)];
        if (!l) return;
        mpPlayToggle(true);
        const seek = () => { mp.audio.currentTime = l.t; };
        if (mp.audio.readyState >= 1) seek();
        else mp.audio.addEventListener('loadedmetadata', seek, { once: true });
    });

    fetch('data/playlist.json')
        .then(r => r.json())
        .then(d => {
            mp.playlist = d.tracks || [];
            if (mp.mode === 'explore') { mpShowMode(); mpLoadExplore(); }
            else mpUseList(mp.playlist);
        })
        .catch(() => { mp.el.title.textContent = '歌单加载失败'; });

    mp.audio.addEventListener('error', () => {
        const t = mp.tracks[mp.idx];
        if (!t || mp.audio.src !== t.src) return; // 换曲打断的旧请求
        mpSetBusy(false);
        mpSyncUI();
        // 探索榜单可能混入已变灰的版权曲，连续跳过几首仍失败才提示
        mp.fails++;
        if (mp.fails <= 8 && mp.tracks.length > 1) { mpLoad(mpStep(1), true); return; }
        mp.el.title.textContent = '音频加载失败，换一首试试';
    });
    mp.audio.addEventListener('loadstart', () => mpSetBusy(true));
    mp.audio.addEventListener('waiting', () => mpSetBusy(true));
    mp.audio.addEventListener('canplay', () => mpSetBusy(false));
    mp.audio.addEventListener('playing', () => { mp.fails = 0; mpSetBusy(false); mpSyncUI(); });
    mp.audio.addEventListener('play', mpSyncUI);
    mp.audio.addEventListener('pause', () => { mpSetBusy(false); mpSyncUI(); });
    mp.audio.addEventListener('ended', () => mpLoad(mpStep(1), true));
    mp.audio.addEventListener('timeupdate', () => {
        const d = mp.audio.duration || 0;
        mpTimeText();
        mp.el.fill.style.width = (d ? (mp.audio.currentTime / d) * 100 : 0) + '%';
        mpSyncLyric();
    });

    mp.el.progress.addEventListener('click', (e) => {
        if (!mp.audio.duration) return;
        const r = mp.el.progress.getBoundingClientRect();
        mp.audio.currentTime = ((e.clientX - r.left) / r.width) * mp.audio.duration;
    });

    // 面板展开时：点面板外或按 Esc 收起（有其他弹层打开时让给它）
    document.addEventListener('click', (e) => {
        if (mp.open && !mp.el.wrap.contains(e.target)) mpTogglePanel(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mp.open && !document.body.classList.contains('modal-open')) mpTogglePanel(false);
    });
}

// ===== 全域搜索（收藏 + 工具 + 影视） =====
let searchSeq = 0;

function renderSearchWithLoading(term) {
    dashboard.classList.add('hidden');
    mediaGrid.style.display = 'none';
    linksGrid.style.display = 'grid';
    emptyState.style.display = 'none';
    // 过渡加载态：短暂显示骨架，随后渲染分组结果
    const seq = ++searchSeq;
    if (document.hidden) { renderSearchResults(term); return; } // 后台标签跳过等待
    linksGrid.innerHTML = `
        <div class="search-group" style="grid-column:1/-1">
            <div class="search-loading">
                <span class="spinner"></span>
                <span>正在搜索「${escapeHtml(term)}」...</span>
            </div>
        </div>`;
    setTimeout(() => {
        if (seq === searchSeq && currentView === 'search') renderSearchResults(term);
    }, 300);
}

// 后台标签定时器被节流时，骨架会停留；聚焦/切回可见的瞬间立即渲染
function flushPendingSearch() {
    if (currentView === 'search' && document.querySelector('.search-loading')) {
        const term = searchInput.value.trim();
        if (term) renderSearchResults(term);
    }
}

function renderSearchResults(term) {
    const t = term.toLowerCase();
    const match = (s) => (s || '').toLowerCase().includes(t);

    const links = allLinks.filter(i => match(i.title) || match(i.description) || match(i.category));
    const tools = allTools.filter(i => match(i.name) || match(i.description) || match(i.category));
    const media = (mediaData.items || []).filter(i => match(i.title) || match(i.comment) || match(i.type));
    const skills = ((pluginsData.skills || {}).groups || []).flatMap(g => g.items)
        .filter(s => match(s.name) || match(s.description || ''));
    const mcps = (pluginsData.mcps || []).filter(m => match(m.name) || match(m.desc || ''));
    const stars = (starsData.repos || []).filter(r => match(r.full_name) || match(r.desc) || match(r.language));

    const total = links.length + tools.length + media.length + skills.length + mcps.length + stars.length;
    if (total === 0) {
        linksGrid.innerHTML = `
            <div class="search-group" style="grid-column:1/-1">
                <p class="empty-state">没有找到与「${escapeHtml(term)}」匹配的内容</p>
            </div>`;
        return;
    }

    const group = (label, count, inner) => `
        <div class="search-group" style="grid-column:1/-1">
            <div class="search-group-head">${label}<span class="search-group-count">${count} 条</span></div>
            <div class="links-grid search-group-body">${inner}</div>
        </div>`;

    let html = '';
    if (links.length) {
        html += group('网站收藏', links.length, links.map(buildLinkCard).join(''));
    }
    if (tools.length) {
        html += group('在线工具', tools.length, tools.map(buildToolCard).join(''));
    }
    if (media.length) {
        html += group('影视收藏', media.length, `<div class="media-cards">${media.map(buildMediaCard).join('')}</div>`);
    }
    if (skills.length) {
        html += group('Agent Skills', skills.length, `<div class="skills-cards">${skills.map(skillCardHtml).join('')}</div>`);
    }
    if (mcps.length) {
        html += group('Agent MCP', mcps.length, `<div class="skills-cards">${mcps.map(mcpCardHtml).join('')}</div>`);
    }
    if (stars.length) {
        html += group('GitHub Stars', stars.length, `<div class="skills-cards">${stars.map(starCardHtml).join('')}</div>`);
    }
    linksGrid.innerHTML = html;
    recalcMarquee();
    bindCopyButtons();
}

// 渲染侧栏影视区（类型导航，无"全部"）
function renderSidebarMedia() {
    const types = mediaData.types || [];
    sidebarMedia.innerHTML = types.map(t => `
        <div class="sidebar-item" role="button" tabindex="0" data-media-type="${t}">
            <span class="item-text">${t}</span>
        </div>
    `).join('');
}

// 加载链接数据
async function loadLinks() {
    try {
        const [linksRes, toolsRes] = await Promise.all([
            fetch('data/links.json'),
            fetch('data/tools.json')
        ]);
        const linksData = await linksRes.json();
        const toolsData = await toolsRes.json();
        allLinks = linksData.links;
        allTools = toolsData.tools;
        // 死链体检结果独立加载：缺失/失败都不影响收藏展示，只是不出角标
        try {
            const healthRes = await fetch('data/link-health.json');
            if (healthRes.ok) linkHealth = (await healthRes.json()).results || {};
        } catch (error) {
            console.error('死链体检结果加载失败:', error);
        }
        renderSidebarTools();
        renderSidebarCategories(linksData.categories);
        renderLinks();
    } catch (error) {
        console.error('加载数据失败:', error);
        linksGrid.innerHTML = '<p class="empty-state">加载数据失败</p>';
    }

    // 影视记录独立加载，失败不影响收藏/工具
    try {
        const mediaRes = await fetch('data/media.json');
        mediaData = await mediaRes.json();
        renderSidebarMedia();
    } catch (error) {
        console.error('影视数据加载失败:', error);
    }

    // Agent Plugin 数据独立加载（skills + mcps）
    try {
        const pluginRes = await fetch('data/agent-plugins.json');
        pluginsData = await pluginRes.json();
    } catch (error) {
        console.error('Agent Plugin 数据加载失败:', error);
    }

    // GitHub Stars 独立加载（工作流每日同步）
    try {
        const starsRes = await fetch('data/stars.json');
        starsData = await starsRes.json();
    } catch (error) {
        console.error('Stars 数据加载失败:', error);
    }
}

// 技能卡片构建（视图与搜索复用）：无图标，标题行 + 命令行 + 来源
function skillCardHtml(s) {
    const install = s.upstream === 'local-only'
        ? ''
        : `npx skills add ${s.upstream}${s.local ? '/' + s.name : ''}`;
    const link = s.upstream === 'local-only' ? ''
        : `<a class="skill-link" href="https://github.com/${s.upstream}${s.local ? '/tree/main/skills/' + s.name : ''}" target="_blank" rel="noopener noreferrer">来源仓库 ↗</a>`;
    return `
    <div class="skill-card">
        <div class="skill-title-row">
            <span class="skill-name">${escapeHtml(s.name)}</span>
            ${s.group ? `<span class="skill-tag">${escapeHtml(s.group)}</span>` : ''}
            ${s.local ? '<span class="skill-tag">本地镜像</span>' : ''}
            ${install ? `<button class="copy-btn" data-cmd="${install}">复制</button>` : ''}
        </div>
        ${install ? `<div class="skill-cmd"><code>${install}</code></div>` : '<div class="skill-cmd"><code>本地技能</code></div>'}
        <div class="skill-meta">${link}</div>
    </div>`;
}

// MCP 卡片构建：说明 + 可展开配置 + 官方页面
function mcpCardHtml(m) {
    const configText = escapeHtml(JSON.stringify(m.config, null, 2));
    const home = m.homepage
        ? `<a class="skill-link" href="${m.homepage}" target="_blank" rel="noopener noreferrer">官方页面 ↗</a>`
        : '<span class="skill-link">本地自部署</span>';
    return `
    <div class="skill-card">
        <div class="skill-title-row">
            <span class="skill-name">${escapeHtml(m.name)}</span>
            <span class="skill-tag">${m.type === 'http' ? 'HTTP' : 'STDIO'}</span>
        </div>
        <div class="skill-desc">${escapeHtml(m.desc)}</div>
        <details class="config-block">
            <summary>配置方法</summary>
            <pre>${configText}</pre>
        </details>
        <div class="skill-meta">${home}</div>
    </div>`;
}

// GitHub Stars 卡片构建：≥1000 显示 x.xk（一位小数）
function fmtStars(n) {
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

function starCardHtml(r) {
    return `
    <a class="skill-card" href="${r.url}" target="_blank" rel="noopener noreferrer">
        <div class="skill-title-row">
            <span class="skill-name">${escapeHtml(r.full_name)}</span>
            <span class="skill-stars">★ ${fmtStars(r.stars)}</span>
        </div>
        ${r.desc ? `<div class="skill-desc">${escapeHtml(r.desc)}</div>` : ''}
        <div class="skill-meta">
            <span class="skill-tag">星标于 ${r.starred_at}</span>
        </div>
    </a>`;
}

// 技能卡片构建（视图与搜索复用）：与收藏卡片同一极简语言
function skillCardHtml(s) {
    const install = s.upstream === 'local-only'
        ? ''
        : `npx skills add ${s.upstream}${s.local ? '/' + s.name : ''}`;
    const link = s.upstream === 'local-only' ? ''
        : `<a class="skill-link" href="https://github.com/${s.upstream}${s.local ? '/tree/main/skills/' + s.name : ''}" target="_blank" rel="noopener noreferrer">来源仓库 ↗</a>`;
    return `
    <div class="skill-card">
        <div class="skill-title-row">
            <span class="skill-name">${escapeHtml(s.name)}</span>
            ${s.group ? `<span class="skill-tag">${escapeHtml(s.group)}</span>` : ''}
            ${s.local ? '<span class="skill-tag">本地镜像</span>' : ''}
            ${install ? `<button class="copy-btn" data-cmd="${install}">复制</button>` : ''}
        </div>
        ${install ? `<div class="skill-cmd"><code>${install}</code></div>` : '<div class="skill-cmd"><code>本地技能</code></div>'}
        <div class="skill-meta">${link}</div>
    </div>`;
}

// MCP 卡片构建：说明 + 可展开配置 + 官方页面
function mcpCardHtml(m) {
    const configText = escapeHtml(JSON.stringify(m.config, null, 2));
    const home = m.homepage
        ? `<a class="skill-link" href="${m.homepage}" target="_blank" rel="noopener noreferrer">官方页面 ↗</a>`
        : '<span class="skill-link">本地自部署</span>';
    return `
    <div class="skill-card">
        <div class="skill-title-row">
            <span class="skill-name">${escapeHtml(m.name)}</span>
            <span class="skill-tag">${m.type === 'http' ? 'HTTP' : 'STDIO'}</span>
        </div>
        <div class="skill-desc">${escapeHtml(m.desc)}</div>
        <details class="config-block">
            <summary>配置方法</summary>
            <pre>${configText}</pre>
        </details>
        <div class="skill-meta">${home}</div>
    </div>`;
}


// 渲染 Agent Plugin 视图（skills 全量平铺 / mcps 配置卡片）
function renderPluginCat(cat) {
    dashboard.classList.add('hidden');
    linksGrid.style.display = 'none';
    emptyState.style.display = 'none';
    mediaGrid.style.display = 'block';

    let cards;
    let countLabel;
    if (cat === 'mcps') {
        cards = (pluginsData.mcps || []).map(mcpCardHtml);
        countLabel = `共 ${(pluginsData.mcps || []).length} 个 MCP 服务器`;
    } else {
        cards = ((pluginsData.skills || {}).groups || []).flatMap(g =>
            g.items.map(s => skillCardHtml({ ...s, group: g.group })));
        countLabel = `共 ${cards.length} 个技能`;
    }
    mediaGrid.innerHTML = `
        <div class="media-count" style="margin-bottom:14px">${countLabel}</div>
        <div class="skills-cards">${cards.join('')}</div>
    `;
    bindCopyButtons();
}

// 复制按钮统一绑定（事件委托）
function bindCopyButtons() {
    mediaGrid.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const text = btn.dataset.cmd;
            try { await navigator.clipboard.writeText(text); }
            catch {
                const ta = document.createElement('textarea');
                ta.value = text; document.body.appendChild(ta);
                ta.select(); document.execCommand('copy'); ta.remove();
            }
            const old = btn.textContent;
            btn.textContent = '已复制 ✓';
            setTimeout(() => { btn.textContent = old; }, 1200);
        });
    });
}

// 渲染侧栏工具区（分类导航）
function renderSidebarTools() {
    const categories = [...new Set(allTools.map(t => t.category))];
    sidebarTools.innerHTML = categories.map(cat => `
        <div class="sidebar-item" role="button" tabindex="0" data-tool-category="${cat}">
            <span class="item-text">${cat}</span>
        </div>
    `).join('');

    // 绑定工具分类点击事件
    sidebarTools.addEventListener('click', (e) => {
        const item = e.target.closest('.sidebar-item');
        if (!item) return;
        sidebarTools.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        homeNav.classList.remove('active');
        currentToolCategory = item.dataset.toolCategory;
        currentView = 'tools';
        searchFrom = 'tools';
        searchInput.value = '';
        renderTools(true);
        if (window.innerWidth <= 768) {
            closeMobileMenu();
        }
    });
}

// 渲染侧栏分类区
function renderSidebarCategories(categories) {
    sidebarCategories.innerHTML = `
        <div class="sidebar-item" role="button" tabindex="0" data-ghstars="1">
            <span class="item-text">我的 Stars</span>
        </div>
    ` + categories.map(cat => `
        <div class="sidebar-item" role="button" tabindex="0" data-category="${cat}">
            <span class="item-text">${cat}</span>
        </div>
    `).join('');
}

// 从 URL 提取域名
function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

// 卡片构建器（收藏/工具/影视共用，供各视图与全域搜索复用）
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 供内联 onerror 字符串安全拼接
function escapeJs(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/['"]/g, '\\$&');
}

function buildLinkCard(link, i) {
    const domain = getDomain(link.url);
    const emojiIcon = link.icon || '🔗';
    // 死链体检判死的链接在标题行出红标（suspect 不出标，宁漏报不误报）
    const health = linkHealth[link.url];
    const deadBadge = health && health.state === 'dead'
        ? ` <span class="link-dead" title="链接体检失效（${escapeHtml(health.checkedAt || '')}）">失效</span>`
        : '';
    // 尝试加载 favicon，两级失败后回退到 emoji
    const faviconHtml = domain
        ? `<img src="https://favicon.im/${domain}" alt="" onerror="this.onerror=null;this.src='https://icons.duckduckgo.com/ip3/${domain}.ico';this.onerror=function(){this.parentElement.innerHTML='${escapeJs(emojiIcon)}'};" width="32" height="32" loading="lazy">`
        : emojiIcon;
    return `
    <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="link-card">
        <div class="icon">${faviconHtml}</div>
        <div class="info">
            <div class="title">${escapeHtml(link.title)}${deadBadge}</div>
            <div class="description">${escapeHtml(link.description)}</div>
            <span class="category">${escapeHtml(link.category)}</span>
        </div>
    </a>`;
}

function buildToolCard(tool, i) {
    const faviconUrl = tool.icon || '';
    return `
    <a href="tools/${tool.path}" target="_blank" rel="noopener noreferrer" class="link-card">
        <div class="icon">${faviconUrl ? `<span style="font-size:1.2rem">${escapeHtml(faviconUrl)}</span>` : '🔧'}</div>
        <div class="info">
            <div class="title">${escapeHtml(tool.name)}</div>
            <div class="description">${escapeHtml(tool.description)}</div>
            <span class="category">${escapeHtml(tool.category)}</span>
        </div>
    </a>`;
}

function buildMediaCard(item, i) {
    const title = escapeHtml(item.title || '');
    const statusClass = item.status === '在看' ? ' watching' : (item.status === '想看' ? ' wish' : '');
    const gradient = TYPE_GRADIENTS[item.type] || TYPE_GRADIENTS['默认'];
    return `
    <${item.url ? 'a' : 'div'} class="media-card"${item.url ? ` href="${item.url}" target="_blank" rel="noopener noreferrer"` : ''}>
        <div class="media-cover">
            <div class="media-ph" style="background:${gradient}"><span class="ph-char">${title.charAt(0)}</span><span class="ph-title">${title}</span></div>
            ${item.cover ? `<img src="${item.cover}" alt="${title}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
            ${item.status ? `<span class="badge-status${statusClass}">${escapeHtml(item.status)}</span>` : ''}
            ${item.rating ? `<span class="badge-rating">★ ${item.rating}</span>` : ''}
            ${item.comment ? `<div class="media-overlay"><p>${escapeHtml(item.comment)}</p></div>` : ''}
        </div>
        <div class="media-info">
            <div class="media-title marquee"><span class="t"><span class="r">${title}</span><span class="r dup" aria-hidden="true">${title}</span></span></div>
            <div class="media-meta">${escapeHtml(item.type || '')}${item.release ? ' · ' + escapeHtml(item.release) : ''}</div>
        </div>
    </${item.url ? 'a' : 'div'}>`;
}

// 渲染链接卡片
function renderLinks(animate = false) {
    // 首页视图：仅显示仪表盘，不显示收藏卡片
    if (currentView === 'home') {
        dashboard.classList.remove('hidden');
        linksGrid.style.display = 'none';
        mediaGrid.style.display = 'none';
        emptyState.style.display = 'none';
        recalcMarquee(); // 仪表盘刚显示，重新量一次歌名是否溢出
        return;
    }

    dashboard.classList.add('hidden');
    mediaGrid.style.display = 'none';

    const filteredLinks = currentCategory
        ? allLinks.filter(link => link.category === currentCategory)
        : allLinks;

    if (filteredLinks.length === 0) {
        linksGrid.style.display = 'none';
        emptyState.style.display = 'block';
    } else {
        linksGrid.style.display = 'grid';
        emptyState.style.display = 'none';
    }

    linksGrid.innerHTML = filteredLinks.map((link, i) => {
        const animClass = animate ? ' anim' : '';
        const animDelay = animate ? ` style="animation-delay:${Math.min(i * 35, 400)}ms"` : '';
        return buildLinkCard(link, i).replace('class="link-card"', `class="link-card${animClass}"${animDelay}`);
    }).join('');
}

// 渲染工具卡片
function renderTools(animate = false) {
    dashboard.classList.add('hidden');
    mediaGrid.style.display = 'none';
    emptyState.style.display = 'none';

    const filteredTools = currentToolCategory
        ? allTools.filter(tool => tool.category === currentToolCategory)
        : allTools;

    linksGrid.style.display = 'grid';
    linksGrid.innerHTML = filteredTools.map((tool, i) => {
        const animClass = animate ? ' anim' : '';
        const animDelay = animate ? ` style="animation-delay:${Math.min(i * 35, 400)}ms"` : '';
        return buildToolCard(tool, i).replace('class="link-card"', `class="link-card${animClass}"${animDelay}`);
    }).join('');
}

// 渲染影视记录（海报卡片墙）
function renderMedia(animate = false) {
    dashboard.classList.add('hidden');
    linksGrid.style.display = 'none';
    emptyState.style.display = 'none';
    mediaGrid.style.display = 'block';

    let items = (mediaData.items || []).filter(i => i.type === currentMediaType);

    // 状态过滤（全部 / 想看 / 在看 / 看过）
    if (currentStatusFilter) items = items.filter(i => i.status === currentStatusFilter);

    // 排序
    const sorted = [...items];
    const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '', 'zh-Hans-CN');
    if (currentSort === 'rating-asc') sorted.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    else if (currentSort === 'rating-desc') sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else if (currentSort === 'release-asc') sorted.sort((a, b) => (a.release || '').localeCompare(b.release || ''));
    else if (currentSort === 'release-desc') sorted.sort((a, b) => (b.release || '').localeCompare(a.release || ''));
    else if (currentSort === 'title-desc') sorted.sort((a, b) => byTitle(b, a));
    else sorted.sort(byTitle);

    const chips = ['全部', '想看', '在看', '看过'].map(s =>
        `<button class="media-chip media-chip-status${(currentStatusFilter || '全部') === s ? ' active' : ''}" data-status-chip="${s}">${s}</button>`
    ).join('');
    const sortOptions = SORT_OPTIONS.map(([v, label]) =>
        `<option value="${v}"${v === currentSort ? ' selected' : ''}>${label}</option>`
    ).join('');

    const cards = sorted.map((item, i) => {
        const html = buildMediaCard(item, i);
        if (!animate) return html;
        const animDelay = ` style="animation-delay:${Math.min(i * 40, 450)}ms"`;
        return html.replace('class="media-card"', `class="media-card anim"${animDelay}`);
    }).join('');

    mediaGrid.innerHTML = `
        <div class="media-filters">
            <div class="media-chips">${chips}</div>
            <label class="media-sort">排序
                <select id="mediaSort">${sortOptions}</select>
            </label>
        </div>
        <div class="media-count">共 ${sorted.length} 部</div>
        <div class="media-cards">${cards || '<p class="empty-state">没有找到匹配的作品</p>'}</div>
    `;

    // 检测溢出的标题，悬停时横向滚动展示全名
    recalcMarquee();
}

// 重算长标题的循环滚动参数（渲染后与窗口 resize 时调用；root 可限定范围，默认全文档）
// 先摘掉 overflowing 量单份文案的真实宽度，再统一写回，避免逐个强制回流
function recalcMarquee(root) {
    const els = [...(root || document).querySelectorAll('.marquee')];
    if (!els.length) return;
    els.forEach(el => {
        el.classList.remove('overflowing');
        el.style.removeProperty('--marquee-dur');
    });
    const runs = els.map(el => el.querySelector('.r'));
    void document.body.offsetWidth;
    els.forEach((el, i) => {
        const run = runs[i];
        if (!run) return;
        const w = run.getBoundingClientRect().width;
        if (w > el.clientWidth + 1) {
            el.classList.add('overflowing');
            el.style.setProperty('--marquee-dur', Math.max(4, w / 40).toFixed(1) + 's'); // 约 40px/s
        }
    });
}

// 主题与设置
// 主题：从 localStorage 应用（设置页 settings.html 负责修改）；跟随系统时监听系统明暗变化
function initTheme() {
    applyThemeFromStorage();
    if (window.SiteAppearance) SiteAppearance.watchSystemTheme(applyThemeFromStorage);
}

function applyThemeFromStorage() {
    if (window.SiteAppearance) { SiteAppearance.applyThemeMode(); return; }
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

// 动画开关：从 localStorage 应用（body.no-anim 全局禁用过渡与关键帧）
function initAnimSetting() {
    applyAnimFromStorage();
}

function applyAnimFromStorage() {
    document.body.classList.toggle('no-anim', localStorage.getItem('animEnabled') === 'off');
}

// 界面字体：字体清单与按需加载都在 assets/appearance.js（settings.html 共用同一份）
function applyFontFromStorage() {
    if (window.SiteAppearance) SiteAppearance.applySiteFontFromStorage();
}

// 搜索回车聚焦首条结果
function focusFirstResult() {
    if (localStorage.getItem('focusFirst') === 'off') return;
    const first = linksGrid.querySelector('.link-card') || mediaGrid.querySelector('.media-card');
    if (first) first.focus();
}

// 设置弹层：iframe 加载 settings.html，更改通过 postMessage 同步
function initSettingsModal() {
    if (!settingsBtn || !settingsModal) return;
    const open = () => {
        settingsModal.hidden = false;
        void settingsModal.offsetHeight; // 同步回流，保证过渡生效（不依赖被节流的 rAF）
        settingsModal.classList.add('open');
        document.body.classList.add('modal-open'); // 锁定背景滚动
        document.getElementById('settingsClose').focus();
    };
    const close = () => {
        settingsModal.classList.remove('open');
        document.body.classList.remove('modal-open');
        setTimeout(() => { settingsModal.hidden = true; }, 200);
        settingsBtn.focus(); // 焦点还原
    };
    settingsBtn.addEventListener('click', open);
    document.getElementById('settingsClose').addEventListener('click', close);
    document.getElementById('settingsBackdrop').addEventListener('click', close);
    // ESC 在弹层打开时只关弹层，不触发全局"回首页"
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !settingsModal.hidden) {
            close();
            e.stopImmediatePropagation();
        }
    });
    window.addEventListener('message', (e) => {
        if (e.origin !== location.origin) return;
        if (e.data && e.data.type === 'settings-changed') {
            applyThemeFromStorage();
            applyAnimFromStorage();
            applyFontFromStorage();
            applyClockStyle();
            // 只有城市真的变了才重拉天气，避免改个深色模式也去敲天气接口
            const raw = window.SiteAppearance ? SiteAppearance.weatherCityRaw() : 'auto';
            if (raw !== lastWeatherRaw) initWeather(true);
        } else if (e.data && e.data.type === 'clear-cache') {
            document.querySelectorAll('.sidebar-section').forEach(s => s.classList.remove('section-collapsed'));
            document.getElementById('todoList').innerHTML = '';
            updateTodoCount();
        } else if (e.data && e.data.type === 'close-settings') {
            close();
        } else if (e.data && e.data.type === 'force-refresh') {
            (async () => {
                try {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    for (const r of regs) await r.unregister();
                    const keys = await caches.keys();
                    for (const k of keys) await caches.delete(k);
                } catch (err) { /* 忽略 */ }
                location.reload();
            })();
        }
    });
}



// ===== 命令面板（Ctrl/Cmd+K） =====
let cmdkActive = 0;
let cmdkCommands = [];

function buildCmdkCommands() {
    const cmds = [
        { icon: '', label: '回到首页', run: goHome },
        { icon: '', label: '打开设置', run: () => document.getElementById('settingsBtn').click() },
        { icon: '', label: 'Agent Plugin：Agent Skills', run: () => {
            document.querySelector('#sidebarPlugin [data-plugin-cat="skills"]')?.click();
        } },
        { icon: '', label: 'Agent Plugin：Agent MCP', run: () => {
            document.querySelector('#sidebarPlugin [data-plugin-cat="mcps"]')?.click();
        } },
        {
            icon: '🔄', label: '切换浅色 / 深色', run: () => {
                const dark = document.documentElement.getAttribute('data-theme') === 'dark';
                localStorage.setItem('theme', dark ? 'light' : 'dark');
                applyThemeFromStorage();
            }
        },
        {
            icon: '✨', label: '切换动画效果', run: () => {
                localStorage.setItem('animEnabled',
                    document.body.classList.contains('no-anim') ? 'on' : 'off');
                applyAnimFromStorage();
            }
        },
        { icon: '', label: '图片格式转换工具', run: () => { window.open('tools/image-converter/app.html', '_blank'); } }
    ];
    document.querySelectorAll('#sidebarCategories .sidebar-item').forEach(item => {
        cmds.push({
            icon: '⭐', label: '收藏分类：' + item.dataset.category,
            run: () => item.click()
        });
    });
    document.querySelectorAll('#sidebarTools .sidebar-item').forEach(item => {
        cmds.push({
            icon: '🔧', label: '工具分类：' + item.dataset.toolCategory,
            run: () => item.click()
        });
    });
    document.querySelectorAll('#sidebarMedia .sidebar-item').forEach(item => {
        cmds.push({
            icon: '🎬', label: '影视类型：' + item.dataset.mediaType,
            run: () => item.click()
        });
    });
    return cmds;
}

function toggleCmdk() {
    cmdk.hidden ? openCmdk() : closeCmdk();
}

function openCmdk() {
    cmdkCommands = buildCmdkCommands();
    cmdk.hidden = false;
    void cmdk.offsetHeight;
    cmdk.classList.add('open');
    cmdkInput.value = '';
    cmdkActive = 0;
    renderCmdkList('');
    setTimeout(() => cmdkInput.focus(), 30);
}

function closeCmdk() {
    cmdk.classList.remove('open');
    setTimeout(() => { cmdk.hidden = true; }, 150);
    cmdkInput.blur();
}

function renderCmdkList(query) {
    const q = query.toLowerCase().trim();
    let list = cmdkCommands.filter(c => c.label.toLowerCase().includes(q));
    if (q) {
        list = [{ icon: '🔍', label: '搜索：' + query, search: query }, ...list];
    }
    cmdkList.innerHTML = list.map((c, i) => `
        <li class="${i === cmdkActive ? 'active' : ''}" data-idx="${i}">${c.icon} ${escapeHtml(c.label)}</li>
    `).join('');
    cmdkList.__items = list;
    const active = cmdkList.querySelector('.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
}

function runCmdkItem(idx) {
    const item = cmdkList.__items && cmdkList.__items[idx];
    if (!item) return;
    closeCmdk();
    if (item.search !== undefined) {
        if (currentView !== 'home') goHome();
        searchInput.value = item.search;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.focus();
        return;
    }
    setTimeout(() => item.run(), 60);
}

function initPalette() {
    if (!cmdk || !cmdkInput) return;
    cmdkInput.addEventListener('input', () => {
        cmdkActive = 0;
        renderCmdkList(cmdkInput.value);
    });
    cmdkInput.addEventListener('keydown', (e) => {
        const items = cmdkList.__items || [];
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            cmdkActive = (cmdkActive + 1) % Math.max(items.length, 1);
            renderCmdkList(cmdkInput.value);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            cmdkActive = (cmdkActive - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1);
            renderCmdkList(cmdkInput.value);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopImmediatePropagation();
            runCmdkItem(cmdkActive);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            closeCmdk();
        }
    });
    cmdkList.addEventListener('click', (e) => {
        const li = e.target.closest('li[data-idx]');
        if (li) runCmdkItem(+li.dataset.idx);
    });
    cmdkList.addEventListener('mousemove', (e) => {
        const li = e.target.closest('li[data-idx]');
        if (li && !li.classList.contains('active')) {
            cmdkActive = +li.dataset.idx;
            cmdkList.querySelectorAll('li').forEach(x => x.classList.remove('active'));
            li.classList.add('active');
        }
    });
    document.getElementById('cmdkBackdrop').addEventListener('click', closeCmdk);
}

// 侧栏
function initSidebar() {
    const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (collapsed) {
        sidebar.classList.add('collapsed');
        document.body.classList.add('sidebar-collapsed');
    }
}

function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    document.body.classList.toggle('sidebar-collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed);
}

// 移动端菜单
function openMobileMenu() {
    sidebar.classList.add('mobile-open');
    sidebarOverlay.classList.add('visible');
}

function closeMobileMenu() {
    sidebar.classList.remove('mobile-open');
    sidebarOverlay.classList.remove('visible');
}

// 事件监听
function initEventListeners() {
    // 搜索：全域搜索（收藏 + 工具 + 影视），清空后恢复原视图
    searchInput.addEventListener('input', () => {
        const term = searchInput.value.toLowerCase().trim();
        if (term) {
            if (currentView !== 'search') {
                searchFrom = currentView;
                currentView = 'search';
                sidebarCategories.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
                sidebarTools.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
                sidebarMedia.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
                sidebarPlugin.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
                homeNav.classList.remove('active');
            }
            renderSearchWithLoading(term);
            return;
        }
        if (currentView === 'search') {
            currentView = searchFrom;
            renderCurrentView();
        }
    });

    // 搜索框回车聚焦首条结果（可设置关闭）
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            focusFirstResult();
        }
    });

    // 侧栏收缩
    sidebarCollapseBtn.addEventListener('click', toggleSidebar);

    // 移动端菜单
    mobileMenuBtn.addEventListener('click', openMobileMenu);
    sidebarOverlay.addEventListener('click', closeMobileMenu);

    // 回到首页
    homeNav.addEventListener('click', goHome);

    // 分类点击（事件委托）- 收藏分类
    sidebarCategories.addEventListener('click', (e) => {
        const item = e.target.closest('.sidebar-item');
        if (!item) return;
        sidebarCategories.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        homeNav.classList.remove('active');
        searchInput.value = ''; // 切视图清空搜索，避免残留
        if (item.dataset.ghstars) {
            currentCategory = '';
            currentView = 'ghstars';
            searchFrom = 'ghstars';
            renderGhStars(true);
            if (window.innerWidth <= 768) {
                closeMobileMenu();
            }
            return;
        }
        currentCategory = item.dataset.category;
        currentView = 'links';
        searchFrom = 'links';
        renderLinks(true);
        // 移动端自动关闭菜单
        if (window.innerWidth <= 768) {
            closeMobileMenu();
        }
    });

    // 侧栏内可点元素键盘支持（Enter/Space 触发点击）
    sidebar.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const item = e.target.closest('.sidebar-item');
        if (item) {
            e.preventDefault();
            item.click();
        }
    });

    // 侧栏内所有可点元素统一加涟漪反馈
    sidebar.addEventListener('click', (e) => {
        const host = e.target.closest('.sidebar-item, .sidebar-section-title, .home-btn, .settings-btn, .sidebar-collapse-btn');
        if (host) spawnRipple(host, e);
    });

    // 影视类型点击（侧栏）
    sidebarMedia.addEventListener('click', (e) => {
        const item = e.target.closest('.sidebar-item');
        if (!item) return;
        sidebarMedia.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        homeNav.classList.remove('active');
        currentMediaType = item.dataset.mediaType;
        currentStatusFilter = '';
        currentView = 'media';
        searchFrom = 'media';
        searchInput.value = '';
        renderMedia(true);
        if (window.innerWidth <= 768) {
            closeMobileMenu();
        }
    });

    // Agent Plugin 分类点击（侧栏：Agent Skills / Agent MCP）
    sidebarPlugin.addEventListener('click', (e) => {
        const item = e.target.closest('.sidebar-item');
        if (!item) return;
        sidebarPlugin.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        homeNav.classList.remove('active');
        currentPluginCat = item.dataset.pluginCat;
        currentView = 'plugin';
        searchFrom = 'plugin';
        searchInput.value = '';
        renderPluginCat(currentPluginCat);
        if (window.innerWidth <= 768) {
            closeMobileMenu();
        }
    });

    // 影视筛选芯片点击 + 排序切换（内容区，事件委托）
    mediaGrid.addEventListener('click', (e) => {
        const statusChip = e.target.closest('[data-status-chip]');
        if (!statusChip) return;
        currentStatusFilter = statusChip.dataset.statusChip === '全部' ? '' : statusChip.dataset.statusChip;
        renderMedia(false);
    });

    mediaGrid.addEventListener('change', (e) => {
        if (e.target.id === 'mediaSort') {
            currentSort = e.target.value;
            renderMedia(false);
        } else if (e.target.id === 'starsSort') {
            starsSort = e.target.value;
            renderGhStars(false);
        }
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K 打开/关闭命令面板
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            toggleCmdk();
        }
        // ESC 返回首页并清空搜索
        if (e.key === 'Escape') {
            goHome();
        }
    });

    // 后台节流兜底：切回页面/聚焦时立即渲染待定搜索结果
    window.addEventListener('focus', flushPendingSearch);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) flushPendingSearch();
    });

    // 窗口 resize：跨移动端断点时收起抽屉，并重算标题滚动参数
    let resizeTimer = null;
    let lastIsMobile = window.innerWidth <= 768;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const isMobile = window.innerWidth <= 768;
            if (lastIsMobile !== isMobile) {
                lastIsMobile = isMobile;
                closeMobileMenu();
            }
            recalcMarquee();
        }, 200);
    });

    // 访客统计：不蒜子是纯装饰第三方脚本，等首屏加载完、浏览器空闲再注入，
    // 不与关键资源抢带宽；成功取到数值后才显示胶囊，失败保持隐藏
    window.addEventListener('load', () => {
        const inject = () => {
            const s = document.createElement('script');
            s.async = true;
            s.src = 'https://busuanzi.cc/js/busuanzi/2.3/busuanzi.pure.mini.js';
            s.onload = () => setTimeout(() => {
                const pv = document.getElementById('busuanzi_value_site_pv');
                if (pv && pv.textContent.trim()) document.getElementById('siteStat').style.display = '';
            }, 800);
            document.head.appendChild(s);
        };
        if ('requestIdleCallback' in window) requestIdleCallback(inject, { timeout: 4000 });
        else setTimeout(inject, 1500);
    }, { once: true });

    // Service Worker（PWA 离线缓存，静默失败）
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => { });
    }
}
