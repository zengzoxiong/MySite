# 拾光集 · 小游戏共享 UI 设计规范（Apple HIG）

> 风格基准：苹果人机界面指南（Apple HIG）iOS / macOS 视觉语言。
> 共享样式表：`assets/game-ui.css`。
> **主站联动**：全页字体跟主站「界面字体」选择（`--font-ui`，由 `assets/appearance.js` 写入），左上角工具栏图标色跟主站主题色（`--accent-color`）；明暗仍跟随系统，其余游戏 UI 不引用主站 `styles.css`。
> 红线先行：**只动样式与 UI 结构，绝不改玩法逻辑**（script 内允许改动的行见 §6.2，除此以外一律不动）。

---

## 1. 如何引用

每个游戏 `app.html` 的 `<head>` 中、自身 `<style>` 之前加一行：

```html
<link rel="stylesheet" href="../../assets/game-ui.css">
```

然后在自身 `<style>` 开头声明该游戏的个性色（覆盖默认蓝）：

```css
:root { --game-accent: #FF2D55; }   /* 以 match3 为例，见第 7 节分配表 */
```

所有组件类的强调色都取 `var(--game-accent)` 系令牌，换一行声明即可整页换色：

- `--game-accent`：实心底色（按钮、进度、选中环）
- `--game-on-accent`：实心底上的文字色（默认白；黄/灰个性色页必须改深色，见 §7）
- `--game-accent-text`：强调色作文字时的颜色（返回键、链接、徽标；默认同个性色，黄/灰个性色页改深色）

字体栈由样式表统一提供，且已接主站「界面字体」选择：

- 正文：`var(--font-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif)`——`--font-ui` 由 `assets/appearance.js` 按主站设置写入 html（六个选项：系统默认/思源黑体/思源宋体/霞鹜文楷/得意黑/朱雀仿宋），游戏页需在 `<head>` 引入该脚本并在页尾调用 `SiteAppearance.applySiteFontFromStorage()`（四宫格脚本已内置）。
- 标题：`--font-display`（同样接 `--font-ui` 兜底）
- 等宽数字/代码：`ui-monospace, "SF Mono", Menlo, …`（`--font-mono`，计分数字用 `.g-num`，不联动）

浅/深两套外观跟随系统（`prefers-color-scheme`）：**凡使用 g-* 共享类的 UI，游戏页无需写深色适配**——唯黄/灰 7 个个性色页例外，需带一行深色复位块（§7.1）；游戏私有视觉（棋盘、糖果、画布内绘制）保留原样，若私有类里硬编码了亮色，按 §5 第 3 条清理或自行补深色（§5 第 11 条有清单）。

---

## 2. 设计令牌速查

| 令牌 | 浅色 | 深色 |
|---|---|---|
| 页面背景 `--bg` | `#F2F2F7` | `#000000` |
| 抬升背景 `--bg-elevated` | `#FFFFFF` | `#1C1C1E` |
| 卡片 `--card` | `#FFFFFF` | `#2C2C2E` |
| 主文字 `--text` | `#000` | `#FFF` |
| 次要文字 `--text-secondary` | `rgba(60,60,67,.6)` | `rgba(235,235,245,.6)` |
| 分隔线 `--separator` | `rgba(60,60,67,.29)` | `rgba(84,84,88,.65)` |

系统语义色（深色下自动提亮为 iOS 深色变体）：

`--blue #007AFF` `--green #34C759` `--red #FF3B30` `--orange #FF9500` `--purple #AF52DE`
`--indigo #5856D6` `--pink #FF2D55` `--teal #5AC8FA` `--yellow #FFCC00` `--gray #8E8E93`

尺度与动效：圆角 8/12/14/18px；点击缩放 0.96；基础时长 0.25s，弹簧 0.35s（`--ease-spring` 轻微过冲）；最小触控目标 44px（`--touch-min`，含规则栏把手）；内容列宽 `--wrap-max`（默认 520px，宽版页覆盖，§3.1）。

### 2.1 浏览器基线与降级

样式表用到两个较新的 CSS 特性，均有兜底，旧浏览器不破版：

