#!/usr/bin/env node
/* -*- coding: utf-8 -*-
 * 贪吃蛇 AI 模拟器（拾光集 · ai-sim.mjs）
 *
 * 用法：
 *   node tools/snake/ai-sim.mjs [局数] [起始种子]
 *   局数默认 100，起始种子默认 20261019（每局种子 = 起始种子 + 局号，结果可复现）
 * 示例：
 *   node tools/snake/ai-sim.mjs                # 按默认设置跑 100 局
 *   node tools/snake/ai-sim.mjs 300            # 跑 300 局
 *   node tools/snake/ai-sim.mjs 100 7          # 跑 100 局，种子从 7 开始
 *
 * 说明：
 *   - AI 核心逻辑（状态初始化 / 单步推进 / BFS 寻路 / 安全模拟 / AI 决策）直接
 *     从 app.html 的 AI_CORE_BEGIN / AI_CORE_END 标记之间提取执行，与页面 AI
 *     严格同一份代码，杜绝两处实现漂移。
 *   - 不依赖浏览器，纯 node 运行；食物随机位置用种子随机数，便于对比回归。
 *   - 每局规则与页面一致：24×24 网格，吃一个食物 +10 分，撞墙或咬到自己结束，
 *     蛇占满全场记「通关」；单局封顶 30000 步，防极端长局挂起。
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
    console.error('错误：未能从 app.html 中找到 AI_CORE_BEGIN / AI_CORE_END 标记，无法提取 AI 核心逻辑。');
    process.exit(1);
  }
  const factorySrc = html.slice(begin, end);
  if (factorySrc.indexOf('function aiCoreSnake') < 0) {
    console.error('错误：提取的片段中缺少 aiCoreSnake 工厂函数，请检查 app.html 标记区。');
    process.exit(1);
  }
  const makeFactory = new Function(factorySrc + '\nreturn aiCoreSnake;');
  return makeFactory()();
}

/* ---------- 种子随机数（mulberry32），同种子同结果 ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 单局模拟：AI 全程代玩，直到死亡、通关或步数封顶 ---------- */
const STEP_CAP = 30000;
function playOne(core, rng) {
  const st = core.initState(rng);
  let steps = 0;
  while (true) {
    const d = core.bestDir(st);
    const ev = core.advance(st, d || null, rng);
    steps++;
    if (ev === 'dead') return { score: st.score, len: st.snake.length, eaten: st.eaten, steps: steps, win: false, cause: st.cause, capped: false };
    if (ev === 'win') return { score: st.score, len: st.snake.length, eaten: st.eaten, steps: steps, win: true, cause: '', capped: false };
    if (steps >= STEP_CAP) return { score: st.score, len: st.snake.length, eaten: st.eaten, steps: steps, win: false, cause: 'cap', capped: true };
  }
}

/* ---------- 统计与输出 ---------- */
function median(sorted) {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}
const pct = (x, base) => (100 * x / base).toFixed(1) + '%';

function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const games = Math.max(1, parseInt(args[0], 10) || 100);
  const seed0 = parseInt(args[1], 10) || 20261019;

  const core = loadCore();
  const t0 = Date.now();
  const results = [];
  for (let i = 0; i < games; i++) {
    results.push(playOne(core, mulberry32(seed0 + i)));
    if (games >= 200 && (i + 1) % Math.ceil(games / 5) === 0) {
      console.log('进度：已完成 ' + (i + 1) + ' / ' + games + ' 局…');
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const scores = results.map(r => r.score).sort((a, b) => a - b);
  const lens = results.map(r => r.len);
  const sumScore = results.reduce((a, r) => a + r.score, 0);
  const sumLen = results.reduce((a, r) => a + r.len, 0);
  const sumEaten = results.reduce((a, r) => a + r.eaten, 0);
  const wins = results.filter(r => r.win).length;
  const capped = results.filter(r => r.capped).length;
  const wall = results.filter(r => r.cause === 'wall').length;
  const self = results.filter(r => r.cause === 'self').length;
  let maxIdx = 0;
  results.forEach((r, i) => { if (r.score > results[maxIdx].score) maxIdx = i; });
  const over = v => scores.filter(s => s >= v).length;

  console.log('===== 贪吃蛇 AI 模拟统计 =====');
  console.log('模拟局数       : ' + games + '（随机种子 ' + seed0 + ' 起，耗时 ' + elapsed + ' 秒）');
  console.log('通关局数       : ' + wins + '（胜率 ' + pct(wins, games) + '，24×24 全部吃满记通关）');
  console.log('平均得分       : ' + (sumScore / games).toFixed(1) + '（中位数 ' + median(scores) + '）');
  console.log('最高得分       : ' + results[maxIdx].score + '（第 ' + (maxIdx + 1) + ' 局，最终长度 ' + results[maxIdx].len + '）');
  console.log('最低得分       : ' + scores[0]);
  console.log('平均最终长度   : ' + (sumLen / games).toFixed(1) + '（最长 ' + Math.max(...lens) + '，最短 ' + Math.min(...lens) + '）');
  console.log('平均吃食数     : ' + (sumEaten / games).toFixed(1) + ' 个（每食 +10 分）');
  console.log('死亡原因       : 撞墙 ' + wall + ' 局（' + pct(wall, games) + '）｜咬到自己 ' + self + ' 局（' + pct(self, games) + '）｜步数封顶 ' + capped + ' 局');
  console.log('得分分布       : ≥200 分 ' + over(200) + ' 局（' + pct(over(200), games) + '）'
    + '｜≥500 分 ' + over(500) + ' 局（' + pct(over(500), games) + '）'
    + '｜≥1000 分 ' + over(1000) + ' 局（' + pct(over(1000), games) + '）'
    + '｜≥2000 分 ' + over(2000) + ' 局（' + pct(over(2000), games) + '）');
  console.log('备注           : 每吃一个食物 +10 分、蛇长 +1；「通关」指蛇占满 24×24 全场，');
  console.log('                 正常对局极难达成，胜率接近 0 属预期；单局封顶 ' + STEP_CAP + ' 步防挂起。');
}

main();
