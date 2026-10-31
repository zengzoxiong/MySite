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
    power: 1, wings: 0, shield: 0,    // 武器等级 / 僚机数 / 护盾层数
    weapon: 'bullet',                 // 武器类型：bullet 弹丸 / laser 激光 / missile 追踪导弹
    drops: [], wingCd: 0,             // 场上道具与僚机开火计时
    combo: 0, comboT: 0,              // 连击数与连击窗口倒计时（秒）
    aiGoal: null,                     // AI 意图点（决策网格点，实际 target 向其缓动）
    keys: {}, target: null
  };
}

// 生成一枚掉落道具：类型按权重抽取（火力 / 僚机 / 护盾 / 清屏弹 / 补给）
function makeDrop(te, rng) {
  const r = rng();
  const type = r < 0.24 ? 'P' : r < 0.42 ? 'L' : r < 0.54 ? 'M'
    : r < 0.68 ? 'W' : r < 0.82 ? 'S' : r < 0.91 ? 'B' : 'H';
  return { x: te.x, y: te.y, type: type, vy: 56, t: rng() * 6 };
}

function buildWaveCore(c, n) {
  c.spawnQueue.length = 0;
  const count = Math.min(6 + n * 2, 28);
  for (let i = 0; i < count; i++) {
    let t = 'scout';
    if (n >= 2 && i % 4 === 3) t = 'raider';
    if (n >= 3 && i % 7 === 6) t = 'tank';
    if (n >= 5 && i % 5 === 4) t = 'raider';
    if (n >= 3 && i % 9 === 5) t = 'zigzag';
    if (n >= 4 && i % 8 === 2) t = 'gunship';
    if (n >= 5 && i % 9 === 7) t = 'sniper';
    c.spawnQueue.push(t);
  }
  c.spawnGap = Math.max(0.3, 1.0 - n * 0.05);
  c.spawnTimer = 0.5;
}

function spawnEnemyCore(c, type, rng) {
  // hpWave：每过几波 +1 血；hpMax：封顶（防高波次变成血牛）
  const cfg = {
    scout: { hp: 1, hpWave: 4, hpMax: 3, r: 13, score: 100, vy: 58 },
    raider: { hp: 2, hpWave: 3, hpMax: 7, r: 16, score: 200, vy: 70 },
    tank: { hp: 4, hpWave: 2, hpMax: 14, r: 21, score: 400, vy: 40 },
    zigzag: { hp: 1, hpWave: 3, hpMax: 4, r: 12, score: 150, vy: 95 },
    gunship: { hp: 3, hpWave: 3, hpMax: 9, r: 19, score: 350, vy: 46 },
    sniper: { hp: 2, hpWave: 3, hpMax: 6, r: 14, score: 300, vy: 34 }
  }[type];
  const x = 26 + rng() * (LW - 52);
  const hp = Math.min(cfg.hp + Math.floor((c.wave - 1) / cfg.hpWave), cfg.hpMax);
  const sways = type === 'scout' || type === 'zigzag';   // 蛇行机型共用正弦摆动
  c.enemies.push({
    type: type, x: x, baseX: x, y: -26,
    hp: hp, maxHp: hp, r: cfg.r, score: cfg.score,
    elite: hp > cfg.hp,      // 血量超基础值：精英机（光环标记）
    vy: cfg.vy * (1 + Math.min(c.wave * 0.06, 0.9)),
    t: rng() * 6,
    amp: sways ? (type === 'zigzag' ? 34 + rng() * 26 : 18 + rng() * 22) : 0,
    freq: type === 'zigzag' ? 3.2 + rng() * 1.6 : 1.6 + rng() * 1.4,
    fireT: 0.8 + rng() * (type === 'tank' || type === 'gunship' ? 1.2 : 1.8),
    burstN: 0, burstT: 0     // 炮艇三连发状态
  });
}

function fireInterval(type, c, rng) {
  const base = type === 'scout' ? 3.4 : type === 'raider' ? 2.5
    : type === 'tank' ? 2.1 : type === 'gunship' ? 2.4 : type === 'sniper' ? 2.8 : 3.6;
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
      const spd = Math.min(FOLLOW_SPEED, dist * 10);   // 接近目标线性减速，避免到点急停
      const step = Math.min(dist, spd * dt);
      c.ship.x += ddx / dist * step;
      c.ship.y += ddy / dist * step;
    }
  }
  c.ship.x = Math.max(16, Math.min(LW - 16, c.ship.x));
  c.ship.y = Math.max(40, Math.min(LH - 24, c.ship.y));
}

