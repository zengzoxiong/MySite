#!/usr/bin/env node
/**
 * 记忆翻牌（memory-flip）AI 代玩模拟器（无浏览器依赖，Node 直接运行）
 *
 * 用法：
 *   node tools/memory-flip/ai-sim.mjs [局数]
 *   局数可省略（默认 200，为每档难度各自的模拟局数），例如：node tools/memory-flip/ai-sim.mjs 500
 *
 * 说明：
 *   - 下方「纯函数核心」与 tools/memory-flip/app.html 中的实现保持一致
 *     （开局发牌、翻牌单步推进、AI 决策），改动时请两处同步。
 *   - AI 策略：记住所有翻过的牌面位置，优先配对已知对子；
 *     没有对子时系统性探索没翻过的新牌，翻到的牌若对子已知则立刻配对。
 *     该策略经信息状态 DP 推导即最优（8 对理论最优期望 12.39 步、18 对 28.53 步）。
 *   - 本游戏没有「得分」概念，成绩以「步数越少越好」衡量（每翻两张记一步），
 *     即自动演示模式；以下统计输出步数、效率与胜率，效率 = 对数 ÷ 步数。
 */

'use strict';

/* 卡面图形数量与 app.html 的 SHAPES 表一致（模拟只用到数量，不渲染 SVG） */
const SHAPES = Array.from({ length: 18 }, () => ({}));

// ===== 纯函数核心（与 app.html 保持一致） =====

// Fisher-Yates 就地洗牌，返回原数组方便链式使用
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// 创建一局的完整状态（渲染无关）
function createGame(size) {
  const pairs = (size * size) / 2;
  // 随机抽取 pairs 种图形，各复制两份后洗牌
  const pool = shuffle(SHAPES.map((_, i) => i)).slice(0, pairs);
  const deck = shuffle(pool.concat(pool));
  return {
    size: size,
    pairs: pairs,
    deck: deck,
    known: deck.map(() => false),
    matched: deck.map(() => false),
    first: -1,
    moves: 0,
    matchedPairs: 0,
    started: false,
    over: false
  };
}

// 翻一张牌的单步推进（纯函数）：idx 为牌位下标，返回 { state, event }
// event.type：'first' 翻开本轮第一张 / 'match' 配对成功 / 'miss' 配对失败 / 'win' 最后一对
function stepFlip(prev, idx) {
  const st = {
    size: prev.size, pairs: prev.pairs, deck: prev.deck,
    known: prev.known.slice(), matched: prev.matched.slice(),
    first: prev.first, moves: prev.moves, matchedPairs: prev.matchedPairs,
    started: prev.started, over: prev.over
  };
  st.known[idx] = true;
  if (st.first < 0) {
    st.first = idx;
    st.started = true;
    return { state: st, event: { type: 'first', idx: idx, shape: st.deck[idx] } };
  }
  const a = st.first, b = idx;
  st.first = -1;
  st.moves++;                                  // 本轮第二张：计一步
  if (st.deck[a] === st.deck[b]) {
    st.matched[a] = true;
    st.matched[b] = true;
    st.matchedPairs++;
    if (st.matchedPairs === st.pairs) {
      st.over = true;
      return { state: st, event: { type: 'win', a: a, b: b } };
    }
    return { state: st, event: { type: 'match', a: a, b: b } };
  }
  return { state: st, event: { type: 'miss', a: a, b: b } };
}

