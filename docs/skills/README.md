# zengzoxiong/skills

个人 Agent Skills 合集。每个目录是一个独立技能（含 `SKILL.md`），可被 Claude Code、Cursor 等支持 Agent Skills 规范的工具安装。

## 安装

```bash
# 安装全部
npx skills add zengzoxiong/skills

# 安装单个
npx skills add zengzoxiong/skills/tmdb-media-catalog
```

## 技能列表

| 技能 | 说明 |
|---|---|
| [tmdb-media-catalog](skills/tmdb-media-catalog/SKILL.md) | 用 TMDB/AniList 维护个人影视收藏数据（评分统一、上映时间、海报本地化） |
| [static-site-launch-checklist](skills/static-site-launch-checklist/SKILL.md) | 静态网站上线前自检：SEO/PWA/无障碍/深色模式一整套检查 |
| [svg-architecture-diagram](skills/svg-architecture-diagram/SKILL.md) | 手写规范的 SVG 架构图/流程图（自适应、暗色适配） |

## 来源

技能沉淀自 [MySite](https://github.com/zengzoxiong/MySite)（个人工具箱站点）的真实维护经验，均经过实战验证。

## License

MIT