| 特性 | 支持起点 | 用在哪 | 旧浏览器表现 |
|---|---|---|---|
| `color-mix()` | Chrome/Edge 111+、Safari 16.2+、Firefox 113+ | `.g-btn-tinted`、`.g-badge-*`、`.g-ai-tag`、`.g-overlay` 的半透明底 | 每条 color-mix 背景前都写了一条纯色/`rgba` 兜底声明，旧浏览器用兜底（tinted/徽标变灰填充、遮罩变不透明底），文字色与布局不变 |
| `:has()` | Chrome/Edge 105+、Safari 15.4+、Firefox 121+ | §4.2 路线 A 的 `body:has(.g-tool-ai.is-running)` 徽标显隐 | 标签停在 `.g-ai-tag-auto` 的 `display: none`（不显示，不破版）；该页可改走路线 B |

降级不回退为自定义背景图或固定色板，统一落到 `var(--fill)` / `rgba(…)` 系统灰。

---

## 3. 组件类用法

### 3.1 页面骨架

```html
<body class="g-page">
  <nav class="g-tool-grid" aria-label="游戏工具栏">…四枚 .g-tool-btn（见 §3.10）…</nav>
  <main class="g-wrap">            <!-- 或 g-wrap g-wrap-wide（宽版，720px） -->
    <nav class="g-nav"><h1 class="g-nav-title">贪吃蛇</h1></nav>
    <h1 class="g-nav-large">贪吃蛇</h1>       <!-- 大标题，可选 -->
    <p class="g-nav-sub">方向键或 WASD 控制移动</p>
    …
    <footer class="g-foot">拾光集 · 在线小游戏</footer>
  </main>
</body>
```

- `.g-wrap`：默认内容列（`--wrap-max: 520px`）。
- `.g-wrap-wide`：宽版变体（覆盖 `--wrap-max: 720px`），贪吃蛇等宽台面游戏用，避免被默认 520px 无告知收窄。
- `.g-tool-grid`：fixed 左上角工具栏（返回/说明/AI/静音四框），见 §3.10；`.g-back-chip` 返回浮钮保留给实用工具页，游戏页不再使用。
- `.g-foot` / `.g-tips`：页脚与玩法小字（中性灰，深浅色自适应）。

### 3.2 按钮（filled / tinted / plain / gray 四态）

| 类 | 外观 | 用法 |
|---|---|---|
| `.g-btn`（默认）/ `.g-btn-filled` | 强调色实心 | 主操作：开始、再来一局 |
| `.g-btn-tinted` | 强调色 16% 底 + 强调色字 | 次操作：提示、检查 |
| `.g-btn-plain` | 透明 + 强调色字 | 低强度操作：跳过、规则 |
| `.g-btn-gray` | 系统灰填充 + 主文字 | 中性操作：暂停、重置 |

修饰：`.g-btn-danger` 红底、`.g-btn-success` 绿底、`.g-btn-sm` 小号、`.g-btn-row` 横排按钮组、`.g-btn-col` **纵排按钮列**（HUD 侧列，match3 暂停/重开列用）。
交互：`:active` 缩放 0.96、禁用透明度 0.35、`:focus-visible` 强调色焦点圈。

**语义按钮文字色**：`.g-btn-danger` / `.g-btn-success` 的文字统一取 `--on-vivid`（`#1C1C1E`，可覆盖），实测对红 `#FF3B30` 4.80:1、对绿 `#34C759` 7.66:1（深色下对 `#FF453A` 4.99:1、对 `#30D158` 8.42:1），达 4.5:1；不随黄/灰页的 `--game-on-accent` 摇摆，同页语义按钮文字策略保持一致。

```html
<button class="g-btn">开始游戏</button>
<button class="g-btn g-btn-tinted">提示</button>
<div class="g-btn-col">
  <button class="g-btn g-btn-gray g-btn-sm">暂停</button>
  <button class="g-btn g-btn-gray g-btn-sm">重开</button>
</div>
```

### 3.3 卡片与数据行

- `.g-card`：14px 圆角、细腻双层阴影、16px 内边距；`.g-card-title` 小节标题、`.g-card-hint` 灰色说明。
- `.g-list` + `.g-row`：iOS inset-grouped 列表，行间发丝分隔线（0.5px `--separator`），`.g-row-label` / `.g-row-value` 左右分列。

### 3.4 计分板（两种形态）

**A. 卡片式**（match3 / 2048 等 `.stat > .lab/.val` 结构映射到这里）：

```html
<div class="g-hud">
  <div class="g-stat"><span class="g-stat-label">分数</span><span class="g-stat-value g-num" id="score">0</span></div>
  <div class="g-stat"><span class="g-stat-label">最高</span><span class="g-stat-value g-num" id="best">0</span></div>
</div>
```

