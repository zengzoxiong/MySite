#!/usr/bin/env node
/* -*- coding: utf-8 -*-
 * 数独 AI 代玩模拟器（拾光集 · ai-sim.mjs）
 *
 * 用法：
 *   node tools/sudoku/ai-sim.mjs [局数] [--diff=入门|中等|困难]
 *   局数默认 120；--diff 只跑某一难度（默认三档难度均分轮转）
 * 示例：
 *   node tools/sudoku/ai-sim.mjs                 # 三档难度各 40 题，共 120 局
 *   node tools/sudoku/ai-sim.mjs 300             # 跑 300 局
 *   node tools/sudoku/ai-sim.mjs 60 --diff=困难   # 只跑 60 道困难题
 *
 * 说明：
 *   - 核心逻辑（题库生成 / 状态构建 / 单步推进 / 冲突检测 / MRV 回溯求解）
 *     直接从 app.html 的 AI_CORE_BEGIN / AI_CORE_END 标记之间提取执行，
 *     与页面「AI 代玩」严格同一份代码，杜绝两处实现漂移。
 *   - 不依赖浏览器，纯 node 运行；自动用 worker_threads 多线程并行加速
 *     （线程数 = min(CPU 核数 - 1, 8)）。
 *   - 数独无「得分」概念：本模拟为自动演示模式，按页面代玩规则跑完整解题
 *     （MRV 选格 + 回溯重试），统计解出率（胜率）、填数 / 回溯步数与求解
 *     用时，平均分不适用（记 -1）。
 */
'use strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { Worker as ThreadWorker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, 'app.html');
const DIFFS = ['入门', '中等', '困难'];

/* ---------- 从 app.html 提取与页面同源的核心逻辑 ---------- */
function loadCore() {
  const html = readFileSync(htmlPath, 'utf8');
  const begin = html.indexOf('/* ===== AI_CORE_BEGIN');
  const end = html.indexOf('/* ===== AI_CORE_END');
  if (begin < 0 || end < 0 || end <= begin) {
    console.error('错误：未能从 app.html 中找到 AI_CORE_BEGIN / AI_CORE_END 标记，无法提取核心逻辑。');
    process.exit(1);
  }
  const src = html.slice(begin, end);
  if (src.indexOf('function aiCoreSudoku') < 0) {
    console.error('错误：提取的片段中缺少 aiCoreSudoku 工厂函数，请检查 app.html 标记区。');
    process.exit(1);
  }
  const make = new Function(src + '\nreturn { generatePuzzle: generatePuzzle, parsePuzzle: parsePuzzle, computeConflicts: computeConflicts, aiCoreSudoku: aiCoreSudoku };');
  return make();
}

/* ---------- 单局模拟：生成一题后 AI 全程演示解题（MRV 回溯） ---------- */
function playOne(bundle, no, diff) {
  const t0 = Date.now();
  const puzzle = bundle.generatePuzzle(no, diff);
  const t1 = Date.now();
  const state = bundle.parsePuzzle(puzzle);
  const core = bundle.aiCoreSudoku();
  const session = core.newSession(state.grid);
  const res = core.runToEnd(session);
  const t2 = Date.now();
  // 校验：解出的终盘必须与该题答案一致，否则本局记失败
  const solved = res.solved && session.work.join('') === puzzle.a;
  return {
    diff: diff,
    no: no,
    solved: solved,
    places: res.places,
    erases: res.erases,
    steps: res.steps,
    genMs: t1 - t0,
    solveMs: t2 - t1
  };
}

