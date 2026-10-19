#!/usr/bin/env node
/* -*- coding: utf-8 -*-
 * 恐龙快跑 · AI 代玩离线模拟（不依赖浏览器，Node 直接运行）
 *
 * 用法：
 *   node tools/dino-run/ai-sim.mjs [局数] [随机种子]
 *   例：node tools/dino-run/ai-sim.mjs             → 默认 200 局，种子 20261019
 *       node tools/dino-run/ai-sim.mjs 500         → 跑 500 局
 *       node tools/dino-run/ai-sim.mjs 100 7       → 100 局，种子 7（结果可复现）
 *
 * 说明：
 *   - 游戏核心（状态创建 / 单步推进 / 碰撞判定 / AI 决策）直接从
 *     tools/dino-run/app.html 的 DINO_CORE_START / DINO_CORE_END 标记之间
 *     提取执行，与页面 AI 严格同一份代码，杜绝两处实现漂移；
 *   - AI 算法：按最近障碍物距离阈值决定跳跃或下蹲——仙人掌与低空翼龙进入
 *     约 16 帧提前量即起跳，中高空翼龙站立即可通过，下落阶段前方无障碍时
 *     按住下蹲加速落地；
 *   - 本游戏是无尽跑酷，没有胜负结局，故不统计「胜率」，改统计存活时长与
 *     死亡原因分布；单局封顶模拟 10 分钟游戏时间（18000 帧 @60fps），
 *     达到上限记为「坚持到底」；
 *   - 每帧推进与页面 60fps 主循环一致（k=1）。
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
  const begin = html.indexOf('// ===== DINO_CORE_START =====');
  const end = html.indexOf('// ===== DINO_CORE_END =====');
  if (begin < 0 || end < 0 || end <= begin) {
    console.error('错误：未能从 app.html 中找到 DINO_CORE_START / DINO_CORE_END 标记，无法提取游戏核心逻辑。');
    process.exit(1);
  }
  const coreSrc = html.slice(begin, end);
  if (coreSrc.indexOf('function createDinoCore') < 0) {
    console.error('错误：提取的片段中缺少 createDinoCore 工厂函数，请检查 app.html 标记区。');
    process.exit(1);
  }
  return new Function(coreSrc + '\nreturn createDinoCore;')();
}

/* ---------- 可复现种子随机（mulberry32，与 dodge/ai-sim.mjs 同款） ---------- */
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

/* ---------- 单局模拟：AI 全程代玩，直到撞上障碍或达到时间上限 ---------- */
const MAX_FRAMES = 60 * 60 * 10;   // 单局封顶：10 分钟游戏时间

function simulateGame(core) {
  const st = core.createState();
  let frames = 0;
  while (!st.over && frames < MAX_FRAMES) {
    const input = core.decide(st);   // AI 决策（与页面同源）
    core.step(st, input, 1);         // 单步推进（与页面 k=1 一致）
    frames++;
  }
  return {
    score: Math.floor(st.score),
    seconds: frames / 60,
    survived: !st.over,              // 到达时间上限 = 坚持到底
    overBy: st.overBy                // 'cactus' | 'bird' | null
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
  const games = Number.isFinite(argN) && argN > 0 ? argN : 200;
  const seed = Number.isFinite(argSeed) ? argSeed >>> 0 : 20261019;

  const createDinoCore = loadCoreFactory();
  const t0 = Date.now();
  const results = [];
  for (let i = 0; i < games; i++) {
    // 每局独立随机流：种子 + 局号，保证局间互不影响且整体可复现
    const core = createDinoCore(mulberry32((seed + i * 0x9E3779B9) >>> 0));
    results.push(simulateGame(core));
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const scores = results.map(r => r.score).sort((a, b) => a - b);
  const times = results.map(r => r.seconds).sort((a, b) => a - b);
  const sum = arr => arr.reduce((s, v) => s + v, 0);
  const avgScore = sum(scores) / games;
  const maxScore = scores[games - 1];
  const minScore = scores[0];
  const maxIdx = results.findIndex(r => r.score === maxScore) + 1;
  const byCactus = results.filter(r => r.overBy === 'cactus').length;
  const byBird = results.filter(r => r.overBy === 'bird').length;
  const survived = results.filter(r => r.survived).length;
  const pct = n => (n / games * 100).toFixed(1) + '%';
  const over = v => scores.filter(s => s >= v).length;

  console.log('============ 恐龙快跑 · AI 代玩模拟报告 ============');
  console.log('模拟局数       : ' + games + '（随机种子 ' + seed + '，耗时 ' + elapsed + ' 秒）');
  console.log('平均得分       : ' + avgScore.toFixed(1));
  console.log('中位数得分     : ' + median(scores).toFixed(1));
  console.log('最高得分       : ' + maxScore + '（第 ' + maxIdx + ' 局，存活 ' + (results[maxIdx - 1].seconds).toFixed(1) + ' 秒）');
  console.log('最低得分       : ' + minScore);
  console.log('平均存活       : ' + (sum(times) / games).toFixed(1) + ' 秒｜最长存活 ' + times[games - 1].toFixed(1) + ' 秒');
  console.log('坚持到底       : ' + survived + ' 局（' + pct(survived) + '，单局上限 10 分钟）');
  console.log('死亡原因       : 撞仙人掌 ' + byCactus + ' 局（' + pct(byCactus) + '）'
    + '｜撞翼龙 ' + byBird + ' 局（' + pct(byBird) + '）');
  console.log('得分分布       : ≥300 分 ' + over(300) + ' 局（' + pct(over(300)) + '）'
    + '｜≥800 分 ' + over(800) + ' 局（' + pct(over(800)) + '）'
    + '｜≥2000 分 ' + over(2000) + ' 局（' + pct(over(2000)) + '）');
  console.log('备注           : 本游戏是无尽跑酷，没有通关/胜负结局，胜率不适用；');
  console.log('                 以上为 AI 自动代玩统计，成绩不计入页面最高分纪录。');
  console.log('====================================================');
}

main();
