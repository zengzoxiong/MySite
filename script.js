// 全局状态
let allLinks = [];
let allTools = [];
let mediaData = { types: [], items: [] };
let currentCategory = '';
let currentToolCategory = '';
let currentMediaType = '番剧';
let currentSort = 'rating'; // 'rating' | 'title' | 'release'
let currentView = 'home'; // 'home' | 'links' | 'tools' | 'media'
let viewBeforeSearch = null; // 从首页进入搜索态时记住来源

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
const themeToggle = document.getElementById('themeToggle');
const themeIcon = (themeToggle && themeToggle.querySelector('.theme-icon')) || null;
const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const mainContent = document.getElementById('mainContent');
const dashboard = document.getElementById('dashboard');
const homeNav = document.getElementById('homeNav');
const mediaGrid = document.getElementById('mediaGrid');
const sidebarMedia = document.getElementById('sidebarMedia');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadLinks();
    initTheme();
    initAnimSetting();
    initFocusFirstSetting();
    initSettingsPanel();
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
    document.getElementById('heroWeather').addEventListener('click', () => initWeather(true));
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

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    viewBeforeSearch = null;
    searchInput.value = '';
    currentCategory = '';
    currentToolCategory = '';
    currentMediaType = '';
    sidebarCategories.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    sidebarTools.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    sidebarMedia.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    homeNav.classList.add('active');
    renderLinks();
    searchInput.blur();
    if (window.innerWidth <= 768) {
        closeMobileMenu();
    }
}

// 渲染侧栏影视区（类型导航，无"全部"）
function renderSidebarMedia() {
    const types = mediaData.types || [];
    sidebarMedia.innerHTML = types.map(t => `
        <div class="sidebar-item" data-media-type="${t}">
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
}

// 渲染侧栏工具区（分类导航）
function renderSidebarTools() {
    const categories = [...new Set(allTools.map(t => t.category))];
    sidebarTools.innerHTML = categories.map(cat => `
        <div class="sidebar-item" data-tool-category="${cat}">
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
        renderTools(true);
        if (window.innerWidth <= 768) {
            closeMobileMenu();
        }
    });
}

// 渲染侧栏分类区
function renderSidebarCategories(categories) {
    let html = '';
    categories.forEach(cat => {
        html += `
            <div class="sidebar-item" data-category="${cat}">
                <span class="item-text">${cat}</span>
            </div>
        `;
    });
    sidebarCategories.innerHTML = html;
}

// 从 URL 提取域名
function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

// 渲染链接卡片
function renderLinks(animate = false) {
    const searchTerm = searchInput.value.toLowerCase().trim();

    // 首页视图：仅显示仪表盘，不显示收藏卡片
    if (currentView === 'home' && !searchTerm) {
        dashboard.classList.remove('hidden');
        linksGrid.style.display = 'none';
        mediaGrid.style.display = 'none';
        emptyState.style.display = 'none';
        return;
    }

    dashboard.classList.add('hidden');
    mediaGrid.style.display = 'none';

    let filteredLinks = allLinks;

    // 搜索时搜索所有，不按分类筛选
    if (!searchTerm && currentCategory) {
        filteredLinks = filteredLinks.filter(link => link.category === currentCategory);
    } else if (searchTerm) {
        filteredLinks = filteredLinks.filter(link =>
            link.title.toLowerCase().includes(searchTerm) ||
            link.description.toLowerCase().includes(searchTerm)
        );
    }

    if (filteredLinks.length === 0) {
        linksGrid.style.display = 'none';
        emptyState.style.display = 'block';
    } else {
        linksGrid.style.display = 'grid';
        emptyState.style.display = 'none';
    }

    linksGrid.innerHTML = filteredLinks.map((link, i) => {
        const domain = getDomain(link.url);
        const emojiIcon = link.icon || '🔗';
        // 尝试加载 favicon，失败则显示 emoji
        const faviconHtml = domain
            ? `<img src="https://favicon.im/${domain}" alt="" onerror="this.onerror=null;this.src='https://icons.duckduckgo.com/ip3/${domain}.ico';this.onerror=function(){this.parentElement.innerHTML='${emojiIcon}'};" width="32" height="32">`
            : emojiIcon;
        const animClass = animate ? ' anim' : '';
        const animDelay = animate ? ` style="animation-delay:${Math.min(i * 35, 400)}ms"` : '';
        return `
        <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="link-card${animClass}"${animDelay}>
            <div class="icon">
                ${faviconHtml}
            </div>
            <div class="info">
                <div class="title">${link.title}</div>
                <div class="description">${link.description}</div>
                <span class="category">${link.category}</span>
            </div>
        </a>`;
    }).join('');
}

