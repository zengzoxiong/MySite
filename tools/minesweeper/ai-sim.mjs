#!/usr/bin/env node
/* -*- coding: utf-8 -*-
 * 扫雷 AI 模拟器（拾光集 · ai-sim.mjs）
 *
 * 用法：
 *   node tools/minesweeper/ai-sim.mjs [每档局数] [--level=beginner|middle|expert|all]
 *   每档局数默认 100（三档共 300 局，满足至少 100 局）；--level 只跑指定档位，默认 all。
 * 示例：
 *   node tools/minesweeper/ai-sim.mjs                # 三档各 100 局
 *   node tools/minesweeper/ai-sim.mjs 50             # 三档各 50 局
 *   node tools/minesweeper/ai-sim.mjs 20 --level=expert   # 只跑高级 20 局
 *
 * 说明：
 *   - 游戏核心与 AI 决策直接从 app.html 的 AI_CORE_BEGIN / AI_CORE_END 标记间
 *     提取执行，与页面 AI 严格同一份代码，杜绝两处实现漂移。
 *   - 不依赖浏览器，纯 node 运行；自动用 worker_threads 多线程并行加速。
 *   - 每局规则与页面一致：首点及 3×3 邻域安全，翻完全部安全格即胜，踩雷即败。
 *   - AI 策略：约束传播确定安全格 / 雷格，剩余按约束分量枚举做概率推理，
 *     必要时点雷概率最小的随机格。
 *   - 扫雷没有“得分”概念，统计以胜率、平均操作数、平均翻开格数衡量；
 *     页面「AI 代玩」即自动演示模式，AI 成绩不计最佳纪录。
 */
'use strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { Worker as ThreadWorker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, 'app.html');

/* ---------- 从 app.html 提取与页面同源的游戏核心 + AI 决策 ---------- */
function loadCore() {
  const html = readFileSync(htmlPath, 'utf8');
  const begin = html.indexOf('/* ===== AI_CORE_BEGIN');
  const end = html.indexOf('/* ===== AI_CORE_END');
  if (begin < 0 || end < 0 || end <= begin) {
    console.error('错误：未能从 app.html 中找到 AI_CORE_BEGIN / AI_CORE_END 标记，无法提取核心逻辑。');
    process.exit(1);
  }
  const factorySrc = html.slice(begin, end);
  if (factorySrc.indexOf('function minesweeperCore') < 0) {
    console.error('错误：提取的片段中缺少 minesweeperCore 工厂函数，请检查 app.html 标记区。');
    process.exit(1);
  }
  const makeFactory = new Function(factorySrc + '\nreturn minesweeperCore;');
  return makeFactory()();
}

/* ---------- 单局模拟：AI 全程代玩，直到终局 ---------- */
function playOne(core, lv, li) {
  const g = core.createState(lv.rows, lv.cols, lv.mines);
  let ops = 0, guard = 0;
  while (!g.over && guard++ < 4000) {
    const act = core.decide(core.observe(g));
    if (!act) break;
    if (act.action === 'flag') {
      for (const i of act.idxs) {
        if (core.toggleFlag(g, i)) ops++;
      }
    } else {
      for (const i of act.idxs) {
        core.reveal(g, i);
        ops++;
        if (g.over) break;
      }
    }
  }
  return { li: li, win: g.result === 'win', ops: ops, revealed: g.revealed };
}