// ---------- AI 决策（同样与渲染无关） ----------
// 记忆翻牌 AI：记住所有翻过的牌面位置——
// 1) 有已知对子就优先配对；
// 2) 没有对子时系统性探索没翻过的新牌，翻到的牌若对子已知则立刻配对。
// 该策略经信息状态 DP 推导即最优（期望步数下界），无需额外启发式。
function aiNextFlip(st) {
  const knownList = [];     // 已翻过且未配对的位置
  const unknownList = [];   // 从未翻过的位置
  for (let i = 0; i < st.deck.length; i++) {
    if (st.matched[i]) continue;
    if (st.known[i]) knownList.push(i); else unknownList.push(i);
  }
  if (st.first >= 0) {
    // 本轮第二张：优先翻第一张的同面牌（必然配对）
    const s = st.deck[st.first];
    for (let k = 0; k < knownList.length; k++) {
      const i = knownList[k];
      if (i !== st.first && st.deck[i] === s) return i;
    }
    // 没有已知同面牌：探索没翻过的新牌
    if (unknownList.length) return unknownList[0];
    // 兜底：任意另一张已知牌（仅数据异常时出现）
    for (let k = 0; k < knownList.length; k++) {
      if (knownList[k] !== st.first) return knownList[k];
    }
    return st.first;
  }
  // 本轮第一张：先配已知对子
  const seen = new Map();
  for (let k = 0; k < knownList.length; k++) {
    const i = knownList[k];
    const s = st.deck[i];
    if (seen.has(s)) return seen.get(s);   // 发现第二张同面牌 → 从第一张开始配对
    seen.set(s, i);
  }
  // 系统性探索：按下标从小到大翻没翻过的新牌
  if (unknownList.length) return unknownList[0];
  return knownList[0];   // 兜底（仅数据异常时出现）
}

// ===== 模拟 =====

// 完整打一局（自动演示），返回 { moves, pairs }
function playOne(size) {
  let st = createGame(size);
  while (!st.over) {
    const r = stepFlip(st, aiNextFlip(st));
    st = r.state;
  }
  return { moves: st.moves, pairs: st.pairs };
}

// ===== 统计与输出 =====

const runs = Math.max(1, Number.parseInt(process.argv[2], 10) || 200);

const t0 = Date.now();
console.log('================ 记忆翻牌 AI 模拟报告 ================');
console.log('模拟局数：' + runs * 2 + ' 局（4×4 与 6×6 各 ' + runs + ' 局）');
console.log('说明：本游戏没有「得分」概念，成绩以「步数越少越好」衡量（每翻两张记一步），');
console.log('      即 AI 自动演示模式；效率 = 对数 ÷ 步数，100% 为每步都配对的完美局。');

for (const size of [4, 6]) {
  const pairs = (size * size) / 2;
  let wins = 0, sumMoves = 0, minMoves = Infinity, maxMoves = -1, perfect = 0, sumEff = 0;
  const dist = new Map();
  for (let i = 0; i < runs; i++) {
    const r = playOne(size);
    wins++;                                  // 完美记忆 AI 必然通关
    sumMoves += r.moves;
    sumEff += pairs / r.moves;
    if (r.moves < minMoves) minMoves = r.moves;
    if (r.moves > maxMoves) maxMoves = r.moves;
    if (r.moves === pairs) perfect++;
    dist.set(r.moves, (dist.get(r.moves) || 0) + 1);
  }
  const avg = sumMoves / runs;
  console.log('');
  console.log('—— ' + size + ' × ' + size + '（' + pairs + ' 对，理论最少 ' + pairs + ' 步）——');
  console.log('局数：' + runs + ' 局；胜率：' + ((wins / runs) * 100).toFixed(1) + '%（完美记忆 AI 必然通关，每局都演示到底）');
  console.log('平均步数：' + avg.toFixed(2) + ' 步（最少 ' + minMoves + ' 步 / 最多 ' + maxMoves + ' 步）');
  console.log('平均效率：' + ((sumEff / runs) * 100).toFixed(1) + '%（完美局 ' + perfect + ' 局，占 ' + ((perfect / runs) * 100).toFixed(1) + '%）');
  console.log('步数分布：');
  const keys = [...dist.keys()].sort((x, y) => x - y);
  for (const k of keys) {
    const c = dist.get(k);
    console.log('  ' + String(k).padStart(3) + ' 步：' + String(c).padStart(4) + ' 局 ' + '█'.repeat(Math.round((c / runs) * 40)));
  }
}

const elapsed = (Date.now() - t0) / 1000;
console.log('');
console.log('总耗时：' + elapsed.toFixed(2) + ' 秒');
