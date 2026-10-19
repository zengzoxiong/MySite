/* ============================================================
 * 迷宫寻宝 · AI 代玩离线模拟（不依赖浏览器，Node 直接运行）
 *
 * 用法：
 *   node tools/maze-runner/ai-sim.mjs [每档局数] [起始种子]
 *   例：node tools/maze-runner/ai-sim.mjs            → 默认每档 120 局（3 档共 360 局），种子 20261019
 *       node tools/maze-runner/ai-sim.mjs 200 7      → 每档 200 局，种子 7（结果可复现）
 *
 * 说明：
 *   - coreGenerateMaze / coreFindPath / coreNewGame / coreMove / aiNextMove
 *     与 tools/maze-runner/app.html 内「纯函数核心」玩法规则完全一致，
 *     调规则请两处同步修改；
 *   - 本游戏无「得分」概念（成绩由用时、步数与星星评级 1~3 星体现），
 *     故不统计平均分，改统计胜率、步数冗余与三星率；用时按 AI 每步
 *     0.11 秒折算（与 app.html 的 AI_STEP_MS 一致），据此套用与页面
 *     相同的评级公式；
 *   - AI 代玩属自动演示模式：页面上 AI 成绩不计入最佳用时，模拟统计
 *     仅用于评估算法水平。
 * ============================================================ */

'use strict';

/* ---------- 基本常量（与 app.html 一致） ---------- */
const PAR_TIME = { 11: 60, 17: 150, 25: 300 };   // 各难度目标时间（秒）
const AI_STEP_SEC = 0.11;                        // AI 每步折算秒数（AI_STEP_MS / 1000）

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

/* ================= 纯函数核心（与 app.html 保持一致） ================= */

/* ---------- 迷宫生成：递归回溯，返回 { n, walls } ---------- */
function coreGenerateMaze(size, rng) {
  const n = size;
  const walls = [];
  const visited = [];
  const rand = rng || Math.random;
  for (let r = 0; r < n; r++) {
    walls.push([]);
    visited.push([]);
    for (let c = 0; c < n; c++) {
      walls[r].push({ n: true, e: true, s: true, w: true });
      visited[r].push(false);
    }
  }
  // 递归回溯（用显式栈实现，避免深层递归）
  const stack = [{ r: 0, c: 0 }];
  visited[0][0] = true;
  const dirs = [
    { dr: -1, dc: 0, a: 'n', b: 's' },
    { dr: 1, dc: 0, a: 's', b: 'n' },
    { dr: 0, dc: -1, a: 'w', b: 'e' },
    { dr: 0, dc: 1, a: 'e', b: 'w' }
  ];
  while (stack.length > 0) {
    const cur = stack[stack.length - 1];
    // 收集未访问的邻居
    const cands = [];
    for (const d of dirs) {
      const nr = cur.r + d.dr, nc = cur.c + d.dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n && !visited[nr][nc]) {
        cands.push({ nr: nr, nc: nc, d: d });
      }
    }
    if (cands.length === 0) {
      stack.pop();
      continue;
    }
    const pick = cands[Math.floor(rand() * cands.length)];
    walls[cur.r][cur.c][pick.d.a] = false;
    walls[pick.nr][pick.nc][pick.d.b] = false;
    visited[pick.nr][pick.nc] = true;
    stack.push({ r: pick.nr, c: pick.nc });
  }
  // 入口开在左上、出口开在右下
  walls[0][0].w = false;
  walls[n - 1][n - 1].e = false;
  return { n: n, walls: walls };
}

/* ---------- BFS 求最短路（返回 [{r,c},...]，含起终点；不可达返回 []） ---------- */
function coreFindPath(walls, n, from, to) {
  if (from.r === to.r && from.c === to.c) return [{ r: from.r, c: from.c }];
  const prev = [];
  for (let r = 0; r < n; r++) {
    prev.push([]);
    for (let c = 0; c < n; c++) prev[r].push(null);
  }
  const q = [{ r: from.r, c: from.c }];
  const seen = new Set([from.r + ',' + from.c]);
  let found = false;
  while (q.length > 0) {
    const cur = q.shift();
    if (cur.r === to.r && cur.c === to.c) { found = true; break; }
    const w = walls[cur.r][cur.c];
    const moves = [
      { dr: -1, dc: 0, open: !w.n },
      { dr: 1, dc: 0, open: !w.s },
      { dr: 0, dc: -1, open: !w.w },
      { dr: 0, dc: 1, open: !w.e }
    ];
    for (const m of moves) {
      if (!m.open) continue;
      const nr = cur.r + m.dr, nc = cur.c + m.dc;
      const k = nr + ',' + nc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n || seen.has(k)) continue;
      seen.add(k);
      prev[nr][nc] = cur;
      q.push({ r: nr, c: nc });
    }
  }
  if (!found) return [];
  // 回溯出完整路径
  const path = [];
  let cur = { r: to.r, c: to.c };
  while (cur) {
    path.unshift(cur);
    cur = prev[cur.r][cur.c];
  }
  return path;
}

