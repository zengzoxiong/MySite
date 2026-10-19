/* ============================================================
 * 陨石闪避 · AI 代玩离线模拟（不依赖浏览器，Node 直接运行）
 *
 * 用法：
 *   node tools/dodge/ai-sim.mjs [局数] [起始种子] [AI参数覆盖]
 *   例：node tools/dodge/ai-sim.mjs            → 默认 300 局，种子 20261019
 *       node tools/dodge/ai-sim.mjs 1000 7     → 1000 局，种子 7（结果可复现）
 *       node tools/dodge/ai-sim.mjs 200 1 "look=3,band=1.3"
 *                                          → 覆盖 AI 参数（AI_CFG 的键，逗号分隔）
 *
 * 说明：
 *   - 本文件内 freshCore / spawnMeteorCore / spawnPickupCore / moveShipCore /
 *     stepCore 与 tools/dodge/app.html 内「纯函数核心」玩法规则完全一致
 *     （此处省略陨石顶点/陨石坑等纯装饰字段，不影响规则）；
 *   - AI_CFG / foldX / pickupGain / smashGain / evalX / aiPickTarget
 *     与 app.html 内「AI 决策」保持一致，调参时请两处同步修改；
 *   - 陨石闪避以存活时间计分（每秒 10 分），不存在「通关/失败」结局，
 *     因此不统计胜率，改统计高分段占比；单局封顶模拟 20 分钟游戏时间。
 * ============================================================ */

'use strict';

/* ---------- 基本常量（与 app.html 一致） ---------- */
const W = 420, H = 640;
const SHIP_Y = H - 84;
const SHIP_R = 13;
const SHIELD_DUR = 10;
const DT = 1 / 60;          // 模拟帧长，等价 60fps 逐帧推进
const AI_EVERY = 6;         // 每 6 帧决策一次 = 0.1 秒（与 app.html aiClock 一致）

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
function mulFor(t) { return Math.min(2.2, 1 + t / 70); }
function intervalFor(t) { return Math.max(0.34, 1.05 - t * 0.011); }

function freshCore(rng) {
  return {
    t: 0, score: 0,
    shipX: W / 2, tx: null,
    keys: { left: false, right: false },
    meteors: [],
    pickups: [],
    spawnT: 0.9,
    nextPickup: 8 + rng() * 5,
    shieldLeft: 0
  };
}

/* 生成陨石：仅玩法字段（app.html 额外生成纯装饰字段，规则不受影响） */
function spawnMeteorCore(c, rng) {
  const r = 13 + rng() * 27;
  c.meteors.push({
    x: r + rng() * (W - 2 * r),
    y: -r - 12,
    vx: (rng() * 2 - 1) * 46 * mulFor(c.t),
    vy: (95 + rng() * 115) * mulFor(c.t),
    r
  });
}

function spawnPickupCore(c, rng) {
  c.pickups.push({ x: 30 + rng() * (W - 60), y: -24, vy: 105, ph: rng() * Math.PI * 2 });
}

function moveShipCore(c, dt) {
  const kb = (c.keys.right ? 1 : 0) - (c.keys.left ? 1 : 0);
  if (kb !== 0) {
    c.shipX += kb * 430 * dt;
    c.tx = null;
  } else if (c.tx !== null) {
    c.shipX += (c.tx - c.shipX) * Math.min(1, dt * 14);
  }
  c.shipX = Math.max(22, Math.min(W - 22, c.shipX));
}

