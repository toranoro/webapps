(function (global) {
  'use strict';
  const B3B = (global.Beauty3Block = global.Beauty3Block || {});

  class JewelAudio {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.unlocked = false;
      // Pentatonic / crystal major notes (Hz) for ascending chains
      this.chainScale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98];
    }

    setEnabled(val) {
      this.enabled = Boolean(val);
    }

    unlock() {
      if (!this.enabled) return;
      try {
        if (!this.ctx) {
          const AudioCtx = global.AudioContext || global.webkitAudioContext;
          if (!AudioCtx) return;
          this.ctx = new AudioCtx();
        }
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        if (!this.unlocked && this.ctx.state === 'running') {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          gain.gain.value = 0.0001;
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start();
          osc.stop(this.ctx.currentTime + 0.01);
          this.unlocked = true;
        }
      } catch (_) {
        // Audio unavailable or blocked; fail silently
      }
    }

    _tone({ freq = 440, endFreq = null, type = 'sine', duration = 0.08, volume = 0.08, delay = 0 }) {
      if (!this.enabled) return;
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
        gain.connect(this.ctx.destination);
        osc.start(t0);
        osc.stop(t0 + duration + 0.01);
      } catch (_) {
        // Ignore transient mobile WebAudio errors
      }
    }

    playMove() {
      this._tone({ freq: 520, endFreq: 620, type: 'triangle', duration: 0.038, volume: 0.035 });
    }

    playRotate() {
      this._tone({ freq: 680, endFreq: 960, type: 'sine', duration: 0.055, volume: 0.05 });
    }

    playLock() {
      this._tone({ freq: 185, endFreq: 110, type: 'triangle', duration: 0.065, volume: 0.065 });
    }

    playHardDrop() {
      this._tone({ freq: 260, endFreq: 95, type: 'triangle', duration: 0.1, volume: 0.09 });
      this._tone({ freq: 880, endFreq: 440, type: 'sine', duration: 0.06, volume: 0.03 });
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
          volume: 0.085,
          delay: i * 0.042
        });
      }
      // Subtle harmonic bell overtone for chains >= 2
      if (chain >= 2) {
        this._tone({
          freq: root * 2,
          type: 'triangle',
          duration: 0.28,
          volume: 0.045,
          delay: 0.06
        });
      }
    }

    playMagic() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
      notes.forEach((f, i) => {
        this._tone({ freq: f, type: 'sine', duration: 0.25, volume: 0.08, delay: i * 0.045 });
      });
    }

    playLevelUp() {
      const notes = [587.33, 739.99, 880, 1174.66];
      notes.forEach((f, i) => {
        this._tone({ freq: f, type: 'triangle', duration: 0.18, volume: 0.065, delay: i * 0.055 });
      });
    }

    playGameOver() {
      const notes = [392.0, 349.23, 311.13, 261.63];
      notes.forEach((f, i) => {
        this._tone({ freq: f, type: 'triangle', duration: 0.26, volume: 0.075, delay: i * 0.11 });
      });
    }
  }

  B3B.JewelAudio = JewelAudio;
})(window);
