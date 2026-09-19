// 全局状态
let allLinks = [];
let allTools = [];
let mediaData = { types: [], items: [] };
let pluginsData = { skills: { groups: [] }, mcps: [] };
let starsData = { updated: '', repos: [] };
let currentCategory = '';
let currentToolCategory = '';
let currentMediaType = '番剧';
let currentSort = 'rating-desc'; // 六向排序，见 SORT_OPTIONS
let currentView = 'home'; // 'home' | 'links' | 'tools' | 'media' | 'skills' | 'search'
let currentPluginCat = '';
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
    initSettingsModal();
    initPalette();
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

// --- 时钟 ---
function initClock() {
    const clockTime = document.getElementById('clockTime');
    const clockDate = document.getElementById('clockDate');
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

    function tick() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        clockTime.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        clockDate.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 星期${weekdays[now.getDay()]}`;
    }
    tick();
    setInterval(tick, 1000);
}

// --- 天气（西安，Open-Meteo 免费接口，无需密钥） ---
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

async function initWeather(manual = false) {
    const weatherIcon = document.getElementById('weatherIcon');
    const weatherTemp = document.getElementById('weatherTemp');
    const weatherDesc = document.getElementById('weatherDesc');
    const weatherExtra = document.getElementById('weatherExtra');

    try {
        if (manual) weatherIcon.classList.add('refreshing');
        // 西安坐标 34.34°N, 108.94°E
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=34.34&longitude=108.94' +
            '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m' +
            '&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai&forecast_days=1';
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const cur = data.current;
        const [text, icon] = WMO_CODES[cur.weather_code] || ['未知', '🌡️'];
        const daily = data.daily;

        weatherIcon.textContent = icon;
        weatherTemp.textContent = `${Math.round(cur.temperature_2m)}°C`;
        weatherDesc.textContent = `西安 · ${text}`;
        weatherExtra.textContent = `今日 ${Math.round(daily.temperature_2m_min[0])}° ~ ${Math.round(daily.temperature_2m_max[0])}° · 湿度 ${cur.relative_humidity_2m}% · 风速 ${Math.round(cur.wind_speed_10m)}km/h`;
    } catch (e) {
        if (!manual) weatherDesc.textContent = '西安 · 天气获取失败';
        console.error('天气加载失败:', e);
    } finally {
        weatherIcon.classList.remove('refreshing');
    }
}

// --- 今日一言（Hitokoto 免费接口） ---
async function loadQuote() {
    const quoteText = document.getElementById('quoteText');
    const quoteMeta = document.getElementById('quoteMeta');
    try {
        const res = await fetch('https://v1.hitokoto.cn/?c=i&c=k&c=d&max_length=42');
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
    loadQuote();
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

    const repos = starsData.repos || [];
    const cards = repos.map((r, i) => {
        const initial = escapeHtml((r.name || '?').charAt(0).toUpperCase());
        const grad = SKILL_GRADIENTS[i % SKILL_GRADIENTS.length];
        return `
        <a href="${r.url}" target="_blank" rel="noopener noreferrer" class="skill-card">
            <div class="skill-top">
                <div class="skill-avatar" style="background:${grad}">${initial}</div>
                <div class="skill-title-wrap">
                    <div class="skill-name">${escapeHtml(r.full_name)}</div>
                    <span class="skill-tag">★ ${r.stars}</span>
                </div>
            </div>
            ${r.desc ? `<div class="skill-desc">${escapeHtml(r.desc)}</div>` : ''}
            <div class="skill-foot">
                ${r.language ? `<span class="skill-tag">${escapeHtml(r.language)}</span>` : ''}
                <span class="skill-link">星标于 ${r.starred_at}</span>
            </div>
        </a>`;
    }).join('');

    mediaGrid.innerHTML = `
        <div class="media-count" style="margin-bottom:14px">共 ${repos.length} 个星标仓库${starsData.updated ? ' · 最近同步 ' + starsData.updated : ''} · 每日自动更新</div>
        <div class="skills-cards">${cards || '<p class="empty-state">还没有星标仓库</p>'}</div>
    `;
    recalcMarquee();
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
        html += group('🌐 网站收藏', links.length, links.map(buildLinkCard).join(''));
    }
    if (tools.length) {
        html += group('🔧 在线工具', tools.length, tools.map(buildToolCard).join(''));
    }
    if (media.length) {
        html += group('🎬 影视收藏', media.length, `<div class="media-cards">${media.map(buildMediaCard).join('')}</div>`);
    }
    if (skills.length) {
        html += group('🧩 Agent Skills', skills.length, `<div class="skills-cards">${skills.map(skillCardHtml).join('')}</div>`);
    }
    if (mcps.length) {
        const mcpCard = (m) => `
            <div class="skill-card">
                <div class="skill-top">
                    <div class="skill-avatar">${escapeHtml((m.name || '?').charAt(0).toUpperCase())}</div>
                    <div class="skill-title-wrap">
                        <div class="skill-name">${escapeHtml(m.name)}<span class="skill-tag" style="margin-left:8px">${m.type === 'http' ? 'HTTP' : 'STDIO'}</span></div>
                        <div class="skill-sub">${escapeHtml(m.desc)}</div>
                    </div>
                </div>
            </div>`;
        html += group('🔌 Agent MCP', mcps.length, `<div class="skills-cards">${mcps.map(mcpCard).join('')}</div>`);
    }
    if (stars.length) {
        const starCard = (r) => `
            <a href="${r.url}" target="_blank" rel="noopener noreferrer" class="skill-card">
                <div class="skill-top">
                    <div class="skill-title-wrap" style="min-width:0">
                        <div class="skill-name">${escapeHtml(r.full_name)}</div>
                        <span class="skill-tag">★ ${r.stars}</span>
                    </div>
                </div>
                ${r.desc ? `<div class="skill-desc">${escapeHtml(r.desc)}</div>` : ''}
                <div class="skill-foot">${r.language ? `<span class="skill-tag">${escapeHtml(r.language)}</span>` : ''}</div>
            </a>`;
        html += group('⭐ GitHub Stars', stars.length, `<div class="skills-cards">${stars.map(starCard).join('')}</div>`);
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

// 技能卡片构建（视图与搜索复用）：渐变头像 + 分组徽标 + 安装命令行
const SKILL_GRADIENTS = [
    'linear-gradient(135deg, #6366f1, #8b5cf6)',
    'linear-gradient(135deg, #0ea5e9, #6366f1)',
    'linear-gradient(135deg, #10b981, #0ea5e9)',
    'linear-gradient(135deg, #f59e0b, #ef4444)',
    'linear-gradient(135deg, #ec4899, #8b5cf6)',
    'linear-gradient(135deg, #14b8a6, #22c55e)'
];

function groupBadgeHtml(group) {
    return group ? `<span class="skill-tag">${escapeHtml(group)}</span>` : '';
}

function skillCardHtml(s) {
    const initial = escapeHtml((s.name || '?').charAt(0).toUpperCase());
    const grad = SKILL_GRADIENTS[(s.name || '').length % SKILL_GRADIENTS.length];
    const install = s.upstream === 'local-only'
        ? `<div class="skill-install"><code>（本地技能，无公开上游仓库）</code></div>`
        : `<div class="skill-install"><code>npx skills add ${s.upstream}${s.local ? '/' + s.name : ''}</code><button class="copy-btn" data-cmd="npx skills add ${s.upstream}${s.local ? '/' + s.name : ''}">复制</button></div>`;
    const link = s.upstream === 'local-only' ? ''
        : `<a class="skill-link" href="https://github.com/${s.upstream}${s.local ? '/tree/main/skills/' + s.name : ''}" target="_blank" rel="noopener noreferrer">来源仓库 ↗</a>`;
    return `
    <div class="skill-card">
        <div class="skill-top">
            <div class="skill-avatar" style="background:${grad}">${initial}</div>
            <div class="skill-title-wrap">
                <div class="skill-name">${escapeHtml(s.name)}</div>
                <div class="skill-sub">${groupBadgeHtml(s.group)}${s.local ? '<span class="skill-tag">本地镜像</span>' : ''}</div>
            </div>
        </div>
        ${install}
        <div class="skill-foot">${link}</div>
    </div>`;
}

// MCP 卡片构建：头像 + 类型徽标 + 说明 + 配置方法 + 上游链接
function mcpCardHtml(m) {
    const initial = escapeHtml((m.name || '?').charAt(0).toUpperCase());
    const grad = SKILL_GRADIENTS[(m.name || '').length % SKILL_GRADIENTS.length];
    const configText = escapeHtml(JSON.stringify(m.config, null, 2));
    const home = m.homepage
        ? `<a class="skill-link" href="${m.homepage}" target="_blank" rel="noopener noreferrer">官方页面 ↗</a>`
        : '<span class="skill-link" style="color:var(--text-tertiary)">本地自部署</span>';
    return `
    <div class="skill-card">
        <div class="skill-top">
            <div class="skill-avatar" style="background:${grad}">${initial}</div>
            <div class="skill-title-wrap">
                <div class="skill-name">${escapeHtml(m.name)}<span class="skill-tag" style="margin-left:8px">${m.type === 'http' ? 'HTTP' : 'STDIO'}</span></div>
                <div class="skill-sub">${escapeHtml(m.desc)}</div>
            </div>
        </div>
        <div class="config-block"><div class="config-label">配置方法 · 密钥用占位符，替换为自己的</div><pre>${configText}</pre></div>
        <div class="skill-foot">${home}</div>
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
            <span class="item-text">⭐ 我的 Stars</span>
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
    // 尝试加载 favicon，两级失败后回退到 emoji
    const faviconHtml = domain
        ? `<img src="https://favicon.im/${domain}" alt="" onerror="this.onerror=null;this.src='https://icons.duckduckgo.com/ip3/${domain}.ico';this.onerror=function(){this.parentElement.innerHTML='${escapeJs(emojiIcon)}'};" width="32" height="32" loading="lazy">`
        : emojiIcon;
    return `
    <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="link-card">
        <div class="icon">${faviconHtml}</div>
        <div class="info">
            <div class="title">${escapeHtml(link.title)}</div>
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
            <div class="media-title"><span class="t">${title}</span></div>
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

    // 排序
    const sorted = [...items];
    const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '', 'zh-Hans-CN');
    if (currentSort === 'rating-asc') sorted.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    else if (currentSort === 'rating-desc') sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else if (currentSort === 'release-asc') sorted.sort((a, b) => (a.release || '').localeCompare(b.release || ''));
    else if (currentSort === 'release-desc') sorted.sort((a, b) => (b.release || '').localeCompare(a.release || ''));
    else if (currentSort === 'title-desc') sorted.sort((a, b) => byTitle(b, a));
    else sorted.sort(byTitle);

    const chips = (mediaData.types || []).map(t =>
        `<button class="media-chip${t === currentMediaType ? ' active' : ''}" data-media-chip="${t}">${t}</button>`
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

// 重算溢出标题的滚动参数（渲染后与窗口 resize 时调用）
function recalcMarquee() {
    mediaGrid.querySelectorAll('.media-title').forEach(el => {
        const span = el.querySelector('.t');
        if (!span) return;
        const overflow = span.scrollWidth > el.clientWidth + 1;
        el.classList.toggle('overflowing', overflow);
        if (overflow) {
            const shift = span.scrollWidth - el.clientWidth;
            span.style.setProperty('--shift', shift + 'px');
            span.style.setProperty('--marquee-dur', (3.5 + shift / 22).toFixed(1) + 's');
        } else {
            span.style.removeProperty('--shift');
            span.style.removeProperty('--marquee-dur');
        }
    });
}

// 主题与设置
// 主题：从 localStorage 应用（设置页 settings.html 负责修改）
function initTheme() {
    applyThemeFromStorage();
}

function applyThemeFromStorage() {
    const savedTheme = localStorage.getItem('theme');
    const dark = savedTheme ? savedTheme === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

// 动画开关：从 localStorage 应用（body.no-anim 全局禁用过渡与关键帧）
function initAnimSetting() {
    applyAnimFromStorage();
}

function applyAnimFromStorage() {
    document.body.classList.toggle('no-anim', localStorage.getItem('animEnabled') === 'off');
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
        } else if (e.data && e.data.type === 'clear-cache') {
            document.querySelectorAll('.sidebar-section').forEach(s => s.classList.remove('section-collapsed'));
            document.getElementById('todoList').innerHTML = '';
            updateTodoCount();
        } else if (e.data && e.data.type === 'close-settings') {
            close();
        }
    });
}



// ===== 命令面板（Ctrl/Cmd+K） =====
let cmdkActive = 0;
let cmdkCommands = [];

function buildCmdkCommands() {
    const cmds = [
        { icon: '🏠', label: '回到首页', run: goHome },
        { icon: '⚙️', label: '打开设置', run: () => document.getElementById('settingsBtn').click() },
        { icon: '🧩', label: 'Agent Plugin：Agent Skills', run: () => {
            document.querySelector('#sidebarPlugin [data-plugin-cat="skills"]')?.click();
        } },
        { icon: '🔌', label: 'Agent Plugin：Agent MCP', run: () => {
            document.querySelector('#sidebarPlugin [data-plugin-cat="mcps"]')?.click();
        } },
        {
            icon: '🔄', label: '切换深色模式', run: () => {
                localStorage.setItem('theme',
                    document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
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
        { icon: '🖼️', label: '图片格式转换工具', run: () => { window.open('tools/image-converter/app.html', '_blank'); } }
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
        const chip = e.target.closest('.media-chip');
        if (!chip) return;
        currentMediaType = chip.dataset.mediaChip;
        // 同步侧栏高亮
        sidebarMedia.querySelectorAll('.sidebar-item').forEach(i =>
            i.classList.toggle('active', i.dataset.mediaType === currentMediaType));
        homeNav.classList.remove('active');
        renderMedia(false);
    });

    mediaGrid.addEventListener('change', (e) => {
        if (e.target.id === 'mediaSort') {
            currentSort = e.target.value;
            renderMedia(false);
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

    // 访客统计：不蒜子成功取到数值后才显示胶囊，失败保持隐藏
    window.addEventListener('load', () => {
        setTimeout(() => {
            const pv = document.getElementById('busuanzi_value_site_pv');
            if (pv && pv.textContent.trim()) {
                document.getElementById('siteStat').style.display = '';
            }
        }, 3000);
    });

    // Service Worker（PWA 离线缓存，静默失败）
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => { });
    }
}
