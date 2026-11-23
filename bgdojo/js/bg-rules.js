/**
 * バックギャモン道場 (bgdojo) - コアルールエンジン
 * bg-rules.js
 * 
 * 厳密なバックギャモン公式ルールに準拠:
 * - 盤面座標系 (1〜24, バー, ベアオフ)
 * - ゾロ目の4回移動
 * - バー優先復帰
 * - ベアオフ判定（ジャスト目および高ポイント不在時の外側ベアオフ）
 * - 最大出目優先原則（どちらか片方しか使えない場合は大きい目を強制）
 * - 最大手数原則（可能な限り多くの目を使用）
 * - ピップカウント計算
 * - シングル / ギャモン / バックギャモン 勝利判定
 */

export const PLAYER_WHITE = 1;  // 先手 / 白 (進行方向: 24 -> 1, ホーム: 1..6, ベアオフ: 0)
export const PLAYER_BLACK = -1; // 後手 / 黒 (進行方向: 1 -> 24, ホーム: 19..24, ベアオフ: 25)

export const BOARD_POINTS = 24;

/**
 * 盤面クラス
 */
export class BackgammonBoard {
  constructor() {
    this.points = new Array(BOARD_POINTS + 1).fill(null).map(() => ({ player: 0, count: 0 }));
    this.bar = { [PLAYER_WHITE]: 0, [PLAYER_BLACK]: 0 };
    this.off = { [PLAYER_WHITE]: 0, [PLAYER_BLACK]: 0 };
    this.initStandard();
  }

  /**
   * 標準初期配置の設定
   */
  initStandard() {
    for (let i = 1; i <= BOARD_POINTS; i++) {
      this.points[i] = { player: 0, count: 0 };
    }
    this.bar[PLAYER_WHITE] = 0;
    this.bar[PLAYER_BLACK] = 0;
    this.off[PLAYER_WHITE] = 0;
    this.off[PLAYER_BLACK] = 0;

    // 白 (PLAYER_WHITE): 24に2枚, 13に5枚, 8に3枚, 6に5枚
    this.points[24] = { player: PLAYER_WHITE, count: 2 };
    this.points[13] = { player: PLAYER_WHITE, count: 5 };
    this.points[8]  = { player: PLAYER_WHITE, count: 3 };
    this.points[6]  = { player: PLAYER_WHITE, count: 5 };

    // 黒 (PLAYER_BLACK): 1に2枚, 12に5枚, 17に3枚, 19に5枚
    this.points[1]  = { player: PLAYER_BLACK, count: 2 };
    this.points[12] = { player: PLAYER_BLACK, count: 5 };
    this.points[17] = { player: PLAYER_BLACK, count: 3 };
    this.points[19] = { player: PLAYER_BLACK, count: 5 };
  }

  /**
   * クローン作成
   */
  clone() {
    const copy = new BackgammonBoard();
    for (let i = 1; i <= BOARD_POINTS; i++) {
      copy.points[i] = { ...this.points[i] };
    }
    copy.bar = { ...this.bar };
    copy.off = { ...this.off };
    return copy;
  }

  /**
   * 盤面ポイント (1〜24) を指定プレイヤーの正規化座標 (24〜1, 25=バー, 0=オフ) に変換
   */
  static toNormalized(player, boardPt) {
    if (boardPt === 'bar' || boardPt === 25 || boardPt === 0) {
      return boardPt;
    }
    return player === PLAYER_WHITE ? boardPt : (25 - boardPt);
  }

  /**
   * 正規化座標 (24〜1) を盤面ポイント (1〜24) に逆変換
   */
  static fromNormalized(player, normPt) {
    if (normPt <= 0) return player === PLAYER_WHITE ? 0 : 25; // オフ
    if (normPt >= 25) return player === PLAYER_WHITE ? 25 : 0; // バー
    return player === PLAYER_WHITE ? normPt : (25 - normPt);
  }

  /**
   * 正規化座標での駒情報取得
   * @param {number} player 
   * @param {number} normPt 1〜24, 25(bar), 0(off)
   * @returns {{ mine: number, opponent: number }}
   */
  getNormalizedPointInfo(player, normPt) {
    if (normPt === 25) {
      return { mine: this.bar[player], opponent: this.bar[-player] };
    }
    if (normPt === 0) {
      return { mine: this.off[player], opponent: this.off[-player] };
    }
    const bPt = BackgammonBoard.fromNormalized(player, normPt);
    const pt = this.points[bPt];
    if (pt.player === player) {
      return { mine: pt.count, opponent: 0 };
    } else if (pt.player === -player) {
      return { mine: 0, opponent: pt.count };
    } else {
      return { mine: 0, opponent: 0 };
    }
  }

