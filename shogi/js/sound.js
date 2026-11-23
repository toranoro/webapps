/*
 * sound.js - 中村将棋道場 サウンドエンジン
 *
 * 外部音声ファイルに依存せず、Web Audio API で将棋盤に駒を指したときの
 * 澄んだ「パチッ」「バシッ」という打音や効果音をリアルタイムに音響合成します。
 * 公開API: window.ShogiSound
 */
(function (global) {
  'use strict';

  var ctx = null;
  var enabled = true;

  function getContext() {
    if (!ctx) {
      var AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
    return ctx;
  }

  // ユーザーの初回操作で AudioContext をアンロック
  function unlock() {
    var c = getContext();
    if (c && c.state === 'suspended') {
      c.resume().catch(function () {});
    }
  }

  ['pointerdown', 'touchstart', 'click'].forEach(function (ev) {
    document.addEventListener(ev, unlock, { once: true, passive: true });
  });

  // ノイズバッファの生成（アタック音用）
  var noiseBuffer = null;
  function getNoiseBuffer(c) {
    if (!noiseBuffer) {
      var len = Math.floor(c.sampleRate * 0.05); // 50ms
      noiseBuffer = c.createBuffer(1, len, c.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return noiseBuffer;
  }

  /*
   * 着手音: 駒を盤に指したときの「パチッ」音
   * @param {boolean} isCapture - 駒を取った時（少し力強い音）
   */
  function playMove(isCapture) {
    if (!enabled) return;
    var c = getContext();
    if (!c) return;

    var t0 = c.currentTime;

    // 1. 高域アタック音（駒同士・駒と盤の硬い衝突破裂音）
    function makeClick(delay, volScale) {
      var src = c.createBufferSource();
      src.buffer = getNoiseBuffer(c);

      var bpf = c.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.setValueAtTime(isCapture ? 2800 : 3400, t0 + delay);
      bpf.Q.setValueAtTime(3.5, t0 + delay);

      var gain = c.createGain();
      var peakVol = (isCapture ? 0.9 : 0.75) * volScale;
      gain.gain.setValueAtTime(0.0001, t0 + delay);
      gain.gain.exponentialRampToValueAtTime(peakVol, t0 + delay + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.024);

      src.connect(bpf);
      bpf.connect(gain);
      gain.connect(c.destination);

      src.start(t0 + delay);
      src.stop(t0 + delay + 0.03);
    }

    // 初撃と、わずかな跳ね返り（二度打ちのリアリティ）
    makeClick(0, 1.0);
    makeClick(0.012, 0.25);

    // 2. 本榧盤の胴鳴り・木の共鳴音（コッという低域の響き）
    var osc = c.createOscillator();
    osc.type = 'triangle';
    var baseFreq = isCapture ? 320 : 360;
    osc.frequency.setValueAtTime(baseFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.65, t0 + 0.07);

    var lpf = c.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(isCapture ? 900 : 1100, t0);

    var oscGain = c.createGain();
    var oscVol = isCapture ? 0.6 : 0.45;
    oscGain.gain.setValueAtTime(0.0001, t0);
    oscGain.gain.exponentialRampToValueAtTime(oscVol, t0 + 0.002);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t0 + (isCapture ? 0.09 : 0.07));

    osc.connect(lpf);
    lpf.connect(oscGain);
    oscGain.connect(c.destination);

    osc.start(t0);
    osc.stop(t0 + 0.1);
  }

  // 成りの音: 爽やかな和風チャイム
  function playPromote() {
    if (!enabled) return;
    var c = getContext();
    if (!c) return;

    var t0 = c.currentTime;
    var notes = [587.33, 880.0]; // D5 -> A5
    notes.forEach(function (freq, idx) {
      var t = t0 + idx * 0.08;
      var osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      var gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  // 王手時の警告音: 控えめな注意音
  function playCheck() {
    if (!enabled) return;
    var c = getContext();
    if (!c) return;

    var t0 = c.currentTime;
    var osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(783.99, t0); // G5
    osc.frequency.setValueAtTime(659.25, t0 + 0.08); // E5

    var gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);

    osc.connect(gain);
    gain.connect(c.destination);

    osc.start(t0);
    osc.stop(t0 + 0.3);
  }

  // 終局音: 厳かな和風の余韻
  function playEnd() {
    if (!enabled) return;
    var c = getContext();
    if (!c) return;

    var t0 = c.currentTime;
    var freqs = [329.63, 440.0, 587.33]; // E4, A4, D5
    freqs.forEach(function (freq, i) {
      var t = t0 + i * 0.12;
      var osc = c.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      var gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(t);
      osc.stop(t + 0.55);
    });
  }

  function setEnabled(val) {
    enabled = !!val;
    if (enabled) unlock();
  }

  function isEnabled() {
    return enabled;
  }

  global.ShogiSound = {
    playMove: playMove,
    playPromote: playPromote,
    playCheck: playCheck,
    playEnd: playEnd,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    unlock: unlock
  };
})(window);
