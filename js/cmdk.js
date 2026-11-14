// 命令面板（Ctrl/Cmd+K）：拆分自 script.js 原第 4168–4360 行。
// 跨块调用（视图/天气/签到/播放器）走对主 script.js 的循环导入，仅在函数体内访问
// （约定见 js/common.js 头部）；「切换动画效果」复用 js/settings.js 的 applyAnimFromStorage。
import { lsGet, lsSet, escapeHtml } from './common.js';
import { applyAnimFromStorage } from './settings.js';
import { goHome, currentView, searchInput, initWeather, isCheckedInToday, openTalisman, applyClockStyle, clockStyle, mp } from '../script.js';

const cmdk = document.getElementById('cmdk');
const cmdkInput = document.getElementById('cmdkInput');
const cmdkList = document.getElementById('cmdkList');

let cmdkActive = 0;
let cmdkCommands = [];

// 面板图标统一内联 SVG（站点禁 emoji）：stroke 继承 currentColor，尺寸由 CSS 控
const IC = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v9h-5v-6h-6v6H4z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M19 7h1M4 17h3M13 17h7"/><circle cx="16" cy="7" r="2.4"/><circle cx="10" cy="17" r="2.4"/></svg>',
    theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" style="fill:currentColor;stroke:none"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
    type: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M12 6v13M9 19h6"/></svg>',
    motion: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>',
    weather: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M7 17h9a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.4A3.5 3.5 0 0 0 7 17z"/></svg>',
    quote: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7H6a2 2 0 0 0-2 2v4h6V7zM10 13c0 3-1.4 4.6-4 5.4M20 7h-4a2 2 0 0 0-2 2v4h6V7zM20 13c0 3-1.4 4.6-4 5.4"/></svg>',
    seal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3.5" width="10" height="17" rx="2"/><path d="M10 8h4M10 12h4M10 16h2.5"/></svg>',
    plug: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l2.4 5 5.6.7-4.1 3.8 1.1 5.5-5-2.8-5 2.8 1.1-5.5L4 9.7 9.6 9z"/></svg>',
    wrench: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.9 2.9-2.1-2.1z"/></svg>',
    film: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 5v14M16 5v14M4 10h4M4 14h4M16 10h4M16 14h4"/></svg>',
    chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v14h16"/><path d="M7.5 14.5l3.5-4 3 2.5 4.5-6"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>'
};

// 面板动作：外观模式三态循环（浅色→深色→跟随系统）
function cycleThemeMode() {
    if (!window.SiteAppearance) return; // appearance.js 加载失败时这三条命令整体跳过
    const order = ['light', 'dark', 'system'];
    const cur = SiteAppearance.themeModeFromStorage();
    const next = order[(order.indexOf(cur) + 1) % order.length];
    lsSet(SiteAppearance.KEY_THEME, next);
    SiteAppearance.applyThemeMode();
}

// 面板动作：时钟风格循环（简约→翻页→上滑→叠卡→滚轮→立方）
function cycleClockStyle() {
    if (!window.SiteAppearance) return;
    const ids = SiteAppearance.CLOCK_STYLES.map(s => s.id);
    const next = ids[(ids.indexOf(clockStyle) + 1) % ids.length];
    lsSet(SiteAppearance.KEY_CLOCK, next);
    applyClockStyle();
}

// 面板动作：界面字体循环（含系统默认）
function cycleSiteFont() {
    if (!window.SiteAppearance) return;
    const fonts = SiteAppearance.SITE_FONTS;
    const cur = lsGet(SiteAppearance.KEY_FONT) || 'system';
    const idx = fonts.findIndex(f => f.id === cur);
    const next = fonts[(idx + 1) % fonts.length];
    lsSet(SiteAppearance.KEY_FONT, next.id);
    SiteAppearance.applySiteFont(next.id);
}

