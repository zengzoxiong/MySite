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


def from_contributions():
    """近一年每日贡献数：解析贡献日历片段里的 data-date / data-count"""
    today = date.today()
    frm = today - timedelta(days=370)
    url = f'https://github.com/users/{USER}/contributions?from={frm.isoformat()}&to={today.isoformat()}'
    html = fetch(url)
    days = {}
    # 两种属性顺序都兼容
    for d, c in re.findall(r'data-date="(\d{4}-\d{2}-\d{2})"[^>]*?data-count="(\d+)"', html):
        days[d] = int(c)
    for c, d in re.findall(r'data-count="(\d+)"[^>]*?data-date="(\d{4}-\d{2}-\d{2})"', html):
        days.setdefault(d, int(c))
    return days


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
