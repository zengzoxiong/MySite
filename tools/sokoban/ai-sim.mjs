#!/usr/bin/env node
/* -*- coding: utf-8 -*-
 * 推箱子 AI 模拟器（拾光集 · ai-sim.mjs）
 *
 * 用法：
 *   node tools/sokoban/ai-sim.mjs [局数] [--limit=节点上限]
 *   局数默认 100；每局 = AI 自动演示模式：从第 1 关起连续求解并通关全部 5 关
 *   --limit=N 求解器单关最大扩展节点数（默认 400000）
 * 示例：
 *   node tools/sokoban/ai-sim.mjs             # 跑 100 局
 *   node tools/sokoban/ai-sim.mjs 20          # 跑 20 局
 *   node tools/sokoban/ai-sim.mjs 5 --limit=100000
 *
 * 说明：
 *   - AI 核心逻辑（关卡解析 / 单步推进 / 胜负判定 / A* 求解）直接从 app.html
 *     的 AI_CORE_BEGIN / AI_CORE_END 标记之间提取执行，与页面 AI 严格同一份
 *     代码，杜绝两处实现漂移。
 *   - 不依赖浏览器，纯 node 运行；自动用 worker_threads 多线程并行加速
 *     （线程数 = min(CPU 核数 - 1, 8, 局数)）。
 *   - 推箱子无得分概念：以通关率、总步数、推动次数衡量成绩（avgScore 记 -1），
 *     并统计每关最优步数 / 推动次数、求解节点数与耗时。
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
  if (factorySrc.indexOf('function aiCoreSokoban') < 0) {
    console.error('错误：提取的片段中缺少 aiCoreSokoban 工厂函数，请检查 app.html 标记区。');
    process.exit(1);
  }
  const makeFactory = new Function(factorySrc + '\nreturn aiCoreSokoban;');
  return makeFactory()();
}

/* ---------- 单局模拟：依次求解并回放 5 关（AI 自动演示模式） ---------- */
function playOne(core, limit) {
  const levels = [];
  let totalMoves = 0, totalPushes = 0, solveMs = 0, expanded = 0;
  let solvedAll = true;
  for (const lv of core.LEVELS) {
    const st = core.parseMap(lv.map);
    const t0 = process.hrtime.bigint();
    const res = core.solve(st, limit);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    solveMs += ms;
    if (!res) {
      solvedAll = false;
      levels.push({ name: lv.name, solved: false, solveMs: ms });
      continue;
    }
    expanded += res.expanded;
    // 逐步回放验证：路径必须每步合法，且正好通关
    let cur = st, ok = true;
    for (const d of res.path) {
      const nx = core.step(cur, d);
      if (!nx) { ok = false; break; }
      cur = nx;
    }
    if (!ok || !core.isWin(cur)) {
      solvedAll = false;
      levels.push({ name: lv.name, solved: false, solveMs: ms, expanded: res.expanded });
      continue;
    }
    totalMoves += cur.moves;
    totalPushes += cur.pushes;
    levels.push({
      name: lv.name, solved: true,
      moves: cur.moves, pushes: cur.pushes,
      solveMs: ms, expanded: res.expanded
    });
  }
  return { solvedAll: solvedAll, totalMoves: totalMoves, totalPushes: totalPushes, solveMs: solveMs, expanded: expanded, levels: levels };
}

