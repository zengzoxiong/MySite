#!/usr/bin/env python3
"""工具页体检：校验 tools/ 页面的去品牌与自引用完整性。

检查项（任一违例退出码 1，CI 红灯）：
  1. app.html 已在 data/tools.json 登记（反向也查：登记了但文件不存在）；
     index.html 若存在同样体检（它是目录默认页，规范 URL 统一指向 app.html）
  2. 有 <link rel="canonical"> 且指向规范页 https://zengzoxiong.github.io/MySite/tools/<目录>/app.html
     （留着来源站 canonical 会把 SEO 权重白送出去；index/app 双页并存时
     canonical 必须统一收敛到 app.html，规范 URL 唯一才不分散权重）
  3. 引用 ../../favicon.svg
  4. 页面含「拾光集」（title/页脚去品牌后的署名）
  5. 无上游品牌残留：JustHTMLs / htmls.dev（大小写不敏感）
  6. tools.json 每个 category 都登记在顶层 categories 清单里（前端按条目
     动态归纳分类所以显示不受影响，但清单与实际不一致属于数据缺陷）

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


def check_page(page: Path, registered: set, canonical_expected: str):
    rel = f'{page.parent.name}/{page.name}'
    html = page.read_text(encoding='utf-8', errors='ignore')
    low = html.lower()
    out = []
    if page.name == 'app.html' and rel not in registered:
        out.append('未在 data/tools.json 登记')
    m = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]*>', html, re.I)
    if not m:
        out.append('缺 canonical')
    elif canonical_expected not in m.group(0):
        out.append(f'canonical 应指向规范页 {canonical_expected}：' + m.group(0)[:90])
    if '../../favicon.svg' not in html:
        out.append('未引用 ../../favicon.svg')
    if '拾光集' not in html:
        out.append('缺「拾光集」署名（title/页脚）')
    for b in BRANDS:
        if b in low:
            out.append(f'上游品牌残留：{b}')
    return out


def main():
    data = json.loads((ROOT / 'data' / 'tools.json').read_text(encoding='utf-8'))
    tools = data['tools']
    categories = set(data.get('categories') or [])
    registered = {t['path'] for t in tools}
    pages = sorted((ROOT / 'tools').glob('*/app.html'))
    index_pages = sorted((ROOT / 'tools').glob('*/index.html'))

    violations = []
    for t in tools:
        if t.get('category') and categories and t['category'] not in categories:
            violations.append((t['path'], f"分类「{t['category']}」未登记进 tools.json 的 categories"))
    for page in pages:
        expected = f'{CANON}{page.parent.name}/app.html'
        for msg in check_page(page, registered, expected):
            violations.append((f'{page.parent.name}/app.html', msg))
    for page in index_pages:
        # 目录默认页的 canonical 也收敛到 app.html，避免同内容双规范页分散 SEO 权重
        expected = f'{CANON}{page.parent.name}/app.html'
        for msg in check_page(page, registered, expected):
            violations.append((f'{page.parent.name}/index.html', msg))
    on_disk = {f'{p.parent.name}/app.html' for p in pages}
    for rel in sorted(registered - on_disk):
        violations.append((rel, 'tools.json 已登记但文件不存在'))

    print(f'体检 {len(pages)} 个工具页 + {len(index_pages)} 个目录默认页，违例 {len(violations)} 处')
    for rel, msg in violations:
        print(f'  [x] {rel}: {msg}')
    if violations:
        write_summary(violations, len(pages) + len(index_pages))
        sys.exit(1)
    print('全部通过：canonical/favicon/署名/去品牌/登记/分类 六项均 OK')


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