/* ---------- 开局状态（纯函数）：迷宫 + 沿解路径放星星 ---------- */
function coreNewGame(size, rng) {
  const g = coreGenerateMaze(size, rng);
  const n = g.n, walls = g.walls;
  const path = coreFindPath(walls, n, { r: 0, c: 0 }, { r: n - 1, c: n - 1 });
  // 星星放在解路径 25% / 50% / 75% 处
  const stars = [];
  const usedIdx = new Set();
  const fracs = [0.25, 0.5, 0.75];
  for (const f of fracs) {
    let idx = Math.min(path.length - 2, Math.max(1, Math.round(path.length * f)));
    // 防止两颗星星落在同一格：必要时沿路径顺移
    while (usedIdx.has(idx) && idx < path.length - 2) idx++;
    while (usedIdx.has(idx) && idx > 1) idx--;
    usedIdx.add(idx);
    stars.push({ r: path[idx].r, c: path[idx].c, got: false });
  }
  return {
    n: n,
    walls: walls,
    stars: stars,
    player: { r: 0, c: 0 },
    steps: 0,
    collected: 0,
    finished: false
  };
}

/* ---------- 单步推进（纯函数）：改状态对象，返回 { moved, gotStar, won } ---------- */
function coreMove(state, dr, dc) {
  const ev = { moved: false, gotStar: false, won: false };
  if (state.finished) return ev;
  const w = state.walls[state.player.r][state.player.c];
  if (dr === -1 && w.n) return ev;
  if (dr === 1 && w.s) return ev;
  if (dc === -1 && w.w) return ev;
  if (dc === 1 && w.e) return ev;
  const nr = state.player.r + dr, nc = state.player.c + dc;
  if (nr < 0 || nr >= state.n || nc < 0 || nc >= state.n) return ev;
  state.player = { r: nr, c: nc };
  state.steps++;
  // 拾取星星
  for (const st of state.stars) {
    if (!st.got && st.r === nr && st.c === nc) {
      st.got = true;
      state.collected++;
      ev.gotStar = true;
    }
  }
  ev.moved = true;
  if (nr === state.n - 1 && nc === state.n - 1) {
    state.finished = true;
    ev.won = true;
  }
  return ev;
}

/* ---------- AI 决策（与渲染无关）：BFS 最短路逐格移动 ----------
   目标：优先奔向 BFS 距离最近的未收集星星，集齐后直奔出口。
   星星取自解路径 25%/50%/75% 处且迷宫通路构成树，故该贪心即最优路线。 */
function aiNextMove(state) {
  const n = state.n, walls = state.walls;
  const from = state.player;
  // BFS 记录距离与前驱，一次搜索即可得到到任意目标的最短路
  const prev = [], dist = [];
  for (let r = 0; r < n; r++) {
    prev.push([]);
    dist.push([]);
    for (let c = 0; c < n; c++) {
      prev[r].push(null);
      dist[r].push(-1);
    }
  }
  dist[from.r][from.c] = 0;
  const q = [from];
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    const w = walls[cur.r][cur.c];
    const moves = [
      { dr: -1, dc: 0, open: !w.n },
      { dr: 1, dc: 0, open: !w.s },
      { dr: 0, dc: -1, open: !w.w },
      { dr: 0, dc: 1, open: !w.e }
    ];
    for (const m of moves) {
      if (!m.open) continue;
      const nr = cur.r + m.dr, nc = cur.c + m.dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n || dist[nr][nc] >= 0) continue;
      dist[nr][nc] = dist[cur.r][cur.c] + 1;
      prev[nr][nc] = cur;
      q.push({ r: nr, c: nc });
    }
  }
  // 选目标：最近的未收集星星，否则出口
  let target = null, bestD = Infinity;
  for (const st of state.stars) {
    if (st.got) continue;
    const d = dist[st.r][st.c];
    if (d > 0 && d < bestD) { bestD = d; target = { r: st.r, c: st.c }; }
  }
  if (!target) target = { r: n - 1, c: n - 1 };
  const td = dist[target.r][target.c];
  if (td <= 0) return null;      // 已在目标格或目标不可达
  // 沿前驱回溯出玩家的下一格
  let cur = target;
  while (prev[cur.r][cur.c] &&
    !(prev[cur.r][cur.c].r === from.r && prev[cur.r][cur.c].c === from.c)) {
    cur = prev[cur.r][cur.c];
  }
  return { dr: cur.r - from.r, dc: cur.c - from.c };
}

/* ================= 单局模拟 ================= */
/* 理论最优步数：枚举 3! 星星访问顺序，取「起点→星星…→出口」最短路之和最小值 */
function optimalSteps(st) {
  const nodes = [{ r: 0, c: 0 }]
    .concat(st.stars.map(function (s) { return { r: s.r, c: s.c }; }))
    .concat([{ r: st.n - 1, c: st.n - 1 }]);
  const d = [];
  for (let i = 0; i < nodes.length; i++) {
    d.push([]);
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) { d[i].push(0); continue; }
      const p = coreFindPath(st.walls, st.n, nodes[i], nodes[j]);
      d[i].push(p.length ? p.length - 1 : Infinity);
    }
  }
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  let best = Infinity;
  for (const pm of perms) {
    const total = d[0][1 + pm[0]] + d[1 + pm[0]][1 + pm[1]] +
      d[1 + pm[1]][1 + pm[2]] + d[1 + pm[2]][4];
    if (total < best) best = total;
  }
  return best;
}

