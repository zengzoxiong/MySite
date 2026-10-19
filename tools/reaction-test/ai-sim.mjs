/* ============================================================
 * 手速反应测试 · AI 代玩离线模拟（不依赖浏览器，Node 直接运行）
 *
 * 用法：
 *   node tools/reaction-test/ai-sim.mjs [局数] [起始种子]
 *   例：node tools/reaction-test/ai-sim.mjs            → 默认每模式 300 组，种子 20261019
 *       node tools/reaction-test/ai-sim.mjs 1000 7     → 每模式 1000 组，种子 7（结果可复现）
 *
 * 说明：
 *   - 本文件内 freshReactCore / reactStartCore / reactAdvanceCore / reactClickCore /
 *     freshAimCore / aimStartCore / spawnTargetCore / aimAdvanceCore / aimHitCore /
 *     aimPadClickCore 与 tools/reaction-test/app.html 内「纯函数核心」玩法规则完全一致；
 *   - AI_CFG / aiReactDelayMs / aiAimDelayMs / aiReactAction / aiAimAction / aiTickCore
 *     与 app.html 内「AI 决策」保持一致，调参时请两处同步修改；
 *   - AI 算法：监听信号自动触发点击——信号未现绝不点击（零抢跳），信号在场后按
 *     模拟人类的反应延迟（经典反应 175~265ms，瞄准测试 165~255ms）点击；
 *   - 模拟按 5ms 步长推进虚拟时钟；一「局」= 5 轮一组的平均成绩，每组前重置状态
 *     （等价于 UI 的「重置本轮」），各组均为独立的 5 轮平均；
 *   - 本游戏测反应毫秒（越低越好），无得分 / 胜负概念，故按自动化演示模式统计：
 *     报告反应时间与抢跳率、命中率，不统计平均分（最终结果 avgScore 记 -1）。
 * ============================================================ */

'use strict';

/* ---------- 基本常量（与 app.html 一致） ---------- */
const ROUNDS = 5;            // 每组轮数
const STEP_MS = 5;           // 虚拟时钟步长（毫秒）
const MAX_GROUP_MS = 120000; // 单组安全上限，防止意外死循环
const PAD_W = 560, PAD_H = 300;   // 瞄准面板近似尺寸（仅用于目标几何，不影响 AI 决策）

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

/* ---------- 纯函数核心（与 app.html 保持一致） ---------- */
function avgOf(arr) { return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length); }

/* ---- 经典反应核心 ---- */
function freshReactCore() { return { phase: 'idle', results: [], greenAt: 0, t0: 0, coolUntil: 0 }; }
function reactWaitMs(rng) { return 1000 + rng() * 4000; }          // 信号随机 1 至 5 秒后出现
function reactStartCore(s, now, rng) { s.phase = 'waiting'; s.greenAt = now + reactWaitMs(rng); }
function reactAdvanceCore(s, now) {                                 // 等待期结束 → 变绿
  if (s.phase === 'waiting' && now >= s.greenAt) { s.phase = 'ready'; s.t0 = now; }
}
/* 面板点击单步：返回 'ignore' 冷却中 / 'start' 开新一轮 / 'fail' 抢跳 / 'hit' 命中一轮 / 'done' 整组完成 */
function reactClickCore(s, now, rng) {
  if (now < s.coolUntil) return 'ignore';
  if (s.phase === 'idle' || s.phase === 'done' || s.phase === 'fail') { reactStartCore(s, now, rng); return 'start'; }
  if (s.phase === 'waiting') { s.phase = 'fail'; s.coolUntil = now + 600; return 'fail'; }
  if (s.phase === 'ready') {
    s.results.push(Math.round(now - s.t0));
    if (s.results.length >= ROUNDS) { s.phase = 'done'; return 'done'; }
    s.phase = 'idle';
    s.coolUntil = now + 350;
    return 'hit';
  }
  return 'ignore';
}

