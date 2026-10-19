#!/usr/bin/env node
/**
 * 猜数字（1A2B）AI 代玩模拟器（无浏览器依赖，Node 直接运行）
 *
 * 用法：
 *   node tools/bulls-cows/ai-sim.mjs [局数]
 *   局数可省略（默认 200），例如：node tools/bulls-cows/ai-sim.mjs 1000
 *
 * 说明：
 *   - 下方「纯函数核心」与 tools/bulls-cows/app.html 中的实现保持一致
 *     （判分、单步推进、候选过滤、选点），改动时请两处同步。
 *   - AI 策略：候选集逐步过滤 + log1p 代价选波束 + 两层前瞻选点（首猜由对称性固定为 0123）。
 *   - 得分规则与页面一致：共 8 次机会，第 n 次猜中得 8-n 分，未猜中得 0 分。
 */

'use strict';

const MAX_TRIES = 8;

// ===== 纯函数核心（与 app.html 保持一致） =====

// 判分：A=数字与位置都对，B=数字对但位置不对
function judgeSecret(guess, secret) {
  let a = 0, b = 0;
  for (let i = 0; i < 4; i++) {
    if (guess[i] === secret[i]) a++;
    else if (secret.indexOf(guess[i]) >= 0) b++;
  }
  return { a, b };
}

// 单步推进：给定对局状态与一次猜测，返回新历史与判定结果
function stepGame(state, guess) {
  const { a, b } = judgeSecret(guess, state.secret);
  const history = state.history.concat([{ guess, a, b }]);
  const win = a === 4;
  const over = win || history.length >= MAX_TRIES;
  const score = win ? MAX_TRIES - history.length : 0;   // 越早猜中分越高
  return { history, a, b, win, over, score };
}

// 生成 4 位不重复数字（0-9 洗牌取前 4，允许 0 开头）
function makeSecret() {
  const pool = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  return pool.slice(0, 4).join('');
}

// 全部可能猜测：0-9 中取 4 个不重复数字的排列，共 5040 个（允许 0 开头）
function buildAllGuesses() {
  const out = [];
  (function rec(s, used) {
    if (s.length === 4) { out.push(s); return; }
    for (let d = 0; d <= 9; d++) {
      if (used & (1 << d)) continue;
      rec(s + d, used | (1 << d));
    }
  })('', 0);
  return out;
}

// 候选过滤：保留与全部历史反馈一致的候选（把候选当假想答案来判分）
function filterCandidates(cands, history) {
  return cands.filter(c => history.every(h => {
    const r = judgeSecret(h.guess, c);
    return r.a === h.a && r.b === h.b;
  }));
}

// ---------- AI 决策 ----------
let AI_TABLES = null;   // 懒加载：5040 个猜测的扁平数字表与索引

function aiEnsureTables() {
  if (AI_TABLES) return AI_TABLES;
  const list = buildAllGuesses();
  const flat = new Uint8Array(list.length * 4);
  const index = new Map();
  for (let i = 0; i < list.length; i++) {
    index.set(list[i], i);
    for (let k = 0; k < 4; k++) flat[i * 4 + k] = list[i].charCodeAt(k) - 48;
  }
  const pop = new Uint8Array(1024);              // 10 位掩码中 1 的个数
  for (let m = 1; m < 1024; m++) pop[m] = pop[m >> 1] + (m & 1);
  const lg = new Float64Array(list.length + 2);  // 预计算 log2(i)，代价计算会用到 log2(c+1)
  for (let i = 2; i <= list.length + 1; i++) lg[i] = Math.log2(i);
  AI_TABLES = { list, flat, index, pop, lg };
  return AI_TABLES;
}

const AI_BEAM = 30;   // 两层前瞻的波束宽度：一层最优的前 30 个猜测进入二层精评

