---
name: static-site-launch-checklist
description: 静态网站（GitHub Pages/Vercel/Netlify 托管的纯 HTML/CSS/JS 站点）上线或大版本发布前的自检清单。当用户发布新站点、增加新页面或询问 SEO/PWA/无障碍/深色模式配置时使用。
---

# 静态站点上线自检清单

对目标站点逐项检查并给出修复代码。全部为零后端依赖方案。

## SEO 基础

- [ ] `<meta name="description">` 一句话说明站点
- [ ] `theme-color` 明暗双值：`<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">` + dark 变体
- [ ] Open Graph 三件套：`og:title` / `og:description` / `og:type`
- [ ] `sitemap.xml`（绝对 URL）+ `robots.txt`（含 Sitemap 行）；注意 github.io 子路径部署时 URL 形如 `https://user.github.io/repo/`
- [ ] `<html lang="zh-CN">`；每个页面有独立 `<title>`

## PWA

- [ ] `manifest.json`：name/short_name/start_url(相对 `./`)/scope/display:standalone/background_color/theme_color/icons（SVG icon 可用 `"sizes": "any"`）
- [ ] Service Worker：install 预缓存同源资源；fetch 用 stale-while-revalidate（缓存命中先回，后台更新）；**跨域请求（API/字体/计数脚本）直连不缓存**；activate 清旧版本缓存
- [ ] 注册代码带特性检测 + `.catch(() => {})` 静默失败

## 深色模式

- [ ] `:root { color-scheme: light }` / `[data-theme="dark"] { color-scheme: dark }`（否则原生控件/select 亮瞎眼）
- [ ] 所有新增样式用 CSS 变量取色，禁止硬编码

## 无障碍

- [ ] 可点击的 div 加 `role="button" tabindex="0"`，并在容器上委托 keydown（Enter/Space → click）
- [ ] 图标按钮/输入框补 `aria-label`
- [ ] `@media (prefers-reduced-motion: reduce)` 全局压缩动画时长
- [ ] 弹层：`role="dialog" aria-modal="true"`、打开聚焦到弹层内、关闭还原焦点、打开时锁 body 滚动

## 已知坑

- **不要用 requestAnimationFrame 给弹层加类**：后台标签 rAF 被节流会永远不执行，弹层透明卡死。改用同步强制回流 `el.hidden = false; void el.offsetHeight; el.classList.add('open')`。
- **后台标签的 setTimeout 同样被节流**：加载态定时器在 `document.hidden` 时应跳过直接渲染结果。
- **弹层不要放在有 `transform` 的容器里**（如侧边抽屉），`position: fixed` 会被 transformed 祖先劫持为相对定位；挂到 body 直接子级。
- **浏览器 HTTP 缓存**会让“改完不生效”：测试时用 `fetch(url, {cache:'reload'})` 或换端口验证。
- postMessage 通信记得校验 `e.origin`；iframe 内的 ESC 键盘事件不会冒泡到父页，需 iframe 自己监听并 postMessage 通知。
