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
│   ├── vendor/           # 工具页本地依赖副本（jsqr、qrcodejs、fontawesome 6.5.1、jszip、docx-preview、exceljs、marked、jspdf、html2canvas）
│   ├── appearance.js     # 外观偏好清单（界面字体/时钟风格），index 与 settings 共用，须在 script.js 之前加载
│   └── icon.svg          # PWA 图标（星芒）
├── tools/                # 130 个自建网页工具（每工具一目录 + app.html）
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
- **从上游搬来的页面必须去品牌**：`tools/*` 多数源自 `justhtmls/html-tools`，页面里的 `JustHTMLs`/`htmls.dev` 字样（返回链接文案、示例数据、`<title>` 后缀、页脚版权、作者徽标）和 `<link rel="canonical">` 都要改成本站（title/页脚用「拾光集」，canonical 指向 `https://zengzoxiong.github.io/MySite/tools/<工具>/index.html`——留着来源站 canonical 会把 SEO 权重白送出去）。署名只保留说明页的「查看源码」按钮（指向上游仓库）。
- 说明页的图标样式表走 cdnjs，`onerror` 兜底到本地副本 `assets/vendor/fontawesome/css/all.min.css`（css + 4 个 woff2，字形路径写死 `../webfonts/`，别挪目录）——已断掉 cdnjs 实测过 solid/regular/brands 三套字形都能从本地渲染。
- **`tools/file-preview`（文件在线预览）是纯前端解析**，对标 kkFileView 但不需要服务端：PDF / 图片 / 音视频 / 文本 / JSON / CSV 走浏览器原生（零依赖），只有 docx / xlsx / zip / md 才按类型 `loadLib()` 懒加载 `assets/vendor/{jszip,docx-preview,exceljs,marked}`（合计约 1.06 MB，其中 exceljs 842 KB，首屏不下）。表格用 **ExcelJS 而不是 SheetJS**：SheetJS 社区版不读 `styles.xml`，拿不到底色/字体/对齐；换 ExcelJS 后才能还原样式。两个坑记牢——`cell.text` **不套数字格式**，要过 `fmtCell()`（百分比 / 小数位 / 千分位 / 日期）；Excel 里 `sz` 是百分之一磅、`a:ln@w` 是 EMU（除 12700 得磅）。加格式只改 `kindOf` + `dispatch` 分派表，**别在首屏引 script**。安全底线：Markdown 与 HTML 的渲染结果只进 `<iframe sandbox>`（无 `allow-scripts`），`sanitize()` 会剥掉 script/iframe/object/embed/link 并清空 `img[src]`（否则文件内容能发起第三方请求当外带通道）；SVG 走 `<img>` 不内联；文本一律 `textContent`。**代码高亮是自写的词法器**：`tokenize()` 按语言配置分类关键字/字符串/注释/数字/标签，表格右上角有「打印 / 存 PDF」按钮（`window.print()` + 一段 `@media print` 隐藏外壳），不引 PDF 生成库。已知限制：pptx 与 doc/ppt/xls 等 OLE 复合文档、HEIC、7z/rar、PSD、CAD/3D 一律不做（pptx 曾做过版式还原，因转 PDF 仍需排版引擎、纯前端做不到而移除，改用「多格式转 PDF」）；遇到时靠魔数嗅探给可操作提示；文本只渲染前 400 KB、单文件上限 200 MB、压缩包成员上限 50 MB。
- **`tools/to-pdf`（多格式转 PDF）**：docx / xlsx / md / csv / json / 文本 / 图片排成纸张（A4·A3·Letter、纵横、三档边距、三档字号），两条出口——`window.print()` 出矢量 PDF（中文可选中，`@page` 尺寸随设置注入 `<style>`），或懒加载 `html2canvas + jspdf`（约 600 KB）截图逐页切图 `doc.save()` 下载位图 PDF。截图路径有 30000 px 高度上限，超了提示改用打印。两个出口的差异必须在页面上写清楚，别让用户以为下载的是矢量。

### 4. Agent Plugin（data/agent-plugins.json）

注册表模式：`groups[].items[]` 每项 `{name, upstream: "owner/repo", local?: true}`，安装命令指向上游作者仓库（内容保持上游最新、署名归原作者）。`upstream: "local-only"` 表示本地技能无公开仓库。MCP 清单在同文件 `mcps[]`（`config` 中密钥一律占位符，绝不提交真实密钥）。

### 5. 我的 Stars（data/stars.json）

由 `.github/workflows/sync-stars.yml` 每日自动同步，**勿手改**。

### 6. 音乐播放器（data/playlist.json）

`tracks[]: {title, artist, src, cover, dur}`；`src` 为可播直链，`cover` 为专辑封面，`dur` 是秒数（用于未加载时就显示时长）。收起态是左上角迷你条（300×56：上一首/播放/下一首 + 歌名 + 右侧箭头），歌名过长时向左循环滚动；点箭头展开成 400 宽面板，纵向依次是**居中的圆形唱片封面（148px，下方歌名+歌手）→ 进度条 → 时间（右对齐）→ 控制行（左端音量细条、中间上一首/播放/下一首、右端模式按钮 + 三条横杠）→ 可滚动曲目列表**；展开高约 503、收起列表后 353。点面板外或按 Esc 收起整个面板。