function stepCore(c, dt, rng) {
  const res = { died: false, gotPickup: false };
  c.t += dt;
  c.score = Math.floor(c.t * 10);
  if (c.shieldLeft > 0) c.shieldLeft = Math.max(0, c.shieldLeft - dt);
  moveShipCore(c, dt);

  c.spawnT -= dt;
  if (c.spawnT <= 0) { spawnMeteorCore(c, rng); c.spawnT = intervalFor(c.t); }
  if (c.t >= c.nextPickup) { spawnPickupCore(c, rng); c.nextPickup = c.t + 11 + rng() * 8; }

  for (let mi = c.meteors.length - 1; mi >= 0; mi--) {
    const m = c.meteors[mi];
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    if ((m.x < m.r && m.vx < 0) || (m.x > W - m.r && m.vx > 0)) m.vx = -m.vx;
    if (m.y > H + m.r + 40) { c.meteors.splice(mi, 1); continue; }
    const rr = m.r * 0.82 + SHIP_R;
    const dx = m.x - c.shipX, dy = m.y - SHIP_Y;
    if (dx * dx + dy * dy < rr * rr) {
      if (c.shieldLeft > 0) {
        c.meteors.splice(mi, 1);
      } else {
        res.died = true;
        return res;
      }
    }
  }

  for (let qi = c.pickups.length - 1; qi >= 0; qi--) {
    const q = c.pickups[qi];
    q.y += q.vy * dt;
    const qy = q.y + Math.sin(c.t * 3 + q.ph) * 4;
    const ddx = q.x - c.shipX, ddy = qy - SHIP_Y;
    if (ddx * ddx + ddy * ddy < 35 * 35) {
      c.pickups.splice(qi, 1);
      c.shieldLeft = SHIELD_DUR;
      res.gotPickup = true;
    } else if (q.y > H + 40) {
      c.pickups.splice(qi, 1);
    }
  }
  return res;
}

/* ---------- AI 决策（与 app.html 保持一致） ----------
   v2 轨迹预采样评分：
   1) 每次决策把各陨石在前瞻窗口内的位置（含左右墙反弹）按 step 预采样；
   2) 每个候选目标点用闭式跟随轨迹逐采样点比对 2D 距离（比旧版仅看横向带更准）；
   3) 窗口内一旦判定撞击，用「首次撞击越晚越好」的悬崖项主导排序，
      未撞击时由近距危险度、护盾道具/清场收益与移动代价决胜。 */
const AI_CFG = {
  look: 0.5,       // 前瞻秒数（实测 0.5 最优：短视窗反应式闪避 + 高频拾盾）
  step: 0.01,      // 预测采样步长（秒）；越细越不易漏判擦碰，实测 0.01 最优
  follow: 14,      // 指针跟随系数（与 moveShipCore 一致）
  band: 1.2,       // 判定半径放宽系数（2D 精算余量）
  wNear: 1.2,      // 近距危险权重
  hitW: 100,       // 首次撞击悬崖惩罚（每晚一个采样点加 hitW）
  softCap: 4,      // 近距危险度封顶（保证悬崖项主导排序）
  moveCost: 0.02,  // 每移动 100px 的代价（抑制抖动）
  pickLook: 4.5,   // 护盾道具考虑窗口（秒）
  pickW: 1.5,      // 护盾道具吸引力上限
  pickNeed: 500,   // 估计奔赴道具的速度（px/s）
  smashW: 0.5,     // 护盾期清场加分上限（每颗陨石）
  smashR: 26       // 清场判定横向吸附半径（px）
};

/* 预采样缓冲（每次决策复用，避免频繁分配） */
const PRED_MAX_M = 64;                    // 陨石数上限
const PRED_MAX_K = 256;                   // 单陨石采样点上限
const predMx = new Float64Array(PRED_MAX_M * PRED_MAX_K);
const predMy = new Float64Array(PRED_MAX_M * PRED_MAX_K);
const predRr2 = new Float64Array(PRED_MAX_M);
const predEff2 = new Float64Array(PRED_MAX_M);
const predEnd = new Int32Array(PRED_MAX_M);
const shipE = new Float64Array(PRED_MAX_K);
let predN = 0;

function foldX(xn, r) {
  const lo = r, hi = W - r, span = hi - lo;
  if (span <= 0) return lo;
  let k = (xn - lo) % (2 * span);
  if (k < 0) k += 2 * span;
  return lo + (k <= span ? k : 2 * span - k);
}

