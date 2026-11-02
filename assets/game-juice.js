/* ============================================================
   拾光集 · 小游戏打击交互感共享模块（零依赖，配合 GameSFX 音效使用）
   页面引入后，在得分 / 消除 / 失败 / 胜利等事件点调用：
     GameJuice.good(el)        得分包：元素弹跳 + 金色粒子迸发
     GameJuice.bad(el)         失误包：震屏 + 红闪
     GameJuice.win(el)         通关庆祝：多点多色粒子迸发
     GameJuice.shake('lg')     震屏（'sm'/'md'/'lg' 三档，默认对 .g-stage）
     GameJuice.flash(color)    全台面闪色覆盖层（默认白，可传红/金等）
     GameJuice.pop(el)         元素弹跳（scale 1→1.2→1）
     GameJuice.burst(x,y,c,n)  视口坐标迸发 n 个粒子
     GameJuice.float(x,y,text) 分数 / 提示飘字
     GameJuice.combo()         连击 +1（2s 窗口自动清零），返回当前连击数
     GameJuice.resetCombo()    手动清零连击
   所有效果自动清理，不阻塞页面逻辑；el 省略时坐标取元素中心。
   ============================================================ */
(function () {
  'use strict';

  /* —— 样式注入（一次） —— */
  var CSS = ''
    + '.gj-shaking-sm{animation:gj-shake-sm .22s linear}'
    + '.gj-shaking-md{animation:gj-shake-md .3s linear}'
    + '.gj-shaking-lg{animation:gj-shake-lg .42s linear}'
    + '@keyframes gj-shake-sm{20%{transform:translate(-2px,1px)}40%{transform:translate(2px,-1px)}60%{transform:translate(-2px,-1px)}80%{transform:translate(1px,1px)}}'
    + '@keyframes gj-shake-md{15%{transform:translate(-5px,2px)}30%{transform:translate(5px,-3px)}45%{transform:translate(-4px,-2px)}60%{transform:translate(4px,2px)}75%{transform:translate(-2px,1px)}90%{transform:translate(2px,-1px)}}'
    + '@keyframes gj-shake-lg{12%{transform:translate(-9px,4px)}24%{transform:translate(8px,-6px)}36%{transform:translate(-7px,-4px)}48%{transform:translate(7px,5px)}60%{transform:translate(-5px,3px)}72%{transform:translate(4px,-3px)}84%{transform:translate(-3px,2px)}96%{transform:translate(2px,-1px)}}'
    + '.gj-flash{position:absolute;inset:0;pointer-events:none;border-radius:inherit;z-index:9;animation:gj-flash-out .24s ease-out forwards}'
    + '@keyframes gj-flash-out{from{opacity:.85}to{opacity:0}}'
    + '.gj-pop{animation:gj-pop .28s cubic-bezier(.2,1.6,.4,1)}'
    + '@keyframes gj-pop{0%{transform:scale(1)}35%{transform:scale(1.18)}70%{transform:scale(.96)}100%{transform:scale(1)}}'
    + '.gj-particle{position:fixed;width:7px;height:7px;border-radius:50%;pointer-events:none;z-index:9999;left:0;top:0;transition:transform .5s cubic-bezier(.15,.6,.4,1),opacity .5s linear;will-change:transform,opacity}'
    + '.gj-float{position:fixed;pointer-events:none;z-index:9999;font:700 15px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-text-stroke:3px rgba(255,255,255,.85);paint-order:stroke fill;transition:transform .8s ease-out,opacity .8s linear;will-change:transform,opacity}'
    + '.gj-combo-badge{position:absolute;top:10px;right:12px;z-index:9;pointer-events:none;font:700 14px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#b06a10;background:rgba(255,255,255,.85);border:1px solid rgba(217,138,31,.4);border-radius:12px;padding:3px 10px;animation:gj-pop .25s cubic-bezier(.2,1.6,.4,1)}';
  var styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* —— 工具 —— */
  function stageOf(el) {
    if (el) return el;
    return document.querySelector('.g-stage')
        || document.querySelector('.g-wrap')
        || document.querySelector('main')
        || document.body;
  }
  function centerOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  /* 弹跳类名复用：同元素连续触发时先摘再挂（强制重播动画） */
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* —— 震屏：keyframes 动画，结束自动摘除（不残留 inline transform） —— */
  function shake(level, el) {
    var t = stageOf(el);
    var cls = 'gj-shaking-' + (level === 'lg' || level === 'md' || level === 'sm' ? level : 'md');
    replay(t, cls);
    setTimeout(function () { t.classList.remove(cls); }, 500);
  }

  /* —— 闪色覆盖层 —— */
  function flash(color, el) {
    var t = stageOf(el);
    var f = document.createElement('div');
    f.className = 'gj-flash';
    f.style.background = color || 'rgba(255,255,255,.5)';
    t.appendChild(f);
    setTimeout(function () { f.remove(); }, 300);
  }

  /* —— 元素弹跳 —— */
  function pop(el) {
    if (!el) return;
    replay(el, 'gj-pop');
    setTimeout(function () { el.classList.remove('gj-pop'); }, 320);
  }

  /* —— DOM 粒子迸发（视口坐标） —— */
  function burst(x, y, color, n) {
    n = n || 10;
    for (var i = 0; i < n; i++) {
      var p = document.createElement('div');
      p.className = 'gj-particle';
      var ang = Math.random() * Math.PI * 2;
      var dist = 28 + Math.random() * 46;
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.background = color || '#f5a623';
      p.style.width = p.style.height = (4 + Math.random() * 6) + 'px';
      document.body.appendChild(p);
      void p.offsetWidth;
      p.style.transitionDelay = (Math.random() * 60) + 'ms';
      p.style.transform = 'translate(' + Math.cos(ang) * dist + 'px,' + (Math.sin(ang) * dist + 14) + 'px)';
      p.style.opacity = '0';
      (function (node) { setTimeout(function () { node.remove(); }, 620); })(p);
    }
  }

  /* —— 飘字（视口坐标，上飘淡出） —— */
  function float(x, y, text, color) {
    var f = document.createElement('div');
    f.className = 'gj-float';
    f.textContent = text;
    f.style.left = x + 'px';
    f.style.top = y + 'px';
    f.style.color = color || '#e8821e';
    document.body.appendChild(f);
    void f.offsetWidth;
    f.style.transform = 'translate(-50%,-42px)';
    f.style.opacity = '0';
    setTimeout(function () { f.remove(); }, 850);
  }

  /* —— 连击（2s 窗口，自动清零；徽标贴在台面右上角） —— */
  var comboN = 0, comboTimer = null, comboBadge = null, comboPopT = null;
  function combo(el) {
    comboN++;
    if (comboTimer) clearTimeout(comboTimer);
    comboTimer = setTimeout(function () { comboN = 0; paintBadge(0, el); }, 2000);
    paintBadge(comboN, el);
    return comboN;
  }
  function paintBadge(n, el) {
    var t = stageOf(el);
    if (n < 2) { if (comboBadge) { comboBadge.remove(); comboBadge = null; } return; }
    if (!comboBadge || !comboBadge.isConnected) {
      comboBadge = document.createElement('div');
      comboBadge.className = 'gj-combo-badge';
      t.appendChild(comboBadge);
    }
    comboBadge.textContent = 'x' + n + ' 连击';
    replay(comboBadge, 'gj-pop');
  }
  function resetCombo() {
    comboN = 0;
    if (comboTimer) clearTimeout(comboTimer);
    paintBadge(0);
  }

  /* —— 组合包 —— */
  function good(el, color) {
    var c = centerOf(stageOf(el));
    if (el && el !== stageOf(el)) c = centerOf(el);
    pop(el);
    burst(c.x, c.y, color || '#f5a623', 10);
  }
  function bad(el) {
    shake('md', el);
    flash('rgba(239,90,103,.28)', el);
  }
  function win(el) {
    var t = stageOf(el);
    var c = centerOf(t);
    var colors = ['#f5a623', '#38b26a', '#3a8ef7', '#ef5a67', '#a35ce8'];
    for (var i = 0; i < 5; i++) {
      (function (cc, idx) {
        setTimeout(function () { burst(cc.x + (Math.random() - 0.5) * 160, cc.y + (Math.random() - 0.5) * 120, cc, 12); }, idx * 130);
      })(colors[i], i);
    }
    flash('rgba(255,224,138,.3)', t);
    replay(t, 'gj-shaking-sm');
    setTimeout(function () { t.classList.remove('gj-shaking-sm'); }, 400);
  }

  window.GameJuice = {
    shake: shake, flash: flash, pop: pop, burst: burst, float: float,
    combo: combo, resetCombo: resetCombo,
    good: good, bad: bad, win: win
  };
})();
