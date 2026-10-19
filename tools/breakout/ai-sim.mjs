#!/usr/bin/env node
/**
 * 打砖块 AI 模拟器（纯 Node 运行，无需浏览器）
 *
 * 用法：
 *   node tools/breakout/ai-sim.mjs          # 默认模拟 100 局
 *   node tools/breakout/ai-sim.mjs 300      # 自定义局数（正整数）
 *
 * 说明：
 * - 脚本读取同目录 app.html，提取 CORE-BEGIN/CORE-END 之间的纯逻辑核心
 *   （物理推进 + AI 决策）直接运行，保证模拟与页面实际逻辑完全一致。
 * - 打砖块没有固定「通关」终点，每局以「到达 30 关或 400000 帧（约 111 分钟游戏时长）」截断。
 * - 「整局未丢命比例」指 3 条命一条都没丢的局数占比，可作为 AI 稳定性（胜率）参考。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- 提取 app.html 中的纯逻辑核心 ----------
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'app.html'), 'utf8');
const matched = html.match(/\/\*CORE-BEGIN\*\/([\s\S]*?)\/\*CORE-END\*\//);
if (!matched) {
  console.error('错误：未能在 app.html 中找到 CORE-BEGIN/CORE-END 纯逻辑核心标记');
  process.exit(1);
}
const core = new Function(
  '"use strict";\n' + matched[1] +
  '\nreturn { coreCreateState, coreStep, coreLaunch, coreAiAction };'
)();

// ---------- 可复现的随机数（mulberry32） ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 模拟参数 ----------
const totalGames = Math.max(1, parseInt(process.argv[2], 10) || 100);
const LEVEL_CAP = 30;      // 单局关卡上限
const FRAME_CAP = 400000;  // 单局帧数上限（按 60fps 计）

// ---------- 逐局模拟 ----------
const scores = [], levels = [], lostList = [], framesList = [];
const endWay = { level: 0, dead: 0, frame: 0 };
let perfectGames = 0;      // 整局未丢命的局数
const t0 = Date.now();

for (let i = 0; i < totalGames; i++) {
  const g = core.coreCreateState(mulberry32((i + 1) * 0x9E3779B9));
  let frames = 0, lost = 0, prevLives = g.lives;
  while (!g.over && g.level <= LEVEL_CAP && frames < FRAME_CAP) {
    const act = core.coreAiAction(g);          // AI 决策（与页面同一份代码）
    g.keys.l = act.dir < 0;
    g.keys.r = act.dir > 0;
    if (act.launch) core.coreLaunch(g);
    core.coreStep(g, 1);                       // 单帧推进（k=1，即 60fps 标准步长）
    frames++;
    if (g.lives < prevLives) { lost += prevLives - g.lives; prevLives = g.lives; }
  }
  scores.push(Math.floor(g.score));
  levels.push(g.level);
  lostList.push(lost);
  framesList.push(frames);
  if (lost === 0) perfectGames++;
  if (g.over) endWay.dead++;
  else if (g.level > LEVEL_CAP) endWay.level++;
  else endWay.frame++;
}

// ---------- 中文统计输出 ----------
const sum = a => a.reduce((x, y) => x + y, 0);
const avg = a => sum(a) / a.length;
const max = a => Math.max(...a);
const min = a => Math.min(...a);

console.log('===== 打砖块 AI 模拟统计 =====');
console.log('模拟局数：' + totalGames);
console.log('平均分：' + avg(scores).toFixed(1) + '　最高分：' + max(scores) + '　最低分：' + min(scores));
console.log('平均到达关卡：' + avg(levels).toFixed(2) + '　最高关卡：' + max(levels) + '　最低关卡：' + min(levels));
console.log('平均丢命数：' + avg(lostList).toFixed(2) + '　整局未丢命比例：' + (perfectGames * 100 / totalGames).toFixed(1) + '%');
console.log('平均每局帧数：' + Math.round(avg(framesList)) + '（60fps 计约合 ' + (avg(framesList) / 3600).toFixed(1) + ' 分钟游戏时长）');
console.log('结束方式：达到关卡上限 ' + endWay.level + ' 局 · 生命耗尽 ' + endWay.dead + ' 局 · 帧数上限 ' + endWay.frame + ' 局');
console.log('每局截断规则：到达 ' + LEVEL_CAP + ' 关或 ' + FRAME_CAP + ' 帧即结束（打砖块无固定通关终点）');
console.log('模拟耗时：' + ((Date.now() - t0) / 1000).toFixed(2) + ' 秒（Node ' + process.version + '）');
