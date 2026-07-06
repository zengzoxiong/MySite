// 全局变量
let allLinks = [];
let allCategories = [];
let currentCategory = 'all';

// DOM 元素
const linksGrid = document.getElementById('linksGrid');
const categoryTags = document.getElementById('categoryTags');
const searchInput = document.getElementById('searchInput');
const emptyState = document.getElementById('emptyState');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle.querySelector('.theme-icon');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadLinks();
    initTheme();
    initEventListeners();
});

// 加载链接数据
async function loadLinks() {
    try {
        const response = await fetch('data/links.json');
        const data = await response.json();
        allLinks = data.links;
        allCategories = data.categories;

        renderCategoryTags();
        renderLinks();
    } catch (error) {
        console.error('加载链接数据失败:', error);
        linksGrid.innerHTML = '<p class="empty-state">加载数据失败，请检查 links.json 文件</p>';
    }
}

// 渲染分类标签
function renderCategoryTags() {
    const tagsHtml = `
        <button class="tag active" data-category="all">全部</button>
        ${allCategories.map(category => `
            <button class="tag" data-category="${category}">${category}</button>
        `).join('')}
    `;
    categoryTags.innerHTML = tagsHtml;

    // 添加标签点击事件
    categoryTags.querySelectorAll('.tag').forEach(tag => {
        tag.addEventListener('click', () => {
            categoryTags.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
            tag.classList.add('active');
            currentCategory = tag.dataset.category;
            renderLinks();
        });
    });
}

// 渲染链接卡片
function renderLinks() {
    const searchTerm = searchInput.value.toLowerCase().trim();

    let filteredLinks = allLinks;

    // 按分类筛选
    if (currentCategory !== 'all') {
        filteredLinks = filteredLinks.filter(link => link.category === currentCategory);
    }

    // 按搜索词筛选
    if (searchTerm) {
        filteredLinks = filteredLinks.filter(link =>
            link.title.toLowerCase().includes(searchTerm) ||
            link.description.toLowerCase().includes(searchTerm)
        );
    }

    // 显示或隐藏空状态
    if (filteredLinks.length === 0) {
        linksGrid.style.display = 'none';
        emptyState.style.display = 'block';
    } else {
        linksGrid.style.display = 'grid';
        emptyState.style.display = 'none';
    }

    // 渲染卡片
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

// 初始化主题
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

// 更新主题图标
function updateThemeIcon(theme) {
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// 切换主题
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

// 初始化事件监听
function initEventListeners() {
    // 搜索输入
    searchInput.addEventListener('input', renderLinks);

    // 主题切换
    themeToggle.addEventListener('click', toggleTheme);

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K 聚焦搜索框
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
        }
        // ESC 清空搜索
        if (e.key === 'Escape') {
            searchInput.value = '';
            searchInput.blur();
            renderLinks();
        }
    });
}