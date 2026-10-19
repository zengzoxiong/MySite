/* ============================================================
 * 跳跳鸟 · AI 代玩离线模拟（不依赖浏览器，Node 直接运行）
 *
 * 用法：
 *   node tools/flappy-bird/ai-sim.mjs [局数] [起始种子] [AI参数覆盖]
 *   例：node tools/flappy-bird/ai-sim.mjs             → 默认 200 局，种子 20261019
 *       node tools/flappy-bird/ai-sim.mjs 1000 7      → 1000 局，种子 7（结果可复现）
 *       node tools/flappy-bird/ai-sim.mjs 200 1 "beam=24,replan=0.25"
 *                                          → 覆盖 AI 参数（AI_CFG 的键，逗号分隔）
 *
 * 说明：
 *   - 本文件内 gapNow / speedNow / spawnPipeCore / freshCore / flapCore /
 *     circleRect / hitPipeCore / stepCore 与 tools/flappy-bird/app.html 内
 *     「纯函数核心」玩法规则完全一致（此处省略翅膀扇动等纯装饰字段，不影响规则）；
 *   - AI_CFG / aiNextPipe / aiPlan / aiShouldFlap 与 app.html 内「AI 决策」
 *     保持一致（束搜索轨迹规划器），调参时请两处同步修改；
 *   - 跳跳鸟是无尽生存玩法，没有「通关/胜利」结局，故不统计胜率，改以高分段
 *     占比呈现成绩分布；得分 = 穿过的管道对数。单局封顶模拟 5 分钟游戏时间。
 * ============================================================ */

'use strict';

/* ---------- 基本常量（与 app.html 一致） ---------- */
const W = 360, H = 560;
const GROUND_H = 64, GROUND_Y = H - GROUND_H;
const GRAVITY = 1900;
const FLAP_VY = -480;
const MAX_FALL = 720;
const PIPE_W = 62;
const GAP_START = 158, GAP_MIN = 112;
const SPACING = 212;
const SPEED_START = 145, SPEED_MAX = 265;
const BIRD_X = 92, BIRD_R = 13;
const DT = 1 / 60;          // 模拟帧长，等价 60fps 逐帧推进

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
function gapNow(score) { return Math.max(GAP_MIN, GAP_START - score * 1.8); }
function speedNow(score) { return Math.min(SPEED_MAX, SPEED_START + score * 3.2); }

/* 生成管道：gapY/gap/x 为玩法字段（app.html 额外生成纯装饰字段，规则不受影响） */
function spawnPipeCore(c, x, rng) {
  const gap = gapNow(c.score);
  const lastY = c.pipes.length ? c.pipes[c.pipes.length - 1].gapY : H * 0.45;
  const minY = gap / 2 + 56, maxY = GROUND_Y - gap / 2 - 40;
  /* 缝隙中心相对上一根随机偏移，限制幅度避免出现够不着的跳变 */
  let gy = lastY + (rng() * 2 - 1) * 120;
  gy = Math.max(minY, Math.min(maxY, gy));
  c.pipes.push({ x: x, gapY: gy, gap: gap, scored: false });
}

function freshCore(rng) {
  const c = {
    bird: { y: H * 0.42, vy: 0 },
    pipes: [],
    score: 0
  };
  spawnPipeCore(c, W + 90, rng);
  return c;
}

/* 扇翅：瞬间给向上速度 */
function flapCore(c) { c.bird.vy = FLAP_VY; }

/* 圆与矩形相交（小鸟碰撞体略微缩小，手感更宽容） */
function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < cr * cr;
}

function hitPipeCore(c) {
  const r = BIRD_R - 2;
  for (let i = 0; i < c.pipes.length; i++) {
    const p = c.pipes[i];
    if (p.x > BIRD_X + r || p.x + PIPE_W < BIRD_X - r) continue;
    const topH = p.gapY - p.gap / 2;
    const botY = p.gapY + p.gap / 2;
    if (circleRect(BIRD_X, c.bird.y, r, p.x, 0, PIPE_W, topH)) return true;
    if (circleRect(BIRD_X, c.bird.y, r, p.x, botY, PIPE_W, GROUND_Y - botY)) return true;
  }
  return false;
}

