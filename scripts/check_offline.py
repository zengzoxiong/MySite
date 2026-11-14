#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""工具离线标记：扫描 tools/*/app.html 的外部依赖，判定并维护 tools.json 的 offline 标记。

判定口径（offline:true = 装成 PWA 后断网即可用，sw.js 会把标记页纳入离线包）：
  1. 硬排除：script/link/img/iframe/source/video/audio/embed/object/track 的
     src/href/poster 指向 http(s) 或协议相对地址（canonical 标签除外）；
     fetch / XMLHttpRequest / 动态 import / WebSocket / EventSource 运行时调用
  2. 误报白名单 FALSE_POSITIVE：fetch 仅出现在生成代码字符串里、或指向同源
     GH Pages 死端点（404 无害，离线行为一致）的页面
  3. 排除依赖共享资产的游戏页（game-ui.css / appearance.js / game-sfx.js /
     game-fit.js / game-juice.js 任一引用），category「小游戏」同样排除
  4. 引用 assets/vendor 本地库的页面：库文件全部存在且合计 ≤300KB 才可离线
     （库文件随离线包缓存；重 vendor 如 file-preview/to-pdf 自动出局）

用法：
    python scripts/check_offline.py            # 只报告：候选/排除/体积/现有标记核验
    python scripts/check_offline.py --apply    # 同步标记进 data/tools.json（可增可删）
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS_JSON = ROOT / 'data' / 'tools.json'
TOOLS_DIR = ROOT / 'tools'
VENDOR_DIR = ROOT / 'assets' / 'vendor'

# vendor 库体积上限（字节）：超过则视为重依赖，不进离线包
VENDOR_MAX_BYTES = 300 * 1024

# fetch 误报白名单：目录名 → 原因（见模块 docstring 第 2 条）
FALSE_POSITIVE = {
    'curl-converter': 'fetch 仅出现在生成代码字符串里，页面自身零请求',
    'markdown-to-html': 'fetch 指向同源 GH Pages 死端点（/api/clicks 404），离线行为一致',
}

# 资源加载型标签的外链属性（<a href> 是导航链接不算；canonical 已先剥离）
RESOURCE_TAG_RE = re.compile(
    r'<(?:script|link|img|iframe|source|video|audio|embed|object|track)\b[^>]*?'
    r'\b(?:src|href|poster)\s*=\s*["\'](?:https?:)?//[^"\']+["\']', re.I)
CANONICAL_RE = re.compile(r'<link[^>]+rel=["\']canonical["\'][^>]*>', re.I)

# 运行时网络调用
RUNTIME_RE = re.compile(
    r'\b(?:fetch\s*\(|XMLHttpRequest\b|import\s*\(|new\s+WebSocket\b|new\s+EventSource\b)')

# 目录外共享资产（游戏套件）：引用即按游戏页排除
SHARED_ASSETS_RE = re.compile(
    r'\.\./\.\./assets/(?:game-ui\.css|appearance\.js|game-sfx\.js|game-fit\.js|game-juice\.js)')

# assets/vendor 本地库引用（含 JS 字符串里的懒加载路径）
VENDOR_REF_RE = re.compile(r'\.\./\.\./assets/vendor/([A-Za-z0-9_\-./]+)')

# vendor 前缀动态拼接用法（var VENDOR='../../assets/vendor/' 后拼库名）：完整清单
# 静态抓不全，按「需人工确认」排除，宁可漏标不误标
VENDOR_PREFIX_RE = re.compile(r'["\'](?:\.\./)+assets/vendor/["\']')


def scan_page(page: Path) -> dict:
    """扫描单个 app.html，返回外部资源引用、运行时调用、vendor 与共享资产清单。"""
    html = page.read_text(encoding='utf-8', errors='ignore')
    html = CANONICAL_RE.sub('', html)  # canonical 指向规范页是文本约定，不是资源请求
    return {
        'external_tags': RESOURCE_TAG_RE.findall(html),
        'runtime_calls': RUNTIME_RE.findall(html),
        'vendor': sorted(set(VENDOR_REF_RE.findall(html))),
        'vendor_prefix': bool(VENDOR_PREFIX_RE.search(html)),
        'shared_assets': bool(SHARED_ASSETS_RE.search(html)),
    }


def vendor_status(rel_paths: list) -> tuple:
    """核对 vendor 文件存在性与总体积，返回 (缺失清单, 总字节)。"""
    missing, total = [], 0
    for rel in rel_paths:
        f = VENDOR_DIR / rel
        if not f.is_file():
            missing.append(rel)
        else:
            total += f.stat().st_size
    return missing, total


