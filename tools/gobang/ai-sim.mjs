#!/usr/bin/env node
/* -*- coding: utf-8 -*-
 * 五子棋 AI 模拟器（拾光集 · ai-sim.mjs）
 *
 * 用法：
 *   node tools/gobang/ai-sim.mjs [局数] [--depth=N] [--rand=局数]
 *   局数默认 100（AI 自对弈演示局数）；--rand=N 强度验证局数（默认 40，
 *   AI 执黑 / 执白各占一半，对手随机落子）；--depth=N 固定搜索深度
 *   （默认跟随 app.html 的自适应深度：候选点 ≤8 时 4 层，其余 3 层）
 * 示例：
 *   node tools/gobang/ai-sim.mjs                  # 100 局自对弈 + 40 局强度验证
 *   node tools/gobang/ai-sim.mjs 200              # 200 局自对弈
 *   node tools/gobang/ai-sim.mjs 20 --depth=2 --rand=8
 *
 * 说明：
 *   - 五子棋无“得分”概念，模拟采用自动演示模式：AI 先后接管黑白双方自动
 *     对弈，统计先后手胜率、和棋率、平均手数等，不输出平均分 / 最高分。
 *   - AI 核心逻辑（单步推进 / 胜负判定 / αβ 剪枝极小极大搜索）直接从
 *     app.html 的 AI_CORE_BEGIN / AI_CORE_END 标记之间提取执行，与页面 AI
 *     严格同一份代码，杜绝两处实现漂移。
 *   - 不依赖浏览器，纯 node 运行；自动用 worker_threads 多线程并行加速
 *     （线程数 = min(CPU 核数 - 1, 8)）。
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
  if (factorySrc.indexOf('function aiCoreGobang') < 0) {
    console.error('错误：提取的片段中缺少 aiCoreGobang 工厂函数，请检查 app.html 标记区。');
    process.exit(1);
  }
  const makeFactory = new Function(factorySrc + '\nreturn aiCoreGobang;');
  return makeFactory()();
}

/* ---------- 单局模拟 ----------
 * aiSide = 0：AI 自对弈演示（黑白双方都由 AI 代下）
 * aiSide = 1：AI 执黑，白方随机落子；aiSide = 2：AI 执白，黑方随机落子 */
function playOne(core, depth, aiSide) {
  let board = core.createBoard();
  let p = 1;                 // 1 黑先 / 2 白
  let moves = 0;
  while (true) {
    let mv;
    if (aiSide && p !== aiSide) {
      const empties = [];
      for (let y = 0; y < core.N; y++) {
        for (let x = 0; x < core.N; x++) if (!board[y][x]) empties.push({ x: x, y: y });
      }
      if (!empties.length) break;
      mv = empties[Math.floor(Math.random() * empties.length)];
    } else {
      mv = core.bestMove(core.cloneBoard(board), p, depth);
    }
    if (!mv) break;
    const res = core.step(board, mv.x, mv.y, p);
    board = res.board;
    moves++;
    if (res.win) return { winner: p, moves: moves, side: aiSide };
    if (res.full) return { winner: 0, moves: moves, side: aiSide };
    p = 3 - p;
  }
  return { winner: 0, moves: moves, side: aiSide };   // 理论兜底：按和棋计
}

/* ---------- 主线程：解析参数、并行分发、聚合统计 ---------- */
if (isMainThread) {
  const argv = process.argv.slice(2);
  const depthArg = argv.find(function (a) { return a.indexOf('--depth=') === 0; });
  const depthOverride = depthArg ? parseInt(depthArg.slice('--depth='.length), 10) || undefined : undefined;
  const randArg = argv.find(function (a) { return a.indexOf('--rand=') === 0; });
  let randGames = randArg ? parseInt(randArg.slice('--rand='.length), 10) : 40;
  if (!Number.isFinite(randGames) || randGames < 0) randGames = 40;
  const posArgs = argv.filter(function (a) { return a.indexOf('--') !== 0; });
  const games = Math.max(1, parseInt(posArgs[0], 10) || 100);

  loadCore();   // 先在主线程校验提取可用，失败即退出

  const total = games + randGames;
  const threads = Math.max(1, Math.min(os.cpus().length - 1 || 1, 8, total));
  const per = Math.ceil(total / threads);
  const startedAt = Date.now();
  const selfResults = [];
  const randResults = [];
  let done = 0;

  console.error('并行 ' + threads + ' 线程：自对弈 ' + games + ' 局 + 强度验证 ' + randGames + ' 局中……');
  let finished = 0;
  let spawned = 0;
  for (let t = 0; t < threads; t++) {
    // 自对弈局在前、强度验证局在后拼成一个任务序列，按片切给各线程
    const start = t * per;
    const end = Math.min(start + per, total);
    const nSelf = Math.max(0, Math.min(end, games) - start);
    const nRand = Math.max(0, end - Math.max(start, games));
    if (nSelf <= 0 && nRand <= 0) continue;
    spawned++;
    const w = new ThreadWorker(new URL(import.meta.url), {
      workerData: {
        self: Math.max(nSelf, 0),
        rand: Math.max(nRand, 0),
        randStart: Math.max(start, games) - games,   // 该线程首个强度验证局的全局序号
        depth: depthOverride || 0
      }
    });
    w.on('message', function (msg) {
      for (const r of msg.self) selfResults.push(r);
      for (const r of msg.rand) randResults.push(r);
      finished++;
      console.error('  线程完成 ' + finished + '/' + threads);
    });
    w.on('error', function (err) { console.error('子线程出错：' + err.message); process.exit(1); });
  }

  const timer = setInterval(function () {
    if (spawned > 0 && finished >= spawned) {
      clearInterval(timer);
      report(selfResults, randResults, Date.now() - startedAt, depthOverride);
    }
  }, 100);
} else {
  /* ---------- 子线程：跑分到的局数后回传 ---------- */
  const core = loadCore();
  const depth = workerData.depth || undefined;
  const self = [];
  const rand = [];
  for (let i = 0; i < workerData.self; i++) self.push(playOne(core, depth, 0));
  for (let i = 0; i < workerData.rand; i++) {
    // 强度验证按全局序号交替执黑 / 执白，双向证明 AI 棋力
    const g = (workerData.randStart || 0) + i;
    rand.push(playOne(core, depth, g % 2 === 0 ? 1 : 2));
  }
  parentPort.postMessage({ self: self, rand: rand });
}

