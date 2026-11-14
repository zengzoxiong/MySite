#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""工具页脚手架：一条命令生成新工具的目录、页面模板并完成登记。

替代「复制粘贴改三个地方」的手工流程（建目录写 app.html、写 index.html 说明页、
登记 data/tools.json、收录 sitemap.xml），生成结果随后自动跑
scripts/check_tools.py 七项体检，违例即脚手架报错。

用法示例::

    # 纯计算工具（默认生成说明页 index.html）
    python scripts/new_tool.py --name url-base64 --title "URL Base64 编码" \
        --category 编码转换 --desc "按 URL 安全规则编解码 Base64" --icon 🔐

    # 不需要说明页的工具（与 image-converter 同款极简型）
    python scripts/new_tool.py --name xxx --title "..." --category 实用工具 \
        --desc "..." --icon 🧰 --no-index

    # 小游戏（game-ui 设计规范模板，默认不生成说明页）
    python scripts/new_tool.py --name my-game --title "我的游戏" --category 小游戏 \
        --desc "一句话玩法" --icon 🎮 --game --accent "#FF9500"

生成物：
  - tools/<name>/app.html          工具页（canonical 指 app.html、favicon、署名齐备）
  - tools/<name>/index.html        说明页（新一代零外链风格，canonical 同指 app.html）
  - data/tools.json                条目追加到 tools 数组末尾（--offline 时带 offline:true）
  - sitemap.xml                    按目录名字母序插入 app.html 条目（monthly / 0.6）
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = ROOT / 'tools'
TOOLS_JSON = ROOT / 'data' / 'tools.json'
SITEMAP = ROOT / 'sitemap.xml'
CHECK_SCRIPT = ROOT / 'scripts' / 'check_tools.py'
CANON_BASE = 'https://zengzoxiong.github.io/MySite/tools/'

# 目录名：小写字母/数字 + 连字符分段（与现存 165 个目录一致）
NAME_RE = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')

SITEMAP_BLOCK_RE = re.compile(
    r'  <url>\n'
    r'    <loc>(?P<loc>[^<]+)</loc>\n'
    r'    <changefreq>(?P<freq>[^<]+)</changefreq>\n'
    r'    <priority>(?P<prio>[^<]+)</priority>\n'
    r'  </url>'
)


def write_crlf(path: Path, text: str) -> None:
    """按仓库现有约定落盘：CRLF 行尾、UTF-8 无 BOM、结尾带一个换行。"""
    if not text.endswith('\n'):
        text += '\n'
    path.write_bytes(text.replace('\n', '\r\n').encode('utf-8'))


# ---------------------------------------------------------------------------
# app.html 模板（纯计算型）：token 用 __NAME__ 占位，CSS 花括号无需转义
# ---------------------------------------------------------------------------

# 浮动胶囊（首页/说明）：与存量多数工具页一致的导航约定，仅生成说明页时才有「说明」
PILL_CSS = """
        .tool-doc-link,
        .tool-home-link {
            position: fixed;
            top: 16px;
            padding: 6px 12px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 600;
            color: #0f172a;
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid rgba(15, 23, 42, 0.12);
            text-decoration: none;
            letter-spacing: 0.02em;
            z-index: 9999;
            box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
        }

        .tool-doc-link { right: 16px; }
        .tool-home-link { right: 74px; }

        .tool-doc-link:hover,
        .tool-home-link:hover {
            background: rgba(255, 255, 255, 1);
            border-color: rgba(15, 23, 42, 0.2);
        }
"""

APP_PURE_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <link rel="icon" href="../../favicon.svg">
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>__TITLE__ - 拾光集</title>
    <meta name="description" content="__DESC__">
    <link rel="canonical" href="__CANON__">
    <style>
        /* 基础版式：新工具从这里起步，按需增改 */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #eee;
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            margin-bottom: 24px;
        }

        .header h1 {
            font-size: 2rem;
            margin-bottom: 8px;
            color: #fff;
        }

        .header p {
            color: #9ca3af;
            font-size: 0.95rem;
        }

        .panel {
            background: rgba(30, 30, 50, 0.8);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 24px;
        }

        footer {
            text-align: center;
            color: #6b7280;
            font-size: 0.85rem;
            margin-top: 24px;
        }
