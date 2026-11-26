(function (global) {
  'use strict';
  const B3B = (global.Beauty3Block = global.Beauty3Block || {});

  class JewelAudio {
    constructor() {
      this.ctx = null;
      this.sfxGain = null;
      this.enabled = true;
      this.volume = 0.75; // 0.0 .. 1.0
      this.unlocked = false;
      this.chainScale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98];
    }

    setEnabled(val) {
      this.enabled = Boolean(val);
      this._syncGain();
    }

    setVolume(val) {
      this.volume = Math.max(0, Math.min(1, Number(val) || 0));
      this._syncGain();
    }

    _syncGain() {
      if (this.sfxGain && this.ctx) {
        try {
          this.sfxGain.gain.setValueAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime);
        } catch (_) {}
      }
    }

    unlock() {
      try {
        if (!this.ctx) {
          const AudioCtx = global.AudioContext || global.webkitAudioContext;
          if (!AudioCtx) return;
          this.ctx = new AudioCtx();
          this.sfxGain = this.ctx.createGain();
          this.sfxGain.gain.value = this.enabled ? this.volume : 0;
          this.sfxGain.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        if (!this.unlocked && this.ctx.state === 'running') {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          gain.gain.value = 0.0001;
          osc.connect(gain);
          gain.connect(this.sfxGain || this.ctx.destination);
          osc.start();
          osc.stop(this.ctx.currentTime + 0.01);
          this.unlocked = true;
        }
      } catch (_) {}
    }

    _tone({ freq = 440, endFreq = null, type = 'sine', duration = 0.08, volume = 0.22, delay = 0 }) {
      if (!this.enabled || this.volume <= 0) return;
      try {
        if (!this.ctx) this.unlock();
        if (!this.ctx || this.ctx.state !== 'running') return;

        const t0 = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (endFreq && endFreq !== freq) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + duration);
        }
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(volume, t0 + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

        osc.connect(gain);
        gain.connect(this.sfxGain || this.ctx.destination);
        osc.onended = () => {
          try {
            osc.disconnect();
            gain.disconnect();
          } catch (_) {}
        };
        osc.start(t0);
        osc.stop(t0 + duration + 0.01);
      } catch (_) {}
    }

    playMove() {
      this._tone({ freq: 520, endFreq: 660, type: 'triangle', duration: 0.04, volume: 0.14 });
    }

    playRotate() {
      this._tone({ freq: 680, endFreq: 1020, type: 'sine', duration: 0.06, volume: 0.2 });
    }

    playLock() {
      this._tone({ freq: 210, endFreq: 115, type: 'triangle', duration: 0.075, volume: 0.22 });
    }

    playHardDrop() {
      this._tone({ freq: 240, endFreq: 75, type: 'triangle', duration: 0.12, volume: 0.34 });
      this._tone({ freq: 980, endFreq: 520, type: 'sine', duration: 0.07, volume: 0.14 });
    }

    playMatch(chain = 1, count = 3) {
      const idx = Math.min(this.chainScale.length - 1, Math.max(0, chain - 1));
      const root = this.chainScale[idx];
      const sparkleCount = Math.min(4, 2 + Math.floor((count - 3) / 2));
      for (let i = 0; i < sparkleCount; i++) {
        const mult = i === 0 ? 1 : i === 1 ? 1.25 : i === 2 ? 1.5 : 2;
        this._tone({
          freq: root * mult,
          endFreq: root * mult * 1.03,
          type: 'sine',
          duration: 0.22,
          volume: 0.26,
          delay: i * 0.042
        });
      }
      if (chain >= 2) {
        this._tone({
          freq: root * 2,
          type: 'triangle',
          duration: 0.28,
          volume: 0.16,
          delay: 0.06
        });
      }
    }

    playMagic() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      notes.forEach((f, i) => {
        this._tone({ freq: f, type: 'sine', duration: 0.24, volume: 0.24, delay: i * 0.045 });
      });
    }

    playLevelUp() {
      const notes = [587.33, 880, 1174.66];
      notes.forEach((f, i) => {
        this._tone({ freq: f, type: 'triangle', duration: 0.18, volume: 0.24, delay: i * 0.06 });
      });
    }

    playGameOver() {
      const notes = [392.0, 349.23, 311.13, 261.63];
      notes.forEach((f, i) => {
        this._tone({ freq: f, type: 'triangle', duration: 0.26, volume: 0.24, delay: i * 0.11 });
      });
    }
  }

  B3B.JewelAudio = JewelAudio;
})(window);