**B. 行内工具条式**（snake 等「分数/最高 + 按钮混排同一行」的 HUD 映射到这里）：

```html
<header class="g-nav">
  <h1 class="g-nav-title">贪吃蛇</h1>
  <div class="g-hud-bar">
    <span class="g-stat-inline">分数 <b id="score">0</b></span>
    <span class="g-stat-inline">最高 <b id="best">0</b></span>
    <span class="g-ai-tag" id="aiTag" hidden>AI 代玩中 · 点击停止</span>
    <button id="pauseBtn" class="g-btn g-btn-gray g-btn-sm" type="button">暂停</button>
    <button id="aiBtn" class="g-btn g-ai-btn g-btn-sm" type="button">AI 代玩</button>
  </div>
</header>
```

以上就是 snake 的 DOM 重写模板：`span 分数 <b id=score>` 内联结构换成 `.g-stat-inline`（id 不变，JS 里 `getElementById('score')` 照常工作），暂停/AI 按钮与 aiTag 同排进 `.g-hud-bar`，与 `tools/snake/app.html:148-154` 的信息架构一一对应。`.g-hud-bar` 是 flex wrap 混排容器，文字分数、徽标、按钮、`.g-hud-spacer`（占位撑开）可任意排列。

数值变化时给 `.g-stat-value` 临时加 `.g-bump`（0.28s 弹跳）。**注意**：`.g-bump` 是独立动画类，施加给 `.g-stat` 容器或 `.g-stat-value` 都生效，match3/2048 现状是给容器加（`tools/match3/app.html:504-506`、`tools/2048/app.html:408-410`），保留现状即可，不必迁移。
状态语义：`.g-stat-danger` 红 + 脉冲（对应 match3 `.stat.danger` 的呼吸提示）、`.g-stat-warn` 橙、`.g-stat-ok` 绿。

### 3.5 Alert 弹窗

iOS 警告框规格：270px 宽、14px 圆角、半透明毛玻璃背景（`backdrop-filter: blur(28px)`）、操作按钮竖向堆叠、发丝分隔线、默认操作加粗、破坏性操作红色。

```html
<div class="g-alert-mask" id="alert" hidden>
  <div class="g-alert" role="alertdialog" aria-modal="true">
    <div class="g-alert-body">
      <h2 class="g-alert-title">游戏结束</h2>
      <p class="g-alert-msg">本局得分 128 · 新纪录！</p>
    </div>
    <div class="g-alert-actions">
      <button class="g-alert-btn">继续挑战</button>
      <button class="g-alert-btn default">再来一局</button>
    </div>
  </div>
</div>
```

显隐协议见 §3.9（`.g-alert-mask` 同款约定：关闭态 `pointer-events: none` 兜底）。

### 3.6 Segmented Control

```html
<div class="g-segment" role="group" aria-label="难度">
  <button class="on" aria-pressed="true">入门</button>
  <button aria-pressed="false">中等</button>
  <button aria-pressed="false">困难</button>
</div>
```

选中段白底浮起（`.on` 或 `aria-pressed="true"`，两者等价）。适合难度、模式、关卡切换。

### 3.7 Switch

```html
<label class="g-switch">
  <input type="checkbox" id="soundToggle">
  <span class="g-switch-track"></span>
</label>
```

51×31px 轨道、27px 白色圆钮、开启绿色、0.35s 弹簧滑动。适合音效、震动、提示开关。

### 3.8 状态徽标

`.g-badge`（灰底圆点）+ 语义变体：`.g-badge-ok` 绿、`.g-badge-warn` 橙、`.g-badge-danger` 红、`.g-badge-info` 蓝、`.g-badge-accent` 强调色。`.g-badge-plain` 无圆点、`.g-badge-live` 圆点呼吸。

### 3.9 舞台与覆盖层

`.g-stage` 包住 `canvas` 或 DOM 棋盘。**容器级自带触控防护**（`touch-action: none` + `user-select: none` + `-webkit-touch-callout: none`），DOM 棋盘（match3/2048）套上即有防双击缩放、防文本误选，不必自带；游戏私有规则里重复的同名防护可删可留。

**覆盖层显隐协议（统一约定，二选一，两者都安全）**：

