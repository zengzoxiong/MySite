# GitHub 工具资源整理

> 2026-09-13 通过 GitHub Search API 搜索整理，所有在线地址均已验证可访问。Star 数为整理时的数据。
> 已收录部分同步维护在 `data/links.json` 中（「工具合集」与「开源工具」两个分类）。

## 一、在线工具箱（已收录到「工具合集」分类）

| 名称 | 在线地址 | GitHub 仓库 | Star | 说明 |
|---|---|---|---|---|
| 一方工具箱 | <https://tool.fologde.com/> | - | - | 简洁好用的在线工具箱，集成图片处理、文本处理、开发辅助等日常小工具 |
| IT Tools | <https://it-tools.tech> | [CorentinTh/it-tools](https://github.com/CorentinTh/it-tools) | 40k+ | 开发者高频工具集：编解码、加密哈希、格式转换等，Vue 构建，体验极佳 |
| CyberChef | <https://gchq.github.io/CyberChef/> | [gchq/CyberChef](https://github.com/gchq/CyberChef) | 35k+ | 英国 GCHQ 出品的「网络瑞士军刀」，加密、编码、压缩、数据分析，可完全离线使用 |
| Omni Tools | <https://omnitools.app> | [iib0011/omni-tools](https://github.com/iib0011/omni-tools) | 10k+ | 自托管友好的开源工具集，无广告无追踪，Docker 一键部署 |
| IT Toolbox | <https://ittool.wort.uk> | [Zoroaaa/it-toolbox](https://github.com/Zoroaaa/it-toolbox) | 139 | 基于 Cloudflare Pages Functions 全栈部署，集成 146 个高频开发工具 |
| 傲星工具箱 | <https://tool.aoaostar.com> | [aoaostar/toolbox](https://github.com/aoaostar/toolbox) | 1.5k | 支持插件扩展的在线工具箱程序，PHP 环境即可自建 |
| 彩虹工具箱 | <https://tool.cccyun.cc> | [netcccyun/toolbox](https://github.com/netcccyun/toolbox) | 412 | 插件增强型在线工具箱，也可当网址导航用，PHP 8.2 + MySQL 自建 |
| FreeTool | <https://xdxsb.top/FreeTool> | [zstar1003/FreeTool](https://github.com/zstar1003/FreeTool) | 139 | 多功能在线工具箱，基于 Gradio 构建，可自行搭建 |

另有本站已收录的其他工具站：ToolHub（<https://toolhub.changhui.org.cn/tools.html>）。

## 二、可部署到自己网站的开源工具（已收录到「开源工具」分类）

均为知名开源项目，提供在线 Demo 可直接使用，也可以按说明部署到自己的服务器 / 静态托管上。

| 名称 | 在线地址 | GitHub 仓库 | Star | 部署方式 |
|---|---|---|---|---|
| Excalidraw | <https://excalidraw.com> | [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) | 130k+ | 手绘风虚拟白板，静态构建后可部署到任意静态托管 |
| tldraw | <https://www.tldraw.com> | [tldraw/tldraw](https://github.com/tldraw/tldraw) | 50k+ | 无限画布白板，提供 React SDK，可嵌入自己的网页 |
| drawDB | <https://drawdb.app> | [drawdb-io/drawdb](https://github.com/drawdb-io/drawdb) | 39k+ | 在线数据库 ER 图编辑器 + SQL 生成，纯前端静态部署 |
| Squoosh | <https://squoosh.app> | [GoogleChromeLabs/squoosh](https://github.com/GoogleChromeLabs/squoosh) | 25k+ | 浏览器端图片压缩，纯静态，图片不出本地 |
| LibreSpeed | <https://librespeed.org> | [librespeed/speedtest](https://github.com/librespeed/speedtest) | 15k+ | HTML5 网速测试，Docker / 静态 + 轻后端均可 |
| WebStack 导航 | <http://webstack.cc> | [WebStackPage/WebStackPage.github.io](https://github.com/WebStackPage/WebStackPage.github.io) | 7k+ | 静态响应式网址导航模板，克隆仓库即可部署 |

## 三、部署到本站的建议

本站是纯静态站点（GitHub Pages / Vercel / Netlify 均可托管），按部署成本从低到高：

1. **纯静态工具**（CyberChef、Squoosh、drawDB、IT Tools）：克隆仓库 → 构建（部分无需构建）→ 将产物放入本站 `tools/` 目录，并在 `data/tools.json` 中登记即可像内置小工具一样展示。
2. **前端组件类**（tldraw、Excalidraw）：通过 npm 引入官方 SDK/组件，嵌入自建工具页面。
3. **需要轻后端**（LibreSpeed、傲星/彩虹工具箱、Omni Tools）：部署到 Vercel / Cloudflare / 自己的 VPS（分别对应 Serverless Functions、PHP、Docker），本站只保留入口链接。

## 四、影视记录类开源项目（2026-09-14 补充调研）

为本站「影视」栏做的调研。以下项目均可自部署追踪观影记录，但因需要服务器/数据库，不适合 GitHub Pages 静态站点直接使用；本站参考它们的数据模型（标题、类型、状态、评分、评论、海报、外链）做了纯静态实现，数据存 `data/media.json`。

| 名称 | 在线地址 | GitHub 仓库 | Star | 技术栈 / 部署 |
|---|---|---|---|---|
| RYOT | <https://ryot.io> | [IgnisDa/ryot](https://github.com/IgnisDa/ryot) | 3.6k | Rust + React，Docker 自部署，支持电影/剧集/番剧/游戏/书籍 |
| Yamtrack | - | [FuzzyGrim/Yamtrack](https://github.com/FuzzyGrim/Yamtrack) | 3.5k | Django，Docker 自部署，对接 TMDB/AniList/MAL |
| Watcharr | <https://watcharr.app> | [sbondCo/Watcharr](https://github.com/sbondCo/Watcharr) | 1.5k | Go + Svelte，Docker 自部署，看过清单 + 评分 + 吐槽 |
| Flox | <https://flox-demo.pyxl.dev/> | [devfake/flox](https://github.com/devfake/flox) | 1.35k | PHP Laravel，电影/剧集/番剧 watched list |
| Movary | <https://movary.org> | [leepeuker/movary](https://github.com/leepeuker/movary) | 776 | PHP，专注电影追踪与评分 |

## 五、搜索方法备忘

- GitHub Search API：`https://api.github.com/search/repositories?q=在线工具+工具箱&sort=stars`
- 关键词组合：`工具箱`、`在线工具`、`self-hosted online tools`、`toolbox`
- 筛选条件建议：`stars:>500` 过滤低质量仓库，按 `sort=stars` 排序
