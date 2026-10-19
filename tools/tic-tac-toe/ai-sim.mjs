#!/usr/bin/env node
/* -*- coding: utf-8 -*-
 * 井字棋 AI 代玩模拟器（拾光集 · ai-sim.mjs）
 *
 * 用法：
 *   node tools/tic-tac-toe/ai-sim.mjs [局数] [起始种子]
 *   局数默认 100（每个模式各跑这么多局，共 3 个模式），种子默认 20261019
 * 示例：
 *   node tools/tic-tac-toe/ai-sim.mjs           # 每模式 100 局（共 300 局）
 *   node tools/tic-tac-toe/ai-sim.mjs 300       # 每模式 300 局
 *   node tools/tic-tac-toe/ai-sim.mjs 100 7     # 指定随机种子（结果可复现）
 *
 * 说明：
 *   - AI 核心逻辑（freshGame / stepGame / winnerOf / minimax / bestMove）
 *     直接从 app.html 的 AI_CORE_BEGIN / AI_CORE_END 标记之间提取执行，
 *     与页面严格同一份代码，杜绝两端实现漂移。
 *   - 不依赖浏览器，纯 node 运行。
 *   - 井字棋没有「得分」概念，本脚本按自动演示模式统计胜/平/负与对局长度，
 *     平均分记 -1（与拾光集统计口径一致），改看胜率、平局率、负率。
 *   - 三种模式：
 *     ① 完美 AI 先手（执 X）vs 随机落子对手
 *     ② 完美 AI 后手（执 O）vs 随机落子对手
 *     ③ 完美 AI 自对弈自动演示（双方都用完美 minimax）
 *   - 完美 minimax 的理论保证：对任何对手都不败。模式①②负场应为 0，
 *     模式③应全部平局；脚本据此自检并在结尾给出结论。
 */
'use strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, 'app.html');

/* ---------- 从 app.html 提取与页面同源的 AI 核心逻辑 ---------- */
function loadCore() {
  const html = readFileSync(htmlPath, 'utf8');
  const begin = html.indexOf('/* ===== AI_CORE_BEGIN');
  const end = html.indexOf('/* ===== AI_CORE_END');
  if (begin < 0 || end < 0 || end <= begin) {
    console.error('错误：未能从 app.html 中找到 AI_CORE_BEGIN / AI_CORE_END 标记，无法提取核心逻辑。');
    process.exit(1);
  }
  const factorySrc = html.slice(begin, end);
  if (factorySrc.indexOf('function aiCoreTicTacToe') < 0) {
    console.error('错误：提取的片段中缺少 aiCoreTicTacToe 工厂函数，请检查 app.html 标记区。');
    process.exit(1);
  }
  const makeFactory = new Function(factorySrc + '\nreturn aiCoreTicTacToe;');
  return makeFactory()();
}

/* ---------- 可复现种子随机（mulberry32） ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 单局模拟 ---------- */
// 模式①②：完美 AI vs 随机对手。aiFirst 为 true 时 AI 执 X 先手
// 返回 { result: 'win' | 'draw' | 'lose', moves }（相对 AI 而言）
function playVsRandom(core, rng, aiFirst) {
  let state = core.freshGame('X');
  const aiMark = aiFirst ? 'X' : 'O';
  const oppMark = aiFirst ? 'O' : 'X';
  let moves = 0;
  while (!state.winner) {
    let i;
    if (state.turn === aiMark) {
      i = core.bestMove(state.board, aiMark, oppMark);
    } else {
      // 随机对手：等概率选一个空位
      const empties = [];
      for (let k = 0; k < 9; k++) if (!state.board[k]) empties.push(k);
      i = empties[Math.floor(rng() * empties.length)];
    }
    if (i === undefined || i < 0) break;   // 棋盘已满兜底
    state = core.stepGame(state, i);
    moves++;
  }
  const w = state.winner;
  return { result: w === aiMark ? 'win' : (w === 'D' ? 'draw' : 'lose'), moves };
}

// 模式③：完美 AI 自对弈（自动演示），双方都用完美 minimax，理论上全部平局
function playSelfPlay(core) {
  let state = core.freshGame('X');
  let moves = 0;
  while (!state.winner) {
    const i = core.bestMove(state.board, state.turn, state.turn === 'X' ? 'O' : 'X');
    if (i < 0) break;
    state = core.stepGame(state, i);
    moves++;
  }
  return { result: state.winner === 'D' ? 'draw' : 'win', moves };
}

/* ---------- 统计与输出 ---------- */
function runMode(title, runs, playOne) {
  let win = 0, draw = 0, lose = 0, sumMoves = 0, minMoves = 99, maxMoves = 0;
  for (let i = 0; i < runs; i++) {
    const r = playOne();
    if (r.result === 'win') win++;
    else if (r.result === 'draw') draw++;
    else lose++;
    sumMoves += r.moves;
    if (r.moves < minMoves) minMoves = r.moves;
    if (r.moves > maxMoves) maxMoves = r.moves;
  }
  const pct = (n) => ((n / runs) * 100).toFixed(1) + '%';
  console.log(title + ' · ' + runs + ' 局');
  console.log('  胜 ' + win + ' 局（' + pct(win) + '） · 平 ' + draw + ' 局（' + pct(draw) + '） · 负 ' + lose + ' 局（' + pct(lose) + '）');
  console.log('  平均每局落子数：' + (sumMoves / runs).toFixed(1) + '（最短 ' + minMoves + ' 步，最长 ' + maxMoves + ' 步）');
  return { win, draw, lose, runs };
}

const runs = Math.max(1, Number.parseInt(process.argv[2], 10) || 100);
const seed = (Number.parseInt(process.argv[3], 10) || 20261019) >>> 0;

const core = loadCore();
const rng = mulberry32(seed);

const t0 = Date.now();
console.log('================ 井字棋 AI 模拟报告 ================');
console.log('模拟模式：自动演示（井字棋无「得分」概念，平均分记 -1，改统计胜/平/负与对局长度）');
console.log('AI 核心：从 app.html AI_CORE_BEGIN / AI_CORE_END 提取，与页面同一份实现');
console.log('随机种子：' + seed + '（对手随机落子可复现）');
console.log('');

const m1 = runMode('【模式 1】完美 AI 先手（执 X）vs 随机对手', runs, () => playVsRandom(core, rng, true));
console.log('');
const m2 = runMode('【模式 2】完美 AI 后手（执 O）vs 随机对手', runs, () => playVsRandom(core, rng, false));
console.log('');
const m3 = runMode('【模式 3】完美 AI 自对弈（自动演示）', runs, () => playSelfPlay(core));
console.log('');

const totalLose = m1.lose + m2.lose + m3.lose;
const totalRuns = runs * 3;
if (totalLose === 0 && m3.draw === runs) {
  console.log('不败校验：三种模式共 ' + totalRuns + ' 局，AI 负场 0 局，自对弈全部平局 → 通过');
} else {
  console.log('不败校验：三种模式共 ' + totalRuns + ' 局，AI 负场 ' + totalLose + ' 局，自对弈平局 ' + m3.draw + ' 局 → 未通过，请检查 minimax 实现');
}
const elapsed = (Date.now() - t0) / 1000;
console.log('总耗时：' + elapsed.toFixed(1) + ' 秒（平均 ' + Math.round((elapsed * 1000) / totalRuns) + ' ms/局）');
