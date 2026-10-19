/* ============================================================
 * 太空射击 · AI 代玩离线模拟（不依赖浏览器，Node 直接运行）
 *
 * 用法：
 *   node tools/space-shooter/ai-sim.mjs [局数] [起始种子] [AI参数覆盖]
 *   例：node tools/space-shooter/ai-sim.mjs            → 默认 120 局，种子 20261019
 *       node tools/space-shooter/ai-sim.mjs 300 7     → 300 局，种子 7（结果可复现）
 *       node tools/space-shooter/ai-sim.mjs 100 1 "aimW=1.4,band=1.2"
 *                                          → 覆盖 AI 参数（AI_CFG 的键，逗号分隔）
 *
 * 说明：
 *   - 本文件内 freshCore / buildWaveCore / spawnEnemyCore / fireInterval /
 *     moveShipCore / stepCore 与 tools/space-shooter/app.html 内「纯函数核心」
 *     玩法规则完全一致（此处省略爆炸粒子等纯装饰输出，不影响规则）；
 *   - AI_CFG / minApproach / shipPath / enemyVel / aimGain / evalPoint / aiPickTarget
 *     与 app.html 内「AI 决策」保持一致，调参时请两处同步修改；
 *   - 太空射击波次无限推进、无通关胜利结局，故不统计胜率，改统计到达波次与
 *     击杀命中率；单局封顶模拟 3 分钟游戏时间（打满视作「未阵亡」）。
 * ============================================================ */

'use strict';

/* ---------- 基本常量（与 app.html 一致） ---------- */
const LW = 380, LH = 560;
const SHIP_SPEED = 320;
const FOLLOW_SPEED = 640;
const FIRE_CD = 0.22;
const INV_TIME = 2.2;
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
function freshCore(rng) {
  return {
    score: 0, wave: 0,
    ship: { x: LW / 2, y: LH - 80, lives: 3, inv: 0 },
    bullets: [], ebullets: [], enemies: [],
    spawnQueue: [], spawnTimer: 0, spawnGap: 1,
    interWave: true, waveGap: 0.9,
    fireCd: 0,
    keys: {}, target: null
  };
}

function buildWaveCore(c, n) {
  c.spawnQueue.length = 0;
  const count = Math.min(6 + n * 2, 28);
  for (let i = 0; i < count; i++) {
    let t = 'scout';
    if (n >= 2 && i % 4 === 3) t = 'raider';
    if (n >= 3 && i % 7 === 6) t = 'tank';
    if (n >= 5 && i % 5 === 4) t = 'raider';
    c.spawnQueue.push(t);
  }
  c.spawnGap = Math.max(0.3, 1.0 - n * 0.05);
  c.spawnTimer = 0.5;
}

function spawnEnemyCore(c, type, rng) {
  const cfg = {
    scout: { hp: 1, r: 13, score: 100, vy: 58 },
    raider: { hp: 2, r: 16, score: 200, vy: 70 },
    tank: { hp: 4, r: 21, score: 400, vy: 40 }
  }[type];
  const x = 26 + rng() * (LW - 52);
  c.enemies.push({
    type: type, x: x, baseX: x, y: -26,
    hp: cfg.hp, maxHp: cfg.hp, r: cfg.r, score: cfg.score,
    vy: cfg.vy * (1 + Math.min(c.wave * 0.06, 0.9)),
    t: rng() * 6,
    amp: type === 'scout' ? 18 + rng() * 22 : 0,
    freq: 1.6 + rng() * 1.4,
    fireT: 0.8 + rng() * (type === 'tank' ? 1.2 : 1.8)
  });
}

function fireInterval(type, c, rng) {
  const base = type === 'scout' ? 3.4 : type === 'raider' ? 2.5 : 2.1;
  return Math.max(0.9, base - c.wave * 0.09) * (0.75 + rng() * 0.5);
}

