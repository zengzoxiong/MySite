/* ============================================================
 * 石头剪刀布 · AI 代玩离线模拟（不依赖浏览器，Node 直接运行）
 *
 * 用法：
 *   node tools/rock-paper-scissors/ai-sim.mjs [局数] [起始种子]
 *   例：node tools/rock-paper-scissors/ai-sim.mjs            → 默认 300 局，种子 20261019
 *       node tools/rock-paper-scissors/ai-sim.mjs 500 7      → 500 局，种子 7（结果可复现）
 *
 * 说明：
 *   - judgeRound / createState / applyRound / randomChoice / AI_CFG / beaterOf / loserOf /
 *     aiChoose 与 tools/rock-paper-scissors/app.html 内「纯函数核心」「AI 决策」完全一致，
 *     调参请两处同步修改；
 *   - 一局 = 连续对战 100 手。对手类型按顺序轮换：纯随机 / 偏好石头 / 循环出招 /
 *     惯性重复 / 反制我方上一手，另单独跑一组纯随机对手作为对照
 *     （AI 胜率应接近理论值 33%，说明 AI 不作弊也不被随机拖垮）；
 *   - 本游戏无传统得分概念，统计以胜率为主，得分按「每局胜场数」计（满分 100）。
 * ============================================================ */

'use strict';

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
const CHOICE_KEYS = ['rock', 'scissors', 'paper'];
const winRules = {
  rock: 'scissors',
  scissors: 'paper',
  paper: 'rock'
};

// 判定单手胜负：win 玩家胜 / lose 玩家负 / draw 平局
function judgeRound(player, computer) {
  if (player === computer) return 'draw';
  return winRules[player] === computer ? 'win' : 'lose';
}

// 新建对局状态
function createState() {
  return { playerScore: 0, computerScore: 0, drawScore: 0, rounds: [] };
}

// 单步推进：记录一手对战并累计比分，返回本手结果
function applyRound(state, player, computer) {
  const result = judgeRound(player, computer);
  if (result === 'win') state.playerScore++;
  else if (result === 'lose') state.computerScore++;
  else state.drawScore++;
  state.rounds.push({ player: player, computer: computer, result: result });
  return result;
}

// 重置对局状态
function resetState(state) {
  state.playerScore = 0;
  state.computerScore = 0;
  state.drawScore = 0;
  state.rounds = [];
}

// 均匀随机出招（rng 为 [0,1) 随机源）；电脑出招即用此函数
function randomChoice(rng) {
  return CHOICE_KEYS[Math.floor(rng() * CHOICE_KEYS.length)];
}

/* ---------- AI 决策（与 app.html 保持一致） ---------- */
const AI_CFG = {
  decay: 0.97,  // 预测得分的历史衰减，越近的对战越重要
  minRounds: 1, // 少于此手数不做预测，随机出招
  gate: 0.42    // 最佳模式的预测准确率下限，低于则判定对手无规律、随机出招
};

// 克制 move 的出招（beaterOf('rock') === 'paper'）
function beaterOf(move) {
  for (const k of CHOICE_KEYS) if (winRules[k] === move) return k;
  return CHOICE_KEYS[0];
}

// 被 move 克制的出招（loserOf('rock') === 'scissors'）
function loserOf(move) {
  return winRules[move];
}

// AI 决策：六种对手模式在线比拼预测准确率，取胜率最高的模式并出其最优响应。
// 模式：维持（重复自己上一手）/ 左旋（接自己上一手的败手）/ 右旋（接自己上一手的胜手）
//      / 反制（克制我方上一手）/ 镜像（模仿我方上一手）/ 频率（边际众数）；
// 各模式都预测不准（对手近似随机）时随机出招。
function aiChoose(rounds, rng) {
  const n = rounds.length;
  if (n < AI_CFG.minRounds) return randomChoice(rng);

  // 各模式对「对手下一手」的衰减预测正确量；freq 同时是衰减边际频率
  const scores = { stay: 0, rotL: 0, rotW: 0, beatM: 0, mirror: 0, freq: 0 };
  const freq = { rock: 0, scissors: 0, paper: 0 };
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      // 用 0..i-1 的历史给第 i 手打分，越近的对战权重越高
      const w = Math.pow(AI_CFG.decay, n - 1 - i);
      total += w;
      const oppPrev = rounds[i - 1].computer;
      const myPrev = rounds[i - 1].player;
      const actual = rounds[i].computer;
      if (actual === oppPrev) scores.stay += w;
      if (actual === loserOf(oppPrev)) scores.rotL += w;
      if (actual === beaterOf(oppPrev)) scores.rotW += w;
      if (actual === beaterOf(myPrev)) scores.beatM += w;
      if (actual === myPrev) scores.mirror += w;
      let mode = CHOICE_KEYS[0];
      for (const k of CHOICE_KEYS) if (freq[k] > freq[mode]) mode = k;
      if (actual === mode) scores.freq += w;
    }
    // 衰减推进边际频率，保证 freq 始终是「第 i 手之前」的加权频率
    for (const k of CHOICE_KEYS) freq[k] *= AI_CFG.decay;
    freq[rounds[i].computer] += 1;
  }

  const last = rounds[n - 1];
  let freqMode = CHOICE_KEYS[0];
  for (const k of CHOICE_KEYS) if (freq[k] > freq[freqMode]) freqMode = k;
  // 各模式对「对手下一手」的预测
  const preds = {
    stay: last.computer,
    rotL: loserOf(last.computer),
    rotW: beaterOf(last.computer),
    beatM: beaterOf(last.player),
    mirror: last.player,
    freq: freqMode
  };

  let best = 'stay';
  for (const k of Object.keys(scores)) if (scores[k] > scores[best]) best = k;
  // 各模式准确率都不如随机 ⇒ 对手无规律，随机出招
  if (total > 0 && scores[best] / total < AI_CFG.gate) return randomChoice(rng);
  return beaterOf(preds[best]);
}

