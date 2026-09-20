# -*- coding: utf-8 -*-
"""每日同步「探索模式」歌单到 data/explore.json。

数据源：网易云音乐「云音乐飙升榜」（每日更新），取前若干首可播曲目。
播放直链用 song/media/outer/url?id=<id>.mp3，由浏览器播放时实时 302 解析，
所以本文件不需要保存有时效的 CDN 地址。榜单里若混有 VIP/版权锁定曲目，
前端会在播放失败时自动跳过（见 script.js 的 mp.fails 逻辑）。
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOARD_ID = '3779629'          # 云音乐飙升榜
BOARD_NAME = '云音乐飙升榜'
LIMIT = 50
OUT = os.path.join(ROOT, 'data', 'explore.json')


def fetch_json(url, data=None):
    req = urllib.request.Request(url, data=data, headers={
        'User-Agent': UA,
        'Referer': 'https://music.163.com/',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    })
    if data:
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'ignore'))


def board_ids():
    d = fetch_json(f'https://music.163.com/api/v3/playlist/detail?id={BOARD_ID}&n={LIMIT}&s=0')
    pl = d.get('playlist') or {}
    ids = [t['id'] for t in (pl.get('trackIds') or [])][:LIMIT]
    if not ids:  # 少数情况直接返回 tracks
        ids = [t['id'] for t in (pl.get('tracks') or [])][:LIMIT]
    return ids


def details(ids):
    """补专辑封面与时长（榜单接口里 album.picUrl 常为空）。"""
    d = fetch_json('https://music.163.com/api/song/detail/?ids='
                   + urllib.parse.quote(json.dumps(ids, separators=(',', ':'))))
    return {s['id']: s for s in (d.get('songs') or [])}


def build():
    ids = board_ids()
    if not ids:
        raise RuntimeError('榜单为空，放弃本次更新')
    info = details(ids)
    tracks = []
    for i in ids:
        s = info.get(i)
        if not s:
            continue
        pic = (s.get('album') or {}).get('picUrl') or ''
        tracks.append({
            'title': s.get('name') or '',
            'artist': ' / '.join(a['name'] for a in (s.get('artists') or [])),
            'src': f'https://music.163.com/song/media/outer/url?id={i}.mp3',
            'cover': (pic + '?param=400y400') if pic else '',
            'dur': round((s.get('duration') or 0) / 1000),
        })
    if not tracks:
        raise RuntimeError('没有解析到任何曲目')
    today = datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d')
    return {
        'note': '首页播放器「探索模式」歌单，由 GitHub Actions 每日从网易云飙升榜同步；勿手改。',
        'source': {'provider': '网易云音乐', 'board': BOARD_NAME, 'date': today, 'count': len(tracks)},
        'tracks': tracks,
    }


def main():
    data = build()
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'已更新 explore.json：{len(data["tracks"])} 首（{data["source"]["date"]}）')
    sys.exit(0)


if __name__ == '__main__':
    main()
