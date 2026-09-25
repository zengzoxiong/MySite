#!/usr/bin/env python3
"""死链体检：遍历 data/links.json 的 url 做状态码检查，结果写 data/link-health.json。

状态三档（宁漏报不误报）：
  ok      2xx/3xx，活着
  dead    404/410，或两次都 DNS 解析失败：真死链，前端标题行出红标
  suspect 401/403/405/429/5xx、超时、连接被重置等：多为反爬或瞬时故障，只记录不出标

非 ok 的结果会重试一次再定档，减少抖动。结果与上次「状态+状态码」相同时整条沿用旧记录
（含 checkedAt），文件在无真实变化时保持字节不变，工作流据此跳过提交。

用法：python scripts/check_links.py [输入json] [输出json]
"""
import json
import socket
import ssl
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36')
TIMEOUT = 15
NOW = datetime.now(timezone.utc).strftime('%Y-%m-%d')


def probe(url):
    """返回 (状态码, 故障类型, 最终url)；故障类型 dns/ssl/net 表示没拿到 HTTP 响应"""
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,*/*'})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            code = res.getcode()
            res.read(2048)  # 读一点就走，不拖整页
            return code, 'http', res.geturl()
    except urllib.error.HTTPError as e:
        return e.code, 'http', url
    except urllib.error.URLError as e:
        # DNS/证书失败会被包在 URLError.reason 里，不解包就全落成疑似
        if isinstance(e.reason, socket.gaierror):
            return 0, 'dns', url
        if isinstance(e.reason, ssl.SSLCertVerificationError):
            return 0, 'ssl', url
        return 0, 'net', url
    except socket.gaierror:
        return 0, 'dns', url
    except ssl.SSLCertVerificationError:
        return 0, 'ssl', url
    except Exception:
        return 0, 'net', url


def check(url):
    tries = [probe(url)]
    if tries[0][1] != 'http' or not (200 <= tries[0][0] < 400):
        tries.append(probe(url))  # 非 ok 重试一次
    ok = any(k == 'http' and 200 <= c < 400 for c, k, _ in tries)
    if ok:
        state = 'ok'
    elif any(c in (404, 410) for c, _, _ in tries) or all(k == 'dns' for _, k, _ in tries):
        state = 'dead'
    else:
        state = 'suspect'
    code, kind, final = tries[-1]
    return url, {
        'status': code,
        'reason': kind,
        'state': state,
        'finalUrl': final if final != url else '',
        'checkedAt': NOW,
    }


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'data/links.json'
    dst = sys.argv[2] if len(sys.argv) > 2 else 'data/link-health.json'
    links = json.load(open(src, encoding='utf-8'))['links']
    urls = []
    for item in links:
        u = item.get('url', '')
        if u.startswith('http') and u not in urls:
            urls.append(u)

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = dict(pool.map(check, urls))

    # 状态与状态码没变的整条沿用旧记录，让文件在无真实变化时保持字节不变
    try:
        prev = json.load(open(dst, encoding='utf-8')).get('results', {})
    except Exception:
        prev = {}
    for url, rec in results.items():
        old = prev.get(url)
        if old and old.get('state') == rec['state'] and old.get('status') == rec['status']:
            results[url] = old

    dead = sorted(u for u, r in results.items() if r['state'] == 'dead')
    suspect = sorted(u for u, r in results.items() if r['state'] == 'suspect')
    out = {
        'counts': {'total': len(urls), 'ok': len(urls) - len(dead) - len(suspect),
                   'suspect': len(suspect), 'dead': len(dead)},
        'results': results,
    }
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'体检完成：{len(urls)} 条，ok {out["counts"]["ok"]}，suspect {len(suspect)}，dead {len(dead)}')
    for u in dead:
        print('  DEAD   ', u, results[u]['status'], results[u]['reason'])
    for u in suspect:
        print('  SUSPECT', u, results[u]['status'], results[u]['reason'])


if __name__ == '__main__':
    main()
