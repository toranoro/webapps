/**
 * Web Audio API によるプロシージャル麻雀効果音エンジン（外部音声ファイル不要）
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.65;
  }

  ensureContext() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setEnabled(val) { this.enabled = !!val; }

  playDiscard(strong = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const gainMaster = this.volume * (strong ? 1.15 : 0.9);

    const bufSize = Math.floor(ctx.sampleRate * 0.045);
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.006));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(strong ? 2300 : 1900, now);
    filter.Q.setValueAtTime(1.8, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.85 * gainMaster, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    noise.connect(filter); filter.connect(nGain); nGain.connect(ctx.destination);
    noise.start(now);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(strong ? 260 : 210, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.055);
    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.45 * gainMaster, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(oGain); oGain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.065);
  }

  playSelect() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.025);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.03);
  }

  playDraw() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.035);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.05);
  }

  playRiichi() {
    this.playDiscard(true);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + 0.03;
    [587.33, 880, 1174.66].forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.045);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22 * this.volume, now + idx * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.35);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now + idx * 0.045); osc.stop(now + idx * 0.045 + 0.36);
    });
  }

  playCall() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.075].forEach((delay, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(idx === 0 ? 660 : 880, now + delay);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.24 * this.volume, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now + delay); osc.stop(now + delay + 0.13);
    });
  }

  playWin() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [587.33, 659.25, 739.99, 880.0, 1174.66].forEach((freq, i) => {
      const t = now + i * 0.07;
      const osc = ctx.createOscillator();
      osc.type = i === 4 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.26 * this.volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (i === 4 ? 0.85 : 0.32));
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.9);
    });
  }
}

export const soundEngine = new SoundEngine();
