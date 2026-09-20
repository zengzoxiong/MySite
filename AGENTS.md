# AGENTS.md — 拾光集 项目维护指南

本文件面向后续接手本项目的 AI Agent / 开发者，说明项目结构、各类内容的增删改方法、前端约定与已知坑位。改动前请先通读。

## 项目概况

- **站点**：「拾光集」——个人数字花园：首页沉浸式仪表盘 + 工具导航 + 网站收藏 + 影视收藏 + Agent Plugin + 我的 Stars + 音乐播放器
- **形态**：纯静态站点（无构建、无框架、原生 HTML/CSS/JS），部署于 GitHub Pages（`zengzoxiong.github.io/MySite`），**push 到 main 即自动上线**
- **语言规范**：对话/注释/提交信息用中文；代码注释中文

## 文件结构

```
MySite/
├── index.html            # 主页：仪表盘 + 各视图容器 + 设置弹层 + 命令面板
├── script.js             # 全部交互逻辑（约 900 行，单文件无模块）
├── styles.css            # 全站样式（液态玻璃设计系统，含明暗主题）
├── settings.html         # 设置页（iframe 载入主站弹层，postMessage 通信）
├── sw.js                 # PWA Service Worker（SWR 缓存，改预缓存须升版本号）
├── manifest.json         # PWA 清单
├── favicon.svg           # 站点图标（星芒设计，128 个工具页引用 ../../favicon.svg）
├── sitemap.xml/robots.txt
├── data/                 # 全部内容数据（改 JSON 刷新即生效，无需改代码）
│   ├── links.json        # 网站收藏（categories + links）
│   ├── tools.json        # 在线工具登记（驱动 tools/ 目录展示）
│   ├── media.json        # 影视收藏（六大类型，详见下文规范）
│   ├── agent-plugins.json# Agent Skills 注册表 + MCP 清单
│   ├── stars.json        # GitHub Stars（工作流自动同步，勿手改）
│   ├── explore.json      # 播放器「探索模式」歌单（工作流每日同步，勿手改）
│   └── playlist.json     # 首页音乐播放器歌单
├── assets/
│   ├── media/            # 影视海报（本地存储，文件名语义化）
│   ├── vendor/           # 工具页本地依赖副本（jsqr、qrcodejs）
│   └── icon.svg          # PWA 图标（星芒）
├── tools/                # 128 个自建网页工具（每工具一目录 + app.html）
├── scripts/              # 同步脚本（sync_tmdb.py / sync_stars.py / sync_explore.py）
└── .github/workflows/    # 定时任务（TMDB 评分 / GitHub Stars / 探索歌单）
```

## 各类内容怎么改

### 1. 网站收藏（data/links.json）

在 `links` 数组追加/删除，分类加进 `categories`：

```json
{ "title": "站点名", "url": "https://…", "description": "一句话", "category": "所属分类", "icon": "💬" }
```

- `icon` 是 favicon 加载失败时的兜底 emoji（站点整体禁 emoji，但此字段为功能性兜底，保留）
- 卡片构建在 `buildLinkCard()`，动态文本已过 `escapeHtml`

### 2. 影视收藏（data/media.json）——数据规范最严格的部分

```json
{ "title": "作品名", "type": "番剧", "status": "看过", "rating": 8.5, "release": "2024-10-02", "comment": "短评", "cover": "assets/media/xxx.jpg", "url": "https://…" }
```

- `type` 六选一：番剧/电影/特摄/综艺/电视剧/纪录片（须在 `types` 数组登记）
- `status` 三选一：看过/在看/想看
- **评分与上映时间统一取自 TMDB，禁止自拟**；TMDB 无数据的作品（如部分国创）不写字段，前端自动隐藏角标
- 番剧精确首播日用 **AniList**（GraphQL，需浏览器 UA）；电影上映日用 TMDB `/releases` 子页最早日期
- 海报：番剧取 AniList `coverImage.extraLarge`，其余取 TMDB `og:image`（w500），存 `assets/media/`，**逐张目检确认没抓错**
- 分季作品**按季拆分独立条目**（用户明确偏好），URL 指向对应 `/season/N`
- `url` 必须是真实可用链接（曾发生误把评论文案填进 url 的事故）
- 长期运行的 `.github/workflows/sync-tmdb.yml` 会自动刷新 TMDB 评分/上映时间并提交——**不要手动改这两类字段**