| 协议 | 用法 | 适用 |
|---|---|---|
| ① 静态 | 只用 `hidden` 切换。`.g-overlay` 默认即可见态，无过渡 | snake 式 `ovX.hidden=state===…`（`tools/snake/app.html:374-377`），零脚本改造 |
| ② 过渡 | 元素加 `.g-overlay-fade`，`hidden` 去掉后同步回流再 `classList.add('open')` | match3/2048 式（`tools/match3/app.html:686-692`、`tools/2048/app.html:437-443`），淡入淡出 |

关键兜底：`.g-overlay-fade`（关闭态）是 `opacity: 0; pointer-events: none`——**透明时绝不拦截下层点击**，不会出现「看不见但点得到」把棋盘锁死；`.open` 才恢复 `pointer-events: auto`。`.g-alert-mask` 同款。协议 ① 的元素**不要**加 `.g-overlay-fade`（否则不加 `.open` 会一直透明）。

层叠：`.g-overlay` 自带 `z-index: 5`（与 match3/2048 私有 `.overlay` 的 `z-index: 5` 等值，`tools/match3/app.html:173`、`tools/2048/app.html:124`），能压住 JS 事后追加、`z-index: 1-4` 的棋子方块（match3 `app.html:98/129/142/150`）；改造删掉私有 `.overlay` 规则后不会被方块盖住。若游戏私有层叠更高（如特效层），私有 `z-index` 规则保留不动、在私有 `<style>` 里继续声明即可。

胜利态修饰：`.g-overlay-win`（标题换强调色）。私有修饰类（如 2048 的 `.win`）与 g-* 共存规则见 §5 第 8 条。

### 3.10 左上角工具栏与游戏规则弹窗

**左上角工具栏（`.g-tool-grid`）**：横排四个 44px 方形图标框，取代游戏页的 `.g-back-chip`「返回主页」浮钮（该类保留给实用工具页）：

```html
<nav class="g-tool-grid" aria-label="游戏工具栏">
  <a class="g-tool-btn" href="../../index.html" aria-label="返回拾光集主页" title="返回主页">…回转箭头 SVG…</a>
  <button class="g-tool-btn" id="rulesBtn" type="button" aria-label="游戏规则" title="游戏规则">…问号 SVG…</button>
  <button class="g-tool-btn g-tool-ai" id="aiBtn" type="button" aria-pressed="false" title="AI 代玩">AI</button>
  <button class="g-tool-btn" id="sfxBtn" type="button" aria-pressed="false" aria-label="静音" title="音效开关">…喇叭 .sfx-on/.sfx-off 两枚 SVG…</button>
</nav>
```

- **返回**：跳主站主页；**说明**：打开规则弹窗；**AI**：接管原位 AI 代玩按钮——「移位保 id」（原位删除、四宫格重建，`aiBtn`/`autoBtn` id 不变），AI 逻辑零改动；框内恒写「AI」，运行中 `.is-running`/`.auto-on` 红底白字，各页 JS 的 AI 按钮 label 切换行（`aiBtn.textContent = …'AI 代玩'…`）已删除；未实现 AI 代玩的页面渲染同款按钮并置 `disabled` 置灰。**音效**：全局静音开关，键 `localStorage.gameSfxMuted`（`'1'`=静音），图标两态切换（`toggleAttribute('hidden')` 切两枚 SVG）、`storage` 事件跨页同步；whack-mole 的 `beep()` 与 simon 的 `ensureAudio()` 按该键短路（其余游戏天然无声），simon 旧 `simonSound` 偏好一次性迁移。
- 图标色走 `--site-accent`（`var(--accent-color, #2563eb)`），跟主站主题色联动；页面须引入 `<script src="../../assets/appearance.js"></script>`（四宫格脚本已内置字体调用与 storage 监听）。
- **游戏规则弹窗**：复用 `.g-alert-mask/.g-alert` 模态，加 `.g-alert-rules` 排版（h2 居中、h3/li 规则列表、body 区滚动）。各页原 `.g-rules` 抽屉、`.g-rules-handle` 把手与 `gameRulesOpen` 开合脚本已移除，规则内容原样搬入弹窗：

```html
<div class="g-alert-mask g-alert-rules open" id="rulesModal" role="dialog" aria-modal="true" aria-label="游戏规则" hidden>
  <div class="g-alert">
    <div class="g-alert-body">
      <h2>游戏规则</h2>
      <h3>玩法</h3><ul><li>…</li></ul>
    </div>
    <div class="g-alert-actions">
      <button class="g-alert-btn default" id="rulesClose" type="button">好的</button>
    </div>
  </div>
</div>
```