function moveShipCore(c, dt) {
  let dx = 0, dy = 0;
  if (c.keys.left) dx--; if (c.keys.right) dx++;
  if (c.keys.up) dy--; if (c.keys.down) dy++;
  if (dx || dy) {
    const l = Math.hypot(dx, dy);
    c.ship.x += dx / l * SHIP_SPEED * dt;
    c.ship.y += dy / l * SHIP_SPEED * dt;
  }
  if (c.target) {
    const ddx = c.target.x - c.ship.x, ddy = c.target.y - c.ship.y;
    const dist = Math.hypot(ddx, ddy);
    if (dist > 1.5) {
      const step = Math.min(dist, FOLLOW_SPEED * dt);
      c.ship.x += ddx / dist * step;
      c.ship.y += ddy / dist * step;
    }
  }
  c.ship.x = Math.max(16, Math.min(LW - 16, c.ship.x));
  c.ship.y = Math.max(40, Math.min(LH - 24, c.ship.y));
}

function stepCore(c, dt, rng) {
  const ev = { kills: 0, hits: 0, waveClear: 0, hit: false, over: false };

  moveShipCore(c, dt);
  c.ship.inv = Math.max(0, c.ship.inv - dt);

  c.fireCd -= dt;
  if (c.fireCd <= 0) {
    if (c.wave >= 3) {
      c.bullets.push({ x: c.ship.x - 7, y: c.ship.y - 12, vy: -540 }, { x: c.ship.x + 7, y: c.ship.y - 12, vy: -540 });
    } else {
      c.bullets.push({ x: c.ship.x, y: c.ship.y - 16, vy: -540 });
    }
    c.fireCd = FIRE_CD;
  }

  if (c.interWave) {
    c.waveGap -= dt;
    if (c.waveGap <= 0) {
      c.interWave = false;
      c.wave++;
      buildWaveCore(c, c.wave);
    }
  } else {
    c.spawnTimer -= dt;
    if (c.spawnTimer <= 0 && c.spawnQueue.length) {
      spawnEnemyCore(c, c.spawnQueue.shift(), rng);
      c.spawnTimer = c.spawnGap * (0.7 + rng() * 0.6);
    }
    if (!c.spawnQueue.length && !c.enemies.length) {
      c.score += 50 * c.wave;
      c.interWave = true; c.waveGap = 1.5;
      ev.waveClear = c.wave;
    }
  }

  for (let i = 0; i < c.bullets.length; i++) {
    const b = c.bullets[i];
    b.y += b.vy * dt;
    if (b.y < -20) b.dead = true;
  }

  for (let i = 0; i < c.enemies.length; i++) {
    const e = c.enemies[i];
    e.t += dt;
    e.y += e.vy * dt;
    if (e.type === 'scout') {
      e.x = e.baseX + Math.sin(e.t * e.freq) * e.amp;
    } else if (e.type === 'raider') {
      const d2 = c.ship.x - e.x;
      const vmax = (38 + c.wave * 3) * dt;
      e.x += Math.max(-vmax, Math.min(vmax, d2));
    }
    e.x = Math.max(e.r + 4, Math.min(LW - e.r - 4, e.x));
    if (e.y > LH + 34) { e.dead = true; continue; }
    if (e.y > 20 && e.y < LH - 90) {
      e.fireT -= dt;
      if (e.fireT <= 0) {
        e.fireT = fireInterval(e.type, c, rng);
        const ang = Math.atan2(c.ship.y - e.y, c.ship.x - e.x);
        const sp = Math.min(140 + c.wave * 9, 240);
        if (e.type === 'tank' && c.wave >= 4) {
          const offs = [-0.26, 0, 0.26];
          for (const o of offs) {
            c.ebullets.push({ x: e.x, y: e.y + e.r * 0.5, vx: Math.cos(ang + o) * sp, vy: Math.sin(ang + o) * sp });
          }
        } else {
          c.ebullets.push({ x: e.x, y: e.y + e.r * 0.5, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp });
        }
      }
    }
  }

  for (let i = 0; i < c.ebullets.length; i++) {
    const eb = c.ebullets[i];
    eb.x += eb.vx * dt; eb.y += eb.vy * dt;
    if (eb.x < -10 || eb.x > LW + 10 || eb.y < -10 || eb.y > LH + 10) eb.dead = true;
  }

  for (let bj = 0; bj < c.bullets.length; bj++) {
    const pb = c.bullets[bj];
    if (pb.dead) continue;
    for (let ej = 0; ej < c.enemies.length; ej++) {
      const te = c.enemies[ej];
      if (te.dead) continue;
      const ddx = pb.x - te.x, ddy = pb.y - te.y;
      const rr2 = (te.r + 4) * (te.r + 4);
      if (ddx * ddx + ddy * ddy < rr2) {
        pb.dead = true;
        te.hp--;
        ev.hits++;
        if (te.hp <= 0) {
          te.dead = true;
          c.score += te.score;
          ev.kills++;
        }
        break;
      }
    }
  }

  let hitFlag = false;
  if (c.ship.inv <= 0) {
    for (let fb = 0; fb < c.ebullets.length; fb++) {
      const eb2 = c.ebullets[fb];
      const ex = eb2.x - c.ship.x, ey = eb2.y - c.ship.y;
      if (ex * ex + ey * ey < 169) { eb2.dead = true; hitFlag = true; break; }
    }
    if (!hitFlag) {
      for (let ce = 0; ce < c.enemies.length; ce++) {
        const cte = c.enemies[ce];
        if (cte.dead) continue;
        const cx = cte.x - c.ship.x, cy = cte.y - c.ship.y;
        const cr2 = (cte.r + 12) * (cte.r + 12);
        if (cx * cx + cy * cy < cr2) {
          cte.dead = true;
          hitFlag = true;
          break;
        }
      }
    }
  }
  if (hitFlag) {
    c.ship.lives--;
    c.ship.inv = INV_TIME;
    c.ebullets.length = 0;
    ev.hit = true;
    if (c.ship.lives <= 0) ev.over = true;
  }

  if (c.bullets.some(x => x.dead)) c.bullets = c.bullets.filter(x => !x.dead);
  if (c.ebullets.some(x => x.dead)) c.ebullets = c.ebullets.filter(x => !x.dead);
  if (c.enemies.some(x => x.dead)) c.enemies = c.enemies.filter(x => !x.dead);
  return ev;
}