### 3. 在线工具（tools/ + data/tools.json）

1. 新建 `tools/工具名/app.html`（自包含单文件，参考 image-converter 的风格）；
2. `data/tools.json` 登记：`{"name","path":"工具名/app.html","description","icon","category"}`。
   工具页统一引用 `../../favicon.svg`，固定亮色内联样式（与主站深色无关，属设计意图）。

### 4. Agent Plugin（data/agent-plugins.json）

注册表模式：`groups[].items[]` 每项 `{name, upstream: "owner/repo", local?: true}`，安装命令指向上游作者仓库（内容保持上游最新、署名归原作者）。`upstream: "local-only"` 表示本地技能无公开仓库。MCP 清单在同文件 `mcps[]`（`config` 中密钥一律占位符，绝不提交真实密钥）。

### 5. 我的 Stars（data/stars.json）

由 `.github/workflows/sync-stars.yml` 每日自动同步，**勿手改**。

### 6. 音乐播放器（data/playlist.json）

`tracks[]: {title, artist, src, cover, dur}`；`src` 为可播直链，`cover` 为专辑封面，`dur` 是秒数（用于未加载时就显示时长）。收起态是左上角迷你条（250×56：上一首/播放/下一首 + 歌名 + 右侧箭头），歌名过长时向左循环滚动；点箭头展开成 400 宽面板，纵向依次是**居中大封面（148px，下方歌名+歌手）→ 进度条 → 时间（右对齐）→ 控制行（左端音量细条、中间上一首/播放/下一首、右端三条横杠）→ 可滚动曲目列表**；展开高 503、收起列表后 353。点面板外或按 Esc 收起整个面板。

- 箭头（`.mp-arrow`）靠 `margin-left:auto` 始终贴在迷你条右端：收起态图标朝左（`.mp-ic-open`），展开态朝下（`.mp-ic-close`）且此时 `.mp-info` 隐藏（歌名移到大封面下方）
- 三条横杠 `#mpListToggle` 只切列表：在 `#musicWrap` 上加/去 `list-closed`，配合 `.mp-list-wrap` 的 `grid-template-rows: 1fr → 0fr`；按钮在列表隐藏时降到 `opacity:.4`
- 音量是 `input[type=range]` 自绘细条（高 3px），**无滑块圆点**（`::-webkit-slider-thumb` 设成 0×0 透明），音量大小由两处表达：填充段深浅（JS 把值写进 CSS 变量 `--v`，填充用 `color-mix(in srgb, var(--text-secondary) calc(20% + 80% * var(--v)), transparent)`）+ 喇叭图标音波道数（`#mpVolWrap` 上的 `data-lv` 0/1/2/3，CSS 控制 `.w1/.w2/.w3` 显隐）
- **四种播放模式**：按钮在控制行右端 `.mp-side` 里、三条横杠的左侧，**纯图标无文字**（网易云式线性图标，`.mi-loop/.mi-one/.mi-shuffle/.mi-explore` 四选一），点击循环切换，`title` 只显示四个字的模式名（列表循环 / 单曲循环 / 列表随机 / 每日探索），状态存 `localStorage.mpMode`；`one` 置 `audio.loop=true`，`explore` 把曲目源换成 `data/explore.json`。索引推进统一走 `mpStep(dir)`，**别再用 `mp.idx ± 1`**
- **切换 SVG 图标显隐必须用 `toggleAttribute('hidden', …)`**：`hidden` 不是 SVGElement 的反射属性，写 `svgEl.hidden = true` 只挂了个 JS 属性、DOM 不变，图标看着"切了模式没切图标"（踩过）
- **探索模式数据**：`data/explore.json` 由 `scripts/sync_explore.py` 从网易云「云音乐飙升榜」(id 3779629) 取前 50 首生成，`.github/workflows/sync-explore.yml` 每日 05:20（北京）刷新，**勿手改**；榜单里混入的 VIP/版权曲会在播放报错时由 `mp.fails` 计数自动跳最多 8 首，跳完才提示失败