- 显隐协议：mask 常驻 `.open`，**只切 `hidden`**（静态协议，无过渡依赖）；`rulesBtn` 开、`rulesClose`/遮罩/Esc 关，开合做焦点还原。

---

## 4. 「AI 代玩」统一组件

### 4.1 按钮

AI 代玩按钮统一放在左上角工具栏（§3.10），框内恒写「AI」，id 保持 `aiBtn`（2048 为 `autoBtn`）不变：

```html
<button class="g-tool-btn g-tool-ai" id="aiBtn" type="button" aria-pressed="false" title="AI 代玩">AI</button>
```

运行中样式：**两种类名都认**——`.is-running`（新）与 `.auto-on`（2048 现有）。运行中红底白字，未运行时图标色为 `--site-accent`。页面原位的 AI 按钮（`.g-btn.g-ai-btn`）已删除，JS 的 `getElementById` 照常命中四宫格按钮；按钮 label 切换行（`aiBtn.textContent = …'停止代玩'…`）已删除，状态只由类名表达。

### 4.2 运行中状态徽标（两条路线，按页面现状选）

统一文案：「AI 代玩中 · 点击停止」，绿色胶囊 + 呼吸圆点（`.g-ai-tag`）。

**路线 A · 纯 CSS（推荐，零脚本）**：标签加 `.g-ai-tag-auto`、**不带** `hidden`，显隐由 `body:has(.g-tool-ai.is-running)` / `body:has(.g-tool-ai.auto-on)` 自动驱动（AI 格即四宫格按钮，现代浏览器均支持 `:has()`）：

```html
<div class="g-ai-group">
  <span class="g-ai-tag g-ai-tag-auto">AI 代玩中 · 点击停止</span>
</div>
```

**路线 B · 既有 JS 切 hidden**：页面已有 aiTag 与显隐 JS 时（snake、sudoku 等），保留 JS 机制，只改 HTML 文案与类名：

```html
<span class="g-ai-tag" id="aiTag" hidden>AI 代玩中 · 点击停止</span>
```

### 4.3 代玩成绩不计的呈现

「AI 代玩成绩不计」类静态标注（`.g-ai-note`）已按用户要求从页面移除，成绩豁免信息统一由两处承载：**规则弹窗内**的规则条目（如扫雷「AI 代玩成绩不计最佳用时」）与 **AI 局结算文案**的动态提示（如 dino-run 的 `overInfo`「AI 代玩 · 本局得分 X」）。其行为逻辑（`!aiOn` 等豁免判定）一律不动。

---

## 5. 通用改造清单（逐条动哪里）

对每个 `tools/<目录>/app.html` 依次执行；每条只动 `<style>` 与 `<body>` 的 UI 结构，涉及 `<script>` 的行见 §6.2 白名单：

