---
name: svg-architecture-diagram
description: 手写规范、可维护的 SVG 架构图/流程图/时序图。当用户需要绘制系统架构图、模块关系图、数据流图，或要求图能自适应缩放、支持暗色模式、嵌入网页或 README 时使用。
---

# SVG 架构图手写规范

## 画布与自适应

- 根元素：`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" font-family="-apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif">`。只定 viewBox 不定 width/height，CSS 里 `max-width:100%; height:auto` 即可无限缩放。
- 网格对齐：所有坐标取 20 的倍数，节点间距 ≥ 40，避免连线穿模。

## 分层与复用

- 用 `<defs>` 定义可复用节点（`<g id="node-db">`）与箭头 marker：
  ```svg
  <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>
  ```
- 连线统一 `stroke="currentColor" marker-end="url(#arrow)"`，折线用 `<path d="M.. H.. V.. H..">` 直角转折。

## 暗色模式适配（关键）

- 禁止硬编码深浅色。用 CSS 变量 + `prefers-color-scheme`：
  ```css
  svg { color: #1f2937 }  /* currentColor 供连线/文字 */
  @media (prefers-color-scheme: dark) { svg { color: #e5e7eb } }
  .node-box { fill: var(--box-fill); stroke: var(--box-line) }
  ```
- 文本必须 `<text>` 元素（不要把字画进 path），才能随主题变色与被搜索。

## 中文排版

- 文字居中：`text-anchor="middle" dominant-baseline="central"`；字号节点标题 14-16、注释 11-12。
- 中文宽度按 1em/字估算预留盒宽，避免溢出；长文案手动折行成多个 `<tspan x=... dy="1.4em">`。

## 可维护性

- 每个 `<g>` 加 `id` 与注释（`<!-- 网关层 -->`）；同类节点坐标列在注释里的对照表中，方便后续增删。
- 输出前自检：改一个 viewBox 数值缩放无锯齿；暗色下无低对比文字；所有箭头指向正确。