/* ---------- AI 决策（与 app.html 保持一致） ---------- */
const AI_CFG = {
  look: 1.6,
  speed: 640,
  band: 1.35,
  wBullet: 1.6,
  wEnemy: 2.4,
  scoutPad: 10,
  aimW: 1.1,
  aimRange: 64,
  aimLook: 1.0,
  moveCost: 0.05,
  upCost: 0.30
};

function minApproach(px, py, vx, vy, sx, sy, svx, svy, tMax) {
  const rx = px - sx, ry = py - sy;
  const ax = vx - svx, ay = vy - svy;
  const a = ax * ax + ay * ay;
  let t = a > 1e-9 ? -(rx * ax + ry * ay) / a : 0;
  if (t < 0) t = 0; else if (t > tMax) t = tMax;
  const dx = rx + ax * t, dy = ry + ay * t;
  return { d: Math.sqrt(dx * dx + dy * dy), t: t };
}

function shipPath(c, xT, yT) {
  const dx = xT - c.ship.x, dy = yT - c.ship.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-6) return { vx: 0, vy: 0, tStop: 0, ex: xT, ey: yT };
  return {
    vx: dx / dist * AI_CFG.speed, vy: dy / dist * AI_CFG.speed,
    tStop: dist / AI_CFG.speed, ex: xT, ey: yT
  };
}

function enemyVel(e, c) {
  let vx = 0;
  if (e.type === 'scout') {
    vx = Math.cos(e.t * e.freq) * e.freq * e.amp;
  } else if (e.type === 'raider') {
    const vmax = 38 + c.wave * 3;
    vx = Math.max(-vmax, Math.min(vmax, c.ship.x - e.x));
  }
  return { vx: vx, vy: e.vy };
}

