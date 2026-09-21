# -*- coding: utf-8 -*-
"""同步歌词到 data/lyrics.json（播放器歌词用）。

从 data/playlist.json 与 data/explore.json 的 src 里提取歌曲 id，逐首调网易云
歌词接口取 LRC 原文，汇总成 { "<id>": "[00:01.20]歌词…" }。

整体重写而不是增量追加：探索榜单每日轮换，按 id 索引的单个文件被整体替换，
仓库体积不会随时间增长。取不到歌词的曲目直接跳过，前端显示「暂无歌词」。
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
OUT = os.path.join(ROOT, 'data', 'lyrics.json')
DELAY = 0.25          # 网易云匿名抓取限速保护
ID_RE = re.compile(r'id=(\d+)\.mp3')


def fetch_json(url):
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Referer': 'https://music.163.com/',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    })
    return json.loads(urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'ignore'))


def all_ids():
    ids = []
    for name in ('playlist.json', 'explore.json'):
        path = os.path.join(ROOT, 'data', name)
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            for t in (json.load(f).get('tracks') or []):
                m = ID_RE.search(t.get('src') or '')
                if m and m.group(1) not in ids:
                    ids.append(m.group(1))
    return ids


def lyric_of(sid):
    try:
        d = fetch_json(f'https://music.163.com/api/song/lyric?id={sid}&lv=1&kt=1')
    except Exception as e:
        print(f'[跳过] {sid}: {e}')
        return None
    txt = ((d.get('lrc') or {}).get('lyric') or '').strip()
    return txt or None


def main():
    ids = all_ids()
    if not ids:
        print('没有可处理的曲目')
        sys.exit(1)
    out, miss = {}, []
    for i, sid in enumerate(ids, 1):
        txt = lyric_of(sid)
        if txt:
            out[sid] = txt
        else:
            miss.append(sid)
        time.sleep(DELAY)

    if not out:
        raise SystemExit('一首歌词都没取到，放弃写入（避免把文件清空）')

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
        f.write('\n')
    size = os.path.getsize(OUT) // 1024
    print(f'已写入 lyrics.json：{len(out)}/{len(ids)} 首有歌词，缺 {len(miss)} 首，约 {size}KB')
    if miss:
        print('缺歌词 id:', ' '.join(miss[:12]) + (' …' if len(miss) > 12 else ''))
    sys.exit(0)


if __name__ == '__main__':
    main()