1. **加引用**：`<head>` 中自身 `<style>` 之前插入 `<link rel="stylesheet" href="../../assets/game-ui.css">`。
2. **声明个性色**：`<style>` 开头加 `:root { --game-accent: <分配色>; }`；黄/灰个性色页再加 `--game-on-accent` / `--game-accent-text` 深色值（§7 表末已给）。
3. **删重复字体与中性色**：删掉自身 `body` 的 `font-family`、背景、文字色硬编码，改用 `.g-page`；`.tips` / `.footer` / `.hint` / `.sub` 等中性灰小字统一换 `.g-tips` / `.g-foot` / `.g-nav-sub` / `.g-card-hint`；删除与样式表重复的 `[hidden]`、`* { box-sizing… }` 复位（保留游戏私有复位亦可，勿删逻辑依赖）。
4. **标题栏**：`header > h1` 结构改 `.g-nav` / `.g-nav-large` / `.g-nav-sub`；副标题灰字改 `.g-nav-sub`。
5. **计分板**：按 §3.4 两种形态映射——`.stat > .lab/.val`（match3/2048）→ `.g-stat > .g-stat-label/.g-stat-value`；内联混排 HUD（snake）→ `.g-hud-bar > .g-stat-inline`（snake DOM 模板见 §3.4 B）。JS 中 `classList` 引用的类名字符串常量按 §6.2 白名单同步改（如 `bump` → `g-bump`），施加目标与时机不动。
6. **按钮**：`.btn` 系类替换为 `.g-btn` 四态；match3 纵向按钮列（`.btns`）→ `.g-btn-col`，2048 HUD 内联按钮 → `.g-hud-bar` 内直接放 `.g-btn`；JS 引用的按钮类名字符串常量同步改（§6.2 白名单第 1 条）。
7. **卡片**：`.card` / `.wrap` 内容容器换 `.g-card` / `.g-wrap`；snake 等 720px 宽台面加 `.g-wrap-wide`；圆角阴影删硬编码。
8. **弹窗**：胜负/结算层换 `.g-overlay`（协议 ①）或 `.g-overlay g-overlay-fade`（协议 ②，见 §3.9）；按钮改 `.g-alert-btn`，主操作加 `default`；私有 `.overlay { z-index: 5 }` 可删（`.g-overlay` 已自带同值 z-index），更高层叠的私有 z-index 保留不动。**私有修饰类共存规则**：g-* 类承担外观基线，游戏私有状态类（2048 的 `.win`、match3 的 `.deny`/`.clear` 等）原样保留在元素上叠加，其私有 CSS 规则继续写在游戏自己的 `<style>` 里，二者互不覆盖（`.win` 与 `.g-overlay-win` 二选一，不叠加冲突即可）。
9. **分段/开关**：难度选择换 `.g-segment`；设置开关换 `.g-switch`。
10. **AI 代玩**：AI 按钮统一在左上角工具栏（§3.10/§4.1，移位保 id）；状态徽标按 §4.2 路线 A（纯 CSS `:has()`，零脚本）或路线 B（既有 hidden JS，只改文案）；「成绩不计」信息只在规则弹窗条目与结算文案（§4.3）。
11. **工具栏与规则弹窗**：`.back-home`/`.g-back-chip` 返回浮钮替换为 `.g-tool-grid` 四宫格（§3.10）；`.rules-panel`/`.g-rules` 抽屉整体替换为 `#rulesModal` 规则弹窗（复用 `.g-alert-mask`，内容原样搬入）；`<head>` 加 `appearance.js` 引用，静音键/字体联动由四宫格脚本统一承担。
12. **响应式与触控**：删除与 `@media (max-width: 560px)` 重复的规则，保留游戏特有微调；`.g-stage` 套住棋盘即可获得触控防护（DOM 棋盘也适用）；自查可点元素 ≥44px（工具栏四格已 44px）。
13. **自查**：切换系统深色模式看一眼外围组件（按钮/徽标/弹窗）是否跟随，棋盘个性视觉是否原样；主站换主题色/字体后刷新游戏页，四宫格图标色与正文字体应跟随。

画布游戏（`canvas` 渲染）只改第 1~4、6~10 条涉及的外围 UI；画布内的棋盘/角色绘制风格保留。

---

## 6. 红线：只动样式与 UI 结构，绝不改玩法逻辑

### 6.1 一律不动

- `<script>` 内的算法、状态机、随机逻辑、计分规则、胜负判定、事件绑定时机与条件；
- `AI_CORE_BEGIN` / `AI_CORE_END` 标记块（如 `tools/snake/app.html:207-361`、`tools/2048/app.html:509-660`、`tools/sudoku/app.html:451-724`）——`ai-sim.mjs` 依赖标记提取同一份纯函数，两端必须同步修改，UI 改造不触碰此约定；
- 与 `ai-sim.mjs` 对应的纯函数（如 snake 的 `aiCoreSnake`、sudoku 的 `aiCoreSudoku`）及其参数、返回结构；
- Web Worker 注入源码（2048 的 expectimax 决策经 `toString` 注入）；
- 元素 `id` 与 `getElementById` 查找目标（可改 class，不可改 id）。

### 6.2 白名单：script 内允许改的行（仅此三类）

这是对「只动样式与 UI 结构」的边界裁定。除下列三类外，`<script>` 里**任何一行**都不许碰：

1. **`classList` 的类名字符串常量**：只改被 add/remove/toggle 的字符串本身（如 `'bump'` → `'g-bump'`、`'ai-on'` → `'is-running'`），调用的元素、时机、条件、正反状态一律不动。`.g-bump` 对容器/子元素均可生效（§3.4），施加目标保持现状不迁移。
2. **纯显示文案字符串**：`textContent` / `innerHTML` / 字符串拼接里的用户可见文字（如 snake `tools/snake/app.html:386` 结算文案、按钮 label），可调整措辞以统一文案；拼接结构、条件分支、数值来源不动。
3. **显隐 JS（仅当页面已有该机制时）**：既有 aiTag/overlay 的 `hidden` / `classList` 显隐调用保持原样；**不为新元素新增显隐 JS**——新徽标一律走 §4.2 路线 A 纯 CSS。