// 反馈分桶：把候选按「猜 gi 会得到的反馈」计数（反馈码 a*5+b，20 即 4A0B）
function aiBucketCounts(T, gi, ci, n, buckets) {
  buckets.fill(0);
  const p = gi * 4;
  const g0 = T.flat[p], g1 = T.flat[p + 1], g2 = T.flat[p + 2], g3 = T.flat[p + 3];
  const gm = (1 << g0) | (1 << g1) | (1 << g2) | (1 << g3);
  for (let k = 0; k < n; k++) {
    const q = ci[k] * 4;
    const c0 = T.flat[q], c1 = T.flat[q + 1], c2 = T.flat[q + 2], c3 = T.flat[q + 3];
    let a = 0;
    if (c0 === g0) a++;
    if (c1 === g1) a++;
    if (c2 === g2) a++;
    if (c3 === g3) a++;
    const inter = gm & ((1 << c0) | (1 << c1) | (1 << c2) | (1 << c3));
    buckets[a * 5 + (T.pop[inter] - a)]++;       // B = 数字交集数 - A
  }
}

// log1p 期望代价：Σ c·log2(1+c)/n（4A0B 桶是已猜中，不计后续），越小分支越均匀
function aiLog1pCost(T, buckets, n) {
  let s = 0;
  for (let t = 0; t < 25; t++) {
    if (t === 20) continue;
    const c = buckets[t];
    if (c) s += c * T.lg[c + 1];
  }
  return s / n;
}

// 在候选集上挑期望总代价最小的猜测（log1p 分桶 + 两层前瞻）：
// 一层对全部 5040 个猜测打分取前 AI_BEAM 个；二层对每个猜测的每个反馈分支再求最佳下一击，
// 取 1 + Σ(分支占比 × 分支内最小代价) 最小者。同分时优先选本身仍是候选的猜测，微弱加分 1e-6。
function aiChooseGuess(cands) {
  const T = aiEnsureTables();
  const n = cands.length;
  if (n === 1) return cands[0];
  const ci = new Int32Array(n);
  const inC = new Uint8Array(T.list.length);
  for (let k = 0; k < n; k++) {
    ci[k] = T.index.get(cands[k]);
    inC[ci[k]] = 1;
  }
  const buckets = new Int32Array(25);            // 反馈共 5×5 种，按 a*5+b 编码
  const topCost = new Float64Array(AI_BEAM).fill(Infinity);
  const topGi = new Int32Array(AI_BEAM).fill(-1);
  for (let gi = 0; gi < T.list.length; gi++) {   // 一层：log1p 代价选波束
    aiBucketCounts(T, gi, ci, n, buckets);
    const cost = aiLog1pCost(T, buckets, n) - (inC[gi] ? 1e-6 : 0);
    if (cost >= topCost[AI_BEAM - 1]) continue;
    let pos = AI_BEAM - 1;
    while (pos > 0 && topCost[pos - 1] > cost) {
      topCost[pos] = topCost[pos - 1];
      topGi[pos] = topGi[pos - 1];
      pos--;
    }
    topCost[pos] = cost;
    topGi[pos] = gi;
  }
  const members = [];
  for (let t = 0; t < 25; t++) members.push([]);
  const inner = new Int32Array(25);
  let bestVal = Infinity, bestGi = topGi[0];
  for (let b = 0; b < AI_BEAM && topGi[b] >= 0; b++) {   // 二层：波束内两层前瞻
    const gi = topGi[b];
    for (let t = 0; t < 25; t++) members[t].length = 0;
    const p = gi * 4;
    const g0 = T.flat[p], g1 = T.flat[p + 1], g2 = T.flat[p + 2], g3 = T.flat[p + 3];
    const gm = (1 << g0) | (1 << g1) | (1 << g2) | (1 << g3);
    for (let k = 0; k < n; k++) {
      const q = ci[k] * 4;
      const c0 = T.flat[q], c1 = T.flat[q + 1], c2 = T.flat[q + 2], c3 = T.flat[q + 3];
      let a = 0;
      if (c0 === g0) a++;
      if (c1 === g1) a++;
      if (c2 === g2) a++;
      if (c3 === g3) a++;
      const inter = gm & ((1 << c0) | (1 << c1) | (1 << c2) | (1 << c3));
      const code = a * 5 + (T.pop[inter] - a);
      if (code !== 20) members[code].push(ci[k]);   // 4A0B 即猜中，无后续分支
    }
    let s = 0;
    for (let t = 0; t < 25; t++) {
      const m = members[t];
      const c = m.length;
      if (c < 2) continue;                          // 0 或 1 个候选：无代价或下一猜即中
      const sub = new Int32Array(m);
      let bestInner = Infinity;
      for (let x = 0; x < c; x++) {
        aiBucketCounts(T, sub[x], sub, c, inner);
        const v2 = aiLog1pCost(T, inner, c);
        if (v2 < bestInner) bestInner = v2;
      }
      s += c * bestInner;
    }
    const val = 1 + s / n - (inC[gi] ? 1e-6 : 0);
    if (val < bestVal) { bestVal = val; bestGi = gi; }
  }
  return T.list[bestGi];
}

