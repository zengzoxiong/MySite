// 全局状态
let allLinks = [];
let currentCategory = 'all';

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

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadLinks();
    initTheme();
    initSidebar();
    initEventListeners();
});

// 加载链接数据
async function loadLinks() {
    try {
        const response = await fetch('data/links.json');
        const data = await response.json();
        allLinks = data.links;
        renderSidebarTools();
        renderSidebarCategories(data.categories);
        renderLinks();
    } catch (error) {
        console.error('加载链接数据失败:', error);
        linksGrid.innerHTML = '<p class="empty-state">加载数据失败</p>';
    }
}

// 渲染侧栏工具区
function renderSidebarTools() {
    sidebarTools.innerHTML = `
        <a class="sidebar-item" href="svg-editor.html" target="_blank" rel="noopener noreferrer">
            <span class="item-icon">✏️</span>
            <span class="item-text">SVG 编辑器</span>
        </a>
    `;
}

// 渲染侧栏分类区
function renderSidebarCategories(categories) {
    let html = `
        <div class="sidebar-item active" data-category="all">
            <span class="item-icon">📋</span>
            <span class="item-text">全部</span>
        </div>
    `;
    categories.forEach(cat => {
        html += `
            <div class="sidebar-item" data-category="${cat}">
                <span class="item-text">${cat}</span>
            </div>
        `;
    });
    sidebarCategories.innerHTML = html;
}

// 渲染链接卡片
function renderLinks() {
    const searchTerm = searchInput.value.toLowerCase().trim();

    let filteredLinks = allLinks;

    if (currentCategory !== 'all') {
        filteredLinks = filteredLinks.filter(link => link.category === currentCategory);
    }

    if (searchTerm) {
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

    linksGrid.innerHTML = filteredLinks.map(link => `
        <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="link-card">
            <div class="icon">${link.icon}</div>
            <div class="info">
                <div class="title">${link.title}</div>
                <div class="description">${link.description}</div>
                <span class="category">${link.category}</span>
            </div>
        </a>
    `).join('');
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
    // 搜索
    searchInput.addEventListener('input', renderLinks);

    // 主题切换
    themeToggle.addEventListener('click', toggleTheme);

    // 侧栏收缩
    sidebarCollapseBtn.addEventListener('click', toggleSidebar);

    // 移动端菜单
    mobileMenuBtn.addEventListener('click', openMobileMenu);
    sidebarOverlay.addEventListener('click', closeMobileMenu);

    // 分类点击（事件委托）
    sidebarCategories.addEventListener('click', (e) => {
        const item = e.target.closest('.sidebar-item');
        if (!item) return;
        sidebarCategories.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        currentCategory = item.dataset.category;
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
        // ESC 清空搜索
        if (e.key === 'Escape') {
            searchInput.value = '';
            renderLinks();
            searchInput.blur();
        }
    });
}