/* 核心单步推进：改写 c 并返回 { died, scored } */
function stepCore(c, dt, rng) {
  const res = { died: false, scored: 0 };
  const b = c.bird;

  /* 小鸟物理 */
  b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
  b.y += b.vy * dt;
  if (b.y < BIRD_R + 2) { b.y = BIRD_R + 2; b.vy = Math.max(b.vy, 0); }   // 撞顶不死，贴顶滑行

  /* 管道推进、生成、计分与清理 */
  const sp = speedNow(c.score);
  for (let j = 0; j < c.pipes.length; j++) c.pipes[j].x -= sp * dt;
  if (c.pipes[c.pipes.length - 1].x < W - SPACING) {
    spawnPipeCore(c, c.pipes[c.pipes.length - 1].x + SPACING, rng);
  }
  for (let k = 0; k < c.pipes.length; k++) {
    const p = c.pipes[k];
    if (!p.scored && p.x + PIPE_W < BIRD_X - BIRD_R) { p.scored = true; c.score++; res.scored++; }
  }
  while (c.pipes.length && c.pipes[0].x + PIPE_W < -80) c.pipes.shift();

  /* 碰撞检测 */
  if (b.y + BIRD_R >= GROUND_Y) { b.y = GROUND_Y - BIRD_R; res.died = true; }
  else if (hitPipeCore(c)) res.died = true;
  return res;
}

/* ---------- AI 决策（与 app.html 保持一致） ----------
   思路（束搜索轨迹规划）：每 replan 秒滚动规划一次——以 1/60 秒为步，
   对「下一管道窗口 + 再下一管入场」逐帧推演「扇 / 不扇」两条分支：
   撞管、落地、或到下一窗口入场时赶不进安全带的分支提前判死（死得越晚
   代价越低）；可行分支按管道窗口内偏离缺口中心、扇翅次数计代价，取
   代价最小者执行其首个扇翅时刻。换管必须的俯冲/急升瞬态发生在两管
   之间的开放空域，该处不计偏离代价，避免物理上必要的轨迹被线性目标
   误剪；赶不上入场的谱系用「连扇 ≈448px/s 爬升 / 自由落体」可达包络
   提前剪除，防止死路在平价排序里挤占束位。 */
const AI_CFG = {
  step: 1 / 60,      // 推演步长（秒）
  beam: 32,          // 束宽（并行保留的轨迹数）
  horizon: 1.5,      // 推演总时长上限（秒）
  qAhead: 0.25,      // 新管道入场后继续推演的时长（秒）
  wFlap: 1.2,        // 每次扇翅的固定代价
  wDev: 0.03,        // 管道窗口内每步每像素偏离缺口中心的代价
  wVy: 0.02,         // 终端竖直速度代价
  wEnd: 0.06,        // 终端高度偏离代价
  margin: 2,         // 安全带收缩（px，容忍时序抖动）
  edge: 14,          // 目标点距安全带边缘的最小距离（px）
  replan: 0.2,       // 重规划周期（秒）
  cruise: 0.42       // 无管道时的巡航高度系数（×H）
};

/* 下一根需要穿过的管道（尚未完全越过小鸟的那根） */
function aiNextPipe(c) {
  for (let i = 0; i < c.pipes.length; i++) {
    const p = c.pipes[i];
    if (p.x + PIPE_W > BIRD_X - BIRD_R) return p;
  }
  return null;
}