/* ---------- 主线程：解析参数、并行分发、聚合统计 ---------- */
if (isMainThread) {
  const argv = process.argv.slice(2);
  const levelArg = argv.find(function (a) { return a.indexOf('--level=') === 0; });
  const levelKey = levelArg ? levelArg.slice('--level='.length) : 'all';
  const posArgs = argv.filter(function (a) { return a.indexOf('--level=') !== 0; });
  const perLevel = Math.max(1, parseInt(posArgs[0], 10) || 100);

  const core0 = loadCore();   // 先在主线程校验提取可用，失败即退出
  const levels = core0.LEVELS.map(function (lv, i) {
    return Object.assign({}, lv, { _li: i });
  }).filter(function (lv) {
    return levelKey === 'all' || lv.id === levelKey;
  });
  if (!levels.length) {
    console.error('错误：--level 取值无效，应为 beginner / middle / expert / all。');
    process.exit(1);
  }

  const jobs = [];
  for (const lv of levels) for (let k = 0; k < perLevel; k++) jobs.push(lv._li);

  const threads = Math.max(1, Math.min(os.cpus().length - 1 || 1, 8, jobs.length));
  const startedAt = Date.now();
  const all = [];
  let finished = 0;

  console.error('并行 ' + threads + ' 线程，模拟 ' + jobs.length + ' 局中……');
  for (let t = 0; t < threads; t++) {
    // 轮转切分任务，均衡各线程负载
    const mine = jobs.filter(function (_, idx) { return idx % threads === t; });
    if (!mine.length) continue;
    const w = new ThreadWorker(new URL(import.meta.url), { workerData: { jobs: mine } });
    w.on('message', function (results) {
      for (const r of results) all.push(r);
      finished++;
      console.error('  线程完成 ' + finished + '/' + threads);
    });
    w.on('error', function (err) { console.error('子线程出错：' + err.message); process.exit(1); });
  }

  const timer = setInterval(function () {
    if (finished >= threads) {
      clearInterval(timer);
      report(all, levels, Date.now() - startedAt);
    }
  }, 100);
} else {
  /* ---------- 子线程：跑分到的局数后回传 ---------- */
  const core = loadCore();
  const results = [];
  for (const li of workerData.jobs) {
    results.push(playOne(core, core.LEVELS[li], li));
  }
  parentPort.postMessage(results);
}

/* ---------- 中文统计输出 ---------- */
function report(results, levels, elapsedMs) {
  const n = results.length;
  const fmt1 = function (x) { return x.toFixed(1); };
  const byLevel = function (li) { return results.filter(function (r) { return r.li === li; }); };

  console.log('');
  console.log('====================================================');
  console.log('           扫雷 AI 模拟统计（拾光集）');
  console.log('====================================================');
  console.log('模拟局数        ：' + n + ' 局（' + levels.map(function (lv) {
    return lv.label + ' ' + byLevel(lv._li).length + ' 局';
  }).join(' / ') + '）');
  console.log('决策策略        ：约束传播 + 分量枚举概率推理 + 最小风险猜测');
  console.log('----------------------------------------------------');
  for (const lv of levels) {
    const rs = byLevel(lv._li);
    const wins = rs.filter(function (r) { return r.win; }).length;
    const avgOps = rs.reduce(function (s, r) { return s + r.ops; }, 0) / rs.length;
    const avgRev = rs.reduce(function (s, r) { return s + r.revealed; }, 0) / rs.length;
    console.log(lv.label + '（' + lv.rows + '×' + lv.cols + ' · ' + lv.mines + ' 雷）  ' +
      '胜率 ' + fmt1(wins * 100 / rs.length) + '%（' + wins + '/' + rs.length + '）  ' +
      '平均操作 ' + fmt1(avgOps) + ' 次  平均翻开 ' + fmt1(avgRev) + ' 格');
  }
  console.log('----------------------------------------------------');
  const winsAll = results.filter(function (r) { return r.win; }).length;
  const avgOpsAll = results.reduce(function (s, r) { return s + r.ops; }, 0) / n;
  const avgRevAll = results.reduce(function (s, r) { return s + r.revealed; }, 0) / n;
  console.log('总胜率          ：' + fmt1(winsAll * 100 / n) + '%（' + winsAll + ' / ' + n + ' 局）');
  console.log('平均操作数      ：' + fmt1(avgOpsAll) + ' 次');
  console.log('平均翻开格数    ：' + fmt1(avgRevAll) + ' 格');
  console.log('平均分          ：无得分概念（扫雷以胜率衡量，计 -1）');
  console.log('说明            ：页面「AI 代玩」即自动演示模式，可随时停止，');
  console.log('                  AI 成绩不计最佳纪录');
  console.log('----------------------------------------------------');
  console.log('总耗时          ：' + (elapsedMs / 1000).toFixed(1) + ' 秒（平均每局 ' +
    (elapsedMs / 1000 / n).toFixed(3) + ' 秒）');
  console.log('====================================================');
}
