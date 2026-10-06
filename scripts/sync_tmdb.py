#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""定时同步 media.json 中 TMDB 条目的评分与上映时间（官方 API v3）。

TMDB 网页 2026-10 起对匿名抓取全面 403（Cloudflare），网页抓取路径作废，
改走官方 API：需要仓库 secret / 环境变量 `TMDB_API_KEY`（TMDB 设置→API→
API Key (v3)，免费申请）。口径：
- 电影 /3/movie/{id}：vote_average + release_dates 全区最早日期（保持旧
  「releases 页所有日期取最早」的口径，append_to_response 一次请求带全）
- 剧集 /3/tv/{id}：vote_average + first_air_date
- 分季 /3/tv/{id}/season/{n}：vote_average + air_date——网页拿不到的分季
  评分，API 全有；此前分季条目手填的 AniList 分数会在同步后归位 TMDB 口径
url 非 themoviedb.org 的条目（豆瓣/AniList）跳过；大面积失败仍退出 1 红灯，
不写入保留旧数据。API 限速宽松（约 50 req/s），条目间防抖 0.35s 即可。
"""
import json
import os
import re
import sys
import time
import urllib.request

API = 'https://api.themoviedb.org/3'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DELAY = 0.35


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'mysite-sync/1.0', 'Accept': 'application/json'})
    return json.loads(urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'ignore'))


def parse_url(url):
    """themoviedb URL → (kind, id, season)；kind: movie/tv/season，其他返回 None"""
    m = re.match(r'https://www\.themoviedb\.org/movie/(\d+)', url)
    if m:
        return 'movie', m.group(1), None
    m = re.match(r'https://www\.themoviedb\.org/tv/(\d+)/season/(\d+)', url)
    if m:
        return 'season', m.group(1), m.group(2)
    m = re.match(r'https://www\.themoviedb\.org/tv/(\d+)', url)
    if m:
        return 'tv', m.group(1), None
    return None


def tmdb_get(path, key):
    sep = '&' if '?' in path else '?'
    return fetch_json(f'{API}/{path}{sep}api_key={key}&language=zh-CN')


def earliest_release_date(movie):
    """release_dates 全区全类型取最早日期，与旧「releases 页最早日期」口径一致"""
    dates = []
    for country in ((movie.get('release_dates') or {}).get('results') or []):
        for r in country.get('release_dates') or []:
            d = r.get('release_date') or ''
            if len(d) >= 10:
                dates.append(d[:10])
    return min(dates) if dates else None


def sync_entry(entry, key):
    url = entry.get('url') or ''
    parsed = parse_url(url)
    if not parsed:
        return False
    kind, tid, season = parsed
    if kind == 'movie':
        movie = tmdb_get(f'movie/{tid}?append_to_response=release_dates', key)
        rating = movie.get('vote_average')
        release = earliest_release_date(movie)
    elif kind == 'season':
        s = tmdb_get(f'tv/{tid}/season/{season}', key)
        rating = s.get('vote_average')
        release = s.get('air_date')
    else:
        tv = tmdb_get(f'tv/{tid}', key)
        rating = tv.get('vote_average')
        release = tv.get('first_air_date')

    changed = False
    if rating:  # vote_average 为 0（无投票）视为无评分，不更新
        rating = round(float(rating), 1)
        if entry.get('rating') != rating:
            entry['rating'] = rating
            changed = True
    if release and len(release) >= 10 and entry.get('release') != release:
        entry['release'] = release[:10]
        changed = True
    return changed


def write_json(path, obj, indent=2):
    """先写临时文件再原子替换：进程中途被杀不会留下半个 JSON 让下次运行崩溃"""
    tmp = str(path) + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent)
        f.write('\n')
    os.replace(tmp, path)


def main():
    key = os.environ.get('TMDB_API_KEY')
    if not key:
        raise SystemExit('缺少 TMDB_API_KEY：TMDB 网页已 403，改用官方 API。'
                         '请申请免费 key（themoviedb.org 设置→API→API Key (v3)）'
                         '并配置为仓库 secret TMDB_API_KEY。')
    path = os.path.join(ROOT, 'data', 'media.json')
    data = json.load(open(path, encoding='utf-8'))
    old_payload = open(path, encoding='utf-8').read()

    changed = total = fails = 0
    for entry in data['items']:
        total += 1
        try:
            if sync_entry(entry, key):
                changed += 1
                print(f"[更新] {entry['title']} 评分={entry.get('rating')} 上映={entry.get('release')}")
        except Exception as e:
            fails += 1
            print(f"[跳过] {entry.get('title')}: {e}")
        time.sleep(DELAY)

    # 大面积失败说明 key 失效或接口变更，宁可红灯也不能带着旧口径静默无更新
    if total and fails * 10 >= total * 3:
        raise SystemExit(f'大面积失败（{fails}/{total}），疑似 key 失效或接口变更，放弃写入')

    payload = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    if payload == old_payload:
        print(f'评分无变化（{total} 条，更新 {changed}），文件保持不变')
        return
    write_json(path, data)
    print(f'已写入 {len(data["items"])} 条（更新 {changed}，跳过失败 {fails}）')


if __name__ == '__main__':
    main()
