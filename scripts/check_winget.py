#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""winget 包体检：验证 data/links.json 里 winget 字段的包 id 在官方源是否可用，
结果写 data/winget-health.json，前端批量安装栏据此出「最新版本 / 已失效」。

验证方式：GitHub Actions 的 Linux runner 上没有 winget 客户端，改查 winget 官方
包仓库 microsoft/winget-pkgs——社区源里每个包的 manifest 都存放在
manifests/<发布者首字母小写>/<发布者>/<包名>/ 下，目录存在即包可用，
子目录名就是历史版本号（取数字段比较的最大值作为最新版本）。
msstore 源的包（火绒/向日葵等商店 id）不在该仓库，无法用此法验证，不要给它们配 winget 字段。

网络请求失败（非 200/404）重试一次；仍失败则沿用旧记录，宁漏报不误报。
结果与上次完全一致时文件字节不变，工作流据此跳过提交。

用法：python scripts/check_winget.py [输入json] [输出json]
环境变量 GITHUB_TOKEN 可选：带上可把 API 限速从 60 次/时提到 5000 次/时（Actions 自带）
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'MySite-winget-check/1.0 (https://github.com/zengzoxiong/MySite)'
API = 'https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests'
NOW = datetime.now(timezone.utc).strftime('%Y-%m-%d')
TIMEOUT = 20


def fetch_json(url):
    """请求 GitHub contents API，返回 (状态码, 解析后的JSON或None)；网络异常返回 (0, None)"""
    headers = {'User-Agent': UA, 'Accept': 'application/vnd.github+json'}
    token = os.environ.get('GITHUB_TOKEN')
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return res.getcode(), json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, None
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0, None


def id_to_path(pkg_id):
    """winget id → winget-pkgs 仓库路径：Tencent.QQ.NT → t/Tencent/QQ/NT
    仓库规则：发布者与包名中的每个点都拆成一层目录，首字母小写作根
    （7zip.7zip → 7/7zip/7zip，Microsoft.VisualStudioCode → m/Microsoft/VisualStudioCode）"""
    parts = pkg_id.split('.')
    return f'{parts[0][0].lower()}/' + '/'.join(parts)


def ver_key(v):
    """版本号排序键：按数字/字母段拆开比，保证 '9.9' < '10.0'；
    纯数字段比数值，字母段兜底按字符串比，两段类型不同时靠首位（0/1）分出大小"""
    parts = re.split(r'[.\-+_]', v)
    return tuple((0, int(p)) if p.isdigit() else (1, p) for p in parts)


def check_id(pkg_id):
    """返回 (ok, latest版本或空串)。404 视为包已从源移除"""
    url = f'{API}/{id_to_path(pkg_id)}'
    for attempt in (1, 2):  # 失败重试一次，减少抖动
        code, data = fetch_json(url)
        if code == 200 and isinstance(data, list):
            # 版本目录名必须以数字开头：过滤掉混在包目录下的非版本子目录
            # （如 Microsoft.VisualStudioCode 下残留的 Insiders 目录）
            versions = [item['name'] for item in data
                        if item.get('type') == 'dir' and item['name'][:1].isdigit()]
            latest = max(versions, key=ver_key) if versions else ''
            return True, latest
        if code == 404:
            return False, ''
        time.sleep(3 * attempt)  # 限速/瞬时故障，退避后重试
    return None, ''  # None 表示验证不成功，沿用旧记录


def main():
    in_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'data', 'links.json')
    out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'data', 'winget-health.json')

    with open(in_path, encoding='utf-8') as f:
        links = json.load(f).get('links', [])
    ids = sorted({l['winget'] for l in links if l.get('winget')})
    if not ids:
        raise SystemExit('links.json 里没有 winget 字段，无事可做')

    old = {}
    if os.path.exists(out_path):
        with open(out_path, encoding='utf-8') as f:
            old = json.load(f).get('packages', {})

    packages = {}
    for pkg_id in ids:
        ok, latest = check_id(pkg_id)
        if ok is None:
            prev = old.get(pkg_id)
            if prev is not None:
                packages[pkg_id] = prev  # 验证不成功沿用旧记录，不误报失效
                print(f'跳过 {pkg_id}（接口异常，沿用旧记录）')
            else:
                packages[pkg_id] = {'ok': False, 'checkedAt': NOW, 'note': '接口异常未验证'}
                print(f'未知 {pkg_id}（接口异常且无旧记录）')
            continue
        packages[pkg_id] = {'ok': ok, 'checkedAt': NOW, **({'latest': latest} if latest else {})}
        print(f'{"可用" if ok else "失效"} {pkg_id}' + (f' 最新 {latest}' if latest else ''))

    result = {
        'source': 'https://github.com/microsoft/winget-pkgs',
        'checkedAt': NOW,
        'packages': packages,
    }
    payload = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if os.path.exists(out_path):
        with open(out_path, encoding='utf-8') as f:
            if f.read() == payload:
                print('体检结果无变化，文件保持不变')
                return
    tmp = out_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(payload)
    os.replace(tmp, out_path)
    print(f'已写入 {out_path}')


if __name__ == '__main__':
    main()