// 渲染工具卡片
function renderTools(animate = false) {
    dashboard.classList.add('hidden');
    mediaGrid.style.display = 'none';

    const searchTerm = searchInput.value.toLowerCase().trim();

    let filteredTools = allTools;

    // 搜索时搜索所有，不按分类筛选
    if (!searchTerm && currentToolCategory) {
        filteredTools = filteredTools.filter(tool => tool.category === currentToolCategory);
    } else if (searchTerm) {
        filteredTools = filteredTools.filter(tool =>
            tool.name.toLowerCase().includes(searchTerm) ||
            tool.description.toLowerCase().includes(searchTerm)
        );
    }

    if (filteredTools.length === 0) {
        linksGrid.style.display = 'none';
        emptyState.style.display = 'block';
    } else {
        linksGrid.style.display = 'grid';
        emptyState.style.display = 'none';
    }

    linksGrid.innerHTML = filteredTools.map((tool, i) => {
        const faviconUrl = tool.icon || '';
        const animClass = animate ? ' anim' : '';
        const animDelay = animate ? ` style="animation-delay:${Math.min(i * 35, 400)}ms"` : '';
        return `
        <a href="tools/${tool.path}" target="_blank" rel="noopener noreferrer" class="link-card${animClass}"${animDelay}>
            <div class="icon">
                ${faviconUrl ? `<span style="font-size:1.2rem">${faviconUrl}</span>` : '🔧'}
            </div>
            <div class="info">
                <div class="title">${tool.name}</div>
                <div class="description">${tool.description}</div>
                <span class="category">${tool.category}</span>
            </div>
        </a>`;
    }).join('');
}