/* ---------- 对手模型（仅模拟使用，app.html 中对手为纯随机电脑） ---------- */
const OPPONENT_TYPES = [
  { id: 0, name: '纯随机' },
  { id: 1, name: '偏好石头' },
  { id: 2, name: '循环出招' },
  { id: 3, name: '惯性重复' },
  { id: 4, name: '反制上一手' }
];

// 返回 bot 函数：(myLast, oppLast) => 对手出招
function makeBot(type, rng) {
  if (type === 1) {
    // 偏好石头：65% 出石头，其余随机
    return () => (rng() < 0.65 ? 'rock' : (rng() < 0.5 ? 'scissors' : 'paper'));
  }
  if (type === 2) {
    // 循环出招：石头→剪刀→布 循环
    const order = ['rock', 'scissors', 'paper'];
    let idx = Math.floor(rng() * 3);
    return () => {
      const m = order[idx];
      idx = (idx + 1) % 3;
      return m;
    };
  }
  if (type === 3) {
    // 惯性重复：70% 重复自己上一手
    let last = null;
    return () => {
      const m = (last !== null && rng() < 0.7) ? last : randomChoice(rng);
      last = m;
      return m;
    };
  }
  if (type === 4) {
    // 反制上一手：70% 出克制我方上一手的招
    return (myLast) => ((myLast !== null && rng() < 0.7) ? beaterOf(myLast) : randomChoice(rng));
  }
  // 纯随机
  return () => randomChoice(rng);
}

/* ---------- 单局模拟：一局 = 100 手 ---------- */
const ROUNDS_PER_MATCH = 100;

function simulateMatch(rng, type) {
  const state = createState();
  const bot = makeBot(type, rng);
  let myLast = null, oppLast = null;
  for (let i = 0; i < ROUNDS_PER_MATCH; i++) {
    const my = aiChoose(state.rounds, rng);
    const opp = bot(myLast, oppLast);
    applyRound(state, my, opp);
    myLast = my;
    oppLast = opp;
  }
  return { wins: state.playerScore, draws: state.drawScore, losses: state.computerScore };
}

/* ---------- 统计与输出 ---------- */
function rate(w, d, l) {
  const total = w + d + l;
  return (w / total * 100).toFixed(1) + '%';
}

function main() {
  const argN = parseInt(process.argv[2], 10);
  const argSeed = parseInt(process.argv[3], 10);
  const games = Number.isFinite(argN) && argN > 0 ? argN : 300;
  const seed = Number.isFinite(argSeed) ? argSeed >>> 0 : 20261019;

  const t0 = Date.now();
  const rng = mulberry32(seed);

  /* 主测试组：对手类型轮换 */
  const results = [];
  const perType = OPPONENT_TYPES.map(() => ({ wins: 0, draws: 0, losses: 0, matches: 0 }));
  for (let i = 0; i < games; i++) {
    const type = i % OPPONENT_TYPES.length;
    const r = simulateMatch(rng, type);
    results.push(r);
    const s = perType[type];
    s.wins += r.wins; s.draws += r.draws; s.losses += r.losses; s.matches++;
  }

  /* 对照组：全部纯随机对手（验证 AI 胜率接近理论 33%） */
  const ctrlGames = Math.min(100, games);
  let ctrlW = 0, ctrlD = 0, ctrlL = 0;
  for (let i = 0; i < ctrlGames; i++) {
    const r = simulateMatch(rng, 0);
    ctrlW += r.wins; ctrlD += r.draws; ctrlL += r.losses;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const sum = arr => arr.reduce((s, v) => s + v, 0);
  const winsArr = results.map(r => r.wins).sort((a, b) => a - b);
  const totalW = sum(winsArr), totalD = sum(results.map(r => r.draws)), totalL = sum(results.map(r => r.losses));
  const avgWins = totalW / games;

  console.log('============ 石头剪刀布 · AI 代玩模拟报告 ============');
  console.log('模拟局数       : ' + games + '（每局 ' + ROUNDS_PER_MATCH + ' 手，共 ' + (games * ROUNDS_PER_MATCH) + ' 手，随机种子 ' + seed + '，耗时 ' + elapsed + ' 秒）');
  console.log('对手构成       : ' + OPPONENT_TYPES.map((t, i) => t.name + ' ' + perType[i].matches + ' 局').join('｜'));
  console.log('总胜率         : ' + rate(totalW, totalD, totalL) + '（胜 ' + totalW + '｜平 ' + totalD + '｜负 ' + totalL + '）');
  console.log('平均每局胜场   : ' + avgWins.toFixed(1) + '｜最高 ' + winsArr[games - 1] + '｜中位 ' + winsArr[Math.floor(games / 2)] + '｜最低 ' + winsArr[0] + '（每局满分 ' + ROUNDS_PER_MATCH + '）');
  console.log('分对手胜率     : ' + OPPONENT_TYPES.map((t, i) => {
    const s = perType[i];
    return t.name + ' ' + rate(s.wins, s.draws, s.losses);
  }).join('｜'));
  console.log('纯随机对照组   : ' + ctrlGames + ' 局胜率 ' + rate(ctrlW, ctrlD, ctrlL) + '（理论值 33.3%，验证 AI 不被随机对手拖垮、也不虚高）');
  console.log('备注           : 本游戏无传统得分概念，得分按「每局胜场数」计；');
  console.log('                 AI 用六种模式（维持/左旋/右旋/反制/镜像/频率）在线比拼预测准确率，取胜率最高的模式出最优响应。');
  console.log('====================================================');
}

main();
