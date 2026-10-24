/* ============================================================
   拾光集 · 小游戏共享音效（WebAudio 本地合成，零音频文件）
   静音：localStorage.gameSfxMuted（'1' = 静音），与左上角工具栏音效格共用，
   storage 事件由音效格脚本维护，本模块每次发声前实时读键。
   用法：页面 <head> 引入后，在得分/胜利/失败等事件点调用
        if (window.GameSFX) GameSFX.score();   等即可，任何失败静默。
   ============================================================ */
(function () {
  var ctx = null;

  function muted() {
    try { return localStorage.getItem('gameSfxMuted') === '1'; } catch (e) { return false; }
  }

  /* 懒创建单例上下文；必须在用户手势事件内首次调用以解锁自动播放限制 */
  function ensure() {
    if (muted()) return null;
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* 单音：freq 起始频率、dur 秒、type 波形、vol 峰值音量、delay 相对延迟秒 */
  function tone(freq, dur, type, vol, delay) {
    var c = ensure();
    if (!c) return;
    try {
      var t0 = c.currentTime + (delay || 0);
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.08, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur);
    } catch (e) { /* 音频不可用时静默 */ }
  }

  window.GameSFX = {
    muted: muted,
    /* 在用户手势事件内调用一次，解锁音频上下文（后续发声不再受限） */
    unlock: function () { ensure(); },
    /* 轻点 / 落子 / 普通交互 */
    click: function () { tone(660, 0.06, 'triangle', 0.05); },
    /* 得分 / 吃到物品 / 正确一步 */
    score: function () { tone(880, 0.09, 'triangle', 0.07); },
    /* 连击 / 合并成更大的东西（双音上行） */
    combo: function () { tone(988, 0.07, 'triangle', 0.07); tone(1319, 0.10, 'triangle', 0.07, 0.07); },
    /* 胜利 / 通关（四音上行琶音） */
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.14, 'triangle', 0.08, i * 0.11); }); },
    /* 失败 / 游戏结束（三音下行） */
    lose: function () { [392, 311, 262].forEach(function (f, i) { tone(f, 0.16, 'sawtooth', 0.06, i * 0.12); }); },
    /* 出错 / 踩雷 / 违规操作（低鸣一声） */
    error: function () { tone(220, 0.12, 'square', 0.05); }
  };
})();