// 渲染影视记录（海报卡片墙）
function renderMedia(animate = false) {
    dashboard.classList.add('hidden');
    linksGrid.style.display = 'none';
    emptyState.style.display = 'none';
    mediaGrid.style.display = 'block';

    const searchTerm = searchInput.value.toLowerCase().trim();
    let items = (mediaData.items || []).filter(i => i.type === currentMediaType);
    if (searchTerm) items = items.filter(i =>
        i.title.toLowerCase().includes(searchTerm) ||
        (i.comment || '').toLowerCase().includes(searchTerm)
    );

    // 排序：评分降序 / 名称 A-Z / 上映时间（新→旧）
    const sorted = [...items];
    if (currentSort === 'title') {
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-Hans-CN'));
    } else if (currentSort === 'release') {
        sorted.sort((a, b) => (b.release || '').localeCompare(a.release || ''));
    } else {
        sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    const chips = (mediaData.types || []).map(t =>
        `<button class="media-chip${t === currentMediaType ? ' active' : ''}" data-media-chip="${t}">${t}</button>`
    ).join('');
    const sortOptions = [
        ['rating', '按评分'],
        ['title', '按名称 A-Z'],
        ['release', '按上映时间']
    ].map(([v, label]) =>
        `<option value="${v}"${v === currentSort ? ' selected' : ''}>${label}</option>`
    ).join('');

    const cards = sorted.map((item, i) => {
        const title = escapeHtml(item.title || '');
        const statusClass = item.status === '在看' ? ' watching' : (item.status === '想看' ? ' wish' : '');
        const gradient = TYPE_GRADIENTS[item.type] || TYPE_GRADIENTS['默认'];
        const animClass = animate ? ' anim' : '';
        const animDelay = animate ? ` style="animation-delay:${Math.min(i * 40, 450)}ms"` : '';
        const coverInner = `
            <div class="media-ph" style="background:${gradient}"><span class="ph-char">${title.charAt(0)}</span><span class="ph-title">${title}</span></div>
            ${item.cover ? `<img src="${item.cover}" alt="${title}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
            ${item.status ? `<span class="badge-status${statusClass}">${item.status}</span>` : ''}
            ${item.rating ? `<span class="badge-rating">★ ${item.rating}</span>` : ''}
            ${item.comment ? `<div class="media-overlay"><p>${escapeHtml(item.comment)}</p></div>` : ''}`;
        const infoInner = `
            <div class="media-title"><span class="t">${title}</span></div>
            <div class="media-meta">${item.type || ''}${item.release ? ' · ' + item.release : ''}</div>`;
        const tag = item.url ? 'a' : 'div';
        const urlAttrs = item.url ? ` href="${item.url}" target="_blank" rel="noopener noreferrer"` : '';
        return `<${tag} class="media-card${animClass}"${urlAttrs}${animDelay}>
            <div class="media-cover">${coverInner}</div>
            <div class="media-info">${infoInner}</div>
        </${tag}>`;
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
    mediaGrid.querySelectorAll('.media-title').forEach(el => {
        const span = el.querySelector('.t');
        if (span && span.scrollWidth > el.clientWidth + 1) {
            const shift = span.scrollWidth - el.clientWidth;
            el.classList.add('overflowing');
            span.style.setProperty('--shift', shift + 'px');
            span.style.setProperty('--marquee-dur', (3.5 + shift / 22).toFixed(1) + 's');
        }
    });
}

// 主题与设置
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    const settingTheme = document.getElementById('settingTheme');
    if (settingTheme) {
        settingTheme.checked = document.documentElement.getAttribute('data-theme') === 'dark';
        settingTheme.addEventListener('change', () => {
            const next = settingTheme.checked ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
        });
    }
}

// 动画开关：关闭时为 body 加 no-anim，全局禁用过渡与关键帧
function initAnimSetting() {
    const settingAnim = document.getElementById('settingAnim');
    if (!settingAnim) return;
    const saved = localStorage.getItem('animEnabled');
    const enabled = saved !== 'off';
    document.body.classList.toggle('no-anim', !enabled);
    settingAnim.checked = enabled;
    settingAnim.addEventListener('change', () => {
        document.body.classList.toggle('no-anim', !settingAnim.checked);
        localStorage.setItem('animEnabled', settingAnim.checked ? 'on' : 'off');
    });
}

// 搜索回车聚焦首条结果
function initFocusFirstSetting() {
    const settingFocusFirst = document.getElementById('settingFocusFirst');
    if (!settingFocusFirst) return;
    settingFocusFirst.checked = localStorage.getItem('focusFirst') !== 'off';
    settingFocusFirst.addEventListener('change', () => {
        localStorage.setItem('focusFirst', settingFocusFirst.checked ? 'on' : 'off');
    });
}

function focusFirstResult() {
    if (localStorage.getItem('focusFirst') === 'off') return;
    const first = linksGrid.querySelector('.link-card') || mediaGrid.querySelector('.media-card');
    if (first) first.focus();
}

function initSettingsPanel() {
    if (!settingsBtn || !settingsPanel) return;
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.classList.toggle('open');
        settingsBtn.classList.toggle('active');
    });
    // 点击面板外关闭
    document.addEventListener('click', (e) => {
        if (settingsPanel.classList.contains('open') &&
            !settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsPanel.classList.remove('open');
            settingsBtn.classList.remove('active');
        }
    });
    // ESC 在面板打开时只关面板，不触发全局“回首页”
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && settingsPanel.classList.contains('open')) {
            settingsPanel.classList.remove('open');
            settingsBtn.classList.remove('active');
            e.stopImmediatePropagation();
        }
    });
    const clearBtn = document.getElementById('settingClearCache');
    clearBtn.addEventListener('click', () => {
        ['dashboardTodos', 'sidebarSection_favorites', 'sidebarSection_tools', 'sidebarSection_media']
            .forEach(k => localStorage.removeItem(k));
        document.querySelectorAll('.sidebar-section').forEach(s => s.classList.remove('section-collapsed'));
        document.getElementById('todoList').innerHTML = '';
        updateTodoCount();
        clearBtn.textContent = '已清除 ✓';
        setTimeout(() => { clearBtn.textContent = '清除本地数据（待办/折叠状态）'; }, 1600);
    });
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
    // 搜索：从首页输入时自动切换到收藏搜索，清空后回到首页
    searchInput.addEventListener('input', () => {
        const term = searchInput.value.toLowerCase().trim();
        if (term && currentView === 'home') {
            viewBeforeSearch = 'home';
            currentView = 'links';
            renderLinks(false);
            return;
        }
        if (!term && viewBeforeSearch === 'home') {
            viewBeforeSearch = null;
            currentView = 'home';
            renderLinks();
            return;
        }
        if (currentView === 'tools') {
            renderTools(false);
        } else if (currentView === 'media') {
            renderMedia(false);
        } else {
            renderLinks(false);
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
        currentCategory = item.dataset.category;
        currentView = 'links';
        viewBeforeSearch = null;
        renderLinks(true);
        // 移动端自动关闭菜单
        if (window.innerWidth <= 768) {
            closeMobileMenu();
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
        viewBeforeSearch = null;
        renderMedia(true);
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
        // Ctrl/Cmd + K 聚焦搜索
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
        }
        // ESC 返回首页并清空搜索
        if (e.key === 'Escape') {
            goHome();
        }
    });
}
