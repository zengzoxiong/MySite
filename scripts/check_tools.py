#!/usr/bin/env python3
"""工具页体检：校验 tools/*/app.html 的去品牌与自引用完整性。

检查项（任一违例退出码 1，CI 红灯）：
  1. 已在 data/tools.json 登记（反向也查：登记了但文件不存在）
  2. 有 <link rel="canonical"> 且指向本站 https://zengzoxiong.github.io/MySite/tools/<目录>/
     （留着来源站 canonical 会把 SEO 权重白送出去）
  3. 引用 ../../favicon.svg
  4. 页面含「拾光集」（title/页脚去品牌后的署名）
  5. 无上游品牌残留：JustHTMLs / htmls.dev（大小写不敏感）

用法：python scripts/check_tools.py
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CANON = 'https://zengzoxiong.github.io/MySite/tools/'
BRANDS = ('justhtmls', 'htmls.dev')


def check_page(page: Path, registered: set):
    rel = f'{page.parent.name}/app.html'
    html = page.read_text(encoding='utf-8', errors='ignore')
    low = html.lower()
    out = []
    if rel not in registered:
        out.append('未在 data/tools.json 登记')
    m = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]*>', html, re.I)
    if not m:
        out.append('缺 canonical')
    elif CANON + page.parent.name not in m.group(0):
        out.append('canonical 未指向本站：' + m.group(0)[:90])
    if '../../favicon.svg' not in html:
        out.append('未引用 ../../favicon.svg')
    if '拾光集' not in html:
        out.append('缺「拾光集」署名（title/页脚）')
    for b in BRANDS:
        if b in low:
            out.append(f'上游品牌残留：{b}')
    return out


def main():
    tools = json.loads((ROOT / 'data' / 'tools.json').read_text(encoding='utf-8'))['tools']
    registered = {t['path'] for t in tools}
    pages = sorted((ROOT / 'tools').glob('*/app.html'))

    violations = []
    for page in pages:
        for msg in check_page(page, registered):
            violations.append((f'{page.parent.name}/app.html', msg))
    on_disk = {f'{p.parent.name}/app.html' for p in pages}
    for rel in sorted(registered - on_disk):
        violations.append((rel, 'tools.json 已登记但文件不存在'))

    print(f'体检 {len(pages)} 个工具页，违例 {len(violations)} 处')
    for rel, msg in violations:
        print(f'  [x] {rel}: {msg}')
    if violations:
        write_summary(violations, len(pages))
        sys.exit(1)
    print('全部通过：canonical/favicon/署名/去品牌/登记 五项均 OK')


def write_summary(violations, page_count):
    path = os.environ.get('GITHUB_STEP_SUMMARY')
    if not path:
        return
    with open(path, 'a', encoding='utf-8') as f:
        f.write(f'## 工具页体检：{len(violations)} 处违例 / {page_count} 页\n\n')
        for rel, msg in violations:
            f.write(f'- `{rel}`：{msg}\n')


if __name__ == '__main__':
    main()