function stepCore(c, dt, rng) {
  const ev = { kills: 0, hits: 0, waveClear: 0, hit: false, over: false, shieldPop: false, powerDown: false };

  // 连击窗口倒计时：超时断连
  c.comboT = Math.max(0, c.comboT - dt);
  if (c.comboT <= 0) c.combo = 0;

  moveShipCore(c, dt);
  c.ship.inv = Math.max(0, c.ship.inv - dt);

  // 自动开火（三种武器：弹幕随等级成长）
  c.fireCd -= dt;
  if (c.fireCd <= 0) {
    if (c.weapon === 'laser') {
      c.fireCd = c.power >= 5 ? 0.08 : 0.12;
      if (c.power >= 5) {
        c.bullets.push({ x: c.ship.x - 10, y: c.ship.y - 14, vy: -620, kind: 'laser' }, { x: c.ship.x, y: c.ship.y - 16, vy: -620, kind: 'laser' }, { x: c.ship.x + 10, y: c.ship.y - 14, vy: -620, kind: 'laser' });
      } else if (c.power >= 3) {
        c.bullets.push({ x: c.ship.x - 6, y: c.ship.y - 14, vy: -620, kind: 'laser' }, { x: c.ship.x + 6, y: c.ship.y - 14, vy: -620, kind: 'laser' });
      } else {
        c.bullets.push({ x: c.ship.x, y: c.ship.y - 16, vy: -620, kind: 'laser' });
      }
    } else if (c.weapon === 'missile') {
      c.fireCd = Math.max(0.3, 0.46 - c.power * 0.03);
      if (c.power >= 4) {
        c.bullets.push({ x: c.ship.x - 8, y: c.ship.y - 12, vx: -30, vy: -260, kind: 'missile', track: 1, dmg: 3, splash: 1, rot: 0 }, { x: c.ship.x + 8, y: c.ship.y - 12, vx: 30, vy: -260, kind: 'missile', track: 1, dmg: 3, splash: 1, rot: 0 });
      } else {
        c.bullets.push({ x: c.ship.x, y: c.ship.y - 16, vx: 0, vy: -260, kind: 'missile', track: 1, dmg: 3, splash: 1, rot: 0 });
      }
    } else {
      c.fireCd = c.power >= 5 ? 0.16 : FIRE_CD;
      if (c.power === 1) {
        c.bullets.push({ x: c.ship.x, y: c.ship.y - 16, vy: -540 });
      } else {
        c.bullets.push({ x: c.ship.x - 7, y: c.ship.y - 12, vy: -540 }, { x: c.ship.x + 7, y: c.ship.y - 12, vy: -540 });
      }
      if (c.power >= 3) {
        c.bullets.push({ x: c.ship.x - 13, y: c.ship.y - 4, vy: -520, vx: -84 }, { x: c.ship.x + 13, y: c.ship.y - 4, vy: -520, vx: 84 });
      }
      if (c.power >= 4) {
        c.bullets.push({ x: c.ship.x, y: c.ship.y - 20, vy: -560 });
      }
    }
  }

  // 僚机开火（跟随两侧的小无人机，匀速直射）
  c.wingCd -= dt;
  if (c.wings > 0 && c.wingCd <= 0) {
    c.wingCd = 0.3;
    if (c.wings >= 1) c.bullets.push({ x: c.ship.x - 22, y: c.ship.y + 2, vy: -480 });
    if (c.wings >= 2) c.bullets.push({ x: c.ship.x + 22, y: c.ship.y + 2, vy: -480 });
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

  // 玩家子弹（斜射弹带横向分速度；追踪导弹自动寻的）
  for (let i = 0; i < c.bullets.length; i++) {
    const b = c.bullets[i];
    if (b.track) {
      let tgt = null, td = 1e9;
      for (let tk = 0; tk < c.enemies.length; tk++) {
        const te2 = c.enemies[tk];
        if (te2.dead) continue;
        const tdx = te2.x - b.x, tdy = te2.y - b.y;
        const tdd = tdx * tdx + tdy * tdy;
        if (tdd < td) { td = tdd; tgt = te2; }
      }
      let ca = Math.atan2(b.vy, b.vx);
      if (tgt) {
        const ta = Math.atan2(tgt.y - b.y, tgt.x - b.x);
        let diff = ta - ca;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = 4.6 * dt;
        ca += Math.max(-turn, Math.min(turn, diff));
      }
      b.vx = Math.cos(ca) * 400;
      b.vy = Math.sin(ca) * 400;
      b.rot = ca + Math.PI / 2;
    }
    b.x += (b.vx || 0) * dt;
    b.y += b.vy * dt;
    if (b.y < -24 || b.x < -20 || b.x > LW + 20) b.dead = true;
  }

  for (let i = 0; i < c.enemies.length; i++) {
    const e = c.enemies[i];
    e.t += dt;
    e.y += e.vy * dt;
    if (e.type === 'scout' || e.type === 'zigzag') {
      e.x = e.baseX + Math.sin(e.t * e.freq) * e.amp;
    } else if (e.type === 'raider') {
      const d2 = c.ship.x - e.x;
      const vmax = (38 + c.wave * 3) * dt;
      e.x += Math.max(-vmax, Math.min(vmax, d2));
    }
    e.x = Math.max(e.r + 4, Math.min(LW - e.r - 4, e.x));
    if (e.y > LH + 34) { e.dead = true; continue; }
    if (e.y > 20 && e.y < LH - 90) {
      if (e.burstN > 0) {
        // 炮艇连发中：按间隔逐发朝玩家当前位置
        e.burstT -= dt;
        if (e.burstT <= 0) {
          e.burstT = 0.13;
          e.burstN--;
          const ga = Math.atan2(c.ship.y - e.y, c.ship.x - e.x);
          const gs = Math.min(150 + c.wave * 8, 230);
          c.ebullets.push({ x: e.x, y: e.y + e.r * 0.4, vx: Math.cos(ga) * gs, vy: Math.sin(ga) * gs });
        }
      } else {
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
          } else if (e.type === 'gunship') {
            e.burstN = 3; e.burstT = 0;   // 进入三连发
          } else if (e.type === 'sniper') {
            const sp2 = Math.min(300 + c.wave * 5, 380);
            c.ebullets.push({ x: e.x, y: e.y + e.r * 0.5, vx: Math.cos(ang) * sp2, vy: Math.sin(ang) * sp2, fast: 1 });
          } else {
            c.ebullets.push({ x: e.x, y: e.y + e.r * 0.5, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp });
          }
        }
      }
    }
  }

  for (let i = 0; i < c.ebullets.length; i++) {
    const eb = c.ebullets[i];
    eb.x += eb.vx * dt; eb.y += eb.vy * dt;
    if (eb.x < -10 || eb.x > LW + 10 || eb.y < -10 || eb.y > LH + 10) eb.dead = true;
  }

  // 道具下落
  for (let i = 0; i < c.drops.length; i++) {
    const dr = c.drops[i];
    dr.y += dr.vy * dt; dr.t += dt;
    if (dr.y > LH + 24) dr.dead = true;
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
        te.hp -= (pb.dmg || 1);
        ev.hits++;
        if (pb.splash) {
          // 导弹溅射：命中点半径内其他敌机各 1 伤（击破给基础分，不计连击）
          for (let si = 0; si < c.enemies.length; si++) {
            const se2 = c.enemies[si];
            if (se2 === te || se2.dead) continue;
            const sdx = se2.x - pb.x, sdy = se2.y - pb.y;
            const sr2 = (se2.r + 22) * (se2.r + 22);
            if (sdx * sdx + sdy * sdy < sr2) {
              se2.hp -= 1;
              if (se2.hp <= 0) {
                se2.dead = true;
                c.score += se2.score;
                ev.kills++;
              }
            }
          }
        }
        if (te.hp <= 0) {
          te.dead = true;
          c.combo++; c.comboT = 2.5;   // 连击 +1，刷新窗口
          c.score += te.score + Math.min(c.combo - 1, 8) * 10;
          ev.kills++;
          // 概率掉落道具（重装舰更慷慨）
          const dropP = te.type === 'tank' ? 0.4 : te.type === 'raider' ? 0.25 : 0.15;
          if (rng() < dropP) c.drops.push(makeDrop(te, rng));
        }
        break;
      }
    }
  }

  // 道具拾取（飞船 22px 内）
  for (let i = 0; i < c.drops.length; i++) {
    const dp = c.drops[i];
    const pdx = dp.x - c.ship.x, pdy = dp.y - c.ship.y;
    if (pdx * pdx + pdy * pdy >= 484) continue;
    dp.dead = true;
    if (dp.type === 'P') {
      if (c.power < 5) c.power++;
      else c.score += 500;
    } else if (dp.type === 'L') {
      c.weapon = 'laser';   // 激光武器
    } else if (dp.type === 'M') {
      c.weapon = 'missile'; // 追踪导弹
    } else if (dp.type === 'W') {
      if (c.wings < 2) c.wings++;
      else c.score += 500;
    } else if (dp.type === 'S') {
      if (c.shield < 2) c.shield++;
      else c.score += 500;
    } else if (dp.type === 'H') {
      if (c.ship.lives < 3) c.ship.lives++;
      else c.score += 300;
    } else {
      // B 清屏炸弹：敌弹全清，全场敌机 2 点伤害（击破给基础分，不计连击）
      c.ebullets.length = 0;
      for (let bi = 0; bi < c.enemies.length; bi++) {
        const be = c.enemies[bi];
        if (be.dead) continue;
        be.hp -= 2;
        if (be.hp <= 0) {
          be.dead = true;
          c.score += be.score;
          ev.kills++;
        }
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
    if (c.shield > 0) {
      // 护盾抵挡：破一层盾，短无敌，不掉命不掉火力
      c.shield--;
      c.ship.inv = 1.2;
      ev.shieldPop = true;
    } else {
      // 被撞或中弹：扣一条命，进入无敌闪烁，清空敌弹给喘息；火力掉一级、连击打断
      c.ship.lives--;
      c.ship.inv = INV_TIME;
      if (c.power > 1) { c.power--; ev.powerDown = true; }
      c.combo = 0; c.comboT = 0;
      c.ebullets.length = 0;
      ev.hit = true;
      if (c.ship.lives <= 0) ev.over = true;
    }
  }

  if (c.bullets.some(x => x.dead)) c.bullets = c.bullets.filter(x => !x.dead);
  if (c.ebullets.some(x => x.dead)) c.ebullets = c.ebullets.filter(x => !x.dead);
  if (c.enemies.some(x => x.dead)) c.enemies = c.enemies.filter(x => !x.dead);
  if (c.drops.some(x => x.dead)) c.drops = c.drops.filter(x => !x.dead);
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
  upCost: 0.14,     // 降低后 AI 敢于纵向走位
  pickW: 1.1,       // 道具吸引权重（顺路去接掉落道具）
  pickRange: 170    // 道具吸引生效半径（px）
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
  if (e.type === 'scout' || e.type === 'zigzag') {
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

/* 道具吸引加分：候选点越接近掉落道具（预判半秒漂移位）分越高，清屏弹更值钱 */
function pickGain(c, xT, yT) {
  let gain = 0;
  for (const dr of c.drops) {
    const dx = xT - dr.x, dy = yT - (dr.y + 28);   // 预判道具向下漂半秒
    const d = Math.sqrt(dx * dx + dy * dy);
    const w = dr.type === 'B' ? 1.5 : 1.0;
    const g = AI_CFG.pickW * w * Math.max(0, 1 - d / AI_CFG.pickRange);
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
    eff = (e.r + 12) * AI_CFG.band + (e.type === 'scout' || e.type === 'zigzag' ? AI_CFG.scoutPad : 0);
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

  return danger - aimGain(c, xT, yT) - pickGain(c, xT, yT);
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
      const t = aiPickTarget(c);
      c.aiGoal = { x: t.x, y: t.y };
    }
    // 目标缓动（与 app.html aiTick 一致）
    if (c.aiGoal) {
      if (!c.target) c.target = { x: c.aiGoal.x, y: c.aiGoal.y };
      const k = Math.min(1, DT * 12);
      c.target.x += (c.aiGoal.x - c.target.x) * k;
      c.target.y += (c.aiGoal.y - c.target.y) * k;
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
