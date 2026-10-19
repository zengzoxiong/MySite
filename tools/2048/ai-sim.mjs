#!/usr/bin/env node
/* -*- coding: utf-8 -*-
 * 2048 AI 模拟器（拾光集 · ai-sim.mjs）
 *
 * 用法：
 *   node tools/2048/ai-sim.mjs [局数] [--depth=N]
 *   局数默认 100；--depth=N 固定搜索深度（默认跟随 app.html 内的自适应深度：
 *   空位 ≤6 时 3 层，其余 2 层）
 * 示例：
 *   node tools/2048/ai-sim.mjs                # 按默认设置跑 100 局
 *   node tools/2048/ai-sim.mjs 200            # 跑 200 局
 *   node tools/2048/ai-sim.mjs 20 --depth=3   # 固定 3 层深度跑 20 局（明显更慢）
 *
 * 说明：
 *   - AI 核心逻辑（单步推进 / 生成 / 评估 / expectimax 搜索）直接从 app.html
 *     的 AI_CORE_BEGIN / AI_CORE_END 标记之间提取执行，与页面 AI 严格同一份
 *     代码，杜绝两处实现漂移。
 *   - 不依赖浏览器，纯 node 运行；自动用 worker_threads 多线程并行加速
 *     （线程数 = min(CPU 核数 - 1, 8)）。
 *   - 每局规则与页面一致：0.9 概率出 2、0.1 概率出 4；合成出 2048 记一次
 *     胜利并继续冲高分，直到无路可走。
 */
'use strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { Worker as ThreadWorker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, 'app.html');

/* ---------- 从 app.html 提取与页面同源的 AI 核心逻辑 ---------- */
function loadCore() {
  const html = readFileSync(htmlPath, 'utf8');
  const begin = html.indexOf('/* ===== AI_CORE_BEGIN');
  const end = html.indexOf('/* ===== AI_CORE_END');
  if (begin < 0 || end < 0 || end <= begin) {
    console.error('错误：未能从 app.html 中找到 AI_CORE_BEGIN / AI_CORE_END 标记，无法提取 AI 核心逻辑。');
    process.exit(1);
  }
  const factorySrc = html.slice(begin, end);
  if (factorySrc.indexOf('function aiCore2048') < 0) {
    console.error('错误：提取的片段中缺少 aiCore2048 工厂函数，请检查 app.html 标记区。');
    process.exit(1);
  }
  const makeFactory = new Function(factorySrc + '\nreturn aiCore2048;');
  return makeFactory()();
}

/* ---------- 单局模拟：AI 全程代玩，直到无路可走 ---------- */
function playOne(core, depthOverride) {
  let m = new Array(16).fill(0);
  for (let k = 0; k < 2; k++) {
    const s = core.pickSpawn(m);
    if (!s) break;
    m[s[0]] = s[1];
  }
  let score = 0, steps = 0, win = false;
  let maxTile = core.maxOf(m);
  while (true) {
    const dir = core.bestDir(m, depthOverride);
    if (!dir) break;                       // 四向皆不可动：本局结束
    const res = core.simMove(m, dir);
    score += res.gained;
    m = res.mat;
    steps++;
    const mv = core.maxOf(m);
    if (mv > maxTile) maxTile = mv;
    if (!win && mv >= 2048) win = true;    // 首次合成 2048 记胜，继续冲更高分
    const s = core.pickSpawn(m);
    if (!s) break;
    m[s[0]] = s[1];
    if (!core.hasMoves(m)) break;
  }
  return { score: score, steps: steps, win: win, maxTile: maxTile };
}