  /**
   * 全駒がホームボード (正規化 1〜6) またはオフにあるか判定
   */
  canBearOff(player) {
    if (this.bar[player] > 0) return false;
    for (let norm = 7; norm <= 24; norm++) {
      const bPt = BackgammonBoard.fromNormalized(player, norm);
      if (this.points[bPt].player === player && this.points[bPt].count > 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * ホーム外（より遠い場所）に駒があるか
   */
  hasCheckerFurtherThan(player, normPt) {
    for (let norm = normPt + 1; norm <= 24; norm++) {
      const bPt = BackgammonBoard.fromNormalized(player, norm);
      if (this.points[bPt].player === player && this.points[bPt].count > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * ピップカウント（ゴールまでの合計残り歩数）を計算
   */
  getPipCount(player) {
    let pip = this.bar[player] * 25;
    for (let norm = 1; norm <= 24; norm++) {
      const bPt = BackgammonBoard.fromNormalized(player, norm);
      if (this.points[bPt].player === player) {
        pip += norm * this.points[bPt].count;
      }
    }
    return pip;
  }

  /**
   * 1つの単一移動が合法かチェック
   * @param {number} player 
   * @param {number} fromNorm 25(bar) または 1〜24
   * @param {number} die サイコロの目 (1〜6)
   * @returns {{ valid: boolean, toNorm: number, isHit: boolean, reason?: string }}
   */
  checkSingleMove(player, fromNorm, die) {
    // バーに駒がある場合、バー以外からは動かせない
    if (this.bar[player] > 0 && fromNorm !== 25) {
      return { valid: false, reason: 'バーの駒を先に復帰させる必要があります' };
    }

    // 移動元に自分の駒があるか
    if (fromNorm === 25) {
      if (this.bar[player] <= 0) return { valid: false, reason: 'バーに駒がありません' };
    } else {
      const bFrom = BackgammonBoard.fromNormalized(player, fromNorm);
      if (this.points[bFrom].player !== player || this.points[bFrom].count <= 0) {
        return { valid: false, reason: '移動元に駒がありません' };
      }
    }

    const toNorm = fromNorm - die;

    // ベアオフの場合
    if (toNorm <= 0) {
      if (!this.canBearOff(player)) {
        return { valid: false, reason: '全駒がインナーに入るまでベアオフできません' };
      }
      if (toNorm === 0) {
        // ジャストベアオフ
        return { valid: true, toNorm: 0, isHit: false };
      } else {
        // 出目が余るベアオフ: 移動元より手前に駒がない場合のみ可
        if (this.hasCheckerFurtherThan(player, fromNorm)) {
          return { valid: false, reason: 'より遠いポイントに駒があるためベアオフできません' };
        }
        return { valid: true, toNorm: 0, isHit: false };
      }
    }

    // 通常の移動先 (1〜24)
    const bTo = BackgammonBoard.fromNormalized(player, toNorm);
    const dest = this.points[bTo];

    if (dest.player === -player && dest.count >= 2) {
      return { valid: false, reason: '相手のブロックポイントです' };
    }

    const isHit = (dest.player === -player && dest.count === 1);
    return { valid: true, toNorm, isHit };
  }

  /**
   * 1手の移動を実行（破壊的操作）
   */
  applyMove(player, fromNorm, toNorm) {
    let isHit = false;
    // 駒を取り除く
    if (fromNorm === 25) {
      this.bar[player]--;
    } else {
      const bFrom = BackgammonBoard.fromNormalized(player, fromNorm);
      this.points[bFrom].count--;
      if (this.points[bFrom].count === 0) {
        this.points[bFrom].player = 0;
      }
    }

    // 駒を配置
    if (toNorm === 0) {
      this.off[player]++;
    } else {
      const bTo = BackgammonBoard.fromNormalized(player, toNorm);
      if (this.points[bTo].player === -player && this.points[bTo].count === 1) {
        // ヒット！相手の駒をバーへ
        this.bar[-player]++;
        this.points[bTo].player = player;
        this.points[bTo].count = 1;
        isHit = true;
      } else {
        this.points[bTo].player = player;
        this.points[bTo].count++;
      }
    }
    return { isHit };
  }

  /**
   * 現在のプレイヤーの単一出目に対する全単発合法手を検索
   * @param {number} player 
   * @param {number} die 
   * @returns {Array<{ fromNorm: number, toNorm: number, isHit: boolean, fromBoard: number|'bar', toBoard: number|'off' }>}
   */
  getAvailableSteps(player, die) {
    const steps = [];
    if (this.bar[player] > 0) {
      const res = this.checkSingleMove(player, 25, die);
      if (res.valid) {
        steps.push({
          fromNorm: 25,
          toNorm: res.toNorm,
          isHit: res.isHit,
          fromBoard: 'bar',
          toBoard: res.toNorm === 0 ? 'off' : BackgammonBoard.fromNormalized(player, res.toNorm)
        });
      }
      return steps;
    }

    for (let norm = 1; norm <= 24; norm++) {
      const bPt = BackgammonBoard.fromNormalized(player, norm);
      if (this.points[bPt].player === player && this.points[bPt].count > 0) {
        const res = this.checkSingleMove(player, norm, die);
        if (res.valid) {
          steps.push({
            fromNorm: norm,
            toNorm: res.toNorm,
            isHit: res.isHit,
            fromBoard: bPt,
            toBoard: res.toNorm === 0 ? 'off' : BackgammonBoard.fromNormalized(player, res.toNorm)
          });
        }
      }
    }
    return steps;
  }

  /**
   * 与えられたダイスリストから、可能なすべての「完全手（シーケンス）」を探索
   * 最大出目優先および最大手数原則を満たす手のみをフィルタリング
   * @param {number} player 
   * @param {number[]} dice 出目の配列 (例: [3, 5] または [4, 4, 4, 4])
   * @returns {Array<{ moves: Array<{ fromNorm: number, toNorm: number, die: number, isHit: boolean, fromBoard: any, toBoard: any }>, finalBoard: BackgammonBoard }>}
   */
  getAllLegalTurnSequences(player, dice) {
    const sequences = [];

    // 再帰探索
    function search(board, remainingDice, currentMoves) {
      if (remainingDice.length === 0) {
        sequences.push({ moves: [...currentMoves], finalBoard: board });
        return;
      }

      // 重複する目を枝刈り
      const triedDice = new Set();
      let anyMoveFound = false;

      for (let i = 0; i < remainingDice.length; i++) {
        const die = remainingDice[i];
        if (triedDice.has(die)) continue;
        triedDice.add(die);

        const steps = board.getAvailableSteps(player, die);
        if (steps.length > 0) {
          anyMoveFound = true;
          const nextDice = [...remainingDice];
          nextDice.splice(i, 1);

          for (const step of steps) {
            const nextBoard = board.clone();
            nextBoard.applyMove(player, step.fromNorm, step.toNorm);
            currentMoves.push({
              fromNorm: step.fromNorm,
              toNorm: step.toNorm,
              die,
              isHit: step.isHit,
              fromBoard: step.fromBoard,
              toBoard: step.toBoard
            });
            search(nextBoard, nextDice, currentMoves);
            currentMoves.pop();
          }
        }
      }

      // どの目でも動かせなかったが、既にいくつか動かしている場合は末端として追加
      if (!anyMoveFound && currentMoves.length > 0) {
        sequences.push({ moves: [...currentMoves], finalBoard: board });
      }
    }

    search(this.clone(), dice, []);

    if (sequences.length === 0) {
      return []; // 1手も動かせないパス
    }

    // 1. 最大手数のルール: 最も多くのダイス目を使える手のみを残す
    let maxMovesCount = 0;
    for (const seq of sequences) {
      if (seq.moves.length > maxMovesCount) {
        maxMovesCount = seq.moves.length;
      }
    }
    let validSeqs = sequences.filter(s => s.moves.length === maxMovesCount);

    // 2. 最大出目優先ルール: 異なる2つの目のうち片方しか動かせない場合、大きい目を優先
    if (dice.length === 2 && dice[0] !== dice[1] && maxMovesCount === 1) {
      const maxDie = Math.max(dice[0], dice[1]);
      const maxDieSeqs = validSeqs.filter(s => s.moves[0].die === maxDie);
      if (maxDieSeqs.length > 0) {
        validSeqs = maxDieSeqs;
      }
    }

    // 盤面同一性の重複除去
    const uniqueSeqs = [];
    const seenSignatures = new Set();
    for (const seq of validSeqs) {
      const sig = seq.moves.map(m => `${m.fromBoard}->${m.toBoard}(${m.die})`).join(';');
      if (!seenSignatures.has(sig)) {
        seenSignatures.add(sig);
        uniqueSeqs.push(seq);
      }
    }

    return uniqueSeqs;
  }

  /**
   * 勝敗判定
   * @returns {{ gameOver: boolean, winner: number, winType: 'single'|'gammon'|'backgammon', points: number }}
   */
  checkWin() {
    let winner = 0;
    if (this.off[PLAYER_WHITE] === 15) winner = PLAYER_WHITE;
    if (this.off[PLAYER_BLACK] === 15) winner = PLAYER_BLACK;

    if (!winner) {
      return { gameOver: false, winner: 0, winType: null, points: 0 };
    }

    const loser = -winner;
    const loserOff = this.off[loser];

    // シングル勝ち: 敗者が1枚以上ベアオフ済み
    if (loserOff > 0) {
      return { gameOver: true, winner, winType: 'single', points: 1 };
    }

    // ギャモン / バックギャモン判定: 敗者が1枚もベアオフしていない
    // バックギャモン: 敗者の駒が勝者のインナーボード (勝者正規化1〜6 = 敗者正規化19〜24) またはバーにある
    let isBackgammon = (this.bar[loser] > 0);
    if (!isBackgammon) {
      for (let norm = 19; norm <= 24; norm++) {
        const bPt = BackgammonBoard.fromNormalized(loser, norm);
        if (this.points[bPt].player === loser && this.points[bPt].count > 0) {
          isBackgammon = true;
          break;
        }
      }
    }

    if (isBackgammon) {
      return { gameOver: true, winner, winType: 'backgammon', points: 3 };
    } else {
      return { gameOver: true, winner, winType: 'gammon', points: 2 };
    }
  }
}