- 迷你条与展开控制区是**两套按钮**（`.mp-transport` 展开时 `display:none`，`.mp-ctrl` 在面板内），靠类名 `.mp-prev/.mp-next/.mp-playbtn` 一起绑定，`mpSyncUI()` 用 `querySelectorAll('.mp-ic-play/.mp-ic-pause')` 同步图标——加按钮别只改一处
- 音量值持久化在 `localStorage.mpVolume`

- **当前歌单来自网易云「一只灰鹦鹉喜欢的音乐」（183 首，只收录了未登录可播的 61 首）**，`src` 用 `https://music.163.com/song/media/outer/url?id=<id>.mp3`（302 到网易云 CDN，实测 https 页面首声约 0.1~1.3s）；封面用 `picUrl + "?param=400y400"`（原图约 1MB，缩图 25KB）
- 其余 122 首是 VIP/版权锁定：outer 直链 302 到 `music.163.com/404`，浏览器报 `MEDIA_ELEMENT_ERROR: Format error`，**不要塞进来**
- 刷新歌单：`music.163.com/api/v3/playlist/detail?id=<pid>&n=1000&s=0` 取 `trackIds` → `api/v3/song/detail`（POST `c=[{"id":x},...]`）取 `privileges[].pl`，`pl>0` 才可播 → `api/song/detail?ids=[...]` 取 `album.picUrl`。接口需带浏览器 UA + `Referer: https://music.163.com/`
- **这是非官方接口，随时可能失效**；失效时回退方案是自建音频（放 `assets/music/`，走 jsDelivr gcore 节点：`https://gcore.jsdelivr.net/gh/zengzoxiong/MySite@main/<路径>`；`cdn.jsdelivr.net`/`fastly.jsdelivr.net` 在国内会 301 到 `raw.githubusercontent.com`，比 GitHub Pages 还慢，别用）
- **按需加载**：`mp.audio.preload = 'none'`，只有点播放/点曲目才挂 `src`（`mp.loaded` 标记），换曲时 `loaded=false`；缓冲中显示在时长位

## 前端架构与约定（script.js / styles.css）

### 视图状态机

`currentView`：`home`（仪表盘）/ `links`（网站收藏）/ `tools`（在线工具）/ `media`（影视）/ `plugin`（Agent Plugin）/ `ghstars`（Stars）/ `search`（全域搜索）。

- **新增视图必须同步改**：`renderCurrentView()` 分发、`goHome()` 复位、侧栏点击处理器（含 `searchFrom` 与搜索框清空）、全域搜索 `renderSearchResults`
- 搜索框输入即进入 `search` 视图（分组结果 + 加载过渡 + `searchSeq` 防竞态），清空后恢复 `searchFrom` 视图

### 卡片构建器（共用，勿在视图里内联写卡片）

`buildLinkCard` / `buildToolCard` / `buildMediaCard` / `skillCardHtml` / `mcpCardHtml` / `starCardHtml`。规则：

- 所有动态文本必须过 `escapeHtml`（拼接进内联 onerror 字符串用 `escapeJs`）
- 卡片布局统一：横向、小图标/纯文字、标题行 + 徽标 + meta 行；样式在 `.skill-card` 系列
- 影视卡片有 `fadeUp` 入场动画时只加 `.anim` 类（搜索重渲染不重播）

### 液态玻璃设计系统（styles.css）

- 颜色一律用 CSS 变量（`--card-bg`/`--glass-border`/`--glass-blur` 等），**禁止硬编码色值**
- 玻璃面板 = 半透明 `var(--card-bg)` + `backdrop-filter: var(--glass-blur)` + `1px var(--glass-border)` 描边
- 背后有 `body::before` 环境光斑（玻璃需透出色彩），暗色主题有独立光斑定义
- 明暗主题靠 `[data-theme="dark"]` 变量覆盖；原生控件需 `color-scheme` 声明

### 已知坑位（全部实战踩过，勿再踩）