/* 束搜索规划：返回 { t0, flaps（相对 t0 的扇翅时刻表，秒）, nextReplan } */
function aiPlan(c) {
  const p = aiNextPipe(c);
  const sp = speedNow(c.score);
  const r = BIRD_R - 2;
  const ceilY = BIRD_R + 2, floorY = GROUND_Y - BIRD_R;
  const step = AI_CFG.step;
  let tInP = 0, tOutP = -1, tInQ = Infinity, tOutQ = Infinity, q = null;
  let pLo = 0, pHi = 0, qLo = 0, qHi = 0;
  if (p) {
    tInP = Math.max(0, (p.x - BIRD_X - r) / sp);
    tOutP = (p.x + PIPE_W - BIRD_X + r) / sp;
    pLo = p.gapY - p.gap / 2 + r + AI_CFG.margin;
    pHi = p.gapY + p.gap / 2 - r - AI_CFG.margin;
    const idx = c.pipes.indexOf(p);
    if (idx + 1 < c.pipes.length) {
      q = c.pipes[idx + 1];
      tInQ = (q.x - BIRD_X - r) / sp;
      tOutQ = (q.x + PIPE_W - BIRD_X + r) / sp;
      qLo = q.gapY - q.gap / 2 + r + AI_CFG.margin;
      qHi = q.gapY + q.gap / 2 - r - AI_CFG.margin;
    }
  }
  const tEnd = Math.min(AI_CFG.horizon, isFinite(tInQ) ? tInQ + AI_CFG.qAhead : Math.max(tOutP, 0) + 0.6);
  const nSteps = Math.max(1, Math.ceil(tEnd / step - 1e-9));

  /* 每步安全带与目标高度：数组按步末时刻索引，与帧末碰撞检测对齐；
     目标沿「p 中心 → q 中心」斜坡过渡并钳在安全带内距边缘 edge 处 */
  const qG = q ? q.gapY : (p ? p.gapY : H * AI_CFG.cruise);
  const cruiseY = H * AI_CFG.cruise;
  const lo = new Float64Array(nSteps), hi = new Float64Array(nSteps), ctr = new Float64Array(nSteps), soft = new Float64Array(nSteps);
  for (let k = 0; k < nSteps; k++) {
    const t = (k + 1) * step;
    let bandLo = ceilY, bandHi = floorY, inWin = false;
    if (p && t >= tInP && t < tOutP) {
      bandLo = pLo; bandHi = pHi; inWin = true;
    } else if (q && t >= tInQ && t < tOutQ) {
      bandLo = qLo; bandHi = qHi; inWin = true;
    }
    lo[k] = bandLo; hi[k] = bandHi;
    /* 偏离代价只在管道窗口内生效：换管必须的俯冲/急升瞬态不罚 */
    soft[k] = inWin ? 1 : 0;
    const aimFrom = p ? p.gapY : cruiseY;
    const aimTo = q ? qG : cruiseY;
    let s = 0;
    if (q && isFinite(tInQ)) s = Math.max(0, Math.min(1, (t - tInP) / (tInQ - tInP)));
    else if (!p) s = 1;
    else if (t > tInP) s = Math.min(1, (t - tInP) / ((tOutP - tInP) + 0.6));
    const ramp = aimFrom + (aimTo - aimFrom) * s;
    const pad = Math.min(AI_CFG.edge, Math.max(0, (bandHi - bandLo) / 2));
    ctr[k] = Math.max(bandLo + pad, Math.min(bandHi - pad, ramp));
  }

  /* 下一窗口入场信息（可达性剪枝用） */
  function nextWin(t) {
    if (p && t < tInP) return { T: tInP - t, lo: pLo, hi: pHi };
    if (q && isFinite(tInQ) && t < tInQ) return { T: tInQ - t, lo: qLo, hi: qHi };
    return null;
  }
  /* 从 (y, vy) 出发 T 秒后能否进入 [lo, hi]：连扇 ≈448px/s 爬升与自由落体的可达包络 */
  function reachOk(y, vy, T, w) {
    let yBot;
    if (vy + GRAVITY * T <= MAX_FALL) yBot = y + vy * T + 0.5 * GRAVITY * T * T;
    else {
      const tc = (MAX_FALL - vy) / GRAVITY;
      yBot = y + vy * tc + 0.5 * GRAVITY * tc * tc + MAX_FALL * (T - tc);
    }
    const yTop = Math.max(ceilY, y - 448 * T);
    return yTop <= w.hi + 1 && yBot >= w.lo - 1;
  }

  const DEATH = 1e6, DEATH_SLOPE = 500;
  /* 状态用父指针串起扇翅历史，搜索期间不拼数组，结束后回溯 */
  let beam = [{ y: c.bird.y, vy: c.bird.vy, cost: 0, dead: false, prev: null, flapT: -1 }];
  const next = new Array(2 * AI_CFG.beam);
  for (let k = 0; k < nSteps; k++) {
    let n = 0;
    for (let bi = 0; bi < beam.length; bi++) {
      const st = beam[bi];
      for (let a = 0; a < 2; a++) {
        if (st.dead && a) continue;
        let y = st.y, vy = a ? FLAP_VY : st.vy;
        let cost = st.cost + (a ? AI_CFG.wFlap : 0);
        let dead = st.dead;
        if (!dead) {
          vy = Math.min(MAX_FALL, vy + GRAVITY * step);
          y += vy * step;
          if (y < ceilY) { y = ceilY; vy = Math.max(vy, 0); }
          if (y >= floorY || y < lo[k] || y > hi[k]) {
            dead = true;
            cost += DEATH + (nSteps - k - 1) * DEATH_SLOPE;
          } else {
            cost += AI_CFG.wDev * soft[k] * Math.abs(y - ctr[k]);
            /* 可达性剪枝：到下一窗口入场时赶不进安全带的谱系提前判死 */
            const w = nextWin((k + 1) * step);
            if (w && w.T > step && !reachOk(y, vy, w.T, w)) {
              dead = true;
              cost += DEATH + (nSteps - k - 1) * DEATH_SLOPE;
            }
          }
        }
        next[n++] = { y, vy, cost, dead, prev: st, flapT: a ? k * step : -1 };
      }
    }
    if (!n) break;
    next.length = n;
    next.sort((x, z) => x.cost - z.cost);
    beam = next.slice(0, AI_CFG.beam);
  }
  /* 终端代价：贴近下一目标中心、速度温和 */
  for (let i = 0; i < beam.length; i++) {
    const st = beam[i];
    if (!st.dead) st.cost += AI_CFG.wEnd * Math.abs(st.y - ctr[nSteps - 1]) + AI_CFG.wVy * Math.abs(st.vy);
  }
  beam.sort((x, z) => x.cost - z.cost);
  /* 回溯最优轨迹的扇翅时刻表 */
  const flaps = [];
  for (let st = beam[0]; st; st = st.prev) if (st.flapT >= 0) flaps.unshift(st.flapT);
  return { t0: c.aiT, flaps: flaps, nextReplan: c.aiT + AI_CFG.replan };
}

