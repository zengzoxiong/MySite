/* ============================================================
   拾光集 · 小游戏台面自适应缩放（共享，零依赖）
   目标：台面尽可能占满视口，且垂直方向不出滚动条。分两档：
   ① canvas 台面：按宽高比设 .g-stage 宽度（位图缩放，高分屏内保持锐利）
   ② DOM 页面（DOM 棋盘 / 无 stage 的整页）：zoom 缩放（参与真实布局，
     滚动高度 / 事件坐标自动正确；transform 的布局盒不缩会留滚动溢出，弃用）
   末尾以文档真实滚动高度收敛复核（涵盖一切 margin），消除垂直溢出。
   ============================================================ */
(function () {
  'use strict';

  /* 自然尺寸：清掉 zoom 后实时测量（布局可能随字体/图片漂移，不缓存） */
  function naturalSize(el) {
    var z = el.style.zoom;
    el.style.zoom = '';
    var r = el.getBoundingClientRect();
    el.style.zoom = z;
    if (!r.width || !r.height) return null;
    return { w: r.width, h: r.height };
  }

  function clearScale(el) {
    el.style.zoom = '';
  }

  /* ① canvas 台面：宽度驱动的位图缩放 */
  function fitCanvas(stage, cv) {
    var ratio = cv.width / cv.height;
    if (!isFinite(ratio) || ratio <= 0) { fitBox(stage.parentElement); return; }
    var d = naturalSize(stage);
    if (!d) return;
    var availW = stage.parentElement.clientWidth;
    var docTop = stage.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0);
    var availH = window.innerHeight - docTop - 10;
    var target = Math.min(d.w, availW, availH * ratio);
    target = Math.max(target, 170);
    stage.style.width = Math.floor(target) + 'px';

    // 收敛：以文档真实滚动高度复核溢出，逐档收缩
    for (var pass = 0; pass < 4; pass++) {
      var over = document.documentElement.scrollHeight - window.innerHeight;
      if (over <= 0) break;
      var wNow = stage.getBoundingClientRect().width;
      var hNow = stage.getBoundingClientRect().height;
      if (wNow <= 170 || hNow <= 60) break;
      var next = Math.max(170, Math.floor(wNow - over * (wNow / hNow) - 2));
      if (next >= wNow) break;
      stage.style.width = next + 'px';
    }
    // 仍溢出（竖长游戏 + 过矮窗口，宽度已触兜底）：对整 wrap 施加 zoom 逐档收尾
    var wrap = stage.parentElement;
    var wz = 1;
    var wh = naturalSize(wrap);
    if (wh) {
      for (var pass2 = 0; pass2 < 6; pass2++) {
        var over2 = document.documentElement.scrollHeight - window.innerHeight;
        if (over2 <= 0) break;
        wz = Math.max(0.3, wz - over2 / wh.h * 0.9);
        if (wz >= 0.999) { wrap.style.zoom = ''; break; }
        wrap.style.zoom = wz.toFixed(4);
      }
      if (wz >= 0.999) wrap.style.zoom = '';
    }
  }

  /* ②③ DOM 容器（棋盘 stage 或整页 wrap）：zoom 缩放（参与真实布局，
     滚动高度 / 事件坐标自动正确；transform 的布局盒不缩会留滚动溢出，弃用） */
  function fitBox(el) {
    var d = naturalSize(el);
    if (!d) return;
    var availW = el.parentElement.clientWidth;
    var docTop = el.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0);
    var availH = window.innerHeight - docTop - 8;
    // 初值按公式给，随后一律走真实滚动高度收敛（页脚等漏算项在循环中自动纠正）
    var k = Math.min(1, availW / d.w, availH / d.h);
    for (var pass = 0; pass < 5; pass++) {
      if (k >= 0.999) {
        clearScale(el);
      } else {
        el.style.zoom = k.toFixed(4);
      }
      var over = document.documentElement.scrollHeight - window.innerHeight;
      if (over <= 0) break;
      k = Math.max(0.3, k - over / d.h * 0.9);
    }
    if (k >= 0.999) clearScale(el);
  }

  function fit() {
    var stage = document.querySelector('.g-stage');
    var cv = stage && stage.querySelector('canvas');
    if (stage && cv && cv.width > 0 && cv.height > 0) { fitCanvas(stage, cv); }
    else {
      // DOM 棋盘游戏（含 stage 外说明卡）与无 stage 页面：整 wrap 缩放，覆盖全部溢出来源
      var wrap = document.querySelector('.g-wrap') || document.querySelector('main') || document.querySelector('.wrap');
      if (wrap) fitBox(wrap);
    }
    document.documentElement.setAttribute('data-game-fit', '1');
  }

  function boot() {
    fit();
    var t = null;
    window.addEventListener('resize', function () {
      if (t) return;
      t = setTimeout(function () { t = null; fit(); }, 120);
    });
    window.addEventListener('orientationchange', function () { setTimeout(fit, 250); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
