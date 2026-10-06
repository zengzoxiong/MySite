#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""每日同步 GoatCounter 访问统计到 data/goatcounter-stats.json。

数据源：GoatCounter 官方 API v0（免费层可用）。需要仓库 secret `GOATCOUNTER_TOKEN`
（后台 Settings → API → Generate new token），站点码 `GOATCOUNTER_SITE`
（如 zengzoxiong，对应 https://{site}.goatcounter.com——已实测该子域即 API base）。

端点 /api/v0/stats/total 返回「按日访客数（visitors）」：GoatCounter 是隐私优先的
UV 统计器，没有 PV 概念，全部口径为访客（UV）。累计口径从 `GOATCOUNTER_START`
（站点注册日）起算；stat 区间单次有限制，按 90 天分段拉取再按日合并。产出：
  { updated, site, total_visitors, days: [{date, visitors}, ...] }
结果与上次字节一致时不写文件，工作流据此跳过提交。
"""
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'goatcounter-stats.json')
NOW = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).strftime('%Y-%m-%d')
TODAY = dt.date.today()  # UTC；GoatCounter 按站点时区记账，差半天对趋势无影响


def _err_text(body):
    """GoatCounter 的 HTTP 错误是 HTML 错误页，提取其中的可读原因"""
    m = re.search(r'<h1[^>]*>(.*?)</h1>\s*(?:<p[^>]*>(.*?)</p>)?', body, re.S)
    if m:
        strip = lambda s: re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', s or '')).strip()
        return f'{strip(m.group(1))}: {strip(m.group(2))}'
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', body)).strip()[:120]


def fetch_json(url, token):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'mysite-sync/1.0',
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
    })
    last_err = None
    for attempt in range(3):  # runner 偶发 DNS 解析失败，重试跨过抖动
        try:
            return json.loads(urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'ignore'))
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'ignore')
            last_err = RuntimeError(f'HTTP {e.code} {_err_text(body)}')
            print(f'请求失败（第 {attempt + 1} 次）：{last_err}，稍后重试')
            time.sleep(10)
        except urllib.error.URLError as e:
            last_err = e
            print(f'请求失败（第 {attempt + 1} 次）：{e}，稍后重试')
            time.sleep(10)
    raise last_err


def main():
    token = os.environ.get('GOATCOUNTER_TOKEN')
    if not token:
        raise SystemExit('缺少 GOATCOUNTER_TOKEN（GoatCounter 后台 Settings→API→Generate new token，'
                         '配置为仓库 secret）。')
    base = os.environ.get('GOATCOUNTER_SITE', 'zengzoxiong')
    start = dt.date.fromisoformat(os.environ.get('GOATCOUNTER_START', '2026-10-06'))

    out_path = sys.argv[1] if len(sys.argv) > 1 else OUT
    days = {}
    cur = start
    for _ in range(60):  # 90 天一段，最多 60 段 ≈ 15 年，足够
        if cur > TODAY:
            break
        end = min(cur + dt.timedelta(days=89), TODAY)
        url = (f'https://{base}.goatcounter.com/api/v0/stats/total'
               f'?start={cur.isoformat()}T00:00&end={end.isoformat()}T23:00')
        rows = fetch_json(url, token).get('stats') or []
        for row in rows:
            day = (row.get('day') or '')[:10]
            if day:
                days[day] = row.get('daily') or 0
        if end >= TODAY:
            break
        cur = end + dt.timedelta(days=1)
        time.sleep(1)  # API 限速保护

    if not days:
        raise SystemExit('未拉到任何统计数据，疑似 token/站点码有误')

    ordered = [{'date': k, 'visitors': v} for k, v in sorted(days.items())]
    result = {
        'note': '数据看板「访问统计」，由 GitHub Actions 每日从 GoatCounter API 同步；勿手改。',
        'updated': NOW,
        'site': base + '.goatcounter.com',
        'total_visitors': sum(days.values()),
        'days': ordered,
    }
    payload = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if os.path.exists(out_path):
        with open(out_path, encoding='utf-8') as f:
            if f.read() == payload:
                print('访问统计无变化，文件保持不变')
                return
    tmp = out_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(payload)
    os.replace(tmp, out_path)
    print(f'已写入 {out_path}：累计访客 {result["total_visitors"]}（{len(ordered)} 天）')


if __name__ == '__main__':
    main()