/* ---------- 主线程：解析参数、并行分发、聚合统计 ---------- */
if (isMainThread) {
  const argv = process.argv.slice(2);
  const diffArg = argv.find(function (a) { return a.indexOf('--diff=') === 0; });
  const onlyDiff = diffArg ? diffArg.slice('--diff='.length) : '';
  if (onlyDiff && DIFFS.indexOf(onlyDiff) < 0) {
    console.error('错误：--diff 只支持 入门 / 中等 / 困难，收到：' + onlyDiff);
    process.exit(1);
  }
  const posArgs = argv.filter(function (a) { return a.indexOf('--diff=') !== 0; });
  const games = Math.max(1, parseInt(posArgs[0], 10) || 120);

  loadCore();   // 先在主线程校验提取可用，失败即退出

  // 任务分配：题号 1..N 顺序取（同题号同难度恒定同一题，结果可复现），难度均分轮转
  const jobs = [];
  for (let i = 0; i < games; i++) {
    jobs.push({ no: i + 1, diff: onlyDiff || DIFFS[i % 3] });
  }

  const threads = Math.max(1, Math.min(os.cpus().length - 1 || 1, 8, games));
  const per = Math.ceil(games / threads);
  const startedAt = Date.now();
  const all = [];
  let finished = 0, dispatched = 0;

  console.error('并行 ' + threads + ' 线程，模拟 ' + games + ' 局中……');
  for (let t = 0; t < threads; t++) {
    const slice = jobs.slice(t * per, Math.min((t + 1) * per, games));
    if (!slice.length) break;
    dispatched++;
    const w = new ThreadWorker(new URL(import.meta.url), { workerData: { jobs: slice } });
    w.on('message', function (results) {
      for (const r of results) all.push(r);
      finished++;
      console.error('  线程完成 ' + finished + '/' + dispatched);
    });
    w.on('error', function (err) { console.error('子线程出错：' + err.message); process.exit(1); });
  }

  const timer = setInterval(function () {
    if (finished >= dispatched) {
      clearInterval(timer);
      report(all, Date.now() - startedAt);
    }
  }, 100);
} else {
  /* ---------- 子线程：跑分到的题目后回传 ---------- */
  const bundle = loadCore();
  const results = [];
  for (const job of workerData.jobs) results.push(playOne(bundle, job.no, job.diff));
  parentPort.postMessage(results);
}

/* ---------- 中文统计输出 ---------- */
function fmt1(x) { return (Math.round(x * 10) / 10).toFixed(1); }

function report(rows, wallMs) {
  const total = rows.length;
  const won = rows.filter(function (r) { return r.solved; });
  const avg = function (list, f) {
    return list.length ? list.reduce(function (s, r) { return s + f(r); }, 0) / list.length : 0;
  };
  const line = function (label, list) {
    const n = list.length;
    const w = list.filter(function (r) { return r.solved; }).length;
    console.log(label + '：' + n + ' 题，解出 ' + w + ' 题（胜率 ' +
      (n ? fmt1(w * 100 / n) : '0.0') + '%），平均填数 ' + fmt1(avg(list, function (r) { return r.places; })) +
      ' 步，平均回溯 ' + fmt1(avg(list, function (r) { return r.erases; })) +
      ' 次，平均求解 ' + fmt1(avg(list, function (r) { return r.solveMs; })) + ' ms');
  };

  console.log('===== 数独 AI 代玩模拟统计（自动演示模式）=====');
  console.log('模拟局数：' + total + ' 局（题号 1-' + total + '，' +
    DIFFS.map(function (d) {
      return d + ' ' + rows.filter(function (r) { return r.diff === d; }).length;
    }).join(' / ') + '）');
  console.log('解出局数：' + won.length + ' 局');
  console.log('胜率（解出率）：' + (total ? fmt1(won.length * 100 / total) : '0.0') + '%');
  console.log('平均填数步数：' + fmt1(avg(rows, function (r) { return r.places; })) + ' 步');
  console.log('平均回溯擦除：' + fmt1(avg(rows, function (r) { return r.erases; })) + ' 次');
  console.log('平均总动作数：' + fmt1(avg(rows, function (r) { return r.steps; })) + ' 步');
  console.log('题目生成用时：平均 ' + fmt1(avg(rows, function (r) { return r.genMs; })) + ' ms');
  const solMs = rows.map(function (r) { return r.solveMs; });
  console.log('AI 求解用时：平均 ' + fmt1(avg(rows, function (r) { return r.solveMs; })) +
    ' ms，最快 ' + Math.min.apply(null, solMs) + ' ms，最慢 ' + Math.max.apply(null, solMs) + ' ms');
  for (const d of DIFFS) {
    const sub = rows.filter(function (r) { return r.diff === d; });
    if (sub.length) line(d, sub);
  }
  console.log('总耗时：' + fmt1(wallMs / 1000) + ' 秒');
  console.log('说明：数独无得分概念，本模拟为 AI 自动演示解题模式，平均分不适用（记 -1）；');
  console.log('      统计口径与页面「AI 代玩」一致：MRV 选格优先填，走不通即回溯重试，直到解出。');
}