- 圆形封面是**歌词页开关**：悬停时像唱片一样自转（`.mp-disc:hover .mp-cover` → `@keyframes mp-spin`），点击切到歌词态（`.music-wrap.lyric`）——封面缩到 64px、歌词区在下方展开（居中逐行、当前行高亮并自动滚到中线、点某行可跳转播放）、曲目列表用同一套 `grid-template-rows: 1fr → 0fr` 收起；再点封面切回。歌词与列表**互斥**：歌词态下点三条横杠会先退回封面态再展开列表（否则 `.lyric` 的强制收起规则会让列表按钮看起来失灵）
- 歌词滚动靠 `.mp-lyric > div { scroll-behavior: smooth }` 做翻滚过渡（不是瞬跳）；`body.no-anim` 与 `prefers-reduced-motion` 下回退成 `auto`
- 歌词只在进入歌词态时才拉 `data/lyrics.json`（`{ "<歌曲id>": "<LRC 原文>" }`，歌曲 id 从 `src` 里 `id=(\d+)\.` 正则取出）；解析在 `mpParseLrc()`，同步在 `timeupdate` 里的 `mpSyncLyric()`。滚动量用 `getBoundingClientRect()` 差值算，别改成 `offsetTop`（滚动容器没有定位）

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

### 7. 站点偏好（界面字体 / 首页时钟风格 / 天气城市）

清单与加载逻辑都在 `assets/appearance.js`（`window.SiteAppearance`），index.html 与 settings.html **共用这一份**，加/改选项只改这里。该文件在 `<head>` 同步加载（加载时就把已选字体的 CSS 挂上，让分片提前下载），必须排在 `script.js` 之前；改完记得把它加进 sw.js 的 PRECACHE 并升版本号。

- **界面字体**：`localStorage.fontFamily`，6 选 1（系统默认 + 思源黑体/思源宋体/霞鹜文楷/得意黑/朱雀仿宋，均为 SIL OFL 开源字体）。字体 CSS 从 jsDelivr 按需拉取（gcore → fastly → cdn 三级回退），每套都做了 unicode-range 分片，浏览器只下载用到的分片；**不要改成整包下载**（整套中文字库十几 MB）。应用方式是写 `--font-ui`（`:root` 里默认 `var(--font-system)`，`body { font-family: var(--font-ui) }`），别在别处硬写 font-family 栈。切换前用 `document.fonts.load()` 等字体就绪再切，避免得意黑那套 CSS 没写 `font-display` 导致整页文字空白（FOIT）。
- **首页时钟风格**：`localStorage.clockStyle`，6 选 1（简约/翻页/上滑/叠卡/滚轮/立方，见 `CLOCK_STYLES`）。除「简约」直接写 `textContent` 外，其余五种把 HH:MM:SS 拆成 6 个 `.ck-cell`（`.ck-a` 当前层撑尺寸、`.ck-b` 新值层绝对定位叠在上面），只有值变了的单元加 `.anim`；样式全在 styles.css 的 `.hero-clock[data-style=…]` 块。`no-anim`/`prefers-reduced-motion` 下走瞬时替换（否则 animationend/transitionend 不触发，单元会卡在动画中间态）；script.js 里 `clockSetDigit`/`clockRollTo` 的 1600ms 兜底定时器要大于 CSS 动画时长。滚轮是 0-9 再补一个 0 的长条，跨 9→0 借末尾那份 0 继续向下滚、滚完瞬移回第一个 0。卡片风格下 `textContent` 是新旧两层叠出来的（复制会拿到重复数字），读屏/报时靠 `role="timer"` + 每秒更新的 `aria-label`。
- **天气城市**：`localStorage.weatherCity`，**默认自动定位**（存 `'auto'` 或空）；自定义城市存 JSON `{name,lat,lon,sub}`，由设置页搜 Open-Meteo 地理编码（`geocoding-api.open-meteo.com/v1/search`，`language=zh`）任选，**不维护固定城市清单**；结果副标题 `sub` 从细到粗拼 `admin2·admin1·country`（跳过与城市名互为前缀的层级），用来区分同名城市（湖北有两个「峰口」，分属荆州/黄冈），并对「名称+sub」完全相同的行去重。自动定位走 `navigator.geolocation.getCurrentPosition`（10 分钟缓存、8s 超时），成功显示「当前位置」；**拒绝授权/不支持/超时静默回退西安**（script.js 的 `FALLBACK_CITY`），不给额外提示。Open-Meteo 统一传 `timezone=auto` 让接口按坐标推时区，别为城市硬编时区。设置里改城市后父页只在存储串（`weatherCityRaw()`）真的变化时才重拉天气，避免改个深色模式也去敲天气接口。读写 helper 在 appearance.js：`getWeatherCity`/`setWeatherCity`/`weatherCityLabel`/`weatherCityRaw`。

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
11. **元素写了 `display` 规则，`el.hidden = true` 就失效**：`[hidden]` 的 UA 样式是 `display:none`（无 `!important`），被作者规则里的 `display:flex/inline-flex` 直接盖掉，表现为"点了没反应、东西一直露着"（文件预览页的工具条与编码下拉踩过一次）。给这类容器补一条 `[hidden] { display: none !important; }`，排查时看 `offsetParent` 是不是 null

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