function simulateGame(rng, size) {
  const st = coreNewGame(size, rng);
  const opt = optimalSteps(st);
  const cap = size * size * 6;   // 安全上限，正常远达不到
  while (!st.finished && st.steps < cap) {
    const d = aiNextMove(st);
    if (!d) break;
    const ev = coreMove(st, d.dr, d.dc);
    if (!ev.moved) break;
  }
  const sec = st.steps * AI_STEP_SEC;
  const timeOK = sec <= PAR_TIME[size];
  const starsOK = st.collected === 3;
  // 与页面相同的评级公式：完成 1 星；时间达标或星星集齐 2 星；两者兼得 3 星
  let rate = 1;
  if (timeOK || starsOK) rate = 2;
  if (timeOK && starsOK) rate = 3;
  return {
    won: st.finished,
    steps: st.steps,
    stars: st.collected,
    opt: opt,
    sec: sec,
    rate: rate
  };
}

/* ---------- 统计与输出 ---------- */
function main() {
  const argN = parseInt(process.argv[2], 10);
  const argSeed = parseInt(process.argv[3], 10);
  const perDiff = Number.isFinite(argN) && argN > 0 ? argN : 120;
  const seed = Number.isFinite(argSeed) ? argSeed >>> 0 : 20261019;

  const SIZES = [11, 17, 25];
  const LABEL = { 11: '简单 11×11', 17: '中等 17×17', 25: '困难 25×25' };
  const t0 = Date.now();
  const rng = mulberry32(seed);
  const sum = arr => arr.reduce((s, v) => s + v, 0);
  const pct = (x, total) => (x / total * 100).toFixed(1) + '%';

  console.log('============ 迷宫寻宝 · AI 代玩模拟报告 ============');
  console.log('模拟设置       : 每档 ' + perDiff + ' 局 × 3 档难度，随机种子 ' + seed +
    '，用时按每步 ' + AI_STEP_SEC + ' 秒折算');

  let allGames = 0, allWon = 0, allStar3 = 0, allRedund = 0, allSteps = 0, allStars = 0;
  for (const size of SIZES) {
    const results = [];
    for (let i = 0; i < perDiff; i++) results.push(simulateGame(rng, size));
    const games = results.length;
    const won = results.filter(r => r.won).length;
    const steps = results.map(r => r.steps);
    const opts = results.map(r => r.opt);
    const redund = results.map(r => r.steps - r.opt);
    const stars = results.map(r => r.stars);
    const rates = results.map(r => r.rate);
    const secs = results.map(r => r.sec);
    const star3 = rates.filter(r => r === 3).length;

    console.log('—— ' + LABEL[size] + ' ——');
    console.log('局数 / 胜率    : ' + games + ' 局，通关 ' + won + '（' + pct(won, games) + '）');
    console.log('步数           : 平均 ' + (sum(steps) / games).toFixed(1) +
      '（最优 ' + (sum(opts) / games).toFixed(1) + '，冗余 ' + (sum(redund) / games).toFixed(2) +
      ' 步，最少 ' + Math.min.apply(null, steps) + ' / 最多 ' + Math.max.apply(null, steps) + '）');
    console.log('星星           : 平均 ' + (sum(stars) / games).toFixed(2) + ' / 3（收集率 ' +
      pct(sum(stars), games * 3) + '）');
    console.log('评级           : 平均 ' + (sum(rates) / games).toFixed(2) + ' 星，三星率 ' +
      pct(star3, games) + '（3 星 = 星星集齐 + 用时 ≤ ' + PAR_TIME[size] + ' 秒）');
    console.log('折算用时       : 平均 ' + (sum(secs) / games).toFixed(1) + ' 秒（目标 ' +
      PAR_TIME[size] + ' 秒）');

    allGames += games;
    allWon += won;
    allStar3 += star3;
    allRedund += sum(redund);
    allSteps += sum(steps);
    allStars += sum(stars);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('—— 全部合计 ——');
  console.log('总局数 / 胜率  : ' + allGames + ' 局，通关 ' + allWon + '（' + pct(allWon, allGames) + '）');
  console.log('平均步数 / 星星: ' + (allSteps / allGames).toFixed(1) + ' 步，' +
    (allStars / allGames).toFixed(2) + ' / 3 颗');
  console.log('三星率 / 冗余  : ' + pct(allStar3, allGames) + '，平均冗余 ' +
    (allRedund / allGames).toFixed(2) + ' 步（0 = 步步最优）');
  console.log('模拟耗时       : ' + elapsed + ' 秒');
  console.log('备注           : 本游戏无「得分」概念（成绩由用时、步数、星星评级体现），');
  console.log('                 故以胜率 / 步数冗余 / 三星率代替平均分；AI 代玩为自动演示');
  console.log('                 模式，页面上成绩不计入最佳用时。');
  console.log('====================================================');
}

main();