function aimGain(c, xT, yT) {
  let gain = 0;
  for (let i = 0; i < c.enemies.length; i++) {
    const e = c.enemies[i];
    if (e.y >= yT - 8) continue;
    const tt = (yT - e.y) / (540 + Math.max(e.vy, 0));
    if (tt > AI_CFG.aimLook) continue;
    const v = enemyVel(e, c);
    let ex = e.x + v.vx * tt;
    ex = Math.max(e.r + 4, Math.min(LW - e.r - 4, ex));
    const off = Math.abs(xT - ex);
    if (off > AI_CFG.aimRange) continue;
    const g = AI_CFG.aimW * (e.score / 400) * (1 - off / AI_CFG.aimRange) * (1 - tt / AI_CFG.aimLook);
    if (g > gain) gain = g;
  }
  return gain;
}

function evalPoint(c, xT, yT) {
  const look = AI_CFG.look;
  const path = shipPath(c, xT, yT);
  let danger = 0, m1, m2, bestD, bestT, eff;

  for (let i = 0; i < c.ebullets.length; i++) {
    const b = c.ebullets[i];
    eff = 13 * AI_CFG.band;
    const bdx = b.x - c.ship.x, bdy = b.y - c.ship.y;
    const reach = (Math.sqrt(b.vx * b.vx + b.vy * b.vy) + AI_CFG.speed) * look + eff;
    if (bdx * bdx + bdy * bdy > reach * reach) continue;
    m1 = minApproach(b.x, b.y, b.vx, b.vy, c.ship.x, c.ship.y, path.vx, path.vy, Math.min(path.tStop, look));
    bestD = m1.d; bestT = m1.t;
    if (path.tStop < look) {
      m2 = minApproach(b.x + b.vx * path.tStop, b.y + b.vy * path.tStop, b.vx, b.vy, path.ex, path.ey, 0, 0, look - path.tStop);
      if (m2.d < bestD) { bestD = m2.d; bestT = path.tStop + m2.t; }
    }
    if (bestD < eff) danger += AI_CFG.wBullet / (1 + bestT) * (1 - bestD / eff);
  }

  for (let i = 0; i < c.enemies.length; i++) {
    const e = c.enemies[i];
    if (e.y > c.ship.y + 160) continue;
    eff = (e.r + 12) * AI_CFG.band + (e.type === 'scout' ? AI_CFG.scoutPad : 0);
    const edx = e.x - c.ship.x, edy = e.y - c.ship.y;
    const reach2 = (Math.abs(e.vy) + AI_CFG.speed) * look + eff + 60;
    if (edx * edx + edy * edy > reach2 * reach2) continue;
    const v = enemyVel(e, c);
    m1 = minApproach(e.x, e.y, v.vx, v.vy, c.ship.x, c.ship.y, path.vx, path.vy, Math.min(path.tStop, look));
    bestD = m1.d; bestT = m1.t;
    if (path.tStop < look) {
      m2 = minApproach(e.x + v.vx * path.tStop, e.y + v.vy * path.tStop, v.vx, v.vy, path.ex, path.ey, 0, 0, look - path.tStop);
      if (m2.d < bestD) { bestD = m2.d; bestT = path.tStop + m2.t; }
    }
    if (bestD < eff) danger += AI_CFG.wEnemy / (1 + bestT) * (1 - bestD / eff);
  }

  return danger - aimGain(c, xT, yT);
}

function aiPickTarget(c) {
  let bestX = c.ship.x, bestY = LH - 24, bestS = Infinity;
  const ySet = [LH - 24, LH - 80, LH - 136, LH - 192, LH - 248, LH - 312];
  function consider(xT, yT) {
    const s = evalPoint(c, xT, yT)
      + AI_CFG.moveCost * (Math.abs(xT - c.ship.x) + Math.abs(yT - c.ship.y)) / 100
      + AI_CFG.upCost * (LH - 24 - yT) / 100;
    if (s < bestS) { bestS = s; bestX = xT; bestY = yT; }
  }
  for (const yT of ySet) {
    for (let xT = 16; xT <= LW - 16 + 1e-9; xT += 16) consider(xT, yT);
  }
  for (let dx = -12; dx <= 12.001; dx += 4) {
    consider(Math.max(16, Math.min(LW - 16, bestX + dx)), bestY);
  }
  return { x: bestX, y: bestY };
}

