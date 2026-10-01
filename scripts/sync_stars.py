# -*- coding: utf-8 -*-
"""每日同步站主的 GitHub Stars 到 data/stars.json（供网站收藏展示）。"""
import json
import os
import sys
import urllib.request

USER = 'zengzoxiong'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fetch_page(page):
    headers = {
        'User-Agent': 'mysite-sync',
        'Accept': 'application/vnd.github.star+json',  # 返回带 starred_at
    }
    # Actions 共享出口 IP 的匿名限额（60 次/时）常被打爆，有 token 就带上
    token = os.environ.get('GH_TOKEN')
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(
        f'https://api.github.com/users/{USER}/starred?per_page=100&page={page}',
        headers=headers)
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
    write_json(path, {'updated': items[0]['starred_at'] if items else '', 'repos': items})
    print(f'stars.json：{len(items)} 个仓库')


def write_json(path, obj, indent=2):
    """先写临时文件再原子替换：进程中途被杀不会留下半个 JSON 让下次运行崩溃"""
    tmp = str(path) + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent)
        f.write('\n')
    os.replace(tmp, path)


if __name__ == '__main__':
    main()