function pickupGain(c, xT) {
  let gain = 0;
  for (let i = 0; i < c.pickups.length; i++) {
    const q = c.pickups[i];
    const tau = (SHIP_Y - q.y) / q.vy;
    if (tau < 0.35 || tau > AI_CFG.pickLook) continue;
    if (Math.abs(q.x - c.shipX) / AI_CFG.pickNeed > tau - 0.15) continue;
    const off = Math.abs(xT - q.x);
    if (off > 70) continue;
    const g = AI_CFG.pickW * (1 - tau / AI_CFG.pickLook) * (1 - off / 70);
    if (g > gain) gain = g;
  }
  return gain;
}

function smashGain(c, xT) {
  if (c.shieldLeft < AI_CFG.look) return 0;
  let g = 0;
  for (let i = 0; i < c.meteors.length; i++) {
    const m = c.meteors[i];
    const rr = m.r * 0.82 + SHIP_R;
    if (m.y > SHIP_Y + rr) continue;
    const tHit = (SHIP_Y - m.y) / m.vy;
    if (tHit < 0 || tHit > AI_CFG.look) continue;
    if (c.shieldLeft <= tHit) continue;
    const off = Math.abs(xT - foldX(m.x + m.vx * tHit, m.r));
    const rr2 = rr + AI_CFG.smashR;
    if (off < rr2) g += AI_CFG.smashW * (1 - off / rr2);
  }
  return g;
}

/* 单个候选目标点的评分（越低越好） */
function evalX(c, xT, K) {
  const x0 = c.shipX;
  const dt = AI_CFG.step;
  let soft = 0, hitK = 0;
  for (let k = 1; k <= K; k++) {
    let xs = xT + (x0 - xT) * shipE[k];
    if (xs < 22) xs = 22; else if (xs > W - 22) xs = W - 22;
    const shielded = c.shieldLeft > k * dt;
    for (let i = 0; i < predN; i++) {
      if (k > predEnd[i]) continue;
      const e = i * PRED_MAX_K + k;
      const dx = predMx[e] - xs, dy = predMy[e] - SHIP_Y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= predEff2[i]) continue;
      if (shielded) continue;
      if (hitK === 0 && d2 < predRr2[i]) hitK = k;
      soft += AI_CFG.wNear / (1 + k * dt) * (1 - d2 / predEff2[i]);
    }
    if (hitK !== 0) break;
  }
  if (soft > AI_CFG.softCap) soft = AI_CFG.softCap;
  const danger = hitK !== 0 ? AI_CFG.hitW * (K + 1 - hitK) : 0;
  return danger + soft - pickupGain(c, xT) - smashGain(c, xT);
}

/* 每步决策：预采样陨石轨迹后横向细扫候选点，返回最优目标横坐标 */
function aiPickTarget(c) {
  const dt = AI_CFG.step;
  const K = Math.max(1, Math.min(PRED_MAX_K - 1, Math.ceil(AI_CFG.look / dt)));
  for (let k = 1; k <= K; k++) shipE[k] = Math.exp(-AI_CFG.follow * k * dt);
  /* 陨石预采样：仅保留前瞻窗口内会进入判定带的陨石 */
  let n = 0;
  for (let i = 0; i < c.meteors.length && n < PRED_MAX_M; i++) {
    const m = c.meteors[i];
    const rr = m.r * 0.82 + SHIP_R;
    const eff = rr * AI_CFG.band;
    if (m.y > SHIP_Y + eff) continue;
    const tOut = Math.min(AI_CFG.look, (SHIP_Y + eff - m.y) / m.vy);
    const kk = Math.max(1, Math.min(K, Math.floor(tOut / dt)));
    const base = n * PRED_MAX_K;
    for (let k = 1; k <= kk; k++) {
      const tau = k * dt;
      predMx[base + k] = foldX(m.x + m.vx * tau, m.r);
      predMy[base + k] = m.y + m.vy * tau;
    }
    predRr2[n] = rr * rr;
    predEff2[n] = eff * eff;
    predEnd[n] = kk;
    n++;
  }
  predN = n;
  let bestX = c.shipX, bestS = Infinity;
  for (let x = 22; x <= W - 22 + 1e-9; x += 8) {
    const s = evalX(c, x, K) + AI_CFG.moveCost * Math.abs(x - c.shipX) / 100;
    if (s < bestS) { bestS = s; bestX = x; }
  }
  return bestX;
}