/* ---------- 单局模拟 ---------- */
function simulateGame(rng) {
  const c = freshCore(rng);
  let kills = 0, hits = 0;
  const maxFrames = 60 * 60 * 3;   // 单局封顶：3 分钟游戏时间
  let frames = 0;
  for (; frames < maxFrames; frames++) {
    if (frames % AI_EVERY === 0) {
      c.keys = {};
      c.target = null;
      const t = aiPickTarget(c);
      c.target = { x: t.x, y: t.y };
    }
    const ev = stepCore(c, DT, rng);
    kills += ev.kills;
    hits += ev.hits;
    if (ev.over) break;
  }
  return {
    score: c.score,
    wave: Math.max(1, c.wave),
    time: (frames + 1) * DT,
    kills, hits, died: frames < maxFrames
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
  const games = Number.isFinite(argN) && argN > 0 ? argN : 120;
  const seed = Number.isFinite(argSeed) ? argSeed >>> 0 : 20261019;

  /* AI 参数覆盖：argv[4] 形如 "aimW=1.4,band=1.2"（仅允许 AI_CFG 已有键） */
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
  const waves = results.map(r => r.wave).sort((a, b) => a - b);
  const sum = arr => arr.reduce((s, v) => s + v, 0);
  const avgScore = sum(scores) / games;
  const avgTime = sum(times) / games;
  const avgWave = sum(waves) / games;
  const totalKills = sum(results.map(r => r.kills));
  const totalHits = sum(results.map(r => r.hits));
  const maxScore = scores[games - 1];
  const minScore = scores[0];
  const maxIdx = results.findIndex(r => r.score === maxScore) + 1;
  const died = results.filter(r => r.died).length;
  const pct = n => (n / games * 100).toFixed(1) + '%';
  const over = v => scores.filter(s => s >= v).length;

  console.log('============ 太空射击 · AI 代玩模拟报告 ============');
  console.log('模拟局数       : ' + games + '（随机种子 ' + seed + '，耗时 ' + elapsed + ' 秒）');
  console.log('平均得分       : ' + avgScore.toFixed(1));
  console.log('中位数得分     : ' + median(scores).toFixed(1));
  console.log('最高得分       : ' + maxScore + '（第 ' + maxIdx + ' 局）');
  console.log('最低得分       : ' + minScore);
  console.log('平均到达波次   : 第 ' + avgWave.toFixed(1) + ' 波｜最远 第 ' + waves[games - 1] + ' 波');
  console.log('平均存活       : ' + avgTime.toFixed(1) + ' 秒｜最长 ' + times[games - 1].toFixed(1) + ' 秒');
  console.log('阵亡局数       : ' + died + ' 局（' + pct(died) + '）｜打满 3 分钟未阵亡 ' + (games - died) + ' 局（' + pct(games - died) + '）');
  console.log('平均击杀       : ' + (totalKills / games).toFixed(1) + ' 架/局（累计 ' + totalKills + ' 架，子弹命中 ' + totalHits + ' 次）');
  console.log('得分分布       : ≥2000 分 ' + over(2000) + ' 局（' + pct(over(2000)) + '）'
    + '｜≥5000 分 ' + over(5000) + ' 局（' + pct(over(5000)) + '）'
    + '｜≥10000 分 ' + over(10000) + ' 局（' + pct(over(10000)) + '）');
  console.log('备注           : 波次无限推进、无通关胜利结局，胜率不适用，');
  console.log('                 以到达波次与「打满 3 分钟未阵亡」占比代替。');
  console.log('====================================================');
}

main();
