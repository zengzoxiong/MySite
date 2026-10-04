#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""每日同步「数据看板 · 每日日报」数据到 data/daily-report.json。

两个板块：
  trending  GitHub Trending 每日精选——官方 Search API 替代（无官方 trending 接口）：
            近 7 天新建仓库按 stars 倒序取前 10，「全网新出的热门项目」。
            带仓库 GITHUB_TOKEN 把搜索限额提到 30 次/分，远超所需。
  hn        Hacker News 首页前十：官方 Firebase API 免鉴权，topstories 后逐条拉 item。

板块各自尽力而为：一个板块失败不影响另一个；数据为空的板块当天省略。
结果与上次字节一致时不写文件，工作流据此跳过提交。

用法：python scripts/sync_daily_report.py [输出json]
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

UA = 'mysite-daily-report/1.0 (https://github.com/zengzoxiong/MySite)'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'daily-report.json')
HN_API = 'https://hacker-news.firebaseio.com/v0'
NOW = datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d')


def fetch_json(url, headers=None):
    req = urllib.request.Request(url, headers={'User-Agent': UA, **(headers or {})})
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'ignore'))


def trending():
    """近 7 天新建仓库热度榜（GitHub Search API，token 可选但强建议）。"""
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime('%Y-%m-%d')
    headers = {'Accept': 'application/vnd.github+json'}
    if os.environ.get('GITHUB_TOKEN'):
        headers['Authorization'] = 'Bearer ' + os.environ['GITHUB_TOKEN']
    url = ('https://api.github.com/search/repositories'
           f'?q=created:>{week_ago}+stars:>20&sort=stars&order=desc&per_page=10')
    d = fetch_json(url, headers)
    out = []
    for r in (d.get('items') or [])[:10]:
        out.append({
            'name': r['full_name'],
            'url': r['html_url'],
            'desc': (r.get('description') or '')[:160],
            'stars': r['stargazers_count'],
            'language': r.get('language') or '',
        })
    return out


def hn_top():
    """Hacker News 首页前十：标题 / 链接 / 分数 / 评论数。"""
    ids = fetch_json(f'{HN_API}/topstories.json')[:10]
    out = []
    for hid in ids:
        for attempt in (1, 2):
            try:
                it = fetch_json(f'{HN_API}/item/{hid}.json')
                break
            except Exception:
                if attempt == 2:
                    it = None
                time.sleep(2 * attempt)
        if not it or it.get('type') != 'story':
            continue
        out.append({
            'id': hid,
            'title': it.get('title') or '',
            'url': it.get('url') or f'https://news.ycombinator.com/item?id={hid}',
            'hn': f'https://news.ycombinator.com/item?id={hid}',
            'score': it.get('score') or 0,
            'comments': it.get('descendants') or 0,
        })
    return out


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else OUT
    sections = {}
    for key, fn in [('trending', trending), ('hn', hn_top)]:
        try:
            sections[key] = fn()
            print(f'{key}: {len(sections[key])} 条')
        except Exception as e:
            print(f'{key} 拉取失败，本板块省略: {e}')
    if not any(sections.values()):
        raise SystemExit('两个板块全部拉取失败，放弃本次更新')

    result = {
        'note': '数据看板「每日日报」数据，由 GitHub Actions 每日同步；勿手改。',
        'updated': NOW,
        'sections': sections,
    }
    payload = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if os.path.exists(out_path):
        with open(out_path, encoding='utf-8') as f:
            if f.read() == payload:
                print('日报内容无变化，文件保持不变')
                return
    tmp = out_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(payload)
    os.replace(tmp, out_path)
    print(f'已写入 {out_path}')


if __name__ == '__main__':
    main()
