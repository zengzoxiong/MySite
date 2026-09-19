# -*- coding: utf-8 -*-
"""每日同步站主的 GitHub Stars 到 data/stars.json（供网站收藏展示）。"""
import json
import os
import sys
import urllib.request

USER = 'zengzoxiong'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fetch_page(page):
    req = urllib.request.Request(
        f'https://api.github.com/users/{USER}/starred?per_page=100&page={page}',
        headers={
            'User-Agent': 'mysite-sync',
            'Accept': 'application/vnd.github.star+json',  # 返回带 starred_at
        })
    return json.load(urllib.request.urlopen(req, timeout=30))


def main():
    items = []
    for page in range(1, 6):  # 上限 500 个星标，足够个人使用
        batch = fetch_page(page)
        for row in batch:
            repo = row['repo']
            items.append({
                'name': repo['name'],
                'full_name': repo['full_name'],
                'url': repo['html_url'],
                'desc': (repo.get('description') or '')[:160],
                'language': repo.get('language') or '',
                'stars': repo['stargazers_count'],
                'starred_at': row['starred_at'][:10],
            })
        if len(batch) < 100:
            break
    items.sort(key=lambda x: x['starred_at'], reverse=True)

    path = os.path.join(ROOT, 'data', 'stars.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'updated': items[0]['starred_at'] if items else '', 'repos': items},
                  f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'stars.json：{len(items)} 个仓库')


if __name__ == '__main__':
    main()