/* ---------- 主线程：解析参数、并行分发、聚合统计 ---------- */
if (isMainThread) {
  const argv = process.argv.slice(2);
  const depthArg = argv.find(function (a) { return a.indexOf('--depth=') === 0; });
  const depthOverride = depthArg ? parseInt(depthArg.slice('--depth='.length), 10) || undefined : undefined;
  const posArgs = argv.filter(function (a) { return a.indexOf('--depth=') !== 0; });
  const games = Math.max(1, parseInt(posArgs[0], 10) || 100);

  loadCore();   // 先在主线程校验提取可用，失败即退出

  const threads = Math.max(1, Math.min(os.cpus().length - 1 || 1, 8, games));
  const per = Math.ceil(games / threads);
  const startedAt = Date.now();
  const all = [];
  let done = 0;

  console.error('并行 ' + threads + ' 线程，模拟 ' + games + ' 局中……');
  let finished = 0;
  for (let t = 0; t < threads; t++) {
    const n = Math.min(per, games - t * per);
    if (n <= 0) break;
    const w = new ThreadWorker(new URL(import.meta.url), { workerData: { games: n, depth: depthOverride || 0 } });
    w.on('message', function (results) {
      for (const r of results) all.push(r);
      finished++;
      console.error('  线程完成 ' + finished + '/' + threads);
    });
    w.on('error', function (err) { console.error('子线程出错：' + err.message); process.exit(1); });
  }

  const timer = setInterval(function () {
    if (finished >= threads) {
      clearInterval(timer);
      report(all, Date.now() - startedAt, depthOverride);
    }
  }, 100);
} else {
  /* ---------- 子线程：跑分到的局数后回传 ---------- */
  const core = loadCore();
  const results = [];
  for (let i = 0; i < workerData.games; i++) results.push(playOne(core, workerData.depth || undefined));
  parentPort.postMessage(results);
}

/* ---------- 中文统计输出 ---------- */
function report(results, elapsedMs, depthOverride) {
  const n = results.length;
  const fmt = function (x) { return Math.round(x).toLocaleString('en-US'); };
  const scores = results.map(function (r) { return r.score; }).sort(function (a, b) { return a - b; });
  const total = scores.reduce(function (s, v) { return s + v; }, 0);
  const avg = total / n;
  const median = n % 2 ? scores[(n - 1) / 2] : (scores[n / 2 - 1] + scores[n / 2]) / 2;
  const wins = results.filter(function (r) { return r.win; }).length;
  const steps = results.reduce(function (s, r) { return s + r.steps; }, 0) / n;
  const dist = {};
  for (const r of results) dist[r.maxTile] = (dist[r.maxTile] || 0) + 1;
  const distLines = Object.keys(dist).map(Number).sort(function (a, b) { return b - a; })
    .map(function (v) { return '  ' + String(v).padEnd(6) + '：' + String(dist[v]).padStart(3) + ' 局'; });

  const strategy = depthOverride
    ? 'expectimax，固定 ' + depthOverride + ' 层深度'
    : 'expectimax，深度自适应（空位 ≤6 时 3 层，其余 2 层）';

  console.log('');
  console.log('====================================================');
  console.log('           2048 AI 模拟统计（拾光集）');
  console.log('====================================================');
  console.log('模拟局数        ：' + n + ' 局');
  console.log('搜索策略        ：' + strategy);
  console.log('----------------------------------------------------');
  console.log('平均分          ：' + fmt(avg));
  console.log('中位数分数      ：' + fmt(median));
  console.log('最高分          ：' + fmt(scores[n - 1]));
  console.log('最低分          ：' + fmt(scores[0]));
  console.log('达成 2048 胜率  ：' + (wins * 100 / n).toFixed(1) + '%（' + wins + ' / ' + n + ' 局）');
  console.log('平均步数        ：' + fmt(steps) + ' 步');
  console.log('----------------------------------------------------');
  console.log('最大方块分布    ：');
  console.log(distLines.join('\n'));
  console.log('----------------------------------------------------');
  console.log('总耗时          ：' + (elapsedMs / 1000).toFixed(1) + ' 秒（平均每局 ' + (elapsedMs / 1000 / n).toFixed(2) + ' 秒）');
  console.log('====================================================');
}