function buildCmdkCommands() {
    const cmds = [
        { icon: IC.home, label: '回到首页', run: goHome },
        { icon: IC.gear, label: '打开设置', run: () => document.getElementById('settingsBtn').click() },
        { icon: IC.theme, label: '外观模式：浅色 / 深色 / 跟随系统 循环', run: cycleThemeMode },
        { icon: IC.clock, label: '切换首页时钟风格', run: cycleClockStyle },
        { icon: IC.type, label: '切换界面字体', run: cycleSiteFont },
        { icon: IC.motion, label: '切换动画效果', run: () => {
            lsSet('animEnabled',
                document.body.classList.contains('no-anim') ? 'on' : 'off');
            applyAnimFromStorage();
        } },
        { icon: IC.weather, label: '刷新天气', run: () => initWeather(true) },
        { icon: IC.quote, label: '换一句一言', run: () => {
            if (isCheckedInToday()) document.getElementById('quoteRefresh').click();
        } },
        { icon: IC.seal, label: isCheckedInToday() ? '再看今日签' : '立即签到', run: () => {
            if (isCheckedInToday()) openTalisman();
            else document.getElementById('checkinBtn').click();
        } },
        { icon: IC.chart, label: '数据看板：汇率走势', run: () => {
            document.querySelector('#sidebarData [data-fx]')?.click();
        } },
        { icon: IC.star, label: '数据看板：我的 Stars', run: () => {
            document.querySelector('#sidebarData [data-ghstars]')?.click();
        } },
        { icon: IC.plug, label: '数据看板：Agent Skills', run: () => {
            document.querySelector('#sidebarData [data-plugin-cat="skills"]')?.click();
        } },
        { icon: IC.plug, label: '数据看板：Agent MCP', run: () => {
            document.querySelector('#sidebarData [data-plugin-cat="mcps"]')?.click();
        } },
        { icon: IC.chart, label: '数据看板：Token 用量', run: () => {
            document.querySelector('#sidebarData [data-token]')?.click();
        } },
        { icon: IC.wrench, label: '图片格式转换工具', run: () => { window.open('tools/image-converter/app.html', '_blank'); } }
    ];
    document.querySelectorAll('#sidebarCategories .sidebar-item').forEach(item => {
        cmds.push({ icon: IC.star, label: '收藏分类：' + item.dataset.category, run: () => item.click() });
    });
    document.querySelectorAll('#sidebarTools .sidebar-item').forEach(item => {
        cmds.push({ icon: IC.wrench, label: '工具分类：' + item.dataset.toolCategory, run: () => item.click() });
    });
    document.querySelectorAll('#sidebarMedia .sidebar-item').forEach(item => {
        cmds.push({ icon: IC.film, label: '影视类型：' + item.dataset.mediaType, run: () => item.click() });
    });
    return cmds;
}

export function toggleCmdk() {
    // 以 .open 为准（hidden 要等关闭过渡结束才翻转，用它判断会让快速重开失灵）
    cmdk.classList.contains('open') ? closeCmdk() : openCmdk();
}

function openCmdk() {
    if (mp.fs && mp.exitFs) mp.exitFs();   // 全屏播放时命令面板浮在其上，切走视图前先退全屏
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
    setTimeout(() => { if (!cmdk.classList.contains('open')) cmdk.hidden = true; }, 150);
    cmdkInput.blur();
}

function renderCmdkList(query) {
    const q = query.toLowerCase().trim();
    let list = cmdkCommands.filter(c => c.label.toLowerCase().includes(q));
    if (q) {
        list = [{ icon: IC.search, label: '搜索：' + query, search: query }, ...list];
    }
    cmdkList.innerHTML = list.map((c, i) => `
        <li role="option" aria-selected="${i === cmdkActive}" class="${i === cmdkActive ? 'active' : ''}" data-idx="${i}">${c.icon} ${escapeHtml(c.label)}</li>
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

export function initPalette() {
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