__PILL_CSS__    </style>
</head>
<body>
__PILLS__    <div class="container">
        <div class="header">
            <h1>__TITLE__</h1>
            <p>__DESC__</p>
        </div>

        <div class="panel">
            <!-- TODO：工具界面从这里开始 -->
            <p>工具界面占位：把你的 UI 写在这里。</p>
        </div>
    </div>

    <footer>拾光集 · 在线工具</footer>

    <script>
        // TODO：工具逻辑从这里开始（自包含单文件，禁止外链脚本）
    </script>
</body>
</html>
"""

# 游戏四宫格工具栏：返回 / 规则 / AI（未实现置灰）/ 静音，标记与存量游戏页一致
GAME_NAV = """    <nav class="g-tool-grid" aria-label="游戏工具栏"><a class="g-tool-btn" href="../../index.html" aria-label="返回拾光集主页" title="返回主页"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H10"/></svg></a><button class="g-tool-btn" id="rulesBtn" type="button" aria-label="游戏规则" title="游戏规则"><svg class="g-q" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5"/><path d="M12 17.5h.01"/></svg></button><button class="g-tool-btn g-tool-ai" id="aiBtn" type="button" aria-pressed="false" title="未实现 AI 代玩" disabled>AI</button><button class="g-tool-btn" id="sfxBtn" type="button" aria-pressed="false" aria-label="静音" title="音效开关"><svg class="sfx-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6.5 8.5H3v7h3.5L11 19V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.6 6a9 9 0 0 1 0 12"/></svg><svg class="sfx-off" viewBox="0 0 24 24" aria-hidden="true" hidden><path d="M11 5 6.5 8.5H3v7h3.5L11 19V5Z"/><path d="m16 9 6 6"/><path d="m22 9-6 6"/></svg></button></nav>
"""

# 规则弹窗 + 静音键接线：照搬存量游戏页的共享块（docs/game-ui-design.md §3.10/§3.11）
GAME_TOOLBAR_JS = """<script>
  /* 左上角工具栏：规则弹窗 + 全局音效开关；字体与主站「界面字体」联动（appearance.js 单源） */
  (function () {
    var mask = document.getElementById('rulesModal');
    var rulesBtn = document.getElementById('rulesBtn');
    var closeBtn = document.getElementById('rulesClose');
    var lastFocus = null;
    function openRules() {
      if (!mask || !mask.hidden) return;
      lastFocus = document.activeElement;
      mask.hidden = false;                  // mask 常驻 .open（g-alert open 态），只切 hidden
      if (closeBtn) closeBtn.focus();
    }
    function closeRules() {
      if (!mask || mask.hidden) return;
      mask.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      lastFocus = null;
    }
    if (rulesBtn) rulesBtn.addEventListener('click', openRules);
    if (closeBtn) closeBtn.addEventListener('click', closeRules);
    if (mask) mask.addEventListener('click', function (e) { if (e.target === mask) closeRules(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mask && !mask.hidden) { e.stopPropagation(); closeRules(); }
    });

    var sfxBtn = document.getElementById('sfxBtn');
    var SFX_KEY = 'gameSfxMuted';
    function sfxMuted() { try { return localStorage.getItem(SFX_KEY) === '1'; } catch (e) { return false; } }
    function paintSfx() {
      if (!sfxBtn) return;
      var muted = sfxMuted();
      sfxBtn.classList.toggle('is-muted', muted);
      sfxBtn.setAttribute('aria-pressed', String(muted));
      sfxBtn.setAttribute('aria-label', muted ? '开启音效' : '静音');
      var on = sfxBtn.querySelector('.sfx-on'), off = sfxBtn.querySelector('.sfx-off');
      if (on) on.toggleAttribute('hidden', muted);      // SVGElement.hidden 非反射属性，必须 toggleAttribute
      if (off) off.toggleAttribute('hidden', !muted);
    }
    if (sfxBtn) sfxBtn.addEventListener('click', function () {
      try { localStorage.setItem(SFX_KEY, sfxMuted() ? '0' : '1'); } catch (e) {}
      paintSfx();
    });
    window.addEventListener('storage', function (e) { if (e.key === SFX_KEY) paintSfx(); });
    paintSfx();

    try { if (window.SiteAppearance) SiteAppearance.applySiteFontFromStorage(); } catch (e) {}
    window.addEventListener('storage', function (e) {
      if (e.key === 'fontFamily' && window.SiteAppearance) SiteAppearance.applySiteFontFromStorage();
    });
  })();
  </script>"""

GAME_APP_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>__TITLE__ - 拾光集</title>
  <meta name="description" content="拾光集在线小游戏：__TITLE__。__DESC__ 纯本地运行，无需联网。">
  <link rel="icon" href="../../favicon.svg">
  <link rel="canonical" href="__CANON__">
  <link rel="stylesheet" href="../../assets/game-ui.css">
  <script src="../../assets/appearance.js"></script>
  <script src="../../assets/game-sfx.js"></script>
  <script src="../../assets/game-fit.js"></script>
  <script src="../../assets/game-juice.js"></script>
  <style>
    /* 个性色：组件强调色一行切换（docs/game-ui-design.md §7），按游戏气质改这里 */
    :root { --game-accent: __ACCENT__; }
  </style>
</head>
<body class="g-page">
__GAME_NAV__
  <main class="g-wrap">
    <header>
      <h1 class="g-nav-large">__TITLE__</h1>
      <p class="g-nav-sub">__DESC__</p>
    </header>

    <section class="g-hud">
      <div class="g-stat" id="scoreStat"><span class="g-stat-label">分数</span><span class="g-stat-value g-num" id="score">0</span></div>
    </section>

    <!-- TODO：游戏主区域（棋盘/画布等），参考现有游戏的 .g-stage 用法；
         结算层复用 <div class="g-overlay g-overlay-fade" hidden>…</div> -->
    <div class="g-stage-wrap"></div>

    <footer class="g-foot">拾光集 · 在线小游戏</footer>
  </main>

  <div class="g-alert-mask g-alert-rules open" id="rulesModal" role="dialog" aria-modal="true" aria-label="游戏规则" hidden>
    <div class="g-alert">
      <div class="g-alert-body">
        <h2>游戏规则</h2>
        <h3>玩法</h3>
        <ul>
          <li>TODO：写下玩法规则</li>
        </ul>
      </div>
      <div class="g-alert-actions">
        <button class="g-alert-btn default" id="rulesClose" type="button">好的</button>
      </div>
    </div>
  </div>

  <script>
  'use strict';
  /* ================= __TITLE__ 主逻辑（零依赖，纯本地运行） ================= */
  // TODO：游戏逻辑从这里开始；关键事件点按规范插桩音效：if (window.GameSFX) GameSFX.click();
  </script>

__GAME_TOOLBAR_JS__
</body>
</html>
"""

