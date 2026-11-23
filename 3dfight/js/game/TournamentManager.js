import { CHARACTER_ORDER, FOUR_KINGS_ORDER } from '../data/characters.js?v=20261122222828';

const MAIN_LADDER_SCALES = [0.65, 0.72, 0.80, 0.90, 1.00, 1.08, 1.16, 1.25];
const HIDDEN_LADDER_SCALES = [1.12, 1.20, 1.28, 1.36, 1.45];

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * オモテ8戦＋裏5戦「全キャラ総当たり勝ち抜き（地獄ラダー）」管理クラス
 * 1プレイヤーを選んだら、自分以外のレギュラー全8体を倒して優勝 →
 * その後猛獣四天王全4体＋極北の帝王しろくまの計5連戦に挑みます！
 */
export class TournamentManager {
  constructor() {
    this.active = false;
    this.isHidden = false;
    this.playerId = 'GRIZZLY';
    this.stageIndex = 0;
    this.ladder = []; // [{ oppId, scale, label, enLabel, cleared }]
    this.championId = null;
  }

  /**
   * オモテ・全8戦勝ち抜きラダーを開始
   */
  start(playerId) {
    this.active = true;
    this.isHidden = false;
    this.playerId = playerId;
    this.stageIndex = 0;
    this.championId = null;

    const opponents = shuffle(CHARACTER_ORDER.filter((id) => id !== playerId)).slice(0, 8);
    this.ladder = opponents.map((oppId, idx) => {
      const isFinal = idx === opponents.length - 1;
      return {
        oppId,
        scale: MAIN_LADDER_SCALES[idx] || 1.25,
        label: isFinal ? `最終戦（第${idx + 1}戦）` : `第${idx + 1}戦`,
        enLabel: isFinal ? `MAIN LADDER FINAL (${idx + 1}/${opponents.length})` : `MAIN LADDER STAGE ${idx + 1}/${opponents.length}`,
        cleared: false,
      };
    });
  }

  /**
   * 裏・猛獣四天王全員＋極北の帝王しろくま（全5戦）開始
   */
  startHidden(playerId) {
    this.active = true;
    this.isHidden = true;
    this.playerId = playerId;
    this.stageIndex = 0;
    this.championId = null;

    const kings = shuffle(FOUR_KINGS_ORDER.filter((id) => id !== playerId));
    const finalBoss = playerId === 'POLAR_KING' ? 'LION' : 'POLAR_KING';
    const hiddenOpps = [...kings];
    if (hiddenOpps.length < 4) {
      const extra = CHARACTER_ORDER.find((id) => id !== playerId && !hiddenOpps.includes(id));
      if (extra) hiddenOpps.push(extra);
    }
    hiddenOpps.push(finalBoss);

    this.ladder = hiddenOpps.map((oppId, idx) => {
      const isFinal = idx === hiddenOpps.length - 1;
      return {
        oppId,
        scale: HIDDEN_LADDER_SCALES[idx] || 1.45,
        label: isFinal ? '真・最終決戦（覇者戦）' : `裏・第${idx + 1}戦（四天王）`,
        enLabel: isFinal ? 'TRUE BOSS: POLAR KING' : `HIDDEN FOUR KINGS ${idx + 1}/${hiddenOpps.length}`,
        cleared: false,
      };
    });
  }

  stop() {
    this.active = false;
    this.isHidden = false;
  }

  getTotalStages() {
    return this.ladder.length;
  }

  getStageInfo() {
    if (!this.ladder.length) {
      return { oppId: CHARACTER_ORDER[1], scale: 1.0, label: '第1戦', enLabel: 'STAGE 1', cleared: false };
    }
    return this.ladder[Math.min(this.stageIndex, this.ladder.length - 1)];
  }

  getStageScale() {
    return this.getStageInfo().scale;
  }

  isGrandFinal() {
    return this.active && this.stageIndex === this.ladder.length - 1;
  }

  getCurrentOpponentId() {
    return this.getStageInfo().oppId || CHARACTER_ORDER[1];
  }

  /**
   * @returns {'NEXT_STAGE' | 'CHAMPION' | 'TRUE_CHAMPION'}
   */
  recordPlayerWin() {
    const slot = this.ladder[this.stageIndex];
    if (slot) slot.cleared = true;

    if (this.stageIndex + 1 < this.ladder.length) {
      this.stageIndex += 1;
      return 'NEXT_STAGE';
    }

    this.championId = this.playerId;
    this.stageIndex = this.ladder.length;
    return this.isHidden ? 'TRUE_CHAMPION' : 'CHAMPION';
  }

  /**
   * DEV用：現在モードの最終戦（オモテ第8戦 / 裏第5戦しろくま）へ直行
   */
  skipToGrandFinal() {
    if (!this.active) {
      this.start(this.playerId);
    }
    for (let i = 0; i < this.ladder.length - 1; i++) {
      this.ladder[i].cleared = true;
    }
    this.stageIndex = Math.max(0, this.ladder.length - 1);
  }

  getSnapshot() {
    return {
      active: this.active,
      isHidden: this.isHidden,
      playerId: this.playerId,
      stageIndex: this.stageIndex,
      totalStages: this.ladder.length,
      stage: this.getStageInfo(),
      opponentId: this.getCurrentOpponentId(),
      ladder: this.ladder,
      championId: this.championId,
    };
  }
}
