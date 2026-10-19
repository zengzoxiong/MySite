#!/usr/bin/env node
/* -*- coding: utf-8 -*-
 * 方块消除 AI 模拟器（拾光集 · ai-sim.mjs）
 *
 * 用法：
 *   node tools/tetris-block/ai-sim.mjs [局数] [--cap=N]
 *   局数默认 100；--cap=N 单局最多模拟 N 个方块（默认 500）
 * 示例：
 *   node tools/tetris-block/ai-sim.mjs            # 按默认设置跑 100 局
 *   node tools/tetris-block/ai-sim.mjs 200        # 跑 200 局
 *   node tools/tetris-block/ai-sim.mjs 20 --cap=1000   # 单局封顶 1000 块跑 20 局
 *
 * 说明：
 *   - AI 核心逻辑（锁定消行单步推进 / 落点枚举 / 启发式评估 / 2 层搜索）直接从
 *     app.html 的 AI_CORE_BEGIN / AI_CORE_END 标记之间提取执行，与页面 AI
 *     严格同一份代码，杜绝两处实现漂移。
 *   - 不依赖浏览器，纯 node 运行；自动用 worker_threads 多线程并行加速
 *     （线程数 = min(CPU 核数 - 1, 8)）。
 *   - 每局规则与页面一致：七袋随机、出生高度横移后硬降（+2 分/格）、
 *     消行 100 / 300 / 500 / 800 × 等级（每消 10 行升 1 级），堆到顶即结束。
 *   - 该 AI 生存能力极强（实测万块不顶出、堆高长期 0~7），单局几乎不会自然
 *     结束，故单局封顶 --cap 个方块后按当前得分结算；统计里区分「顶出结束」
 *     与「封顶存活」两种结局。
 *   - 方块消除无固定胜利条件（堆到顶即结束），故不统计胜率，
 *     改统计消行、下落块数与分数段占比。
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
  if (factorySrc.indexOf('function aiCoreTetris') < 0) {
    console.error('错误：提取的片段中缺少 aiCoreTetris 工厂函数，请检查 app.html 标记区。');
    process.exit(1);
  }
  const makeFactory = new Function(factorySrc + '\nreturn aiCoreTetris;');
  return makeFactory()();
}

/* ---------- 单局模拟：AI 全程代玩，堆到顶或达到封顶块数为止 ----------
   判定与页面一致：新块先在出生位（原点 y=0、水平居中）做顶出检测，
   顶出即结束；否则 AI 选择最优旋转与落点后硬降 */
function playOne(core, cap) {
  const bag = core.newBag();
  let type = bag.take();
  let nextT = bag.take();
  let grid = core.emptyGrid();
  let score = 0, lines = 0, level = 1, pieces = 0;
  let topped = false;
  while (pieces < cap) {
    const spawnM = core.matrixFor(type, 0);
    const spawnX = Math.floor((core.COLS - spawnM[0].length) / 2);
    if (core.collide(grid, spawnM, spawnX, 0)) { topped = true; break; }   // 顶出：本局结束
    const p = core.bestPlacement(grid, type, nextT);
    if (!p) { topped = true; break; }
    const res = core.lockInto(grid, p.m, p.x, p.y, type);
    score += Math.max(0, p.y) * 2;                      // 硬降奖励，与页面 hardDrop 一致
    if (res.n > 0) {
      lines += res.n;
      score += (core.LINE_SCORES[res.n] || 1200) * level;
      level = Math.floor(lines / 10) + 1;
    }
    pieces++;
    if (res.toppedOut) { topped = true; break; }
    grid = res.grid;
    type = nextT;
    nextT = bag.take();
  }
  return { score: score, lines: lines, pieces: pieces, topped: topped };
}

/* ---------- 主线程：解析参数、并行分发、聚合统计 ---------- */
if (isMainThread) {
  const argv = process.argv.slice(2);
  const capArg = argv.find(function (a) { return a.indexOf('--cap=') === 0; });
  const cap = Math.max(1, parseInt(capArg ? capArg.slice('--cap='.length) : '', 10) || 500);
  const posArgs = argv.filter(function (a) { return a.indexOf('--cap=') !== 0; });
  const games = Math.max(1, parseInt(posArgs[0], 10) || 100);

  loadCore();   // 先在主线程校验提取可用，失败即退出

  const threads = Math.max(1, Math.min(os.cpus().length - 1 || 1, 8, games));
  const per = Math.ceil(games / threads);
  const startedAt = Date.now();
  const all = [];
  let finished = 0;

  console.error('并行 ' + threads + ' 线程，模拟 ' + games + ' 局（单局封顶 ' + cap + ' 块）中……');
  for (let t = 0; t < threads; t++) {
    const n = Math.min(per, games - t * per);
    if (n <= 0) break;
    const w = new ThreadWorker(new URL(import.meta.url), { workerData: { games: n, cap: cap } });
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
      report(all, Date.now() - startedAt, cap);
    }
  }, 100);
} else {
  /* ---------- 子线程：跑分到的局数后回传 ---------- */
  const core = loadCore();
  const results = [];
  for (let i = 0; i < workerData.games; i++) results.push(playOne(core, workerData.cap));
  parentPort.postMessage(results);
}

