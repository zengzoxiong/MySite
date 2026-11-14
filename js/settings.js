// 设置中心：主题/动画/字体应用 + 设置弹层（iframe 加载 settings.html，postMessage 单向同步）。
// 拆分自 script.js 原第 4070–4164 行；跨块调用（时钟/天气/待办）走对主 script.js 的
// 循环导入，仅在函数体内访问（约定见 js/common.js 头部）。
import { lsGet } from './common.js';
import { applyClockStyle, initWeather, lastWeatherRaw, updateTodoCount } from '../script.js';

const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsClose = document.getElementById('settingsClose');
const settingsBackdrop = document.getElementById('settingsBackdrop');
const sidebar = document.getElementById('sidebar');

// 主题：从 localStorage 应用（设置页 settings.html 负责修改）；跟随系统时监听系统明暗变化
export function initTheme() {
    applyThemeFromStorage();
    if (window.SiteAppearance) SiteAppearance.watchSystemTheme(applyThemeFromStorage);
}

function applyThemeFromStorage() {
    if (window.SiteAppearance) { SiteAppearance.applyThemeMode(); return; }
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

// 动画开关：从 localStorage 应用（body.no-anim 全局禁用过渡与关键帧）
export function initAnimSetting() {
    applyAnimFromStorage();
}

// 命令面板的「切换动画效果」也走这里
export function applyAnimFromStorage() {
    document.body.classList.toggle('no-anim', lsGet('animEnabled') === 'off');
}

// 界面字体：字体清单与按需加载都在 assets/appearance.js（settings.html 共用同一份）
export function applyFontFromStorage() {
    if (window.SiteAppearance) SiteAppearance.applySiteFontFromStorage();
}

// 设置弹层：iframe 加载 settings.html，更改通过 postMessage 同步
export function initSettingsModal() {
    if (!settingsBtn || !settingsModal) return;
    const open = () => {
        settingsModal.hidden = false;
        void settingsModal.offsetHeight; // 同步回流，保证过渡生效（不依赖被节流的 rAF）
        settingsModal.classList.add('open');
        document.body.classList.add('modal-open'); // 锁定背景滚动
        settingsClose.focus();
    };
    const close = () => {
        settingsModal.classList.remove('open');
        document.body.classList.remove('modal-open');
        setTimeout(() => { if (!settingsModal.classList.contains('open')) settingsModal.hidden = true; }, 200);
        settingsBtn.focus(); // 焦点还原
    };
    settingsBtn.addEventListener('click', open);
    settingsClose.addEventListener('click', close);
    settingsBackdrop.addEventListener('click', close);
    // ESC 在弹层打开时只关弹层，不触发全局"回首页"
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !settingsModal.hidden) {
            close();
            e.stopImmediatePropagation();
        }
    });
    window.addEventListener('message', (e) => {
        if (e.origin !== location.origin) return;
        if (e.data && e.data.type === 'accent-changed') {
            if (window.SiteAppearance) SiteAppearance.applyAccentFromStorage();
        } else if (e.data && e.data.type === 'settings-changed') {
            applyThemeFromStorage();
            applyAnimFromStorage();
            applyFontFromStorage();
            applyClockStyle();
            // 只有城市真的变了才重拉天气，避免改个深色模式也去敲天气接口
            const raw = window.SiteAppearance ? SiteAppearance.weatherCityRaw() : 'auto';
            if (raw !== lastWeatherRaw) initWeather(true);
        } else if (e.data && e.data.type === 'clear-cache') {
            // 设置页已清空全部本站 localStorage 键，这里把由持久化状态驱动的 UI 同步回默认
            document.body.classList.remove('no-anim');
            document.body.classList.remove('sidebar-collapsed');
            sidebar.classList.remove('collapsed');
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