### 6.3 允许的非 script 改动

`<head>` 的 `<link>`、`<style>` 全部内容、`<body>` 的标签结构与 class/aria 属性、按钮/徽标/说明的静态显示文案。

---

## 7. 33 个游戏个性色分配表

每游戏一个 `--game-accent`，取自 iOS 系统色板，总量均衡（蓝仅 3 个）：

| 目录 | 游戏 | `--game-accent` | 色名 | 理由 |
|---|---|---|---|---|
| match3 | 消消乐 | `#FF2D55` | 粉 | 糖果甜色 |
| othello | 黑白棋 | `#8E8E93` | 灰 | 黑白棋盘 |
| nonogram | 数织 | `#5856D6` | 靛蓝 | 逻辑像素 |
| game24 | 24 点 | `#FF9500` | 橙 | 扑克暖色 |
| klotski | 华容道 | `#FF3B30` | 红 | 木块推移 |
| lightsout | 灯火通明 | `#FFCC00` | 黄 | 灯光 |
| onestroke | 一笔画 | `#5AC8FA` | 青 | 线条轻盈 |
| dotsboxes | 点格棋 | `#8E8E93` | 灰 | 纸笔棋类 |
| hanoi | 汉诺塔 | `#AF52DE` | 紫 | 彩色圆盘 |
| idiom-chain | 成语接龙 | `#FFCC00` | 黄 | 文字灯泡 |
| simon | 西蒙说 | `#FF2D55` | 粉 | 记忆灯色 |
| wordle-zh | 汉字 Wordle | `#34C759` | 绿 | 猜中绿格 |
| 2048 | 2048 | `#FF9500` | 橙 | 暖色方块 |
| breakout | 打砖块 | `#FF3B30` | 红 | 砖块 |
| bulls-cows | 猜数字 | `#5856D6` | 靛蓝 | 推理 |
| dino-run | 小恐龙快跑 | `#34C759` | 绿 | 恐龙 |
| dodge | 极速躲避 | `#007AFF` | 蓝 | 速度 |
| flappy-bird | 飞翔小鸟 | `#FFCC00` | 黄 | 小鸟 |
| gobang | 五子棋 | `#8E8E93` | 灰 | 黑白棋 |
| maze-runner | 迷宫追逐 | `#007AFF` | 蓝 | 探索 |
| memory-flip | 记忆翻牌 | `#AF52DE` | 紫 | 翻牌魔法 |
| minesweeper | 扫雷 | `#5856D6` | 靛蓝 | 经典系统蓝紫 |
| reaction-test | 反应测试 | `#FF3B30` | 红 | 紧张反应 |
| rock-paper-scissors | 石头剪刀布 | `#AF52DE` | 紫 | 保留原紫调 |
| slide-puzzle | 数字华容道 | `#5AC8FA` | 青 | 滑块 |
| snake | 贪吃蛇 | `#34C759` | 绿 | 经典蛇绿 |
| sokoban | 推箱子 | `#FF9500` | 橙 | 木箱 |
| space-shooter | 太空射击 | `#007AFF` | 蓝 | 星空 |
| stack-tower | 叠叠高塔 | `#5AC8FA` | 青 | 层层叠加 |
| sudoku | 数独 | `#5856D6` | 靛蓝 | 静心逻辑 |
| tetris-block | 俄罗斯方块 | `#FF2D55` | 粉 | 方块活力 |
| tic-tac-toe | 井字棋 | `#8E8E93` | 灰 | 纸笔棋类 |
| whack-mole | 打地鼠 | `#FF9500` | 橙 | 土拨鼠 |

用量统计：蓝 3、绿 3、红 3、橙 4、紫 3、靛蓝 4、粉 3、青 3、黄 3、灰 4，共 33。

### 7.1 黄/灰个性色的对比度修正（必做）

白字压黄底（`#FFCC00` 上白字 1.51:1）、黄字作正文（对 `#F2F2F7` 1.35:1）、白字压灰（`#8E8E93` 上白字 3.26:1）均低于 WCAG 4.5:1。以下 7 页**必须**同时覆盖两个令牌，把实心底上的字与强调色文字改深：

