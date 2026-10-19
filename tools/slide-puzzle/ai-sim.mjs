#!/usr/bin/env node
/**
 * 数字华容道（滑块拼图）AI 代玩模拟器（无浏览器依赖，Node 直接运行）
 *
 * 用法：
 *   node tools/slide-puzzle/ai-sim.mjs [每档局数]
 *   每档局数可省略（默认 100）：3×3 / 4×4 / 5×5 各模拟这么多局，合计为其 3 倍
 *   例如：node tools/slide-puzzle/ai-sim.mjs 30
 *
 * 说明：
 *   - 下方「纯函数核心」与 tools/slide-puzzle/app.html 中的实现保持一致
 *     （打乱、单步推进、IDA* 与分阶段归约求解），改动时请两处同步。
 *   - AI 策略：3×3 / 4×4 先用 IDA*（曼哈顿距离 + 线性冲突启发、迭代加深）
 *     求近优解，超出节点预算时回退分阶段归约；5×5 直接用分阶段归约
 *     （逐格归位 + 行尾/列尾两格轮转技巧，右下 2×2 精确搜索收尾）。
 *   - 本游戏没有“得分”概念，成绩以解题步数衡量（越少越好）；
 *     模拟即自动演示模式：AI 必然解开，统计输出各档胜率、平均步数与求解耗时。
 */

'use strict';

// ===== 纯函数核心（与 app.html 保持一致） =====

// 完成态：cells[i] = i+1，最后一格为 0（空位）
function coreGoalCells(n) {
  const cells = new Array(n * n);
  for (let i = 0; i < n * n; i++) cells[i] = (i + 1) % (n * n);
  return cells;
}

// 是否完成：每格数字都等于目标值
function coreIsSolved(cells, n) {
  for (let i = 0; i < n * n; i++) {
    if (cells[i] !== (i + 1) % (n * n)) return false;
  }
  return true;
}

// 打乱：从完成态随机逆推若干步（不原地折返），保证必然可解
function coreShuffle(n, rng) {
  const rand = rng || Math.random;
  const steps = n === 3 ? 160 : n === 4 ? 320 : 520;
  for (;;) {
    const cells = coreGoalCells(n);
    let blank = n * n - 1;
    let prev = -1;                        // 上一次空位所在格，避免原地来回蹭
    for (let s = 0; s < steps; s++) {
      const r = Math.floor(blank / n), c = blank % n;
      const opts = [];
      if (r > 0) opts.push(blank - n);
      if (r < n - 1) opts.push(blank + n);
      if (c > 0) opts.push(blank - 1);
      if (c < n - 1) opts.push(blank + 1);
      const cand = prev >= 0 ? opts.filter(function (i) { return i !== prev; }) : opts;
      const pick = cand[Math.floor(rand() * cand.length)];
      cells[blank] = cells[pick];
      cells[pick] = 0;
      prev = blank;
      blank = pick;
    }
    if (coreIsSolved(cells, n)) continue;   // 概率极低地回到原状，重洗兜底
    return { n: n, cells: cells, blank: blank, moves: 0, solved: false };
  }
}

// 单步推进：把 idx 格的数字块滑进空位；改状态对象，返回 { moved, tile, solved }
function coreMove(state, idx) {
  const ev = { moved: false, tile: 0, solved: false };
  if (state.solved || idx < 0 || idx >= state.n * state.n || state.cells[idx] === 0) return ev;
  const n = state.n;
  const r = Math.floor(idx / n), c = idx % n;
  const br = Math.floor(state.blank / n), bc = state.blank % n;
  if (Math.abs(r - br) + Math.abs(c - bc) !== 1) return ev;   // 必须与空位相邻
  const v = state.cells[idx];
  state.cells[state.blank] = v;
  state.cells[idx] = 0;
  state.blank = idx;
  state.moves++;
  state.solved = coreIsSolved(state.cells, n);
  ev.moved = true;
  ev.tile = v;
  ev.solved = state.solved;
  return ev;
}

// ---------- AI 决策（与渲染无关） ----------