1. **弹层不要放进有 `transform` 的容器**（如侧栏抽屉）——`position: fixed` 会被劫持；挂 body 直接子级
2. **后台标签页 rAF/setTimeout 被节流**：弹层加类用同步强制回流 `el.hidden=false; void el.offsetHeight; el.classList.add('open')`，禁用 rAF；搜索结果在 `document.hidden` 时跳过骨架直接渲染
3. **iframe 内的键盘事件不会冒泡到父页**：Esc 需 iframe 自己监听并 `postMessage` 通知父页
4. **postMessage 必须校验 `e.origin`**
5. `body.no-anim`（用户关动画）与 `prefers-reduced-motion` 下所有动画失效——依赖 `animationend` 清理节点的代码要有兜底
6. 窗口 resize：跨 768px 断点收抽屉、重算 marquee。**长标题滚动是共用件**：容器加 `.marquee`，内部结构固定为 `<span class="t"><span class="r">文案</span><span class="r dup" aria-hidden="true">文案</span></span>`，由 `recalcMarquee(root)` 量首份 `.r` 的宽度决定是否加 `.overflowing`（排两份文案才能 `-50%` 无缝循环），速度恒定约 40px/s。**触发方式分两种**：音乐迷你条 `.mp-title` 溢出即常开循环；影视卡片要 `.media-card:hover` 或 `:focus` 才动，静止时仍是省略号。新增长标题卡片记得套这个结构，否则不滚动
7. 弹层打开锁 `body.modal-open` 滚动 + 焦点管理（开聚焦/关还原）
8. 站点整体**禁用 emoji**（图标用内联 SVG；`media.json` 的 icon 兜底字段除外）
9. **`.corner` 自带 `position:absolute; z-index:2`**：和它做兄弟的元素会被玻璃卡片盖住（音乐拉绳曾因此完全不可见也不可点）。要么覆写 `position: relative` 让它走文档流，要么绝对定位挂在卡片下沿（`top: 100%`）；排查遮挡直接用 `document.elementFromPoint(x, y)` 看命中的是谁
10. **高度自适应展开用 `grid-template-rows: 0fr → 1fr`**（见 `.mp-panel` / `.mp-panel-inner`），比写死 `max-height` 准；内层必须 `overflow: hidden; min-height: 0`

### Service Worker（sw.js）

- SWR 模式：同源资源缓存优先、后台更新；**跨域请求直连不缓存**
- 改动 `PRECACHE` 清单或资源内容后**必须升 `CACHE` 版本号**（v1→v2→…），否则老访客拿旧缓存
- 注册带特性检测 + 静默失败

## 本地测试方法

1. `python -m http.server <端口> --bind 127.0.0.1` 起服务（**每次换新端口**，避免浏览器强缓存旧资源）
2. 浏览器验证：仪表盘/三视图切换/搜索分组/设置弹层/播放器/深色模式（DevTools 强刷 Ctrl+F5 或在 Application 面板注销 SW + 清 Cache）
3. **IAB/后台标签假象须知**：后台标签 rAF/定时器冻结会让过渡和延迟渲染"看起来失效"，属测试假象；截图失败就等几秒重试或重开标签页
4. JSON 改完用 `python -c "import json; json.load(open('data/xxx.json', encoding='utf-8'))"` 校验

## 定时任务（GitHub Actions）

- `sync-tmdb.yml`：每日 05:00（北京）刷新 media.json 的 TMDB 评分/上映时间，有变化才提交
- `sync-stars.yml`：每日 05:10 同步 GitHub Stars 到 stars.json
- `sync-explore.yml`：每日 05:20 同步网易云飙升榜到 data/explore.json（播放器探索模式用）
- 三个工作流都用 Actions 的 git 身份提交——**本地 push 遇到 `[rejected] fetch first` 时先 `git pull --rebase` 再推**（就是它们的新提交）

## 维护红线

- 不引入构建步骤/框架/后端依赖，保持纯静态零依赖架构
- 不引入 emoji（用户明确要求）；不使用 alert/prompt
- 数据文件改完必须 JSON 校验；`data/media.json` 保持无重复标题、封面文件齐全
- 主分支即线上，提交信息用约定式中文提交（feat/fix/chore）
