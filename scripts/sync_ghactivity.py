#!/usr/bin/env python3
"""同步 GitHub 贡献热力图数据到 data/gh-activity.json。

主源：github.com/users/<user>/contributions 的 HTML 片段（rect 带 data-date/data-count），
覆盖近一年；拿不到（网络/结构变化）时回退 api.github.com 公开 events（仅近 90 天）。
输出：{ "user", "fetchedAt", "days": { "YYYY-MM-DD": 次数 } }，供首页右上角热力图面板渲染。

用法：python scripts/sync_ghactivity.py
"""
import json
import re
import urllib.request
from datetime import date, timedelta
from pathlib import Path

USER = 'zengzoxiong'
UA = {'User-Agent': 'Mozilla/5.0 (compatible; MySite-sync/1.0)'}
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'gh-activity.json'


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode('utf-8', errors='ignore')


def parse_calendar(html):
    """从一份贡献日历 HTML 里抠出 {日期: 次数}。

    GitHub 2026 改版后 <td> 不再带 data-count，计数挪进了与 td 同 id 配对的
    <tool-tip> 文本（如「8 contributions on July 6th.」/「No contributions …」）；
    旧结构（data-date + data-count 属性）留作兜底。
    """
    days = {}
    # 新结构：td 的 id ↔ tool-tip 的 for 同名配对，数字从文本里抠
    cells = {}
    for tag in re.findall(r'<td[^>]*>', html):
        d = re.search(r'data-date="(\d{4}-\d{2}-\d{2})"', tag)
        cid = re.search(r'id="(contribution-day-component-[^"]+)"', tag)
        if d and cid:
            cells[cid.group(1)] = d.group(1)
    for cid, text in re.findall(
            r'<tool-tip[^>]*for="(contribution-day-component-[^"]+)"[^>]*>(.*?)</tool-tip>',
            html, re.S):
        d = cells.get(cid)
        if not d:
            continue
        m = re.search(r'(\d+)\s+contributions?', text)
        days[d] = int(m.group(1)) if m else 0
    if days:
        return days
    # 旧结构兜底：两种属性顺序都兼容
    for d, c in re.findall(r'data-date="(\d{4}-\d{2}-\d{2})"[^>]*?data-count="(\d+)"', html):
        days[d] = int(c)
    for c, d in re.findall(r'data-count="(\d+)"[^>]*?data-date="(\d{4}-\d{2}-\d{2})"', html):
        days.setdefault(d, int(c))
    return days


def from_contributions():
    """近一年每日贡献数。GitHub 已忽略 from/to 参数、只按自然年返回日历，
    所以今年 + 去年各抓一份合并，再裁到近 370 天窗口。"""
    today = date.today()
    days = {}
    for year in (today.year - 1, today.year):
        html = fetch(f'https://github.com/users/{USER}/contributions?from={year}-01-01&to={year}-12-31')
        days.update(parse_calendar(html))
    frm = (today - timedelta(days=390)).isoformat() # 390 天 > 前端 54 周(378 天)窗口，保证格子不缺
    return {d: c for d, c in days.items() if frm <= d <= today.isoformat()}


def from_events():
    """回退源：公开 events 按天计数（GitHub 只保留近 90 天）"""
    days = {}
    for page in range(1, 4):
        url = f'https://api.github.com/users/{USER}/events/public?per_page=100&page={page}'
        try:
            data = json.loads(fetch(url))
        except Exception:
            break
        if not isinstance(data, list) or not data:
            break
        for ev in data:
            d = (ev.get('created_at') or '')[:10]
            if d:
                days[d] = days.get(d, 0) + 1
    return days


def main():
    days = {}
    source = 'none'
    try:
        days = from_contributions()
        if days:
            source = 'contributions'
    except Exception as e:
        print('contributions 源失败:', e)
    if not days:
        try:
            days = from_events()
            if days:
                source = 'events'
        except Exception as e:
            print('events 源失败:', e)
    out = {'user': USER, 'source': source, 'fetchedAt': date.today().isoformat(), 'days': days}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'贡献同步完成：source={source}，{len(days)} 天有记录，共 {sum(days.values())} 次')


if __name__ == '__main__':
    main()
