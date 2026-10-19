#!/usr/bin/env node
/* -*- coding: utf-8 -*-
 * 叠叠高 · AI 代玩离线模拟（不依赖浏览器，Node 直接运行）
 *
 * 用法：
 *   node tools/stack-tower/ai-sim.mjs [局数] [随机种子]
 *   例：node tools/stack-tower/ai-sim.mjs             → 默认 100 局，种子 20261019
 *       node tools/stack-tower/ai-sim.mjs 300         → 跑 300 局
 *       node tools/stack-tower/ai-sim.mjs 100 7       → 100 局，种子 7（结果可复现）
 *
 * 说明：
 *   - 游戏核心（状态创建 / 单步推进 / 放置判定 / AI 决策）直接从
 *     tools/stack-tower/app.html 的 TOWER_CORE_START / TOWER_CORE_END 标记之间
 *     提取执行，与页面 AI 严格同一份代码，杜绝两处实现漂移；
 *   - AI 算法：按当前移动块与塔顶的水平偏差计算对准时机——预测本帧移动后的
 *     新偏差，「立即放下」比「再走一帧」更接近对齐位则点击，误差不超过半帧
 *     位移，可稳定打出完美对齐回涨宽度；
 *   - 帧间隔按真实 rAF 建模：60fps 基准 ±12% 抖动，1.5% 概率 2~4 倍卡顿帧
 *     （页面侧同为每帧把真实 dt 交给同一决策函数）；
 *   - 本游戏是无尽堆叠、没有通关结局，故不统计「胜率」，改统计完美对齐率与
 *     封顶达成率；单局封顶 500 层（另设 10 分钟游戏时间上限作保险）。
 */
'use strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, 'app.html');

/* ---------- 从 app.html 提取与页面同源的纯逻辑核心 ---------- */
function loadCoreFactory() {
  const html = readFileSync(htmlPath, 'utf8');
  const begin = html.indexOf('// ===== TOWER_CORE_START =====');
  const end = html.indexOf('// ===== TOWER_CORE_END =====');
  if (begin < 0 || end < 0 || end <= begin) {
    console.error('错误：未能从 app.html 中找到 TOWER_CORE_START / TOWER_CORE_END 标记，无法提取游戏核心逻辑。');
    process.exit(1);
  }
  const coreSrc = html.slice(begin, end);
  if (coreSrc.indexOf('function createTowerCore') < 0) {
    console.error('错误：提取的片段中缺少 createTowerCore 工厂函数，请检查 app.html 标记区。');
    process.exit(1);
  }
  return new Function(coreSrc + '\nreturn createTowerCore;')();
}

/* ---------- 可复现种子随机（mulberry32，与 dino-run/ai-sim.mjs 同款） ---------- */
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

/* ---------- 帧间隔模型（模拟真实 rAF 抖动与偶发卡顿） ---------- */
function frameDt(rng) {
  if (rng() < 0.015) return (1 / 60) * (2 + rng() * 2);   // 1.5% 概率 2~4 倍卡顿帧
  return (1 / 60) * (0.88 + rng() * 0.24);                // 60fps 基准 ±12% 抖动
}

/* ---------- 单局模拟：AI 全程代玩，直到失误结束或达到封顶 ---------- */
const MAX_LAYERS = 500;            // 单局封顶层数
const MAX_FRAMES = 60 * 60 * 10;   // 单局封顶：10 分钟游戏时间（保险）

function simulateGame(core, rng) {
  const st = core.createState();
  let frames = 0, drops = 0, perfects = 0, maxCombo = 0;
  while (!st.over && st.stack.length - 1 < MAX_LAYERS && frames < MAX_FRAMES) {
    const dt = frameDt(rng);
    if (core.decide(st, dt)) {
      const ev = core.drop(st);
      if (ev) {
        drops++;
        if (ev.perfect) perfects++;
        if (st.combo > maxCombo) maxCombo = st.combo;
      }
    } else {
      core.step(st, dt);
    }
    frames++;
  }
  return {
    score: st.score,
    layers: st.stack.length - 1,
    bonus: st.bonus,
    drops: drops,
    perfects: perfects,
    maxCombo: maxCombo,
    reachedCap: st.stack.length - 1 >= MAX_LAYERS
  };
}