// 启发函数：曼哈顿距离 + 行/列线性冲突（均不高估，可放心用于 IDA*）
function aiH(cells, n) {
  let d = 0;
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (v === 0) continue;
    const g = v - 1;
    d += Math.abs(Math.floor(i / n) - Math.floor(g / n)) + Math.abs((i % n) - (g % n));
  }
  // 行线性冲突：同一行里两块的目标都在本行且顺序颠倒，至少多 2 步
  for (let r = 0; r < n; r++) {
    for (let c1 = 0; c1 < n; c1++) {
      const v1 = cells[r * n + c1];
      if (v1 === 0) continue;
      const g1 = v1 - 1;
      if (Math.floor(g1 / n) !== r) continue;
      for (let c2 = c1 + 1; c2 < n; c2++) {
        const v2 = cells[r * n + c2];
        if (v2 === 0) continue;
        const g2 = v2 - 1;
        if (Math.floor(g2 / n) !== r) continue;
        if (g1 % n > g2 % n) d += 2;
      }
    }
  }
  // 列线性冲突（行与列对称）
  for (let c = 0; c < n; c++) {
    for (let r1 = 0; r1 < n; r1++) {
      const v1 = cells[r1 * n + c];
      if (v1 === 0) continue;
      const g1 = v1 - 1;
      if (g1 % n !== c) continue;
      for (let r2 = r1 + 1; r2 < n; r2++) {
        const v2 = cells[r2 * n + c];
        if (v2 === 0) continue;
        const g2 = v2 - 1;
        if (g2 % n !== c) continue;
        if (Math.floor(g1 / n) > Math.floor(g2 / n)) d += 2;
      }
    }
  }
  return d;
}

// IDA*：迭代加深 A*（曼哈顿+线性冲突启发、不原路折返剪枝）；
// 返回解法（数字序列）或 null（超出节点预算，由分阶段归约兜底）
function aiSolveIda(cells0, n, nodeBudget) {
  const cells = cells0.slice();
  let blank = cells.indexOf(0);
  const path = [];
  let nodes = 0;
  let found = false;

  function dfs(g, bound, prevBlank) {
    if (nodes++ >= nodeBudget) return null;
    const h = aiH(cells, n);
    const f = g + h;
    if (f > bound) return f;
    if (h === 0) { found = true; return -1; }
    const r = Math.floor(blank / n), c = blank % n;
    const cand = [];
    if (r > 0) cand.push(blank - n);
    if (r < n - 1) cand.push(blank + n);
    if (c > 0) cand.push(blank - 1);
    if (c < n - 1) cand.push(blank + 1);
    let min = Infinity;
    // 贪心走子排序：先试曼哈顿降幅大的块，减少 IDA* 无效分支
    cand.sort(function (a, b) {
      const da = Math.abs(Math.floor(a / n) - Math.floor((cells[a] - 1) / n)) + Math.abs((a % n) - ((cells[a] - 1) % n));
      const db = Math.abs(Math.floor(b / n) - Math.floor((cells[b] - 1) / n)) + Math.abs((b % n) - ((cells[b] - 1) % n));
      return da - db;
    });
    for (let k = 0; k < cand.length; k++) {
      const idx = cand[k];
      if (idx === prevBlank) continue;   // 不把刚滑进来的块原样推回去
      const v = cells[idx];
      const pb = blank;
      cells[pb] = v;
      cells[idx] = 0;
      blank = idx;
      path.push(v);
      const t = dfs(g + 1, bound, pb);
      if (found) return t;
      if (t === null) return null;
      if (t < min) min = t;
      path.pop();
      cells[idx] = v;
      cells[pb] = 0;
      blank = pb;
    }
    return min;
  }

  if (aiH(cells, n) === 0) return [];
  let bound = aiH(cells, n);
  for (let round = 0; round < 256; round++) {
    const t = dfs(0, bound, -1);
    if (found) return path.slice();
    if (t === null) return null;
    bound = t;
  }
  return null;
}

// 把数字 v 移到 target 格（fixed 格视为墙）：对 (v 的位置, 空位位置) 做联合 BFS，
// 状态数 ≤ (n²)² 规模很小；求出走法后直接作用到 cells / moves 上
function aiMoveTileTo(cells, moves, n, v, target, fixed) {
  const size = n * n;
  const startTile = cells.indexOf(v);
  if (startTile === target) return true;
  const startBlank = cells.indexOf(0);
  const start = startTile * size + startBlank;
  const prev = new Map();
  prev.set(start, null);
  const queue = [start];
  let endKey = -1;
  for (let head = 0; head < queue.length; head++) {
    const key = queue[head];
    const tp = Math.floor(key / size), bp = key % size;
    if (tp === target) { endKey = key; break; }
    const br = Math.floor(bp / n), bc = bp % n;
    const cand = [];
    if (br > 0) cand.push(bp - n);
    if (br < n - 1) cand.push(bp + n);
    if (bc > 0) cand.push(bp - 1);
    if (bc < n - 1) cand.push(bp + 1);
    for (let k = 0; k < cand.length; k++) {
      const nb = cand[k];
      if (fixed[nb]) continue;
      let ntp = tp;
      if (nb === tp) ntp = bp;           // 空位滑进 v 所在格 → v 被推到空位原处
      const nkey = ntp * size + nb;
      if (prev.has(nkey)) continue;
      prev.set(nkey, { from: key, idx: nb });
      queue.push(nkey);
    }
  }
  if (endKey < 0) return false;
  const seq = [];
  let k = endKey;
  while (prev.get(k)) {
    const p = prev.get(k);
    seq.push(p.idx);
    k = p.from;
  }
  seq.reverse();
  let blank = startBlank;
  for (let i = 0; i < seq.length; i++) {
    const idx = seq[i];
    const tv = cells[idx];
    moves.push(tv);
    cells[blank] = tv;
    cells[idx] = 0;
    blank = idx;
  }
  return true;
}

