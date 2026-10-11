# 拾光集（MySite）

个人数字花园：沉浸式仪表盘 + 工具导航 + 网站收藏 + 影视收藏 + 音乐播放器 + 数据看板。
**纯静态、零依赖、无构建**（原生 HTML/CSS/JS），推送 main 即自动部署上线。

**线上地址**：[zengzoxiong.github.io/MySite](https://zengzoxiong.github.io/MySite/)

## ✨ 功能特性

### 🏠 沉浸式仪表盘

- 🕐 **时钟 6 风格** - 简约 / 翻页 / 上滑 / 叠卡 / 滚轮 / 立方，设置里随时切换
- ⛅ **天气 + 空气质量** - Open-Meteo 驱动，默认自动定位（可搜索任意城市），温度/湿度/风速 + AQI 徽标与 24h 曲线
- 🈴 **拾光签** - 每日一签（吉凶 + 签句按日期固定种子，同一天全球同签），签到解锁今日一言；签面为 16 套场景主题的 Canvas 生成画（毛笔字 + 山水渐变），可导出 PNG / 复制图片
- 📈 **时光进度 + 待办清单** - 年/月/周进度条，本地持久化待办
- 🐙 **GitHub 传送门** - 仓库/粉丝统计 + 近一年贡献热力图（工作流每日同步）

### 🎵 音乐播放器

- 左上角迷你条，展开为圆形唱片 + 进度 + 音量 + 歌单的完整面板
- 歌单来自网易云公开歌单，**每日探索模式**自动同步网易云飙升榜；圆形封面点击进入歌词页（逐行高亮、点击跳转）

### 🗂 内容与工具

- 🛠 **151 个自建在线工具** - 图片转换 / 二维码 / 文件在线预览 / 多格式转 PDF / 20+ 个小游戏等，全部纯前端本地运行，按 9 个分类组织
- 🎴 **影视收藏** - 六大类型海报墙，评分与上映时间统一取自 TMDB 并每日自动刷新，支持排序与标题滚动
- 🔗 **网站收藏** - 分类卡片 + favicon + 死链体检角标；「常用软件下载」支持 **winget 批量安装模式**（勾选后下载一键装机脚本）
- 🔍 **全域搜索 + 命令面板** - 搜索一次覆盖工具/收藏/影视/汇率等分组展示；Ctrl/Cmd + K 唤起命令面板

### 📊 数据看板

| 视图 | 内容 |
|------|------|
| 我的 Stars | GitHub 星标仓库墙（每日同步） |
| 汇率走势 | ECB 参考价 15 币种卡片 + 走势图 + 双向换算器 + ChatGPT Plus 各区实付榜 |
| 每日日报 | GitHub Trending 精选 + Hacker News 首页十条（每日同步） |
| 访问统计 | GoatCounter 访客（UV）汇总与趋势图（每日同步） |
| Token 用量 | 模型 × 天用量热力图 / 趋势折线 / 环形图 / 明细表 |
| Agent Skills / Agent MCP | 技能与 MCP 注册表视图 |

### 🧱 基础体验

- 🪟 **液态玻璃 UI** - 环境光斑 + 全站毛玻璃，明暗双主题、6 种界面字体、7 种主题色
- 📱 **PWA** - 可安装到桌面/主屏，Service Worker 缓存（页面骨架 SWR + 数据文件网络优先）
- ⚙️ **设置中心** - 主题色 / 外观模式 / 动画 / 字体 / 时钟风格 / 天气城市
- ♿ **无障碍** - 完整 aria 标注、键盘焦点环、遵循 prefers-reduced-motion

## 🤖 自动化（GitHub Actions）

10 个定时任务全部在深夜低峰运行，写数据的任务无变化时自动跳过提交：

| 工作流 | 频率 | 作用 |
|--------|------|------|
| sync-tmdb | 每日 | 刷新影视评分与上映时间（TMDB 官方 API） |
| sync-stars | 每日 | 同步 GitHub Stars |
| sync-explore | 每日 | 同步网易云飙升榜 + 歌词 |
| sync-fx | 每日 | 同步 ECB 人民币汇率 |
| sync-ghactivity | 每日 | 同步 GitHub 贡献热力图 |
| daily-report | 每日 | 同步 Trending + HN 每日日报 |
| goatcounter | 每日 | 同步访客统计（需 secret `GOATCOUNTER_TOKEN`） |
| check-winget | 每日 | 体检 winget 包可用性 |
| check-links | 每周二 | 体检网站收藏死链 |
| check-tools | 每周 + 变更时 | 体检工具页登记/去品牌/canonical |

## 📁 项目结构

```
MySite/
├── index.html            # 主页：仪表盘 + 各视图容器 + 设置弹层 + 命令面板
├── script.js             # 全部交互逻辑（单文件无模块）
├── styles.css            # 全站样式（液态玻璃设计系统，明暗双主题）
├── settings.html         # 设置页（iframe 载入主站弹层）
├── sw.js / manifest.json # PWA Service Worker 与清单
├── data/                 # 内容数据（16 个 JSON，改完刷新即生效）
│   ├── links.json        # 网站收藏
│   ├── tools.json        # 在线工具登记（151 个工具）
│   ├── media.json        # 影视收藏
│   ├── playlist.json     # 首页音乐播放器歌单
│   └── …                 # 其余由工作流每日同步（勿手改）
├── assets/               # 海报 / 本地依赖 / 外观偏好清单
├── tools/                # 151 个自建网页工具（每工具一目录 + app.html）
├── scripts/              # 同步与体检脚本（12 个 Python）
└── .github/workflows/    # 10 个定时任务
```

## 🔧 内容维护

> 完整规范（含坑位记录）见 [AGENTS.md](AGENTS.md)。

### 添加网站收藏

编辑 `data/links.json`，在 `links` 数组添加：

```json
{
  "title": "网站名称",
  "url": "https://example.com",
  "description": "一句话描述",
  "category": "分类名称",
  "icon": "🔗"
}
```

分类加进 `categories` 数组即可出现在侧栏；软件类条目可加 `"winget": "<包id>"` 启用批量安装。

### 添加影视记录

编辑 `data/media.json`（评分/上映时间统一取自 [TMDB](https://www.themoviedb.org)，勿自拟）：

```json
{
  "title": "作品名",
  "type": "番剧",
  "status": "看过",
  "rating": 8.5,
  "release": "2022-04-09",
  "comment": "一句话短评",
  "cover": "assets/media/xxx.jpg",
  "url": "https://www.themoviedb.org/tv/120089"
}
```

### 添加自建工具

1. 新建 `tools/工具名/app.html`（自包含单文件，随站点部署）；
2. 在 `data/tools.json` 登记：

```json
{"name": "工具名", "path": "工具名/app.html", "description": "一句话描述", "icon": "🔧", "category": "所属分类"}
```

## 🚀 本地测试

```bash
python -m http.server 8000 --bind 127.0.0.1
```

浏览器访问 `http://127.0.0.1:8000`（每次换新端口避免强缓存；调试 PWA 需在 DevTools 注销 Service Worker）。

## 📄 许可证

MIT License
