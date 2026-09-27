#!/usr/bin/env python3
"""同步 GitHub 贡献热力图数据到 data/gh-activity.json。

主源（配置 GH_TOKEN 时）：GraphQL contributionsCollection——本人 PAT 视角
自动包含私有仓库贡献；其次：github.com/users/<user>/contributions 的 HTML
片段（rect 带 data-date，计数在配对 tool-tip 文本里），覆盖近一年但仅公开
贡献；都拿不到（网络/结构变化）时回退 api.github.com 公开 events（仅近 90 天）。
输出：{ "user", "source", "fetchedAt", "days": { "YYYY-MM-DD": 次数 } }，供首页右上角热力图面板渲染。

用法：GH_TOKEN=<pat> python scripts/sync_ghactivity.py   # token 只走环境变量，绝不入库
"""
import json
import os
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


def write_json(path, obj, indent=2):
    """先写临时文件再原子替换：进程中途被杀不会留下半个 JSON 让下次运行崩溃"""
    tmp = str(path) + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent)
        f.write('\n')
    os.replace(tmp, path)



def from_graphql(token):
    """近一年每日贡献数（含私有仓库）：本人 PAT 视角的 contributionsCollection
    自动计入私有贡献，无需额外参数（includePrivateContributions 已从 schema 移除）。"""
    today = date.today()
    query = '''
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
}'''
    body = json.dumps({
        'query': query,
        'variables': {
            'login': USER,
            'from': (today - timedelta(days=370)).isoformat() + 'T00:00:00Z',
            'to': today.isoformat() + 'T23:59:59Z'
        }
    }).encode()
    req = urllib.request.Request('https://api.github.com/graphql', data=body, headers={
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'User-Agent': UA['User-Agent']
    })
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.load(res)
    if data.get('errors'):
        raise RuntimeError(data['errors'][0].get('message', 'GraphQL 查询失败'))
    days = {}
    for week in data['data']['user']['contributionsCollection']['contributionCalendar']['weeks']:
        for day in week['contributionDays']:
            days[day['date'][:10]] = day['contributionCount']
    # 裁到 390 天窗口（与公开路径一致，> 前端 54 周(378 天)）
    frm = (today - timedelta(days=390)).isoformat()
    return {d: c for d, c in days.items() if frm <= d <= today.isoformat()}


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
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if token:
        try:
            days = from_graphql(token)
            if days:
                source = 'contributions-private' # 本人 PAT 视角，含私有仓库贡献
        except Exception as e:
            print('GraphQL 源失败:', e)
    if not days:
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
    write_json(OUT, out)
    print(f'贡献同步完成：source={source}，{len(days)} 天有记录，共 {sum(days.values())} 次')


if __name__ == '__main__':
    main()
