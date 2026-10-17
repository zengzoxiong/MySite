---
name: tmdb-media-catalog
description: 维护个人影视收藏目录数据（JSON）。当用户需要新增/修正影视条目、统一评分来源、补充上映时间或下载海报时使用。核心原则：评分与上映时间统一取自 TMDB，番剧日期用 AniList 精修，不自行编造数据。
---

# TMDB 影视收藏数据维护

维护形如 `data/media.json` 的影视收藏库（字段：title/type/status/rating/release/comment/cover/url），type 取值：番剧、电影、特摄、综艺、电视剧、纪录片。

## 数据来源规范（强制）

1. **评分（rating，0-10）与上映时间（release）统一取自 TMDB**（themoviedb.org），禁止自拟或混用豆瓣等其他来源。TMDB 无评分的作品不写该字段（前端自动隐藏角标）。
2. **番剧/综艺的首播日期**优先用 AniList GraphQL（免钥）：
   ```graphql
   query ($search: String) { Page(perPage: 8) { media(search: $search, type: ANIME) {
     id format startDate { year month day } title { native english } coverImage { extraLarge } } }
   }
   ```
   端点 `https://graphql.anilist.co`，POST JSON，需浏览器 UA（裸 urllib 会被 403）。
3. **电影的上映日期**用 TMDB 详情页的 `/releases` 子页，取最早日期（详情页本体由 JS 渲染，抓不到）。
4. **评分抓取**：TMDB 详情页内嵌 `<script type="application/ld+json">`（JSON-LD），取 `aggregateRating.ratingValue`；注意剥掉 CDATA 注释（截取首尾大括号之间）。
5. **封面**：电影/剧集从 TMDB `og:image`（或搜索卡片 srcset 改 `/t/p/w500/`）下载；番剧用 AniList `coverImage.extraLarge`。下载到本地 `assets/media/` 并用语义化文件名，海报逐张目检确认未抓错。

## 已知坑（实战教训）

- **TMDB 中文搜索错配率高**：中文关键词常命中配音版/地区变体/完全无关条目。必须做"标题包含 + 年份 ±1"双重校验，拿不准就换英文/日文原名重搜。
- **分季番剧**：TMDB 常把整季系列合并为一个条目，季评分即总评分；条目 URL 指向对应 `/tv/{id}/season/{n}`。
- **豆瓣（movie.douban.com）对自动化访问全面封锁**（302 到 sec.douban.com），不要尝试抓取，用户手填。
- **图片主机可用性因网络而异**：TMDB（image.tmdb.org）与 AniList CDN（s4.anilist.co）一般可达；Wikipedia/Bangumi 在部分网络不可达。连续抓取加 2-7 秒间隔防 404 限流（TMDB 对突发抓取会临时 404，等一会即恢复）。
- **URL 拼接**：TMDB 搜索卡片捕获的路径不含前导斜杠时，拼接尺寸前缀记得补 `/`（`/t/p/w500/` + path）。

## 条目规则

- 分季作品按用户偏好拆为单独条目（每季一条，URL 指向对应季页），或按用户明确要求合并为“全季”——先问清。
- 同作品的配音版/中配版不算独立作品，不重复收录。
- 长标题在 UI 中省略号展示，数据里保留完整名。