/* ---------- 中文统计输出 ---------- */
function pct(n, total) {
  return total ? (n * 100 / total).toFixed(1) + '%' : '-';
}

function report(self, rand, elapsedMs, depthOverride) {
  const n = self.length;
  const blackWins = self.filter(function (r) { return r.winner === 1; }).length;
  const whiteWins = self.filter(function (r) { return r.winner === 2; }).length;
  const draws = n - blackWins - whiteWins;
  const movesList = self.map(function (r) { return r.moves; }).sort(function (a, b) { return a - b; });
  const avgMoves = n ? movesList.reduce(function (s, v) { return s + v; }, 0) / n : 0;
  const medianMoves = n ? (n % 2 ? movesList[(n - 1) / 2] : (movesList[n / 2 - 1] + movesList[n / 2]) / 2) : 0;

  // 强度验证：按执子方向分别统计 AI 胜率（对手为随机落子）
  const randAsBlack = rand.filter(function (r) { return r.side === 1; });
  const randAsWhite = rand.filter(function (r) { return r.side === 2; });

  const strategy = depthOverride
    ? 'αβ 剪枝极小极大，固定 ' + depthOverride + ' 层深度'
    : 'αβ 剪枝极小极大，深度自适应（候选 ≤8 时 4 层，其余 3 层）';

  console.log('');
  console.log('====================================================');
  console.log('           五子棋 AI 模拟统计（拾光集）');
  console.log('====================================================');
  console.log('自对弈局数      ：' + n + ' 局（自动演示模式，AI 托管黑白双方）');
  console.log('搜索策略        ：' + strategy + '，活三冲四启发评估');
  console.log('----------------------------------------------------');
  console.log('黑棋（先手）胜  ：' + blackWins + ' 局（' + pct(blackWins, n) + '）');
  console.log('白棋（后手）胜  ：' + whiteWins + ' 局（' + pct(whiteWins, n) + '）');
  console.log('和棋            ：' + draws + ' 局（' + pct(draws, n) + '）');
  console.log('平均手数        ：' + avgMoves.toFixed(1) + ' 手（中位数 ' + medianMoves + ' 手，最短 ' + (movesList[0] || 0) + ' 手，最长 ' + (movesList[n - 1] || 0) + ' 手）');
  console.log('平均每手耗时    ：' + (n ? (elapsedMs / Math.max(1, movesList.reduce(function (s, v) { return s + v; }, 0))).toFixed(1) : 0) + ' ms');
  console.log('----------------------------------------------------');
  if (rand.length) {
    console.log('强度验证（对手随机落子）：');
    console.log('  AI 执黑胜率   ：' + pct(randAsBlack.filter(function (r) { return r.winner === 1; }).length, randAsBlack.length)
      + '（' + randAsBlack.filter(function (r) { return r.winner === 1; }).length + ' / ' + randAsBlack.length + ' 局）');
    console.log('  AI 执白胜率   ：' + pct(randAsWhite.filter(function (r) { return r.winner === 2; }).length, randAsWhite.length)
      + '（' + randAsWhite.filter(function (r) { return r.winner === 2; }).length + ' / ' + randAsWhite.length + ' 局）');
    console.log('----------------------------------------------------');
  }
  console.log('备注            ：五子棋无“得分”概念，本模拟为自动演示模式，');
  console.log('                  以先后手胜率 / 和棋率 / 平均手数代替分数统计。');
  console.log('总耗时          ：' + (elapsedMs / 1000).toFixed(1) + ' 秒（Node ' + process.version + '）');
  console.log('====================================================');
}
