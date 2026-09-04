# 我的收藏导航

一个简洁的静态导航页面，用于收藏和快速访问常用网站。

## ✨ 功能特性

- 🎴 **卡片式布局** - 每个链接显示为美观的卡片
- 🔍 **实时搜索** - 支持按标题和描述搜索
- 🏷️ **分类筛选** - 点击分类标签快速筛选
- 🌙 **暗色模式** - 支持明暗主题切换，自动保存偏好
- 📱 **响应式设计** - 适配桌面和移动端
- ⌨️ **键盘快捷键** - Ctrl/Cmd + K 聚焦搜索，ESC 清空搜索
- 🧰 **自建工具区** - 置顶展示自建网页工具（内置 SVG 可视化编辑器）

## 📁 项目结构

```
MySite/
├── index.html          # 主页面
├── styles.css          # 样式文件
├── script.js           # 交互逻辑
├── svg-editor.html     # 自建工具：SVG 可视化编辑器（独立页面）
├── data/
│   └── links.json      # 链接配置文件
└── README.md           # 项目说明
```

## 🔧 使用方法

### 添加新链接

编辑 `data/links.json` 文件，在 `links` 数组中添加新条目：

```json
{
  "title": "网站名称",
  "url": "https://example.com",
  "description": "网站描述",
  "category": "分类名称",
  "icon": "🔗"
}
```

### 添加新分类

在 `data/links.json` 的 `categories` 数组中添加新分类名称。

### 添加自建工具

自建工具为本站同源托管的网页（如 `svg-editor.html`），展示在首页置顶的「我的工具」区。

1. 将工具页面放入仓库根目录（随站点一同部署）；
2. 在 `index.html` 的 `.tools-grid` 中追加一个 `tool-card` 链接指向该页面。

> 说明：SVG 编辑器内置 6 张参考架构图，可通过工具栏「图集」按钮按需加载；打开即空白画布，编辑会自动保存到当前浏览器（刷新可续编）。

## 🚀 部署

本项目为纯静态页面，可通过以下方式部署：

- **GitHub Pages** - 推送到 GitHub 仓库后，在 Settings > Pages 中启用
- **Vercel** - 直接导入 GitHub 仓库
- **Netlify** - 直接导入 GitHub 仓库

## 📄 许可证

MIT License