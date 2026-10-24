/* ============================================================
   拾光集 · 小游戏共享音效（WebAudio 本地合成，零音频文件）
   静音：localStorage.gameSfxMuted（'1' = 静音），与左上角工具栏音效格共用，
   本模块每次发声前实时读键；全部失败静默。
   用法：页面 <head> 引入后，在事件点调用
        if (window.GameSFX) GameSFX.coin();  等。
   音色增强：同类音随机 ±15 音分微抖（防机械重复感）、滑音（jump）、
   白噪声+低通的爆音层（smash）。
   ============================================================ */
(function () {
  var ctx = null;
  var noiseBuf = null;

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

  /* 音高微抖：±15 音分内随机 */
  function jit(freq) {
    return freq * Math.pow(2, (Math.random() * 30 - 15) / 1200);
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
      o.frequency.setValueAtTime(jit(freq), t0);
      g.gain.setValueAtTime(vol || 0.08, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur);
    } catch (e) { /* 音频不可用时静默 */ }
  }

  /* 滑音：f1 指数滑到 f2 */
  function glide(f1, f2, dur, type, vol) {
    var c = ensure();
    if (!c) return;
    try {
      var t0 = c.currentTime;
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(f1, t0);
      o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      g.gain.setValueAtTime(vol || 0.05, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur);
    } catch (e) {}
  }

  /* 噪声爆音：白噪声 + 低通滤波 + 快速衰减（击碎 / 爆炸体感） */
  function noise(dur, vol, cutoff, delay) {
    var c = ensure();
    if (!c) return;
    try {
      if (!noiseBuf) {
        noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      var t0 = c.currentTime + (delay || 0);
      var src = c.createBufferSource();
      src.buffer = noiseBuf;
      var f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff || 900;
      var g = c.createGain();
      g.gain.setValueAtTime(vol || 0.12, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f);
      f.connect(g);
      g.connect(c.destination);
      src.start(t0);
      src.stop(t0 + dur);
    } catch (e) {}
  }

  window.GameSFX = {
    muted: muted,
    /* 在用户手势事件内调用一次，解锁音频上下文（后续发声不再受限） */
    unlock: function () { ensure(); },

    /* —— 基础交互 —— */
    /* 轻点 / 落子 / 翻格 */
    click: function () { tone(660, 0.06, 'triangle', 0.05); },
    /* 更轻柔的滑动 / 移动 */
    swipe: function () { tone(520, 0.05, 'sine', 0.04); },
    /* 得分 / 正确一步 */
    score: function () { tone(880, 0.09, 'triangle', 0.07); },
    /* 连击 / 合并成更大的东西（双音上行） */
    combo: function () { tone(988, 0.07, 'triangle', 0.07); tone(1319, 0.10, 'triangle', 0.07, 0.07); },
    /* 出错 / 违规操作（低鸣一声） */
    error: function () { tone(220, 0.12, 'square', 0.05); },

    /* —— 物品与奖励 —— */
    /* 金币 / 吃到物品（经典两音 B5→E6） */
    coin: function () { tone(988, 0.07, 'square', 0.055); tone(1319, 0.16, 'square', 0.055, 0.065); },
    /* 拾取道具 / 星星（上行三音，水晶感） */
    pickup: function () { tone(784, 0.06, 'sine', 0.07); tone(1175, 0.08, 'sine', 0.07, 0.05); tone(1568, 0.12, 'sine', 0.06, 0.10); },
    /* 插旗 / 标记（闷短音） */
    flag: function () { tone(440, 0.05, 'square', 0.05); },
    /* 强化 / 能量满（快速四连上行） */
    powerup: function () { [523, 659, 831, 1047].forEach(function (f, i) { tone(f, 0.07, 'square', 0.05, i * 0.055); }); },

    /* —— 动作 —— */
    /* 跳跃（上滑音） */
    jump: function () { glide(330, 660, 0.16, 'square', 0.045); },
    /* 击碎 / 爆炸（噪声爆音 + 低频体感） */
    smash: function () { noise(0.16, 0.12, 900); tone(160, 0.10, 'sawtooth', 0.05); },

    /* —— 节奏与终局 —— */
    /* 倒计时滴答 */
    tick: function () { tone(1200, 0.03, 'square', 0.04); },
    /* 时间到（两短一长急促） */
    timeup: function () { tone(880, 0.09, 'square', 0.06); tone(880, 0.09, 'square', 0.06, 0.13); tone(622, 0.22, 'square', 0.06, 0.26); },
    /* 过关进入下一关（上行两音，比 win 短促） */
    levelup: function () { tone(659, 0.09, 'triangle', 0.07); tone(988, 0.16, 'triangle', 0.07, 0.09); },
    /* 胜利 / 通关（四音上行琶音） */
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.14, 'triangle', 0.08, i * 0.11); }); },
    /* 失败 / 游戏结束（三音下行） */
    lose: function () { [392, 311, 262].forEach(function (f, i) { tone(f, 0.16, 'sawtooth', 0.06, i * 0.12); }); }
  };
})();