/* ---- 瞄准测试核心 ---- */
function freshAimCore() { return { phase: 'idle', results: [], showAt: 0, t0: 0, coolUntil: 0 }; }
function aimWaitMs(rng) { return 400 + rng() * 600; }               // 目标出现前随机 0.4 至 1 秒
function aimStartCore(s, now, rng) { s.phase = 'waiting'; s.showAt = now + aimWaitMs(rng); }
/* 目标生成：面板内随机位置，留 10 像素边距，尺寸 44 至 64 像素 */
function spawnTargetCore(rng, padW, padH) {
  const size = 44 + rng() * 20;
  const margin = 10;
  return {
    size: size,
    x: margin + rng() * Math.max(1, padW - size - margin * 2),
    y: margin + rng() * Math.max(1, padH - size - margin * 2)
  };
}
/* 时间推进：等待期结束则目标出现，返回目标几何参数（未出现返回 null） */
function aimAdvanceCore(s, now, rng, padW, padH) {
  if (s.phase !== 'waiting' || now < s.showAt) return null;
  s.phase = 'targeting';
  s.t0 = now;
  return spawnTargetCore(rng, padW, padH);
}
/* 命中目标单步：返回 'ignore' / 'hit' / 'done' */
function aimHitCore(s, now) {
  if (s.phase !== 'targeting') return 'ignore';
  s.results.push(Math.round(now - s.t0));
  if (s.results.length >= ROUNDS) { s.phase = 'done'; return 'done'; }
  s.phase = 'idle';
  s.coolUntil = now + 350;
  return 'hit';
}
/* 面板点击单步：等待 / 目标在场时点空不惩罚，故只处理 idle / done 的开局 */
function aimPadClickCore(s, now, rng) {
  if (now < s.coolUntil) return 'ignore';
  if (s.phase === 'idle' || s.phase === 'done') { aimStartCore(s, now, rng); return 'start'; }
  return 'ignore';
}

/* ---------- AI 决策（与 app.html 保持一致） ---------- */
const AI_CFG = {
  reactMin: 175, reactMax: 265,   // 经典反应：变绿后的反应延迟区间（毫秒）
  aimMin: 165, aimMax: 255        // 瞄准测试：目标出现后的反应延迟区间（毫秒）
};
function aiReactDelayMs(rng) { return AI_CFG.reactMin + rng() * (AI_CFG.reactMax - AI_CFG.reactMin); }
function aiAimDelayMs(rng) { return AI_CFG.aimMin + rng() * (AI_CFG.aimMax - AI_CFG.aimMin); }
/* 决策（只读纯状态）：'tap' 开始/续一轮，'fire' 信号在场可点击，'wait' 继续守信号 */
function aiReactAction(s) {
  if (s.phase === 'idle' || s.phase === 'done' || s.phase === 'fail') return 'tap';
  if (s.phase === 'ready') return 'fire';
  return 'wait';   // waiting：守着信号，绝不抢跳
}
function aiAimAction(s) {
  if (s.phase === 'idle' || s.phase === 'done') return 'tap';
  if (s.phase === 'targeting') return 'fire';
  return 'wait';
}
/* 控制器单步：观测到信号的瞬间定好点击时刻（信号时刻 + 反应延迟），到点才触发 */
function aiTickCore(ctrl, action, now, rng, delayFn) {
  if (action !== 'fire') { ctrl.fireAt = null; return action; }
  if (ctrl.fireAt === null) ctrl.fireAt = now + delayFn(rng);
  if (now >= ctrl.fireAt) { ctrl.fireAt = null; return 'fire'; }
  return 'wait';
}

/* ---------- 单组模拟（一组 = 5 轮，返回组平均与明细） ---------- */
function simulateReactGroup(rng) {
  const s = freshReactCore();
  const ctrl = { fireAt: null };
  let now = 0, fails = 0;
  while (s.phase !== 'done') {
    if (now > MAX_GROUP_MS) throw new Error('经典反应单组模拟超时');
    reactAdvanceCore(s, now);
    const act = aiTickCore(ctrl, aiReactAction(s), now, rng, aiReactDelayMs);
    if (act === 'tap' || act === 'fire') {
      const ev = reactClickCore(s, now, rng);
      if (ev === 'fail') fails++;   // 抢跳：AI 只在信号后点击，理论上恒为 0
    }
    now += STEP_MS;
  }
  return { avg: avgOf(s.results), rounds: s.results.slice(), fails: fails };
}

