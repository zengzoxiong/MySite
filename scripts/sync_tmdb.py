# -*- coding: utf-8 -*-
"""定时同步 media.json 中 TMDB 条目的评分与上映时间。

仅更新 url 指向 themoviedb.org 的条目；解析详情页 JSON-LD，
评分取 aggregateRating.ratingValue，剧集取 startDate、电影取 releases 最早日期。
"""
import json
import os
import re
import sys
import time
import urllib.request

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DELAY = 2.5  # TMDB 匿名抓取限速保护


def fetch(url, binary=False, timeout=25):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9'})
    data = urllib.request.urlopen(req, timeout=timeout).read()
    return data if binary else data.decode('utf-8', 'ignore')


def parse_ld(html):
    # type 属性未必是首个/唯一属性，放宽到任意属性顺序
    m = re.search(r'<script[^>]+ld\+json[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return None
    txt = m.group(1)
    txt = txt[txt.find('{'):txt.rfind('}') + 1]
    return json.loads(txt)


def write_json(path, obj, indent=2):
    """先写临时文件再原子替换：进程中途被杀不会留下半个 JSON 让下次运行崩溃"""
    tmp = str(path) + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent)
        f.write('\n')
    os.replace(tmp, path)


def movie_release(mtype, tid):
    html = fetch(f'https://www.themoviedb.org/{mtype}/{tid}/releases')
    dates = sorted(set(re.findall(r'(\d{4}-\d{2}-\d{2})', html)))
    return dates[0] if dates else None


def sync_entry(entry):
    url = entry.get('url') or ''
    m = re.match(r'https://www\.themoviedb\.org/(movie|tv)/(\d+)', url)
    if not m:
        return False
    mtype, tid = m.groups()
    html = fetch(url)
    ld = parse_ld(html)
    changed = False

    rating = (ld.get('aggregateRating') or {}).get('ratingValue')
    if rating is not None:
        rating = round(float(rating), 1)
        if entry.get('rating') != rating:
            entry['rating'] = rating
            changed = True

    if mtype == 'tv':
        sd = ld.get('startDate')
        # 年/年月精度（"2016"/"2023-10"）不入库，保留旧值，避免文件里日期格式参差
        release = sd[:10] if sd and len(sd) >= 10 else None
    else:
        time.sleep(DELAY)
        release = movie_release(mtype, tid)
    if release and entry.get('release') != release:
        entry['release'] = release
        changed = True

    return changed


def main():
    path = os.path.join(ROOT, 'data', 'media.json')
    data = json.load(open(path, encoding='utf-8'))
    changed = 0
    total = 0
    fails = 0
    for entry in data['items']:
        total += 1
        try:
            if sync_entry(entry):
                changed += 1
                print(f"[更新] {entry['title']} 评分={entry.get('rating')} 上映={entry.get('release')}")
        except Exception as e:
            fails += 1
            print(f"[跳过] {entry.get('title')}: {e}")
        time.sleep(DELAY)

    # 大面积解析失败说明 TMDB 页面结构变了，宁可红灯也不能静默“无更新”
    if total and fails * 10 >= total * 3:
        print(f'解析失败率过高（{fails}/{total}），TMDB 页面结构可能已变化')
        sys.exit(1)

    if changed:
        write_json(path, data)
    print(f'完成：{total} 条中更新 {changed} 条')
    sys.exit(0)


if __name__ == '__main__':
    main()
