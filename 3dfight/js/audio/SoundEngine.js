/**
 * Web Audio API を用いたレトロ格闘ゲーム風サウンド生成エンジン
 * 外部音声ファイル不要で、iOS Safari / Android Chrome / PC Chrome の自動再生制限に配慮して動作します。
 */

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.noiseBuffer = null;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.noiseBuffer = this._createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
  }

  isMuted() {
    return this.muted;
  }

  _createNoiseBuffer() {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 0.5);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  _canPlay() {
    if (this.muted) return false;
    if (!this.ctx) this.unlock();
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  playSwing(heavy = false) {
    if (!this._canPlay() || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(heavy ? 620 : 980, now);
    filter.frequency.exponentialRampToValueAtTime(heavy ? 240 : 420, now + 0.12);
    filter.Q.value = 1.6;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(heavy ? 0.18 : 0.11, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.14 : 0.09));

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.15);
  }

  playHit(heavy = false) {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime;

    // 低音インパクト
    const osc = this.ctx.createOscillator();
    osc.type = heavy ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(heavy ? 210 : 280, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + (heavy ? 0.18 : 0.11));

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(heavy ? 0.35 : 0.24, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.2 : 0.12));

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.21);

    // 打撃ノイズ
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(heavy ? 2600 : 1900, now);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(heavy ? 0.26 : 0.16, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.14 : 0.08));
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 0.15);
    }
  }

  playGuard() {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime;
    const freqs = [540, 810];
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.72, now + 0.09);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(idx === 0 ? 0.14 : 0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.11);
    });
  }

  playThrow() {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(340, now + 0.09);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.28);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  playJump() {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.11);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  playRingOut() {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(130, now + 0.65);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.7);
  }

  playAnnounce(type = 'start') {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime;
    const notes =
      type === 'ko'
        ? [440, 330, 220]
        : type === 'win'
        ? [523.25, 659.25, 783.99, 1046.5]
        : [440, 554.37, 659.25];

    notes.forEach((freq, idx) => {
      const start = now + idx * 0.085;
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, start);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.17);
    });
  }

  /**
   * 動物キャラ固有の咆哮・掛け声SE（必殺技発動時）
   */
  playRoar(baseFreq = 120) {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq * 1.35, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.72, now + 0.24);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  /**
   * EMERGENCY!! 重厚アラートサイレンSE（ブーッ、ブーッ、ブーッと長めに鳴動）
   */
  playAlert() {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime;
    [0, 0.82, 1.64].forEach((offset) => {
      const t0 = now + offset;
      const dur = 0.62;

      // 重低音ブザー（不協和2音＋ローパスで厚みを持たせる）
      [135, 198].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        osc.type = idx === 0 ? 'sawtooth' : 'square';
        osc.frequency.setValueAtTime(freq, t0);
        osc.frequency.linearRampToValueAtTime(freq * 0.94, t0 + dur);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(950, t0);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, t0);
        gain.gain.linearRampToValueAtTime(idx === 0 ? 0.2 : 0.11, t0 + 0.04);
        gain.gain.setValueAtTime(idx === 0 ? 0.18 : 0.1, t0 + dur - 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      });
    });
  }

  /**
   * 巨獣降臨着地の地響き重低音SE
   */
  playImpactLand() {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.35);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  /**
   * 氷結SE（FROZEN状態異常向け共通基盤）
   */
  playFreeze() {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime;
    [1318.5, 1760, 2093].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.1, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + 0.19);
    });
  }
}
