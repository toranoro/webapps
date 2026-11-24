(function (global) {
  'use strict';
  const B3B = (global.Beauty3Block = global.Beauty3Block || {});

  class BGMPlayer {
    constructor({ onTrackChange } = {}) {
      this.tracks = Array.isArray(B3B.BGM_TRACKS) ? B3B.BGM_TRACKS : [];
      this.onTrackChange = onTrackChange;

      this.enabled = true;
      this.mode = 'random'; // 'random' | 'repeat'
      this.selectedFile = this.tracks.length > 1 ? this.tracks[1].file : (this.tracks[0]?.file || '');
      this.volume = 0.55;
      this.currentIndex = -1;
      this.suspendedByVisibility = false;
      this.suspendedByRotate = false;
      this.pendingStart = false;
      this.unsupported = false;
      this.consecutiveErrors = 0;

      this.audio = new global.Audio();
      this.audio.preload = 'auto';
      this.audio.volume = this.volume;

      this.audio.addEventListener('ended', () => {
        if (!this.enabled) return;
        if (this.mode === 'repeat') {
          this.audio.currentTime = 0;
          this._safePlay();
        } else {
          this.playNextRandom();
        }
      });

      this.audio.addEventListener('error', () => {
        this.consecutiveErrors++;
        if (this.consecutiveErrors >= 3) {
          this.unsupported = true;
          this._emitTrackChange();
          return;
        }
        if (this.enabled && this.mode === 'random' && this.tracks.length > 1) {
          this.playNextRandom();
        }
      });

      this.audio.addEventListener('playing', () => {
        this.consecutiveErrors = 0;
        this.pendingStart = false;
        this._emitTrackChange();
      });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (!this.audio.paused) {
            this.suspendedByVisibility = true;
            this.audio.pause();
          }
        } else if (this.suspendedByVisibility) {
          this.suspendedByVisibility = false;
          if (this.enabled && !this.suspendedByRotate) {
            this._safePlay();
          }
        }
      });
    }

    getCurrentTrack() {
      if (this.currentIndex >= 0 && this.currentIndex < this.tracks.length) {
        return this.tracks[this.currentIndex];
      }
      return this.tracks.find((t) => t.file === this.selectedFile) || this.tracks[0] || null;
    }

    _emitTrackChange() {
      if (typeof this.onTrackChange === 'function') {
        this.onTrackChange(this.getCurrentTrack(), this);
      }
    }

    configure({ enabled, mode, selectedFile, volume }) {
      if (typeof enabled === 'boolean') this.enabled = enabled;
      if (mode === 'random' || mode === 'repeat') this.mode = mode;
      if (typeof selectedFile === 'string' && this.tracks.some((t) => t.file === selectedFile)) {
        this.selectedFile = selectedFile;
      }
      if (typeof volume === 'number' && !Number.isNaN(volume)) {
        this.volume = Math.max(0, Math.min(1, volume));
        this.audio.volume = this.volume;
      }
      this.audio.loop = this.mode === 'repeat';
      this._emitTrackChange();
    }

    setEnabled(val, autoplayNow = false) {
      this.enabled = Boolean(val);
      if (!this.enabled) {
        this.pendingStart = false;
        this.audio.pause();
        this._emitTrackChange();
      } else if (autoplayNow) {
        this.startOrResume();
      } else {
        this._emitTrackChange();
      }
    }

    setMode(mode, autoplayNow = false) {
      if (mode !== 'random' && mode !== 'repeat') return;
      this.mode = mode;
      this.audio.loop = mode === 'repeat';
      if (mode === 'repeat') {
        const idx = this.tracks.findIndex((t) => t.file === this.selectedFile);
        if (idx >= 0 && idx !== this.currentIndex) {
          this._loadIndex(idx);
        }
      }
      if (this.enabled && autoplayNow) {
        if (!this.audio.src) {
          this.startOrResume();
        } else {
          this._safePlay();
        }
      }
      this._emitTrackChange();
    }

    setSelectedTrack(file, playImmediately = false) {
      const idx = this.tracks.findIndex((t) => t.file === file);
      if (idx < 0) return;
      this.selectedFile = file;
      this._loadIndex(idx);
      if (this.enabled && playImmediately) {
        this._safePlay();
      }
      this._emitTrackChange();
    }

    setVolume(vol) {
      this.volume = Math.max(0, Math.min(1, Number(vol) || 0));
      this.audio.volume = this.volume;
    }

    setRotateSuspended(suspended) {
      const next = Boolean(suspended);
      if (next === this.suspendedByRotate) return;
      this.suspendedByRotate = next;
      if (next) {
        if (!this.audio.paused) {
          this.audio.pause();
        }
      } else if (this.enabled && !this.suspendedByVisibility && this.audio.src) {
        this._safePlay();
      }
    }

    unlockAndMaybeStart() {
      if (this.enabled && this.pendingStart && !this.suspendedByRotate && !this.suspendedByVisibility) {
        this._safePlay();
      }
    }

    startOrResume() {
      if (!this.enabled || this.tracks.length === 0 || this.suspendedByRotate) return;
      if (this.currentIndex < 0 || !this.audio.src) {
        if (this.mode === 'repeat') {
          const idx = Math.max(0, this.tracks.findIndex((t) => t.file === this.selectedFile));
          this._loadIndex(idx);
        } else {
          this.playNextRandom();
          return;
        }
      }
      this._safePlay();
    }

    playNextRandom() {
      if (this.tracks.length === 0) return;
      let nextIdx = 0;
      if (this.tracks.length > 1) {
        do {
          nextIdx = Math.floor(Math.random() * this.tracks.length);
        } while (nextIdx === this.currentIndex);
      }
      this._loadIndex(nextIdx);
      if (this.enabled && !this.suspendedByRotate) {
        this._safePlay();
      }
    }

    _loadIndex(idx) {
      if (idx < 0 || idx >= this.tracks.length) return;
      this.currentIndex = idx;
      this.unsupported = false;
      const track = this.tracks[idx];
      this.audio.src = track.url;
      this.audio.loop = this.mode === 'repeat';
      this.audio.load();
      this._emitTrackChange();
    }

    _safePlay() {
      if (!this.enabled || this.suspendedByRotate || this.suspendedByVisibility) return;
      try {
        const p = this.audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch((err) => {
            if (err && err.name === 'NotAllowedError') {
              this.pendingStart = true;
            }
          });
        }
      } catch (_) {
        this.pendingStart = true;
      }
    }
  }

  B3B.BGMPlayer = BGMPlayer;
})(window);