/* ---------- 单局模拟 ---------- */
function simulateGame(rng) {
  const c = freshCore(rng);
  let frames = 0, picks = 0;
  const maxFrames = 60 * 60 * 20;   // 单局封顶：20 分钟游戏时间
  while (frames < maxFrames) {
    if (frames % AI_EVERY === 0) {
      c.keys.left = false;
      c.keys.right = false;
      c.tx = aiPickTarget(c);
    }
    const ev = stepCore(c, DT, rng);
    if (ev.gotPickup) picks++;
    frames++;
    if (ev.died) break;
  }
  return { score: c.score, time: c.t, picks };
}

/* ---------- 统计与输出 ---------- */
function median(sorted) {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function main() {
  const argN = parseInt(process.argv[2], 10);
  const argSeed = parseInt(process.argv[3], 10);
  const games = Number.isFinite(argN) && argN > 0 ? argN : 300;
  const seed = Number.isFinite(argSeed) ? argSeed >>> 0 : 20261019;

  /* AI 参数覆盖：argv[4] 形如 "look=3,band=1.3"（仅允许 AI_CFG 已有键） */
  const argCfg = process.argv[4];
  if (argCfg) {
    const applied = [];
    for (const kv of argCfg.split(',')) {
      const pos = kv.indexOf('=');
      if (pos < 0) continue;
      const k = kv.slice(0, pos).trim();
      const num = parseFloat(kv.slice(pos + 1));
      if (Object.prototype.hasOwnProperty.call(AI_CFG, k) && Number.isFinite(num)) {
        AI_CFG[k] = num;
        applied.push(k + '=' + num);
      } else {
        console.warn('忽略无效 AI 参数：' + kv);
      }
    }
    if (applied.length) console.log('AI 参数覆盖   : ' + applied.join('，'));
  }

  const t0 = Date.now();
  const rng = mulberry32(seed);
  const results = [];
  for (let i = 0; i < games; i++) {
    results.push(simulateGame(rng));
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const scores = results.map(r => r.score).sort((a, b) => a - b);
  const times = results.map(r => r.time).sort((a, b) => a - b);
  const sum = arr => arr.reduce((s, v) => s + v, 0);
  const avgScore = sum(scores) / games;
  const avgTime = sum(times) / games;
  const maxScore = scores[games - 1];
  const minScore = scores[0];
  const maxIdx = results.findIndex(r => r.score === maxScore) + 1;
  const totalPicks = sum(results.map(r => r.picks));
  const pct = n => (n / games * 100).toFixed(1) + '%';
  const over = v => scores.filter(s => s >= v).length;

  console.log('============ 陨石闪避 · AI 代玩模拟报告 ============');
  console.log('模拟局数       : ' + games + '（随机种子 ' + seed + '，耗时 ' + elapsed + ' 秒）');
  console.log('平均得分       : ' + avgScore.toFixed(1));
  console.log('中位数得分     : ' + median(scores).toFixed(1));
  console.log('最高得分       : ' + maxScore + '（第 ' + maxIdx + ' 局，存活 ' + (maxScore / 10).toFixed(0) + ' 秒）');
  console.log('最低得分       : ' + minScore);
  console.log('平均存活       : ' + avgTime.toFixed(1) + ' 秒｜最长存活 ' + times[games - 1].toFixed(1) + ' 秒');
  console.log('得分分布       : ≥300 分 ' + over(300) + ' 局（' + pct(over(300)) + '）'
    + '｜≥600 分 ' + over(600) + ' 局（' + pct(over(600)) + '）'
    + '｜≥1000 分 ' + over(1000) + ' 局（' + pct(over(1000)) + '）');
  console.log('护盾道具       : 共拾取 ' + totalPicks + ' 次（平均每局 ' + (totalPicks / games).toFixed(1) + ' 次）');
  console.log('备注           : 本游戏按存活时间计分（每秒 10 分），无通关/失败结局，');
  console.log('                 故以高分段占比代替胜率；单局封顶模拟 20 分钟。');
  console.log('====================================================');
}

main();
