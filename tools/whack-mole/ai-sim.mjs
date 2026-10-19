#!/usr/bin/env node
/* -*- coding: utf-8 -*-
 * 打地鼠 · AI 代玩离线模拟（拾光集 · ai-sim.mjs）
 *
 * 用法：
 *   node tools/whack-mole/ai-sim.mjs [局数] [随机种子]
 *   例：node tools/whack-mole/ai-sim.mjs             → 默认 200 局，种子 20261019
 *       node tools/whack-mole/ai-sim.mjs 500         → 跑 500 局
 *       node tools/whack-mole/ai-sim.mjs 100 7       → 100 局，种子 7（结果可复现）
 *
 * 说明：
 *   - 游戏核心（状态创建 / 单步推进 / 命中结算 / AI 决策）直接从
 *     tools/whack-mole/app.html 的 WHACK_CORE_START / WHACK_CORE_END 标记之间
 *     提取执行，与页面 AI 严格同一份代码，杜绝两处实现漂移；
 *   - AI 算法：定时扫描（每 AI_TICK_MS = 60 毫秒，与页面同源），只敲冒头且
 *     未敲过的地鼠，多只同时冒头优先敲快收回的，炸弹一律不碰；
 *   - 每局 30 秒与页面规则一致：敲地鼠 10 分起、连击每连 +2 加成最高 +20
 *     （连击第 10 次起单次 30 分），误点炸弹扣 20 分并清空连击；
 *   - 本游戏是限时得分制，没有胜负结局，故不统计「胜率」，改统计地鼠命中率
 *     与炸弹回避率；模拟步长 20 毫秒，AI 按 AI_TICK_MS 节拍决策。
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
  const begin = html.indexOf('/* ===== WHACK_CORE_START');
  const end = html.indexOf('/* ===== WHACK_CORE_END');
  if (begin < 0 || end < 0 || end <= begin) {
    console.error('错误：未能从 app.html 中找到 WHACK_CORE_START / WHACK_CORE_END 标记，无法提取游戏核心逻辑。');
    process.exit(1);
  }
  const coreSrc = html.slice(begin, end);
  if (coreSrc.indexOf('function createWhackCore') < 0) {
    console.error('错误：提取的片段中缺少 createWhackCore 工厂函数，请检查 app.html 标记区。');
    process.exit(1);
  }
  return new Function(coreSrc + '\nreturn createWhackCore;')();
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

/* ---------- 单局模拟：AI 全程代玩 30 秒直到时间到 ---------- */
const DT = 20;   // 模拟步长（毫秒），页面主循环为 rAF 真实时间推进，语义一致

function simulateGame(core) {
  const st = core.createState();
  const prevUp = new Array(9).fill(false);
  let aiClock = 0, strikes = 0, molesHit = 0, bombsHit = 0;
  let molesShown = 0, bombsShown = 0, maxCombo = 0;
  while (st.playing) {
    aiClock -= DT;
    if (aiClock <= 0) {
      aiClock += core.AI_TICK_MS;
      const i = core.decide(st);
      if (i >= 0) {
        const res = core.hit(st, i);
        if (res) {
          strikes++;
          if (res.bomb) bombsHit++; else molesHit++;
        }
      }
    }
    core.step(st, DT);
    for (let j = 0; j < 9; j++) {
      const h = st.holes[j];
      if (h.up && !prevUp[j]) {
        if (h.kind === 2) bombsShown++; else molesShown++;
      }
      prevUp[j] = h.up;
    }
    if (st.combo > maxCombo) maxCombo = st.combo;
  }
  return {
    score: st.score, strikes: strikes, maxCombo: maxCombo,
    molesHit: molesHit, molesShown: molesShown,
    bombsHit: bombsHit, bombsShown: bombsShown
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

  const createWhackCore = loadCoreFactory();
  const t0 = Date.now();
  const results = [];
  for (let i = 0; i < games; i++) {
    // 每局独立随机流：种子 + 局号，保证局间互不影响且整体可复现
    const core = createWhackCore(mulberry32((seed + i * 0x9E3779B9) >>> 0));
    results.push(simulateGame(core));
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const scores = results.map(r => r.score).sort((a, b) => a - b);
  const sum = arr => arr.reduce((s, v) => s + v, 0);
  const avgScore = sum(scores) / games;
  const maxScore = scores[games - 1];
  const minScore = scores[0];
  const maxIdx = results.findIndex(r => r.score === maxScore) + 1;
  const sumOf = f => sum(results.map(f));
  const molesHit = sumOf(r => r.molesHit), molesShown = sumOf(r => r.molesShown);
  const bombsHit = sumOf(r => r.bombsHit), bombsShown = sumOf(r => r.bombsShown);
  const strikes = sumOf(r => r.strikes);
  const pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '—';
  const over = v => scores.filter(s => s >= v).length;

  console.log('============ 打地鼠 · AI 代玩模拟报告 ============');
  console.log('模拟局数       : ' + games + '（每局 30 秒，随机种子 ' + seed + '，耗时 ' + elapsed + ' 秒）');
  console.log('平均得分       : ' + avgScore.toFixed(1));
  console.log('中位数得分     : ' + median(scores).toFixed(1));
  console.log('最高得分       : ' + maxScore + '（第 ' + maxIdx + ' 局）');
  console.log('最低得分       : ' + minScore);
  console.log('平均连击峰值   : ' + (sumOf(r => r.maxCombo) / games).toFixed(1) + ' 连击');
  console.log('地鼠命中率     : 命中 ' + molesHit + ' / 冒头 ' + molesShown + '（' + pct(molesHit, molesShown) + '）');
  console.log('炸弹回避率     : 未点 ' + (bombsShown - bombsHit) + ' / 冒头 ' + bombsShown
    + '（' + pct(bombsShown - bombsHit, bombsShown) + '）｜误点炸弹 ' + bombsHit + ' 次');
  console.log('平均敲击次数   : ' + (strikes / games).toFixed(1) + ' 次 / 局');
  console.log('得分分布       : ≥500 分 ' + over(500) + ' 局（' + pct(over(500), games) + '）'
    + '｜≥800 分 ' + over(800) + ' 局（' + pct(over(800), games) + '）'
    + '｜≥1000 分 ' + over(1000) + ' 局（' + pct(over(1000), games) + '）');
  console.log('备注           : 本游戏是 30 秒限时得分制，没有胜负结局，胜率不适用；');
  console.log('                 以上为 AI 自动代玩统计，成绩不计入页面最高分纪录。');
  console.log('====================================================');
}

main();
