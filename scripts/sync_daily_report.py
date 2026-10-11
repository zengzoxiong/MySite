#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""每日同步「数据看板 · 每日日报」数据到 data/daily-report.json。

五个板块：
  trending  GitHub Trending 每日精选——官方 Search API 替代（无官方 trending 接口）：
            近 7 天新建仓库按 stars 倒序取前 10，「全网新出的热门项目」。
            带仓库 GITHUB_TOKEN 把搜索限额提到 30 次/分，远超所需。
  hn        Hacker News 首页前十：官方 Firebase API 免鉴权，topstories 后逐条拉 item。
  hf_models Hugging Face 每日热门模型前 10：官方公开 API 按 trendingScore 排序，免鉴权。
  weibo     微博实时热搜前 10：网页版官方接口（ajax/side/hotSearch）免登录，
            过滤广告位；海外 runner 可访问（weibo-trending-hot-search 同款做法）。
  onthisday 历史上的今天：中文维基百科官方 Feed API，按北京时间月/日取 6 条
            （年份从近到远，只收挂了词条链接的事件）。
            接口默认吐繁体源文，须带 Accept-Language: zh-cn 让字词转换服务输出简体。

板块各自尽力而为：一个板块失败不影响另一个；数据为空的板块当天省略。
结果与上次字节一致时不写文件，工作流据此跳过提交。

用法：python scripts/sync_daily_report.py [输出json]
"""
import json
import os
import re
import sys
import time
import urllib.parse
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


def hf_models():
    """Hugging Face 每日热门模型前 10：模型 id / 任务类型 / 下载量 / 点赞。"""
    d = fetch_json('https://huggingface.co/api/models?sort=trendingScore&limit=10')
    out = []
    for m in d[:10]:
        mid = (m.get('id') or '').strip()
        if not mid:
            continue
        out.append({
            'id': mid,
            'url': f'https://huggingface.co/{mid}',
            'task': m.get('pipeline_tag') or '',
            'downloads': m.get('downloads') or 0,
            'likes': m.get('likes') or 0,
        })
    return out


def weibo_hot():
    """微博实时热搜前 10：词条 / 热度值 / 标签（爆/热/新/沸）；is_ad 广告位剔除。"""
    d = fetch_json('https://weibo.com/ajax/side/hotSearch', headers={
        # 微博对陌生 UA 不直接给数据，按浏览器身份请求
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://weibo.com/',
    })
    out = []
    for r in (d.get('data') or {}).get('realtime') or []:
        word = (r.get('word') or '').strip()
        if not word or r.get('is_ad'):
            continue
        out.append({
            'word': word,
            'num': r.get('num') or 0,
            'label': r.get('label_name') or '',
            'url': 'https://s.weibo.com/weibo?q=' + urllib.parse.quote(f'#{word}#'),
        })
        if len(out) >= 10:
            break
    return out


def onthisday():
    """历史上的今天（中文维基官方 Feed，北京时间月/日）：年份 / 事件 / 词条链接，取 6 条。"""
    now = datetime.now(timezone(timedelta(hours=8)))
    d = fetch_json(f'https://api.wikimedia.org/feed/v1/wikipedia/zh/onthisday/events/{now.month:02d}/{now.day:02d}',
                   headers={'Accept-Language': 'zh-cn'})
    out = []
    for ev in sorted(d.get('events') or [], key=lambda e: e.get('year') or 0, reverse=True):
        # 词条页优先取有实义的（跳过「2021年」这类年份页），都没有就退回第一个
        pages = ev.get('pages') or []
        page = next((p for p in pages
                     if re.match(r'https://zh\.wikipedia\.org/wiki/.+', (p.get('content_urls') or {}).get('desktop', {}).get('page') or '')
                     and not re.fullmatch(r'\d{3,4}年', p.get('normalizedtitle') or p.get('title') or '')), None) \
            or next((p for p in pages if (p.get('content_urls') or {}).get('desktop', {}).get('page')), None)
        text = (ev.get('text') or '').strip()
        if not text or not page:
            continue
        out.append({
            'year': ev.get('year'),
            'text': text[:140],
            'title': page.get('normalizedtitle') or page.get('title') or '',
            'url': page['content_urls']['desktop']['page'],
        })
        if len(out) >= 6:
            break
    return out


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else OUT
    sections = {}
    for key, fn in [('trending', trending), ('hn', hn_top), ('hf_models', hf_models),
                    ('weibo', weibo_hot), ('onthisday', onthisday)]:
        try:
            sections[key] = fn()
            print(f'{key}: {len(sections[key])} 条')
        except Exception as e:
            print(f'{key} 拉取失败，本板块省略: {e}')
    if not any(sections.values()):
        raise SystemExit('全部板块拉取失败，放弃本次更新')

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