def classify(name: str, entry: dict, page: Path) -> dict:
    """返回 {ok: bool, reason: str, vendor_paths: list}；ok=True 表示可离线。"""
    info = scan_page(page)
    if info['external_tags']:
        return {'ok': False, 'reason': f'外部资源引用（{info["external_tags"][0][:60]}）'}
    calls = [c.strip() for c in info['runtime_calls']]
    if calls and name not in FALSE_POSITIVE:
        return {'ok': False, 'reason': f'运行时外部请求（{calls[0]}）'}
    if info['shared_assets'] or entry.get('category') == '小游戏':
        return {'ok': False, 'reason': '依赖游戏共享资产/属小游戏'}
    if info['vendor_prefix']:
        return {'ok': False, 'reason': 'vendor 路径动态拼接，库清单需人工确认'}
    if info['vendor']:
        missing, total = vendor_status(info['vendor'])
        if missing:
            return {'ok': False, 'reason': f'vendor 缺失：{", ".join(missing)}'}
        if total > VENDOR_MAX_BYTES:
            return {'ok': False, 'reason': f'vendor 过重（{total // 1024} KB > 300 KB）'}
        return {'ok': True, 'reason': f'含本地 vendor 小库（{total // 1024} KB，随包缓存）',
                'vendor_paths': info['vendor']}
    return {'ok': True, 'reason': '零外部引用，完全自包含', 'vendor_paths': []}


def fmt_bytes(n: int) -> str:
    return f'{n / 1024 / 1024:.2f} MB' if n >= 1024 * 1024 else f'{n // 1024} KB'


def main() -> None:
    parser = argparse.ArgumentParser(description='工具离线标记扫描/同步')
    parser.add_argument('--apply', action='store_true', help='把判定结果同步进 data/tools.json')
    args = parser.parse_args()

    data = json.loads(TOOLS_JSON.read_text(encoding='utf-8'))
    ok_pages, vendor_pages, vendor_bytes = [], [], 0
    excluded = []            # (name, reason)
    flagged_bad = []         # 现有 offline:true 但不合格
    flagged_ok_count = 0

    for entry in data['tools']:
        name = entry['path'].split('/')[0]
        page = TOOLS_DIR / name / 'app.html'
        if not page.is_file():
            excluded.append((name, 'app.html 不存在'))
            continue
        verdict = classify(name, entry, page)
        marked = entry.get('offline') is True
        if verdict['ok']:
            ok_pages.append(name)
            if verdict.get('vendor_paths'):
                vendor_pages.append(name)
                _, total = vendor_status(verdict['vendor_paths'])
                vendor_bytes += total
            if marked:
                flagged_ok_count += 1
        else:
            excluded.append((name, verdict['reason']))
            if marked:
                flagged_bad.append((name, verdict['reason']))

    # 纯自包含页体积（可离线页 app.html 本体）
    pages_bytes = sum((TOOLS_DIR / n / 'app.html').stat().st_size for n in ok_pages)
    total = pages_bytes + vendor_bytes

    print(f'扫描 {len(data["tools"])} 个工具页：可离线 {len(ok_pages)} 页'
          f'（纯自包含 {len(ok_pages) - len(vendor_pages)} + 含 vendor 小库 {len(vendor_pages)}）')
    if vendor_pages:
        print('  含 vendor 小库：' + '、'.join(vendor_pages))
    by_kind = {}
    for name, reason in excluded:
        key = re.split('[（：]', reason)[0]
        by_kind.setdefault(key, []).append(name)
    for key, names in sorted(by_kind.items(), key=lambda kv: -len(kv[1])):
        show = '、'.join(names[:8]) + ('…' if len(names) > 8 else '')
        print(f'  排除 {len(names)} 页 · {key}：{show}')
    print(f'离线包体积合计：{fmt_bytes(total)}（页面 {fmt_bytes(pages_bytes)} + vendor {fmt_bytes(vendor_bytes)}）')

    print(f'标记核验：现有 offline:true {flagged_ok_count + len(flagged_bad)} 条，'
          f'合格 {flagged_ok_count}，不合格 {len(flagged_bad)}')
    for name, reason in flagged_bad:
        print(f'  [x] {name}: {reason}')

    if args.apply:
        changed = []
        for entry in data['tools']:
            name = entry['path'].split('/')[0]
            qualifies = name in ok_pages
            marked = entry.get('offline') is True
            if qualifies and not marked:
                entry['offline'] = True
                changed.append(f'+ {name}')
            elif not qualifies and marked:
                entry.pop('offline', None)
                changed.append(f'- {name}')
        if changed:
            text = json.dumps(data, ensure_ascii=False, indent=2).replace('\n', '\r\n') + '\r\n'
            TOOLS_JSON.write_bytes(text.encode('utf-8'))
            print(f'--apply 完成：增 {sum(c.startswith("+") for c in changed)} / 删 '
                  f'{sum(c.startswith("-") for c in changed)} 条标记')
            for c in changed:
                print(f'  {c}')
        else:
            print('--apply：标记已与判定一致，无需改动')
        sys.exit(0)

    print('（--apply 可把上述判定同步进 data/tools.json）')


if __name__ == '__main__':
    main()