# index.html 说明页：新一代零外链风格（参照 json-formatter/index.html，不引 FontAwesome）
INDEX_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <link rel="icon" href="../../favicon.svg">
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>__TITLE__ - 拾光集</title>
    <meta name="description" content="__DESC__">
    <link rel="canonical" href="__CANON__">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            color: white;
            margin-bottom: 30px;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }

        .card {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            margin-bottom: 20px;
        }

        .card h2 {
            color: #333;
            margin-bottom: 20px;
            font-size: 1.5rem;
        }

        .card p {
            color: #666;
            line-height: 1.8;
            margin-bottom: 15px;
        }

        .features {
            list-style: none;
            margin-top: 20px;
        }

        .features li {
            padding: 10px 0;
            color: #555;
            border-bottom: 1px solid #eee;
        }

        .features li:before {
            content: "\\2713";
            color: #667eea;
            font-weight: bold;
            margin-right: 10px;
        }

        .btn {
            display: inline-block;
            padding: 14px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 10px;
            font-weight: 600;
            transition: all 0.3s;
            margin: 10px 10px 10px 0;
        }

        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
        }

        .btn-secondary {
            background: #6c757d;
        }

        footer {
            text-align: center;
            color: rgba(255, 255, 255, 0.75);
            font-size: 0.85rem;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>__TITLE__</h1>
            <p>__DESC__</p>
        </div>

        <div class="card">
            <h2>关于这个工具</h2>
            <p>TODO：__DESC__。补充功能介绍、使用场景与注意事项，帮助访客快速上手。</p>

            <h2>功能特点</h2>
            <ul class="features">
                <li>TODO：功能点一</li>
                <li>TODO：功能点二</li>
                <li>完全在浏览器本地运行</li>
            </ul>

            <div style="margin-top: 30px;">
                <a href="app.html" class="btn">开始使用</a>
                <a href="../../index.html" class="btn btn-secondary">返回首页</a>
            </div>
        </div>
    </div>

    <footer>拾光集 · 在线工具</footer>
</body>
</html>
"""


def render(template: str, mapping: dict) -> str:
    """按 __TOKEN__ 占位渲染模板（模板含 CSS 花括号，不用 str.format）。"""
    out = template
    for key, value in mapping.items():
        out = out.replace('__' + key + '__', value)
    leftover = re.findall(r'__[A-Z_]+__', out)
    if leftover:
        raise SystemExit(f'内部错误：模板存在未替换占位符 {sorted(set(leftover))}')
    return out


def load_tools_json() -> dict:
    return json.loads(TOOLS_JSON.read_text(encoding='utf-8'))


def validate(args, data: dict) -> list:
    """返回校验错误清单（空清单 = 通过）。"""
    errors = []
    if not NAME_RE.match(args.name):
        errors.append(f'目录名「{args.name}」不合规范：须为小写字母/数字 + 连字符分段（如 url-base64）')
    tool_dir = TOOLS_DIR / args.name
    if tool_dir.exists():
        errors.append(f'目录已存在：{tool_dir}')
    paths = {t['path'] for t in data['tools']}
    names = {t['name'] for t in data['tools']}
    if f'{args.name}/app.html' in paths:
        errors.append(f'tools.json 已登记同名路径：{args.name}/app.html')
    if args.title in names:
        errors.append(f'tools.json 已存在同名工具：{args.title}')
    categories = set(data.get('categories') or [])
    if categories and args.category not in categories:
        errors.append(f'分类「{args.category}」不在 tools.json 的 categories 清单内：{sorted(categories)}')
    return errors


def build_app_html(args, canon: str, with_index: bool) -> str:
    if args.game:
        return render(GAME_APP_TEMPLATE, {
            'TITLE': args.title, 'DESC': args.desc, 'CANON': canon, 'ACCENT': args.accent,
            'GAME_NAV': GAME_NAV, 'GAME_TOOLBAR_JS': GAME_TOOLBAR_JS,
        })
    pill_css = PILL_CSS if with_index else ''
    pills = ('    <a class="tool-home-link" href="../../index.html">首页</a>\n'
             '    <a class="tool-doc-link" href="index.html">说明</a>\n') if with_index else ''
    return render(APP_PURE_TEMPLATE, {
        'TITLE': args.title, 'DESC': args.desc, 'CANON': canon,
        'PILL_CSS': pill_css, 'PILLS': pills,
    })


def register_tools_json(data: dict, args) -> None:
    entry = {
        'name': args.title,
        'path': f'{args.name}/app.html',
        'description': args.desc,
        'icon': args.icon,
        'category': args.category,
    }
    if args.offline:
        entry['offline'] = True
    data['tools'].append(entry)
    # 与现有文件同格式：2 空格缩进、非 ASCII 原样、CRLF、结尾换行
    write_crlf(TOOLS_JSON, json.dumps(data, ensure_ascii=False, indent=2))


def sitemap_upsert(name: str) -> str:
    """插入 app.html 条目并保持 loc 字母序；返回动作说明。"""
    text = SITEMAP.read_text(encoding='utf-8').replace('\r\n', '\n')
    header = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    footer = '</urlset>\n'
    blocks = SITEMAP_BLOCK_RE.findall(text)
    rebuilt = header + ''.join(
        f'  <url>\n    <loc>{loc}</loc>\n    <changefreq>{freq}</changefreq>\n'
        f'    <priority>{prio}</priority>\n  </url>\n'
        for loc, freq, prio in blocks
    ) + footer
    if rebuilt != text:
        raise SystemExit('sitemap.xml 格式与预期不一致（切块无法无损重组），请人工检查后再登记')

    url = f'{CANON_BASE}{name}/app.html'
    if any(loc == url for loc, _, _ in blocks):
        return '已存在，跳过'
    home = [b for b in blocks if '/tools/' not in b[0]]
    tools = sorted([b for b in blocks if '/tools/' in b[0]] + [(url, 'monthly', '0.6')])
    new_blocks = home + tools
    out = header + ''.join(
        f'  <url>\n    <loc>{loc}</loc>\n    <changefreq>{freq}</changefreq>\n'
        f'    <priority>{prio}</priority>\n  </url>\n'
        for loc, freq, prio in new_blocks
    ) + footer
    write_crlf(SITEMAP, out)
    return f'已插入（loc 字母序）'


def main() -> None:
    parser = argparse.ArgumentParser(description='工具页脚手架：生成目录/页面并登记')
    parser.add_argument('--name', required=True, help='目录名，小写 kebab-case（如 url-base64）')
    parser.add_argument('--title', required=True, help='工具显示名（中文，tools.json 的 name）')
    parser.add_argument('--category', required=True, help='分类，必须在 tools.json 的 categories 清单内')
    parser.add_argument('--desc', required=True, help='一句话描述')
    parser.add_argument('--icon', required=True, help='卡片图标（emoji 或字符）')
    parser.add_argument('--no-index', action='store_true', help='不生成 index.html 说明页')
    parser.add_argument('--game', action='store_true', help='游戏模板（game-ui 规范骨架，默认不生成说明页）')
    parser.add_argument('--accent', default='#3b82f6', help='游戏个性色（--game 时的 --game-accent）')
    parser.add_argument('--offline', action='store_true', help='标记 offline:true（纯计算工具可离线使用）')
    args = parser.parse_args()

    data = load_tools_json()
    errors = validate(args, data)
    if errors:
        print('校验未通过：')
        for e in errors:
            print(f'  [x] {e}')
        sys.exit(1)

    if args.game and not args.no_index:
        # 游戏页按存量约定不带说明页（37 个无 index 的目录里 36 个是游戏）
        args.no_index = True
        print('  [i] 游戏模板默认不生成说明页（如需说明页改用纯计算模板）')

    canon = f'{CANON_BASE}{args.name}/app.html'
    tool_dir = TOOLS_DIR / args.name
    tool_dir.mkdir(parents=True)

    with_index = not args.no_index
    write_crlf(tool_dir / 'app.html', build_app_html(args, canon, with_index))
    print(f'已生成 {tool_dir / "app.html"}')
    if with_index:
        write_crlf(tool_dir / 'index.html', render(INDEX_TEMPLATE, {
            'TITLE': args.title, 'DESC': args.desc, 'CANON': canon,
        }))
        print(f'已生成 {tool_dir / "index.html"}')

    register_tools_json(data, args)
    print(f'已登记 data/tools.json（tools 数组末尾，{len(data["tools"])} 条）')
    print(f'sitemap.xml：{sitemap_upsert(args.name)}')

    print('--- 自动体检（scripts/check_tools.py）---', flush=True)
    result = subprocess.run([sys.executable, str(CHECK_SCRIPT)])
    sys.exit(result.returncode)


if __name__ == '__main__':
    main()
