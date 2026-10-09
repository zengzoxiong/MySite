#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导入 ZCode 平台导出的「Token 用量」CSV 到 data/token-usage.json。

CSV 列（GBK 编码，从桌面 ZCode 面板导出）：
日期,模型,渠道,请求数,输入tokens,输出tokens,推理tokens,缓存写入tokens,缓存读取tokens,总tokens,模型总耗时(秒)

换算口径（与首批导入一致，用 10-06 的既有数据反推验证过）：
- inCache（输入·缓存命中）= 缓存写入 + 缓存读取
- inFresh（输入·未命中缓存）= 输入 tokens − 缓存写入 − 缓存读取
- out = 输出 tokens（推理列目前恒为 0，并入输出）
不变式：inCache + inFresh + out == 总 tokens，违例即中止。
表尾「合计/汇总」行与全天总量为 0 的行跳过；同一天重复导入时按模型去重（后写的覆盖）。
用法：python scripts/import_token_usage.py <csv路径>
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data', 'token-usage.json')


def parse_csv(path):
    """GBK 解码 → 按行返回 (date, model_id, inCache, inFresh, out, total)"""
    with open(path, 'rb') as f:
        text = f.read().decode('gbk')
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    header = lines[0].split(',')
    col = {name: i for i, name in enumerate(header)}
    need = ['日期', '模型', '输入tokens', '输出tokens', '缓存写入tokens', '缓存读取tokens', '总tokens']
    for k in need:
        if k not in col:
            sys.exit(f'CSV 缺少列：{k}（表头：{header}）')
    rows = []
    for line in lines[1:]:
        parts = line.split(',')
        name = parts[col['模型']].strip()
        if not name or '合计' in name or '汇总' in name:
            continue
        n_in = int(parts[col['输入tokens']])
        n_out = int(parts[col['输出tokens']])
        n_cw = int(parts[col['缓存写入tokens']])
        n_cr = int(parts[col['缓存读取tokens']])
        n_total = int(parts[col['总tokens']])
        if n_total == 0:
            continue
        in_cache = n_cw + n_cr
        in_fresh = n_in - in_cache
        if in_fresh < 0:
            sys.exit(f'口径校验失败（{name}）：输入 {n_in} < 缓存命中 {in_cache}')
        if in_cache + in_fresh + n_out != n_total:
            sys.exit(f'口径校验失败（{name}）：{in_cache}+{in_fresh}+{n_out} != {n_total}')
        date = parts[col['日期']].strip().replace('/', '-')
        y, mo, da = date.split('-')
        date = f'{y}-{int(mo):02d}-{int(da):02d}'  # 2026/10/7 → 2026-10-07，与库内口径一致
        rows.append((date, name, in_cache, in_fresh, n_out, n_total))
    return rows


def main():
    if len(sys.argv) != 2:
        sys.exit('用法：python scripts/import_token_usage.py <csv路径>')
    rows = parse_csv(sys.argv[1])
    if not rows:
        sys.exit('CSV 中没有有效数据行')

    with open(DATA, encoding='utf-8') as f:
        doc = json.load(f)
    days = doc['days']
    by_date = {d['date']: d for d in days}

    changed = []
    for date, model, in_cache, in_fresh, out, total in rows:
        day = by_date.get(date)
        if day is None:
            day = {'date': date, 'models': []}
            by_date[date] = day
            days.append(day)
        models = {m['id']: m for m in day['models']}
        models[model] = {'id': model, 'inCache': in_cache, 'inFresh': in_fresh, 'out': out, 'total': total}
        day['models'] = sorted(models.values(), key=lambda m: m['id'])
        changed.append((date, model, total))

    # 按日期升序重排（新导入的天可能补在中间）
    doc['days'] = sorted(days, key=lambda d: d['date'])
    doc['updated'] = doc['days'][-1]['date']

    with open(DATA, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write('\n')

    for date, model, total in changed:
        print(f'导入 {date} {model} total={total:,}')


if __name__ == '__main__':
    main()
