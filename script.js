// 全局状态
let allLinks = [];
let allTools = [];
let currentCategory = '';
let currentToolCategory = '';
let isToolsView = false; // 是否显示工具视图

// DOM 元素
const sidebar = document.getElementById('sidebar');
const searchInput = document.getElementById('searchInput');
const sidebarTools = document.getElementById('sidebarTools');
const sidebarCategories = document.getElementById('sidebarCategories');
const linksGrid = document.getElementById('linksGrid');
const emptyState = document.getElementById('emptyState');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle.querySelector('.theme-icon');
const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const mainContent = document.getElementById('mainContent');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadLinks();
    initTheme();
    initSidebar();
    initEventListeners();
    initClock();
    initWeather();
});

// ===== 首页时钟 =====
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

// ===== 首页天气（西安，Open-Meteo 免费接口，无需密钥） =====
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

async function initWeather() {
    const weatherIcon = document.getElementById('weatherIcon');
    const weatherTemp = document.getElementById('weatherTemp');
    const weatherDesc = document.getElementById('weatherDesc');
    const weatherExtra = document.getElementById('weatherExtra');

    try {
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
        weatherDesc.textContent = '西安 · 天气获取失败';
        console.error('天气加载失败:', e);
    }
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
}

// 渲染侧栏工具区（改为分类导航）
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
        currentToolCategory = item.dataset.toolCategory;
        isToolsView = true;
        renderTools();
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
function renderLinks() {
    const searchTerm = searchInput.value.toLowerCase().trim();

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

    linksGrid.innerHTML = filteredLinks.map(link => {
        const domain = getDomain(link.url);
        const emojiIcon = link.icon || '🔗';
        // 尝试加载 favicon，失败则显示 emoji
        const faviconHtml = domain
            ? `<img src="https://favicon.im/${domain}" alt="" onerror="this.onerror=null;this.src='https://icons.duckduckgo.com/ip3/${domain}.ico';this.onerror=function(){this.parentElement.innerHTML='${emojiIcon}'};" width="32" height="32">`
            : emojiIcon;
        return `
        <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="link-card">
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
function renderTools() {
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

    linksGrid.innerHTML = filteredTools.map(tool => {
        const faviconUrl = tool.icon || '';
        return `
        <a href="tools/${tool.path}" target="_blank" rel="noopener noreferrer" class="link-card">
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

// 主题
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
    } else if (prefersDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        updateThemeIcon('dark');
    }
}

function updateThemeIcon(theme) {
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
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
    // 搜索（根据当前视图决定渲染哪个）
    searchInput.addEventListener('input', () => {
        if (isToolsView) {
            renderTools();
        } else {
            renderLinks();
        }
    });

    // 主题切换
    themeToggle.addEventListener('click', toggleTheme);

    // 侧栏收缩
    sidebarCollapseBtn.addEventListener('click', toggleSidebar);

    // 移动端菜单
    mobileMenuBtn.addEventListener('click', openMobileMenu);
    sidebarOverlay.addEventListener('click', closeMobileMenu);

    // 分类点击（事件委托）- 收藏分类
    sidebarCategories.addEventListener('click', (e) => {
        const item = e.target.closest('.sidebar-item');
        if (!item) return;
        sidebarCategories.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        currentCategory = item.dataset.category;
        isToolsView = false; // 切换到链接视图
        renderLinks();
        // 移动端自动关闭菜单
        if (window.innerWidth <= 768) {
            closeMobileMenu();
        }
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K 聚焦搜索
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
        }
        // ESC 清空搜索并重置视图
        if (e.key === 'Escape') {
            searchInput.value = '';
            isToolsView = false;
            currentCategory = '';
            currentToolCategory = '';
            // 重置分类选中状态
            sidebarCategories.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            sidebarTools.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            renderLinks();
            searchInput.blur();
        }
    });
}
