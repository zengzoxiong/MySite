#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""每日同步 GoatCounter 访问统计到 data/goatcounter-stats.json。

数据源：GoatCounter 官方 API v0（免费层可用），需要仓库 secret `GOATCOUNTER_TOKEN`
（GoatCounter 后台 Settings → API → Generate new token），站点码
`GOATCOUNTER_SITE`（如 zengzoxiong，对应 https://{site}.goatcounter.com）。

累计口径从 `GOATCOUNTER_START`（站点注册日，YYYY-MM-DD）起算；API 的 stat/range
单次区间有限制，脚本按 90 天分段拉取再按日合并。产出：
  { updated, site, total: {pv, visitors}, days: [{date, pv, visitors}, ...] }
结果与上次字节一致时不写文件，工作流据此跳过提交。
"""
import datetime as dt
import json
import os
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'goatcounter-stats.json')
NOW = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).strftime('%Y-%m-%d')
TODAY = dt.date.today()  # UTC（GoatCounter 按站点时区记账，差半天对趋势无影响）


def fetch_json(url, token):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'mysite-sync/1.0',
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
    })
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'ignore'))


def pull_range(base, token, start, end):
    """拉一段区间（GoatCounter stat/range，day 值形如 'YYYY-MM-DD 00:00:00'）"""
    url = (f'https://{base}/api/v0/stat/range'
           f'?start={start.isoformat()}&end={end.isoformat()}')
    return fetch_json(url, token)


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
        stats = pull_range(base, token, cur, end).get('stats') or []
        for row in stats:
            day = (row.get('day') or '')[:10]
            if day:
                days[day] = (row.get('pv') or 0, row.get('visitors') or 0)
        if end >= TODAY:
            break
        cur = end + dt.timedelta(days=1)
        time.sleep(1)  # API 限速保护

    if not days:
        raise SystemExit('未拉到任何统计数据，疑似 token/站点码有误')

    ordered = [{'date': k, 'pv': v[0], 'visitors': v[1]} for k, v in sorted(days.items())]
    result = {
        'note': '数据看板「访问统计」，由 GitHub Actions 每日从 GoatCounter API 同步；勿手改。',
        'updated': NOW,
        'site': base + '.goatcounter.com',
        'total': {'pv': sum(v[0] for v in days.values()),
                  'visitors': sum(v[1] for v in days.values())},
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
    print(f'已写入 {out_path}：累计 PV {result["total"]["pv"]} / UV {result["total"]["visitors"]}（{len(ordered)} 天）')


if __name__ == '__main__':
    main()