/* 每帧决策：到期就取计划里的下一个扇翅时刻；到重规划周期就滚动重规划 */
function aiShouldFlap(c, dt) {
  if (c.aiT === undefined) { c.aiT = 0; c.aiPlan = null; }
  c.aiT += dt;
  if (!c.aiPlan || c.aiT >= c.aiPlan.nextReplan) c.aiPlan = aiPlan(c);
  const pl = c.aiPlan;
  if (pl.flaps.length && c.aiT >= pl.t0 + pl.flaps[0] - 1e-9) {
    pl.flaps.shift();
    return true;
  }
  return false;
}

/* ---------- 单局模拟 ---------- */
function simulateGame(rng) {
  const c = freshCore(rng);
  let frames = 0;
  const maxFrames = 60 * 300;   // 单局封顶：5 分钟游戏时间
  while (frames < maxFrames) {
    if (aiShouldFlap(c, DT)) flapCore(c);
    const ev = stepCore(c, DT, rng);
    frames++;
    if (ev.died) break;
  }
  return { score: c.score, time: frames * DT };
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

  /* AI 参数覆盖：argv[4] 形如 "wFlap=80,margin=6"（仅允许 AI_CFG 已有键） */
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
  const pct = n => (n / games * 100).toFixed(1) + '%';
  const over = v => scores.filter(s => s >= v).length;

  console.log('============ 跳跳鸟 · AI 代玩模拟报告 ============');
  console.log('模拟局数       : ' + games + '（随机种子 ' + seed + '，耗时 ' + elapsed + ' 秒）');
  console.log('平均得分       : ' + avgScore.toFixed(1) + '（穿过的管道对数）');
  console.log('中位数得分     : ' + median(scores).toFixed(1));
  console.log('最高得分       : ' + maxScore + '（第 ' + maxIdx + ' 局）');
  console.log('最低得分       : ' + minScore);
  console.log('平均存活       : ' + avgTime.toFixed(1) + ' 秒｜最长存活 ' + times[games - 1].toFixed(1) + ' 秒');
  console.log('得分分布       : ≥10 分 ' + over(10) + ' 局（' + pct(over(10)) + '）'
    + '｜≥30 分 ' + over(30) + ' 局（' + pct(over(30)) + '）'
    + '｜≥60 分 ' + over(60) + ' 局（' + pct(over(60)) + '）'
    + '｜≥100 分 ' + over(100) + ' 局（' + pct(over(100)) + '）');
  console.log('备注           : 跳跳鸟为无尽生存玩法，没有「通关/胜利」结局，不统计胜率，');
  console.log('                 以高分段占比代替；得分 = 穿过的管道对数。单局封顶 5 分钟。');
  console.log('====================================================');
}

main();