// AI 单步决策入口：按历史过滤候选，再按期望总代价（两层前瞻）挑猜测
function aiNextGuess(history) {
  if (!history.length) return '0123';   // 首猜在数字对称性下彼此等价，固定一个即可
  const cands = filterCandidates(buildAllGuesses(), history);
  return cands.length ? aiChooseGuess(cands) : '0123';   // 候选为空仅数据异常时兜底
}

// ===== 模拟 =====

// 完整打一局，返回 { win, score, tries, secret }
function playOne() {
  const secret = makeSecret();
  let state = { secret, history: [] };
  for (let t = 0; t < MAX_TRIES; t++) {
    const step = stepGame(state, aiNextGuess(state.history));
    state = { secret, history: step.history };
    if (step.over) return { win: step.win, score: step.score, tries: step.history.length, secret };
  }
  return { win: false, score: 0, tries: MAX_TRIES, secret };   // 理论不可达，兜底
}

// ===== 统计与输出 =====

const runs = Math.max(1, Number.parseInt(process.argv[2], 10) || 200);

const t0 = Date.now();
let wins = 0, totalScore = 0, maxScore = -1, minScore = MAX_TRIES;
let sumTriesWin = 0, fastest = MAX_TRIES + 1, slowestWin = 0;
const winDist = new Array(MAX_TRIES + 1).fill(0);   // winDist[t] = 第 t 次猜中的局数
const losers = [];                                   // 失败局答案示例
for (let i = 0; i < runs; i++) {
  const r = playOne();
  totalScore += r.score;
  if (r.score > maxScore) maxScore = r.score;
  if (r.score < minScore) minScore = r.score;
  if (r.win) {
    wins++;
    sumTriesWin += r.tries;
    winDist[r.tries]++;
    if (r.tries < fastest) fastest = r.tries;
    if (r.tries > slowestWin) slowestWin = r.tries;
  } else if (losers.length < 5) {
    losers.push(r.secret);
  }
}
const elapsed = (Date.now() - t0) / 1000;
const losses = runs - wins;

const bar = (n) => '█'.repeat(Math.round((n / Math.max(1, runs)) * 40));
console.log('================ 猜数字（1A2B）AI 模拟报告 ================');
console.log('模拟局数：' + runs + ' 局');
console.log('胜率：' + ((wins / runs) * 100).toFixed(1) + '%（胜 ' + wins + ' 局 / 负 ' + losses + ' 局）');
console.log('平均每局得分：' + (totalScore / runs).toFixed(2) + ' 分（共 8 次机会，第 n 次猜中得 8-n 分，未猜中 0 分）');
console.log('最高单局得分：' + maxScore + ' 分；最低单局得分：' + minScore + ' 分');
if (wins) {
  console.log('胜利局平均用次：' + (sumTriesWin / wins).toFixed(2) + ' 次（最快第 ' + fastest + ' 次，最慢第 ' + slowestWin + ' 次猜中）');
}
console.log('猜中所用次数分布：');
for (let t = 1; t <= MAX_TRIES; t++) {
  console.log('  第 ' + t + ' 次猜中：' + String(winDist[t]).padStart(4) + ' 局 ' + bar(winDist[t]));
}
if (losses && losers.length) console.log('失败局示例答案：' + losers.join('、'));
console.log('总得分：' + totalScore + ' 分；耗时：' + elapsed.toFixed(1) + ' 秒（平均 ' + Math.round((elapsed * 1000) / runs) + ' ms/局）');