function simulateAimGroup(rng) {
  const s = freshAimCore();
  const ctrl = { fireAt: null };
  let now = 0, misses = 0;
  while (s.phase !== 'done') {
    if (now > MAX_GROUP_MS) throw new Error('瞄准测试单组模拟超时');
    const t = aimAdvanceCore(s, now, rng, PAD_W, PAD_H);
    if (t) { /* 目标几何仅用于渲染，模拟中无需使用 */ }
    const act = aiTickCore(ctrl, aiAimAction(s), now, rng, aiAimDelayMs);
    if (act === 'tap') aimPadClickCore(s, now, rng);
    else if (act === 'fire') {
      const ev = aimHitCore(s, now);
      if (ev === 'ignore') misses++;   // 未点中目标：AI 只在目标在场时点击，理论上恒为 0
    }
    now += STEP_MS;
  }
  return { avg: avgOf(s.results), rounds: s.results.slice(), misses: misses };
}

/* ---------- 统计与输出 ---------- */
function median(sorted) {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2);
}
function pct(n, total) { return (n / total * 100).toFixed(1) + '%'; }

function reportMode(title, groups, keyErr, errName, seedNote) {
  const avgs = groups.map(g => g.avg).sort((a, b) => a - b);
  const rounds = [];
  let err = 0;
  for (const g of groups) {
    for (const r of g.rounds) rounds.push(r);
    err += g[keyErr];
  }
  rounds.sort((a, b) => a - b);
  const n = groups.length;
  const sum = arr => arr.reduce((s, v) => s + v, 0);
  const avgAll = sum(avgs) / n;
  const bestIdx = groups.findIndex(g => g.avg === avgs[0]) + 1;
  const over250 = avgs.filter(v => v <= 250).length;   // “胜率”口径：组平均快于人类均值 250ms

  console.log('—— ' + title + '（' + n + ' 组 × ' + ROUNDS + ' 轮）——');
  console.log('平均每组平均   : ' + avgAll.toFixed(1) + ' ms（全部 ' + rounds.length + ' 轮总平均 ' + (sum(rounds) / rounds.length).toFixed(1) + ' ms）');
  console.log('中位数组平均   : ' + median(avgs) + ' ms');
  console.log('最佳组平均     : ' + avgs[0] + ' ms（第 ' + bestIdx + ' 组）');
  console.log('最差组平均     : ' + avgs[n - 1] + ' ms');
  console.log('单轮最快       : ' + rounds[0] + ' ms｜单轮最慢 ' + rounds[rounds.length - 1] + ' ms');
  console.log(errName + '       : ' + err + '（' + pct(err, rounds.length) + '）');
  console.log('基准胜率       : ' + over250 + '/' + n + '（' + pct(over250, n) + '）  ← 无胜负概念，以组平均快于人类均值 250ms 为“胜”');
  if (seedNote) console.log(seedNote);
}

function main() {
  const argN = parseInt(process.argv[2], 10);
  const argSeed = parseInt(process.argv[3], 10);
  const games = Number.isFinite(argN) && argN > 0 ? argN : 300;
  const seed = Number.isFinite(argSeed) ? argSeed >>> 0 : 20261019;

  const t0 = Date.now();
  const rng = mulberry32(seed);
  const reactGroups = [], aimGroups = [];
  for (let i = 0; i < games; i++) reactGroups.push(simulateReactGroup(rng));
  for (let i = 0; i < games; i++) aimGroups.push(simulateAimGroup(rng));
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('============ 手速反应测试 · AI 代玩模拟报告 ============');
  console.log('模拟局数       : 每模式 ' + games + ' 组 × ' + ROUNDS + ' 轮（共 ' + (games * 2) + ' 组 '
    + (games * ROUNDS * 2) + ' 轮，随机种子 ' + seed + '，耗时 ' + elapsed + ' 秒）');
  reportMode('经典反应', reactGroups, 'fails', '抢跳次数', null);
  reportMode('瞄准测试', aimGroups, 'misses', '点空次数', null);
  console.log('备注           : 本游戏测反应毫秒（越低越好），无得分 / 胜负概念，');
  console.log('                 故按自动化演示模式统计，不计平均分（avgScore 记 -1）；');
  console.log('                 AI 只监听信号后触发点击（延迟 ' + AI_CFG.reactMin + '~' + AI_CFG.reactMax + ' / '
    + AI_CFG.aimMin + '~' + AI_CFG.aimMax + ' ms），信号未现绝不点击，理论零抢跳。');
  console.log('====================================================');
}

main();
