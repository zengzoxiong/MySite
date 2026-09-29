# -*- coding: utf-8 -*-
"""同步人民币汇率（ECB 参考价）到 data/fx.json。

数据源 https://api.frankfurter.dev（欧洲央行参考汇率镜像，每工作日约 16:00 CET 发布）。
接口返回「1 人民币 = X 外币」，原样入库；前端展示时按 per / 值 换算成「per 单位外币 = ? 人民币」。
只在新交易日数据到达时改写文件，避免定时任务产生空提交。
"""
import json
import os
import urllib.request

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYMBOLS = ['USD', 'EUR', 'JPY', 'GBP', 'HKD', 'KRW', 'SGD', 'AUD']
API = 'https://api.frankfurter.dev/v1/1999-01-01..'


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    return urllib.request.urlopen(req, timeout=60).read().decode('utf-8')


def main():
    url = f'{API}?base=CNY&symbols={",".join(SYMBOLS)}'
    raw = json.loads(fetch(url))
    rates = raw['rates']

    rows = []
    for date in sorted(rates):
        r = rates[date]
        if not all(s in r for s in SYMBOLS):
            continue
        rows.append([date] + [round(r[s], 5) for s in SYMBOLS])
    if not rows:
        raise SystemExit('未取到任何汇率数据')

    path = os.path.join(ROOT, 'data', 'fx.json')
    old = None
    if os.path.exists(path):
        old = json.load(open(path, encoding='utf-8'))
    if old and old.get('series') == rows and old.get('columns') == SYMBOLS:
        print(f'无新数据（最新 {rows[-1][0]}），跳过写入')
        return

    out = {
        'source': 'ECB',
        'sourceName': '欧洲央行参考汇率',
        'sourceUrl': 'https://api.frankfurter.dev',
        'base': 'CNY',
        'updated': rows[-1][0],
        'columns': SYMBOLS,
        'latest': dict(zip(SYMBOLS, rows[-1][1:])),
        'series': rows,
    }
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')
    print(f'完成：{len(rows)} 个交易日（{rows[0][0]} ~ {rows[-1][0]}），'
          f'{len(SYMBOLS)} 种货币，{os.path.getsize(path) // 1024} KB')


if __name__ == '__main__':
    main()