// 把空位移到 target 格（fixed 格视为墙），BFS 出路后逐格滑动执行
function aiMoveBlankTo(cells, moves, n, target, fixed) {
  const size = n * n;
  const start = cells.indexOf(0);
  if (start === target) return true;
  const prev = new Int32Array(size).fill(-2);
  prev[start] = -1;
  const queue = [start];
  let end = -1;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === target) { end = cur; break; }
    const r = Math.floor(cur / n), c = cur % n;
    const cand = [];
    if (r > 0) cand.push(cur - n);
    if (r < n - 1) cand.push(cur + n);
    if (c > 0) cand.push(cur - 1);
    if (c < n - 1) cand.push(cur + 1);
    for (let k = 0; k < cand.length; k++) {
      const nb = cand[k];
      if (fixed[nb] || prev[nb] !== -2) continue;
      prev[nb] = cur;
      queue.push(nb);
    }
  }
  if (end < 0) return false;
  const seq = [];
  let k = end;
  while (prev[k] !== -1) { seq.push(k); k = prev[k]; }
  seq.reverse();
  let blank = start;
  for (let i = 0; i < seq.length; i++) {
    const idx = seq[i];
    const v = cells[idx];
    moves.push(v);
    cells[blank] = v;
    cells[idx] = 0;
    blank = idx;
  }
  return true;
}

// 滑动一格：idx 格数字块滑进空位（调用方保证二者相邻）
function aiSlide(cells, moves, idx) {
  const blank = cells.indexOf(0);
  const v = cells[idx];
  moves.push(v);
  cells[blank] = v;
  cells[idx] = 0;
}

// 把 A、B 两块分别送到 targetA / targetB（fixed 格视为墙）：对
// (A 的位置, B 的位置, 空位位置) 做联合 BFS，状态数 ≤ (n²)³ 仍然很小。
// 两块必须一起规划：先把 A 停进单门的行尾角会封死 B 的出口，逐块贪心必卡死。
function aiMovePairTo(cells, moves, n, vA, targetA, vB, targetB, fixed) {
  const size = n * n;
  const a0 = cells.indexOf(vA), b0 = cells.indexOf(vB), s0 = cells.indexOf(0);
  if (a0 === targetA && b0 === targetB) return true;
  const keyOf = function (a, b, blank) { return (a * size + b) * size + blank; };
  const start = keyOf(a0, b0, s0);
  const prev = new Map();
  prev.set(start, null);
  const queue = [start];
  let endKey = -1;
  for (let head = 0; head < queue.length; head++) {
    const key = queue[head];
    const bp = key % size;
    const bpos = Math.floor(key / size) % size;
    const apos = Math.floor(key / (size * size));
    if (apos === targetA && bpos === targetB) { endKey = key; break; }
    const br = Math.floor(bp / n), bc = bp % n;
    const cand = [];
    if (br > 0) cand.push(bp - n);
    if (br < n - 1) cand.push(bp + n);
    if (bc > 0) cand.push(bp - 1);
    if (bc < n - 1) cand.push(bp + 1);
    for (let k = 0; k < cand.length; k++) {
      const nb = cand[k];
      if (fixed[nb]) continue;
      let na = apos, nbp = bpos;
      if (nb === apos) na = bp;
      else if (nb === bpos) nbp = bp;
      const nkey = keyOf(na, nbp, nb);
      if (prev.has(nkey)) continue;
      prev.set(nkey, { from: key, idx: nb });
      queue.push(nkey);
    }
  }
  if (endKey < 0) return false;
  const seq = [];
  let k = endKey;
  while (prev.get(k)) {
    const p = prev.get(k);
    seq.push(p.idx);
    k = p.from;
  }
  seq.reverse();
  let blank = s0;
  for (let i = 0; i < seq.length; i++) {
    const idx = seq[i];
    const tv = cells[idx];
    moves.push(tv);
    cells[blank] = tv;
    cells[idx] = 0;
    blank = idx;
  }
  return true;
}

