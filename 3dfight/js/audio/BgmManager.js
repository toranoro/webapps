/**
 * 外部音声ファイル (assets/bgm/<track>.flac / .mp3 / .ogg / .wav) の自動検出・ループ再生管理クラス
 * YuE2 バッチ生成された BGM を、未生成ファイルを安全にスキップしつつシーン・対戦相手ごとに切り替えます。
 */
export const BGM_SCREEN_TRACKS = {
  TITLE: '00_opening_title',
  CHAR_SELECT: '00_character_select',
  BRACKET: '00_tournament_bracket',
  CHAMPION: '00_champion_trophy',
  PHASE4_EMERGENCY: '00_phase4_emergency',
  TRUE_ENDING: '00_true_ending_credits',
};

export const BGM_FIGHTER_TRACKS = {
  GRIZZLY: { battle: '01_battle_grizzly', ending: '01_ending_grizzly' },
  GIRAFFE: { battle: '02_battle_giraffe', ending: '02_ending_giraffe' },
  KOALA: { battle: '03_battle_koala', ending: '03_ending_koala' },
  KANGAROO: { battle: '04_battle_kangaroo', ending: '04_ending_kangaroo' },
  PENGUIN: { battle: '05_battle_penguin', ending: '05_ending_penguin' },
  CHAMELEON: { battle: '06_battle_chameleon', ending: '06_ending_chameleon' },
  HIPPO: { battle: '07_battle_hippo', ending: '07_ending_hippo' },
  FLAMINGO: { battle: '08_battle_flamingo', ending: '08_ending_flamingo' },
  ALPACA: { battle: '09_battle_alpaca', ending: '09_ending_alpaca' },
  LION: { battle: '10_battle_lion', ending: '10_ending_lion' },
  TIGER: { battle: '11_battle_tiger', ending: '11_ending_tiger' },
  ELEPHANT: { battle: '12_battle_elephant', ending: '12_ending_elephant' },
  RHINO: { battle: '13_battle_rhino', ending: '13_ending_rhino' },
  POLAR_KING: { battle: '14_battle_polar_king', ending: '14_ending_polar_king' },
};

const BASE_DIRS = ['./assets/bgm', './music', './assets/music'];
const EXTENSIONS = ['ogg', 'mp3', 'flac', 'wav'];

export class BgmManager {
  constructor() {
    this.audio = new Audio();
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.baseVolume = 0.36;
    this.ducked = false;
    this.muted = false;

    this.currentKey = null;
    this.desiredKey = null;
    this.desiredLoop = true;
    this.unlocked = false;
    this._requestSeq = 0;

    // 解決済み・失敗済みキャッシュ（高速切り替え＆重複404抑止）
    this._resolvedUrls = new Map();
    this._fallbackTried = new Set();

    this.audio.addEventListener('error', () => {
      const failedKey = this.currentKey;
      if (!failedKey || this.muted || this.desiredKey !== failedKey) return;
      if (this._fallbackTried.has(failedKey)) {
        this.currentKey = null;
        return;
      }
      this._fallbackTried.add(failedKey);
      this._resolveFallbackAndPlay(failedKey, this.audio.src, this._requestSeq);
    });
  }

  unlock() {
    this.unlocked = true;
    if (!this.muted && this.desiredKey && this.audio.paused) {
      if (this.currentKey === this.desiredKey && this.audio.src) {
        this.audio.play().catch(() => {});
      } else {
        const key = this.desiredKey;
        const loop = this.desiredLoop;
        this.currentKey = null;
        this.playTrack(key, { loop });
      }
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) {
      this.audio.pause();
    } else if (this.desiredKey) {
      const key = this.desiredKey;
      const loop = this.desiredLoop;
      this.currentKey = null;
      this.playTrack(key, { loop });
    }
  }

  isMuted() {
    return this.muted;
  }

  setDucked(ducked) {
    this.ducked = Boolean(ducked);
    this._applyVolume();
  }

  _applyVolume() {
    this.audio.volume = this.ducked ? this.baseVolume * 0.42 : this.baseVolume;
  }

  async _resolveFallbackAndPlay(trackKey, failedSrc, seq) {
    for (const dir of BASE_DIRS) {
      for (const ext of EXTENSIONS) {
        const url = `${dir}/${trackKey}.${ext}`;
        if (failedSrc && failedSrc.endsWith(url.replace('./', '/'))) continue;
        try {
          const res = await fetch(url, { method: 'HEAD' });
          if (seq !== this._requestSeq || this.muted || this.desiredKey !== trackKey) {
            return;
          }
          if (res.ok) {
            this._resolvedUrls.set(trackKey, url);
            this.audio.loop = this.desiredLoop;
            this.audio.src = url;
            this._applyVolume();
            this.audio.play().catch(() => {});
            return;
          }
        } catch {
          // 次の候補へ
        }
      }
    }
    this._resolvedUrls.set(trackKey, null);
    this.currentKey = null;
  }

  async playTrack(trackKey, { loop = true } = {}) {
    this.desiredKey = trackKey;
    this.desiredLoop = loop;

    if (!trackKey || this.muted) {
      this.audio.pause();
      this.currentKey = null;
      return;
    }

    if (this.currentKey === trackKey && this.audio.src && !this.audio.paused) {
      this.audio.loop = loop;
      this._applyVolume();
      return;
    }

    const seq = ++this._requestSeq;
    let url = this._resolvedUrls.get(trackKey);
    if (url === null) {
      this.audio.pause();
      this.currentKey = null;
      return;
    }
    if (!url) {
      // 最軽量な .ogg を事前HEADリクエスト無しのダイレクト再生で即ストリーミング開始
      url = `${BASE_DIRS[0]}/${trackKey}.${EXTENSIONS[0]}`;
    }

    if (seq !== this._requestSeq || this.muted || this.desiredKey !== trackKey) {
      return;
    }

    this.currentKey = trackKey;
    this.audio.loop = loop;
    this.audio.src = url;
    this._applyVolume();

    try {
      await this.audio.play();
      this._resolvedUrls.set(trackKey, url);
      this.unlocked = true;
    } catch {
      // ユーザー操作前の自動再生ブロック時は unlock() まで再生保留
    }
  }

  stop() {
    this.desiredKey = null;
    this.currentKey = null;
    this._requestSeq += 1;
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  getTrackForState(screen, p1Id, p2Id, isTrueChampion = false) {
    if (screen === 'EMERGENCY_EVENT') {
      return BGM_SCREEN_TRACKS.PHASE4_EMERGENCY;
    }
    if (screen === 'CHAMPION') {
      return isTrueChampion ? BGM_SCREEN_TRACKS.TRUE_ENDING : BGM_SCREEN_TRACKS.CHAMPION;
    }
    if (screen === 'ENDING') {
      return BGM_FIGHTER_TRACKS[p1Id]?.ending || BGM_SCREEN_TRACKS.TRUE_ENDING;
    }
    if (screen === 'ROUND_INTRO' || screen === 'FIGHTING' || screen === 'ROUND_END') {
      return BGM_FIGHTER_TRACKS[p2Id]?.battle || BGM_SCREEN_TRACKS.TITLE;
    }
    if (screen === 'PAUSED' || screen === 'RESULT') {
      return this.desiredKey;
    }
    return BGM_SCREEN_TRACKS[screen] || null;
  }
}