| 页面（7 个） | 浅色额外声明 | 深色复位（必带） |
|---|---|---|
| lightsout、idiom-chain、flappy-bird（黄） | `--game-on-accent: #1C1C1E;` `--game-accent-text: #8A6100;` | `--game-on-accent: #FFFFFF;` `--game-accent-text: var(--game-accent);` |
| othello、dotsboxes、gobang、tic-tac-toe（灰） | `--game-on-accent: #1C1C1E;` `--game-accent-text: #5C5C60;` | 同上 |

浅色下实测（WCAG 相对亮度公式）：`#1C1C1E` 压 `#FFCC00` 11.25:1、压 `#8E8E93` 5.22:1；`#8A6100` 对 `#F2F2F7` 4.96:1、`#5C5C60` 对 `#F2F2F7` 5.97:1，均达 4.5:1。

**深色模式必须复位**：上面的深色值只在浅色成立——`#8A6100` 对纯黑 3.79:1、`#5C5C60` 对纯黑 3.15:1，深色页面背景就是 `#000`（`--bg`），沿用即不达标。样式表已把深色复位挂在 `.g-page`（body 自有声明，胜过游戏页 `:root` 的覆盖——游戏页 `<style>` 在 `<link>` 之后、同特异性时文档顺序在后必胜，只复位 `:root` 挡不住）。为保险与可读，游戏页示例**同时**自带深色复位块，两层独立生效：

写法（以 lightsout 为例）：

```css
:root {
  --game-accent: #FFCC00;
  --game-on-accent: #1C1C1E;
  --game-accent-text: #8A6100;
}
@media (prefers-color-scheme: dark) {
  :root {
    --game-on-accent: #FFFFFF;
    --game-accent-text: var(--game-accent);
  }
}
```

即：**黄/灰 7 页的深色适配是「一行复位块」，不是「无需适配」**；其余 26 页用默认令牌仍无需写深色代码。

---

## 8. 附：改造现状底账（2026-10 抽样）

抽读 `tools/match3/app.html`、`tools/snake/app.html`、`tools/2048/app.html`、`tools/sudoku/app.html` 确认的共性与差异：

- 各页自带固定亮色样式与重复的 `.back-home`、`.rules-panel` 公共块（snake `app.html:33-140` 为典型），收敛到 `.g-back-chip` / `.g-rules` 系（§3.10）；
- **计分板两种形态并存**：`.stat > .lab/.val` 卡片式（match3 `app.html:322-328`、2048 `app.html:28-38`）与内联混排式（snake `app.html:148-154`，分数 span + 按钮 + aiTag 同行），分别映射 §3.4 A/B；
- **覆盖层显隐三套协议**：snake 只切 `hidden`（`app.html:374-377`）、match3/2048 `hidden`+同步回流+`.open`（match3 `app.html:686-692`、2048 `app.html:437-443`），统一为 §3.9 两协议（`.g-overlay-fade` 关闭态带 `pointer-events: none` 兜底）；
- **AI 状态呈现两派**：snake/sudoku 有 aiTag 元素 + hidden JS；2048 无 aiTag，只切 `autoBtn` 的 `auto-on` 类（`app.html:703-708`），样式表已兼容 `auto-on`，新徽标走 §4.2 路线 A 纯 CSS；
- **bump 施加在容器**：match3 `app.html:504-506`、2048 `app.html:408-410` 给 `.stat` 加类，`.g-bump` 动画不挑层级，保留现状；
- 21 个游戏有 AI 代玩且目录内带 `ai-sim.mjs`，12 个纯手动（无 AI 按钮）；`rock-paper-scissors` 无 `.back-home`/`.rules-panel` 公共块，改造时补引用即可，不强加重构。

**2026-10-24 更新**：全站 33 个小游戏完成左上角四宫格工具栏改造（返回/说明/AI/静音，见 §3.10）——`.g-back-chip` 游戏页退役（保留给实用工具页）、`.g-rules` 抽屉替换为规则弹窗（内容原样迁移）、AI 按钮移位保 id 并统一「AI」字样、全局静音键 `gameSfxMuted` 接通 whack-mole/simon（其余游戏天然无声）、字体与图标色接入主站联动（`appearance.js` 单源）；`typing-tutor` 同步接入并删除其旧体系私拷贝（`.back-home`/`.rules-panel`）。`rock-paper-scissors` 属实用工具分类，维持两枚 chip 原状。