/* ---------- 统计与输出 ---------- */
function median(sorted) {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function main() {
  const argN = parseInt(process.argv[2], 10);
  const argSeed = parseInt(process.argv[3], 10);
  const games = Number.isFinite(argN) && argN > 0 ? argN : 100;
  const seed = Number.isFinite(argSeed) ? argSeed >>> 0 : 20261019;

  const createTowerCore = loadCoreFactory();
  const t0 = Date.now();
  const results = [];
  for (let i = 0; i < games; i++) {
    // 每局独立随机流：种子 + 局号，保证局间互不影响且整体可复现
    const rng = mulberry32((seed + i * 0x9E3779B9) >>> 0);
    const core = createTowerCore(rng);
    results.push(simulateGame(core, rng));
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const scores = results.map(r => r.score).sort((a, b) => a - b);
  const layers = results.map(r => r.layers).sort((a, b) => a - b);
  const sum = arr => arr.reduce((s, v) => s + v, 0);
  const avgScore = sum(scores) / games;
  const maxScore = scores[games - 1];
  const minScore = scores[0];
  const maxIdx = results.findIndex(r => r.score === maxScore) + 1;
  const totalDrops = sum(results.map(r => r.drops));
  const totalPerfects = sum(results.map(r => r.perfects));
  const avgCombo = sum(results.map(r => r.maxCombo)) / games;
  const capped = results.filter(r => r.reachedCap).length;
  const pct = n => (n / games * 100).toFixed(1) + '%';
  const over = v => scores.filter(s => s >= v).length;

  console.log('============ 叠叠高 · AI 代玩模拟报告 ============');
  console.log('模拟局数       : ' + games + '（随机种子 ' + seed + '，耗时 ' + elapsed + ' 秒）');
  console.log('AI 算法        : 偏差预测对准时机（立即放下 vs 再走一帧取更接近对齐位的一侧）');
  console.log('平均分         : ' + avgScore.toFixed(1));
  console.log('中位数分数     : ' + median(scores).toFixed(1));
  console.log('最高分         : ' + maxScore + '（第 ' + maxIdx + ' 局，堆叠 ' + results[maxIdx - 1].layers + ' 层）');
  console.log('最低分         : ' + minScore);
  console.log('平均层数       : ' + (sum(layers) / games).toFixed(1) + ' 层｜最多堆叠 ' + layers[games - 1] + ' 层（单局上限 ' + MAX_LAYERS + ' 层）');
  console.log('完美对齐率     : ' + (totalPerfects * 100 / totalDrops).toFixed(1) + '%（共放块 ' + totalDrops + ' 次，完美 ' + totalPerfects + ' 次）');
  console.log('平均最高连击   : ' + avgCombo.toFixed(1) + ' 连');
  console.log('封顶达成       : ' + capped + ' 局（' + pct(capped) + '，坚持到 ' + MAX_LAYERS + ' 层上限）');
  console.log('分数分布       : ≥8000 分 ' + over(8000) + ' 局（' + pct(over(8000)) + '）'
    + '｜≥12000 分 ' + over(12000) + ' 局（' + pct(over(12000)) + '）'
    + '｜≥16000 分 ' + over(16000) + ' 局（' + pct(over(16000)) + '）');
  console.log('备注           : 本游戏无尽堆叠、没有通关结局，胜率不适用，');
  console.log('                 以「封顶达成率」代替胜率；分数 = 层数 + 完美连击奖励。');
  console.log('                 以上为 AI 自动代玩统计，成绩不计入页面最高分纪录。');
  console.log('====================================================');
}

main();
