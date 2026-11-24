/**
 * audio.js - Web Audio API 合成音響 ＆ BGMジュークボックスエンジン
 * 外部音声ファイルへの依存なしでも動作し、asset/music の50曲BGM再生・選曲・ループ/ランダム切替にも完全対応。
 */
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
        this.sfxVolume = 0.7;
        this.bgmVolume = 0.45;

        // SE用ゲインノード
        this.masterGain = null;
        this.sfxGain = null;

        // 内蔵シンセサイザーBGM用
        this.synthBgmEnabled = false;
        this.synthBgmTimer = null;
        this.synthBgmStep = 0;
        this.synthBgmGain = null;

        // 外部ファイル（asset/music）BGMジュークボックス
        this.bgmAudio = new Audio();
        this.bgmList = [];
        this.currentTrackIndex = -1;
        this.playMode = 'random'; // 'random' または 'loop'
        this.isBgmPlaying = false;
        this.bgmSourceType = 'file'; // 'file' または 'synth' または 'none'

        // 再生終了時の自動遷移
        this.bgmAudio.addEventListener('ended', () => {
            if (this.playMode === 'loop') {
                this.playBgmTrack(this.currentTrackIndex);
            } else {
                // ランダムに次の曲
                this.playRandomBgm();
            }
        });

        this.bgmAudio.addEventListener('error', (e) => {
            console.warn('BGM file play error, fallback to synth if enabled', e);
        });

        // ノイズバッファ（移動音「チャッ」用の極短ホワイトノイズ）
        this.noiseBuffer = null;
    }

    init() {
        if (this.ctx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        this.ctx = new AudioContext();
        
        // マスターゲイン
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        // SFXゲイン
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
        this.sfxGain.connect(this.masterGain);

        // 内蔵シンセBGMゲイン
        this.synthBgmGain = this.ctx.createGain();
        this.synthBgmGain.gain.setValueAtTime(0.18, this.ctx.currentTime);
        this.synthBgmGain.connect(this.masterGain);

        // ノイズバッファ生成（50ms）
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.05);
        this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // 音量制御
    setSfxVolume(val) {
        this.sfxVolume = Math.max(0, Math.min(1, val));
        if (this.sfxGain && this.ctx) {
            this.sfxGain.gain.setValueAtTime(this.isMuted ? 0 : this.sfxVolume, this.ctx.currentTime);
        }
    }

    setBgmVolume(val) {
        this.bgmVolume = Math.max(0, Math.min(1, val));
        this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;
        if (this.synthBgmGain && this.ctx) {
            this.synthBgmGain.gain.setValueAtTime(this.isMuted ? 0 : this.bgmVolume * 0.35, this.ctx.currentTime);
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            if (this.sfxGain && this.ctx) this.sfxGain.gain.setValueAtTime(0, this.ctx.currentTime);
            this.bgmAudio.volume = 0;
            if (this.synthBgmGain && this.ctx) this.synthBgmGain.gain.setValueAtTime(0, this.ctx.currentTime);
        } else {
            if (this.sfxGain && this.ctx) this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
            this.bgmAudio.volume = this.bgmVolume;
            if (this.synthBgmGain && this.ctx) this.synthBgmGain.gain.setValueAtTime(this.bgmVolume * 0.35, this.ctx.currentTime);
        }
        return this.isMuted;
    }

    // =========================================================
    // 効果音（SFX）
    // =========================================================

    // ★移動音：「チャッ！チャッ！チャッ！」という小気味よいクリスタルクリック音
    playMove() {
        if (this.isMuted) return;
        this.init();
        this.resume();
        const now = this.ctx.currentTime;

        // 1. バンドパス・ノイズ（チャッという擦過音・アタック）
        if (this.noiseBuffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(4200, now);
            filter.Q.setValueAtTime(3.5, now);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.25, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(this.sfxGain);

            noise.start(now);
            noise.stop(now + 0.025);
        }

        // 2. 超短パルス・クリスタルトーン（澄んだ高音芯）
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2600, now);
        osc.frequency.exponentialRampToValueAtTime(1400, now + 0.02);

        oscGain.gain.setValueAtTime(0.18, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

        osc.connect(oscGain);
        oscGain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.02);
    }

    // 回転音：軽快なスイープチャイム
    playRotate() {
        if (this.isMuted) return;
        this.init();
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(960, now + 0.07);

        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.08);
    }

    // ソフトドロップ/着地音
    playLock() {
        if (this.isMuted) return;
        this.init();
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.09);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.09);
    }

    // ハードドロップ音
    playHardDrop() {
        if (this.isMuted) return;
        this.init();
        this.resume();
        const now = this.ctx.currentTime;

        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(190, now);
        kickOsc.frequency.exponentialRampToValueAtTime(45, now + 0.18);
        kickGain.gain.setValueAtTime(0.45, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        kickOsc.connect(kickGain);
        kickGain.connect(this.sfxGain);
        kickOsc.start(now);
        kickOsc.stop(now + 0.18);

        const hiOsc = this.ctx.createOscillator();
        const hiGain = this.ctx.createGain();
        hiOsc.type = 'triangle';
        hiOsc.frequency.setValueAtTime(1046.5, now);
        hiOsc.frequency.exponentialRampToValueAtTime(2093, now + 0.14);
        hiGain.gain.setValueAtTime(0.18, now);
        hiGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        hiOsc.connect(hiGain);
        hiGain.connect(this.sfxGain);
        hiOsc.start(now);
        hiOsc.stop(now + 0.14);
    }

    // ホールド音
    playHold() {
        if (this.isMuted) return;
        this.init();
        this.resume();
        const now = this.ctx.currentTime;
        [587.33, 880].forEach(f => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, now);
            osc.frequency.exponentialRampToValueAtTime(f * 1.25, now + 0.12);
            gain.gain.setValueAtTime(0.14, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(now);
            osc.stop(now + 0.13);
        });
    }

    // ライン消去音
    playLineClear(lines, combo = 0) {
        if (this.isMuted) return;
        this.init();
        this.resume();
        const now = this.ctx.currentTime;
        const scale = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00];
        const baseIndex = Math.min(combo, 3);

        let notes = [];
        if (lines === 1) notes = [scale[baseIndex], scale[baseIndex + 2]];
        else if (lines === 2) notes = [scale[baseIndex], scale[baseIndex + 2], scale[baseIndex + 3]];
        else if (lines === 3) notes = [scale[baseIndex], scale[baseIndex + 1], scale[baseIndex + 3], scale[baseIndex + 4]];
        else notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00];

        notes.forEach((freq, idx) => {
            const startDelay = idx * 0.055;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = lines >= 4 ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(freq, now + startDelay);

            const duration = lines >= 4 ? 0.45 : 0.3;
            gain.gain.setValueAtTime(0.2, now + startDelay);
            gain.gain.exponentialRampToValueAtTime(0.001, now + startDelay + duration);

            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.start(now + startDelay);
            osc.stop(now + startDelay + duration);
        });
    }

    playGameOver() {
        if (this.isMuted) return;
        this.init();
        this.resume();
        const now = this.ctx.currentTime;
        [440, 392, 349.23, 261.63].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const start = now + idx * 0.15;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.2, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(start);
            osc.stop(start + 0.35);
        });
    }

    playLevelUp() {
        if (this.isMuted) return;
        this.init();
        this.resume();
        const now = this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const start = now + i * 0.08;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, start);
            gain.gain.setValueAtTime(0.2, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(start);
            osc.stop(start + 0.25);
        });
    }

    // =========================================================
    // BGMジュークボックス（asset/music ＆ シンセサイザー両対応）
    // =========================================================

    // プレイリスト登録
    setPlaylist(list) {
        this.bgmList = list || [];
    }

    // 外部オーディオトラック再生
    playBgmTrack(index) {
        if (!this.bgmList || this.bgmList.length === 0) {
            this.startSynthBgm();
            return;
        }

        if (index < 0 || index >= this.bgmList.length) {
            index = 0;
        }

        this.currentTrackIndex = index;
        const track = this.bgmList[this.currentTrackIndex];

        this.stopSynthBgm();
        this.bgmAudio.src = track.url;
        this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;
        this.bgmAudio.loop = (this.playMode === 'loop');

        const playPromise = this.bgmAudio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                this.isBgmPlaying = true;
                this.bgmSourceType = 'file';
                this.notifyTrackChange(track);
            }).catch(err => {
                console.warn('BGM play blocked or waiting user gesture, fallback to synth:', err);
                this.startSynthBgm();
            });
        }
    }

    // ランダム再生
    playRandomBgm() {
        if (!this.bgmList || this.bgmList.length === 0) {
            this.startSynthBgm();
            return;
        }
        let nextIndex;
        if (this.bgmList.length === 1) {
            nextIndex = 0;
        } else {
            do {
                nextIndex = Math.floor(Math.random() * this.bgmList.length);
            } while (nextIndex === this.currentTrackIndex && this.bgmList.length > 1);
        }
        this.playBgmTrack(nextIndex);
    }

    stopBgm() {
        this.bgmAudio.pause();
        this.isBgmPlaying = false;
        this.stopSynthBgm();
    }

    pauseBgm() {
        if (this.bgmSourceType === 'file') {
            this.bgmAudio.pause();
        } else if (this.bgmSourceType === 'synth') {
            this.stopSynthBgm();
        }
        this.isBgmPlaying = false;
    }

    resumeBgm() {
        if (this.bgmSourceType === 'file' && this.bgmAudio.src) {
            this.bgmAudio.play().then(() => {
                this.isBgmPlaying = true;
            }).catch(() => {});
        } else {
            this.startSynthBgm();
        }
    }

    setPlayMode(mode) {
        this.playMode = mode;
        this.bgmAudio.loop = (mode === 'loop');
    }

    onTrackChange = null;
    notifyTrackChange(track) {
        if (this.onTrackChange) {
            this.onTrackChange(track, this.playMode);
        }
    }

    getCurrentTrack() {
        if (this.currentTrackIndex >= 0 && this.currentTrackIndex < this.bgmList.length) {
            return this.bgmList[this.currentTrackIndex];
        }
        return { name: 'Crystal Ambient Synth (Built-in)', url: '' };
    }

    // 内蔵シンセBGM
    startSynthBgm() {
        if (this.synthBgmTimer) return;
        this.init();
        this.resume();
        this.bgmSourceType = 'synth';
        this.isBgmPlaying = true;

        const notes = [
            261.63, 329.63, 392.00, 523.25, 659.25, 
            392.00, 523.25, 783.99, 659.25, 523.25,
            392.00, 329.63, 261.63, 392.00, 523.25, 659.25
        ];
        
        const playStep = () => {
            if (this.isMuted || !this.ctx) return;
            const now = this.ctx.currentTime;
            const freq = notes[this.synthBgmStep % notes.length];
            this.synthBgmStep++;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

            osc.connect(gain);
            gain.connect(this.synthBgmGain);

            osc.start(now);
            osc.stop(now + 0.65);
        };

        this.synthBgmTimer = setInterval(playStep, 450);
        this.notifyTrackChange({ name: 'Crystal Ambient Synth (Built-in)', url: '' });
    }

    stopSynthBgm() {
        if (this.synthBgmTimer) {
            clearInterval(this.synthBgmTimer);
            this.synthBgmTimer = null;
        }
    }
}

window.soundEngine = new SoundEngine();
