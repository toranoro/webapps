/**
 * Web Audio API によるスクイーズ効果音シンセサイザー
 * 外部音声ファイル不要で「ぷにっ」「ぽよんっ」という柔らかい音を生成します。
 */

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
  }

  isMuted() {
    return this.muted;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  _ensureCtx() {
    if (this.muted) return null;
    if (!this.ctx) {
      this.unlock();
    }
    if (!this.ctx || this.ctx.state !== "running") return null;
    return this.ctx;
  }

  /** スクイーズを落としたときの「ぽっ」音 */
  playDrop() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(210, now + 0.11);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  /** スクイーズ同士が軽くぶつかったときの「ぷにっ」音 */
  playSquish(intensity = 0.5) {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = Math.min(0.12, Math.max(0.02, intensity * 0.08));

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    const base = 160 + Math.random() * 60;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.35, now + 0.04);
    osc.frequency.exponentialRampToValueAtTime(base * 0.85, now + 0.09);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  /** 合体進化時の「ぽよよ〜ん♪」音（レベルが高いほど華やかに） */
  playMerge(newLevelIndex, combo = 1) {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const scaleNotes = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    const freq = scaleNotes[Math.min(scaleNotes.length - 1, newLevelIndex)] * (1 + Math.min(combo - 1, 4) * 0.04);

    // 1音目: 弾むサイン波
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq * 0.72, now);
    osc1.frequency.exponentialRampToValueAtTime(freq * 1.18, now + 0.09);
    osc1.frequency.exponentialRampToValueAtTime(freq, now + 0.22);

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // 2音目: きらめき倍音
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq * 1.5, now + 0.04);
    osc2.frequency.exponentialRampToValueAtTime(freq * 2.0, now + 0.22);

    gain2.gain.setValueAtTime(0.001, now + 0.04);
    gain2.gain.linearRampToValueAtTime(0.09, now + 0.07);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.04);
    osc2.stop(now + 0.28);
  }

  /** 最大スクイーズ同士の合体ファンファーレ */
  playSuperMerge() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const start = ctx.currentTime + i * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  }

  /** ゲームオーバー音 */
  playGameOver() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const notes = [392.0, 349.23, 311.13, 261.63];
    notes.forEach((f, i) => {
      const start = ctx.currentTime + i * 0.13;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  }
}