/* ---------- 中文统计输出 ---------- */
function report(results, elapsedMs, cap) {
  const n = results.length;
  const fmt = function (x) { return Math.round(x).toLocaleString('en-US'); };
  const scores = results.map(function (r) { return r.score; }).sort(function (a, b) { return a - b; });
  const total = scores.reduce(function (s, v) { return s + v; }, 0);
  const avg = total / n;
  const median = n % 2 ? scores[(n - 1) / 2] : (scores[n / 2 - 1] + scores[n / 2]) / 2;
  const linesList = results.map(function (r) { return r.lines; });
  const avgLines = linesList.reduce(function (s, v) { return s + v; }, 0) / n;
  const maxLines = Math.max.apply(null, linesList);
  const avgPieces = results.reduce(function (s, r) { return s + r.pieces; }, 0) / n;
  const maxPieces = Math.max.apply(null, results.map(function (r) { return r.pieces; }));
  const topped = results.filter(function (r) { return r.topped; }).length;
  const survived = n - topped;
  const tenk = results.filter(function (r) { return r.score >= 10000; }).length;
  const fiftyk = results.filter(function (r) { return r.score >= 50000; }).length;

  const bands = [
    ['< 1 万', function (s) { return s < 10000; }],
    ['1 万 ~ 5 万', function (s) { return s >= 10000 && s < 50000; }],
    ['5 万 ~ 10 万', function (s) { return s >= 50000 && s < 100000; }],
    ['≥ 10 万', function (s) { return s >= 100000; }]
  ];
  const bandLines = bands.map(function (b) {
    const c = results.filter(function (r) { return b[1](r.score); }).length;
    return '  ' + b[0].padEnd(12) + '：' + String(c).padStart(3) + ' 局（' + (c * 100 / n).toFixed(1) + '%）';
  });

  console.log('');
  console.log('====================================================');
  console.log('          方块消除 AI 模拟统计（拾光集）');
  console.log('====================================================');
  console.log('模拟局数        ：' + n + ' 局');
  console.log('AI 算法         ：启发式评估（高度 / 空洞 / 平整度 / 井深）+ 下一块 2 层搜索');
  console.log('单局封顶        ：' + cap + ' 块（本 AI 极少顶出，封顶后按当前得分结算）');
  console.log('----------------------------------------------------');
  console.log('平均分          ：' + fmt(avg));
  console.log('中位数分数      ：' + fmt(median));
  console.log('最高分          ：' + fmt(scores[n - 1]));
  console.log('最低分          ：' + fmt(scores[0]));
  console.log('平均消行        ：' + fmt(avgLines) + ' 行（单局最高 ' + fmt(maxLines) + ' 行）');
  console.log('平均下落块数    ：' + fmt(avgPieces) + ' 块（单局最高 ' + fmt(maxPieces) + ' 块）');
  console.log('结局分布        ：顶出结束 ' + topped + ' 局 / 封顶存活 ' + survived + ' 局');
  console.log('万分分局占比    ：' + (tenk * 100 / n).toFixed(1) + '%（' + tenk + ' / ' + n + ' 局）');
  console.log('五万分分局占比  ：' + (fiftyk * 100 / n).toFixed(1) + '%（' + fiftyk + ' / ' + n + ' 局）');
  console.log('胜率            ：不适用（本游戏无固定胜利条件，堆到顶即结束）');
  console.log('----------------------------------------------------');
  console.log('分数段分布      ：');
  console.log(bandLines.join('\n'));
  console.log('----------------------------------------------------');
  console.log('总耗时          ：' + (elapsedMs / 1000).toFixed(1) + ' 秒（平均每局 ' + (elapsedMs / 1000 / n).toFixed(2) + ' 秒）');
  console.log('====================================================');
}