// 收尾：右下 2×2 内精确 BFS（状态至多 24 个），只在角内滑动
function aiSolveCorner(cells, moves, n) {
  const size = n * n;
  const ids = [(n - 2) * n + (n - 2), (n - 2) * n + (n - 1), (n - 1) * n + (n - 2), (n - 1) * n + (n - 1)];
  const goal = ids.map(function (i) { return (i + 1) % size; });
  const start = ids.map(function (i) { return cells[i]; });
  const adj = [[1, 2], [0, 3], [0, 3], [1, 2]];   // 2×2 邻接：0-1、0-2、1-3、2-3
  const keyOf = function (arr) { return arr.join(','); };
  const prev = new Map();
  prev.set(keyOf(start), null);
  const queue = [start];
  let endArr = null;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur[0] === goal[0] && cur[1] === goal[1] && cur[2] === goal[2] && cur[3] === goal[3]) {
      endArr = cur;
      break;
    }
    const b = cur.indexOf(0);
    for (let k = 0; k < adj[b].length; k++) {
      const nb = adj[b][k];
      const nxt = cur.slice();
      const moved = nxt[nb];
      nxt[b] = moved;
      nxt[nb] = 0;
      const kk = keyOf(nxt);
      if (prev.has(kk)) continue;
      prev.set(kk, { from: cur, moved: moved });
      queue.push(nxt);
    }
  }
  if (!endArr) return false;
  const seq = [];
  let cur = endArr;
  while (prev.get(keyOf(cur))) {
    const p = prev.get(keyOf(cur));
    seq.push(p.moved);
    cur = p.from;
  }
  seq.reverse();
  for (let i = 0; i < seq.length; i++) {
    aiSlide(cells, moves, cells.indexOf(seq[i]));
  }
  return true;
}

// 分阶段归约求解（任意档位通用）：
//   1）逐行归位：每行前 n-2 列直接归位，最后两列用“暂存 + 轮转”一次归位
//      （角格是单门半岛，贪心推入后无法保持，必须整对轮转）；
//   2）逐列归位底部两行的前 n-2 列，同样两格轮转；
//   3）右下 2×2 精确搜索收尾。
function aiSolveStaged(cells0, n) {
  const size = n * n;
  const cells = cells0.slice();
  const moves = [];
  const fixed = new Uint8Array(size);     // 1 = 已归位、不可扰动

  // 逐行归位（行 0 .. n-3）
  for (let r = 0; r <= n - 3; r++) {
    for (let c = 0; c <= n - 3; c++) {
      const i = r * n + c;
      const v = i + 1;
      if (cells[i] !== v && !aiMoveTileTo(cells, moves, n, v, i, fixed)) return null;
      fixed[i] = 1;
    }
    // 行尾两格：A=(r,n-2)、B=(r,n-1)，先暂存再轮转归位
    const aTgt = r * n + (n - 2), bTgt = r * n + (n - 1);
    const A = aTgt + 1, B = bTgt + 1;
    if (cells[aTgt] !== A || cells[bTgt] !== B) {
      const parkB = (r + 1) * n + (n - 1);
      // 两块一起送到暂存位：A 行尾角、B 正下方，再轮转
      if (!aiMovePairTo(cells, moves, n, A, bTgt, B, parkB, fixed)) return null;
      fixed[bTgt] = 1;
      fixed[parkB] = 1;
      if (!aiMoveBlankTo(cells, moves, n, aTgt, fixed)) return null;     // 空位到 A 左侧
      aiSlide(cells, moves, bTgt);          // A 左移归位
      aiSlide(cells, moves, parkB);         // B 上移归位
      fixed[parkB] = 0;
    }
    fixed[aTgt] = 1;
    fixed[bTgt] = 1;
  }

  // 逐列归位（列 0 .. n-3，只剩底部两行）
  for (let c = 0; c <= n - 3; c++) {
    const aTgt = (n - 2) * n + c, bTgt = (n - 1) * n + c;
    const A = aTgt + 1, B = bTgt + 1;
    if (cells[aTgt] !== A || cells[bTgt] !== B) {
      const parkB = (n - 1) * n + (c + 1);
      // 两块一起送到暂存位：A 列底、B 右侧，再轮转
      if (!aiMovePairTo(cells, moves, n, A, bTgt, B, parkB, fixed)) return null;
      fixed[bTgt] = 1;
      fixed[parkB] = 1;
      if (!aiMoveBlankTo(cells, moves, n, aTgt, fixed)) return null;     // 空位到 A 上方
      aiSlide(cells, moves, bTgt);          // A 上移归位
      aiSlide(cells, moves, parkB);         // B 左移归位
      fixed[parkB] = 0;
    }
    fixed[aTgt] = 1;
    fixed[bTgt] = 1;
  }

  if (!aiSolveCorner(cells, moves, n)) return null;
  return moves;
}