/* ---------- 主线程：解析参数、并行分发、聚合统计 ---------- */
if (isMainThread) {
  const argv = process.argv.slice(2);
  const limitArg = argv.find(function (a) { return a.indexOf('--limit=') === 0; });
  const limit = limitArg ? (parseInt(limitArg.slice('--limit='.length), 10) || 400000) : 400000;
  const posArgs = argv.filter(function (a) { return a.indexOf('--limit=') !== 0; });
  const games = Math.max(1, parseInt(posArgs[0], 10) || 100);

  const core = loadCore();   // 先在主线程校验提取可用，失败即退出
  const levelCount = core.LEVELS.length;

  const threads = Math.max(1, Math.min(os.cpus().length - 1 || 1, 8, games));
  const per = Math.ceil(games / threads);
  const startedAt = Date.now();
  const all = [];
  let finished = 0;

  console.log('推箱子 · AI 代玩模拟开始（' + games + ' 局 × ' + levelCount + ' 关自动演示，并行 ' + threads + ' 线程）…');
  let spawned = 0;
  for (let t = 0; t < threads; t++) {
    const n = Math.min(per, games - t * per);
    if (n <= 0) break;
    spawned++;
    const w = new ThreadWorker(new URL(import.meta.url), { workerData: { games: n, limit: limit } });
    w.on('message', function (results) {
      for (const r of results) all.push(r);
      finished++;
    });
    w.on('error', function (err) { console.error('子线程出错：' + err.message); process.exit(1); });
  }

  const timer = setInterval(function () {
    if (finished >= spawned) {
      clearInterval(timer);
      report(core, all, Date.now() - startedAt, threads);
    }
  }, 100);
} else {
  /* ---------- 子线程：跑分到的局数后回传 ---------- */
  const core = loadCore();
  const results = [];
  for (let i = 0; i < workerData.games; i++) results.push(playOne(core, workerData.limit));
  parentPort.postMessage(results);
}

/* ---------- 中文统计输出 ---------- */
function report(core, runs, wallMs, threads) {
  const games = runs.length;
  const winCount = runs.filter(function (r) { return r.solvedAll; }).length;
  const avg = function (arr) { return arr.reduce(function (a, b) { return a + b; }, 0) / (arr.length || 1); };
  const fmt = function (v) { return (Math.round(v * 10) / 10).toString(); };
  const moveList = runs.map(function (r) { return r.totalMoves; });
  const pushList = runs.map(function (r) { return r.totalPushes; });

  console.log('');
  console.log('========================================');
  console.log(' 推箱子 · AI 代玩模拟统计（node 实测）');
  console.log('========================================');
  console.log('模拟局数：' + games + '（每局 = AI 连续求解并通关全部 ' + core.LEVELS.length + ' 关的自动演示）');
  console.log('全通关局数：' + winCount + ' / ' + games + '　胜率：' + fmt(winCount / games * 100) + '%');
  console.log('每局总步数：平均 ' + fmt(avg(moveList)) + '（最少 ' + Math.min.apply(null, moveList) + ' / 最多 ' + Math.max.apply(null, moveList) + '）');
  console.log('每局总推动：平均 ' + fmt(avg(pushList)) + '（最少 ' + Math.min.apply(null, pushList) + ' / 最多 ' + Math.max.apply(null, pushList) + '）');
  console.log('');
  console.log('分关统计（宏步 A* 精确最少步数解，各关结果稳定）：');
  for (let i = 0; i < core.LEVELS.length; i++) {
    const list = runs.map(function (r) { return r.levels[i]; });
    const okList = list.filter(function (x) { return x.solved; });
    if (okList.length === 0) {
      console.log('  ' + core.LEVELS[i].name + '：全部失败（求解超限或无解）');
      continue;
    }
    const m = avg(okList.map(function (x) { return x.moves; }));
    const p = avg(okList.map(function (x) { return x.pushes; }));
    const ms = avg(okList.map(function (x) { return x.solveMs; }));
    const ex = avg(okList.map(function (x) { return x.expanded; }));
    console.log('  ' + core.LEVELS[i].name + '：平均 ' + fmt(m) + ' 步 / ' + fmt(p) + ' 推（求解 ' + fmt(ms) + ' ms，扩展 ' + fmt(ex) + ' 节点）');
  }
  console.log('');
  console.log('求解耗时：平均每局 ' + fmt(avg(runs.map(function (r) { return r.solveMs; }))) + ' ms（单线程 CPU 时间）；模拟墙钟 ' + (wallMs / 1000).toFixed(1) + ' s（' + threads + ' 线程并行）');
  console.log('说明：推箱子无得分概念（avgScore = -1），以通关率、步数、推动次数作为成绩指标；');
  console.log('      AI 为确定性 A* + 死格剪枝求最少步数解，固定关卡下各局结果一致属正常现象。');
}