// IDA* 节点预算：超出即回退分阶段归约，保证浏览器里不卡死
const AI_IDA_BUDGET = { 3: 300000, 4: 2000000 };

// AI 单步决策入口：求出完整解法（应滑动的数字序列），与渲染无关
// 返回 { moves, method }，method 为 'ida'（IDA* 近优解）或 'staged'（分阶段归约）
function aiSolve(cells0, n) {
  const cells = cells0.slice();
  if (coreIsSolved(cells, n)) return { moves: [], method: 'ida' };
  if (n <= 4) {
    const ida = aiSolveIda(cells, n, AI_IDA_BUDGET[n] || 0);
    if (ida) return { moves: ida, method: 'ida' };
  }
  return { moves: aiSolveStaged(cells, n), method: 'staged' };
}

// ===== 模拟 =====

// 完整打一局：打乱 → AI 求解 → 严格按规则回放，返回统计项
function playOne(n) {
  const st = coreShuffle(n);
  const plan = aiSolve(st.cells, n);
  if (!plan.moves) return { win: false, moves: -1, method: plan.method };
  for (let i = 0; i < plan.moves.length; i++) {
    const idx = st.cells.indexOf(plan.moves[i]);
    const ev = coreMove(st, idx);
    if (!ev.moved) return { win: false, moves: -1, method: plan.method };   // 走法非法 = 求解器缺陷
  }
  return { win: st.solved, moves: st.moves, method: plan.method };
}

// ===== 统计与输出 =====

const perSize = Math.max(1, Number.parseInt(process.argv[2], 10) || 100);
const SIZES = [3, 4, 5];

const t0 = Date.now();
const stats = {};
for (const n of SIZES) {
  stats[n] = { games: 0, wins: 0, sum: 0, min: Infinity, max: -1, ida: 0, staged: 0, ms: 0 };
}
for (const n of SIZES) {
  const s = stats[n];
  for (let i = 0; i < perSize; i++) {
    const g0 = Date.now();
    const r = playOne(n);
    s.ms += Date.now() - g0;
    s.games++;
    if (!r.win) continue;
    s.wins++;
    s.sum += r.moves;
    if (r.moves < s.min) s.min = r.moves;
    if (r.moves > s.max) s.max = r.moves;
    if (r.method === 'ida') s.ida++; else s.staged++;
  }
}
const elapsed = (Date.now() - t0) / 1000;

console.log('================ 数字华容道 AI 模拟报告 ================');
console.log('模拟局数：' + perSize + ' 局/档 × 3 档 = ' + (perSize * SIZES.length) + ' 局');
console.log('说明：本游戏无“得分”概念（平均分记 -1），成绩以解题步数衡量（越少越好）；');
console.log('      模拟即自动演示模式，AI 必然解开，胜率恒为 100%（统计如下按实测列出）。');
let allWins = 0, allGames = 0, allSum = 0;
for (const n of SIZES) {
  const s = stats[n];
  allWins += s.wins; allGames += s.games; allSum += s.sum;
  console.log('—— ' + n + '×' + n + ' ——');
  console.log('  胜率：' + ((s.wins / s.games) * 100).toFixed(1) + '%（解开 ' + s.wins + ' / ' + s.games + ' 局）');
  if (s.wins) {
    console.log('  解题步数：平均 ' + (s.sum / s.wins).toFixed(1) + ' 步（最少 ' + s.min + ' 步，最多 ' + s.max + ' 步）');
    console.log('  解法来源：IDA* 近优解 ' + s.ida + ' 局 / 分阶段归约 ' + s.staged + ' 局');
    console.log('  求解耗时：平均 ' + (s.ms / s.games).toFixed(1) + ' ms/局');
  }
}
if (allWins) {
  console.log('—— 汇总 ——');
  console.log('  总胜率：' + ((allWins / allGames) * 100).toFixed(1) + '%（解开 ' + allWins + ' / ' + allGames + ' 局）');
  console.log('  全部对局平均步数：' + (allSum / allWins).toFixed(1) + ' 步');
}
console.log('总耗时：' + elapsed.toFixed(1) + ' 秒（平均 ' + Math.round((elapsed * 1000) / allGames) + ' ms/局）');
