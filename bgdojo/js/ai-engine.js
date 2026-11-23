/**
 * バックギャモン道場 (bgdojo) - AI思考エンジン & コーチ機能
 * ai-engine.js
 * 
 * 4段階のAI難易度 + ヒント・悪手警告ロジック + ダブリングキューブAI
 */

import { PLAYER_WHITE, PLAYER_BLACK, BackgammonBoard } from './bg-rules.js';

export class AIEngine {
  /**
   * 難易度に応じたベストシーケンスの選択
   * @param {BackgammonBoard} board 
   * @param {number} player 
   * @param {number[]} dice 
   * @param {number} level 1: 入門, 2: 初級, 3: 中級, 4: 上級
   * @returns {{ sequence: any, evaluation: number, hintText?: string }}
   */
  static selectBestMove(board, player, dice, level = 3) {
    const sequences = board.getAllLegalTurnSequences(player, dice);
    if (!sequences || sequences.length === 0) {
      return { sequence: null, evaluation: 0, hintText: '動かせる駒がありません（パス）' };
    }

    if (sequences.length === 1) {
      return { sequence: sequences[0], evaluation: this.evaluateBoard(sequences[0].finalBoard, player, level) };
    }

    // Lv.1 入門: ランダム + わずかに前進傾向
    if (level === 1) {
      const idx = Math.floor(Math.random() * sequences.length);
      return { sequence: sequences[idx], evaluation: 0 };
    }

    // 各シーケンスを評価
    let bestSeq = null;
    let bestScore = -Infinity;

    for (const seq of sequences) {
      const score = this.evaluateBoard(seq.finalBoard, player, level, seq.moves);
      // 同点時の揺らぎ
      const jitter = (Math.random() - 0.5) * 0.1;
      const totalScore = score + jitter;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestSeq = seq;
      }
    }

    return {
      sequence: bestSeq,
      evaluation: bestScore
    };
  }

  /**
   * 盤面評価関数
   */
  static evaluateBoard(board, player, level = 3, moves = []) {
    const myPip = board.getPipCount(player);
    const oppPip = board.getPipCount(-player);
    const pipDiff = oppPip - myPip; // 大きいほど自分が先行して有利

    const myOff = board.off[player];
    const oppOff = board.off[-player];
    const myBar = board.bar[player];
    const oppBar = board.bar[-player];

    // 勝敗
    if (myOff === 15) return 100000;
    if (oppOff === 15) return -100000;

    let score = 0;

    // 1. ピップリード（レース評価）
    score += pipDiff * 3.0;

    // 2. ベアオフ進行ボーナス
    score += myOff * 15.0;
    score -= oppOff * 15.0;

    // 3. バーの駒（相手をヒットした効果 vs 自分がヒットされたペナルティ）
    score += oppBar * 35.0;
    score -= myBar * 40.0;

    // 4. ブロット（単独の駒）の露出ペナルティ
    let myBlots = 0;
    let oppBlots = 0;
    let homeMadePoints = 0; // 自陣インナーボードのブロック数
    let consecutivePrimes = 0;
    let maxPrime = 0;
    let currentPrime = 0;

    for (let norm = 1; norm <= 24; norm++) {
      const info = board.getNormalizedPointInfo(player, norm);
      if (info.mine === 1) {
        myBlots++;
        // 相手の駒が後ろにいる（ヒットされる危険がある）かチェック
        let canBeHit = false;
        // 相手がバーにいる場合、相手から見た距離は 25 - (25 - norm) = norm
        if (oppBar > 0 && norm >= 19) {
          canBeHit = true;
        }
        for (let oppNorm = 1; oppNorm <= 24; oppNorm++) {
          const oppInfo = board.getNormalizedPointInfo(player, oppNorm);
          // 相手から見て手前（自陣から見て奥＝normより大きい）に相手駒がある場合
          if (oppInfo.opponent > 0 && oppNorm > norm) {
            const dist = oppNorm - norm;
            if (dist <= 12) {
              canBeHit = true;
              break;
            }
          }
        }
        if (canBeHit) {
          score -= (level >= 4 ? 25.0 : 18.0);
        } else {
          score -= 5.0; // 安全なブロットも多少のペナルティ
        }
      } else if (info.mine >= 2) {
        // ブロックポイント
        score += 8.0;
        if (norm <= 6) {
          homeMadePoints++;
          score += 12.0; // インナーボードのブロックは脱出阻止とベアオフで超重要
        }
        currentPrime++;
        if (currentPrime > maxPrime) maxPrime = currentPrime;
      } else {
        currentPrime = 0;
      }

      if (info.opponent === 1) oppBlots++;
    }

    // プライム（連続ブロック）の価値
    if (maxPrime >= 3) {
      score += Math.pow(maxPrime, 2.2) * 4.0;
    }

    // レベル別重み調整
    if (level === 2) {
      // 初級: ヒット最優先、ブロット回避
      const hitsCount = moves ? moves.filter(m => m.isHit).length : 0;
      score += hitsCount * 30.0;
      score -= myBlots * 10.0;
    } else if (level >= 3) {
      // 中級・上級: アンカー（相手インナー内の自陣拠点）評価
      for (let norm = 19; norm <= 24; norm++) {
        const info = board.getNormalizedPointInfo(player, norm);
        if (info.mine >= 2) {
          score += 18.0; // 高級アンカー（特に20番・21番）の価値
        }
      }
    }

    // Lv.4 精密被弾確率計算
    if (level >= 4) {
      const hitProb = this.calculateHitProbability(board, player);
      score -= hitProb * 60.0;
    }

    return score;
  }

  /**
   * 盤面上の自軍ブロットが次の手番で相手にヒットされる確率（0.0〜1.0）の近似計算
   */
  static calculateHitProbability(board, player) {
    let totalHitOutcomes = 0;
    const oppPlayer = -player;

    // 相手のダイス36通り (1-1 から 6-6)
    const diceOutcomes = [];
    for (let d1 = 1; d1 <= 6; d1++) {
      for (let d2 = 1; d2 <= 6; d2++) {
        diceOutcomes.push(d1 === d2 ? [d1, d1, d1, d1] : [d1, d2]);
      }
    }

    let hitCombinations = 0;
    // サンプリング（軽量化のため代表的な出目パターンまたは全数検査）
    for (const dice of diceOutcomes) {
      const oppSeqs = board.getAllLegalTurnSequences(oppPlayer, dice);
      let canHitInTurn = false;
      for (const seq of oppSeqs) {
        if (seq.moves.some(m => m.isHit)) {
          canHitInTurn = true;
          break;
        }
      }
      if (canHitInTurn) {
        hitCombinations++;
      }
    }

    return hitCombinations / 36.0;
  }

  /**
   * ダブリングキューブAIの判断
   * @param {BackgammonBoard} board 
   * @param {number} player 
   * @param {number} cubeValue 
   * @param {number} level 
   * @returns {'double'|'roll'|'take'|'drop'}
   */
  static evaluateCubeAction(board, player, cubeValue, level = 3, matchInfo = null) {
    const myPip = board.getPipCount(player);
    const oppPip = board.getPipCount(-player);
    const pipDiff = oppPip - myPip; // 自分が先行

    // ピップ差ベースの簡易勝率評価 (0.0 〜 1.0)
    // 一般的な目安: ピップ差 / (総ピップ * 0.15)
    const totalPip = myPip + oppPip;
    let winRate = 0.5 + (pipDiff / Math.max(80, totalPip * 0.25)) * 0.5;
    winRate = Math.max(0.05, Math.min(0.95, winRate));

    // 自軍の優勢補正 (ヒット・インナーボード等)
    const evalScore = this.evaluateBoard(board, player, level);
    if (evalScore > 80) winRate += 0.08;
    if (evalScore < -80) winRate -= 0.08;
    winRate = Math.max(0.05, Math.min(0.95, winRate));

    // ダブルを提案するかどうか (勝率が概ね 68%〜75% 以上、かつ高すぎない(Too good to double))
    // マネーゲーム / 通常マッチ基準
    if (winRate >= 0.68 && winRate <= 0.85) {
      return 'double';
    }

    return 'roll';
  }

  /**
   * 相手からダブルを提案された時の判断 (テイク or ドロップ)
   * 理論値: テイクポイントは約 25% (25%以上勝てるならテイクした方が期待値プラス)
   */
  static evaluateCubeResponse(board, player, cubeValue, level = 3) {
    const myPip = board.getPipCount(player);
    const oppPip = board.getPipCount(-player);
    const pipDiff = oppPip - myPip; // 自分が先行ならプラス、遅れならマイナス

    const totalPip = myPip + oppPip;
    let winRate = 0.5 + (pipDiff / Math.max(80, totalPip * 0.25)) * 0.5;
    winRate = Math.max(0.05, Math.min(0.95, winRate));

    // ギャモン負けの危険度（自軍のオフが0で相手のオフが進んでいる）
    let gammonRisk = 0;
    if (board.off[player] === 0 && board.off[-player] >= 6) {
      gammonRisk = 0.15;
    }

    const effectiveWinRate = winRate - gammonRisk;

    // 23%以上勝てる見込みがあれば受託(テイク)、それ未満なら辞退(ドロップ)
    if (effectiveWinRate >= 0.24) {
      return 'take';
    } else {
      return 'drop';
    }
  }

  /**
   * プレイヤー向けヒント生成（候補手上位とアドバイス）
   */
  static getPlayerHint(board, player, dice) {
    const sequences = board.getAllLegalTurnSequences(player, dice);
    if (!sequences || sequences.length === 0) {
      return { topMoves: [], advice: 'この出目で動かせる駒はありません。パスしてください。' };
    }

    const evaluated = sequences.map(seq => {
      const score = this.evaluateBoard(seq.finalBoard, player, 4, seq.moves);
      return { seq, score };
    });

    evaluated.sort((a, b) => b.score - a.score);
    const best = evaluated[0];

    const moveDescs = best.seq.moves.map(m => {
      const fromStr = m.fromBoard === 'bar' ? 'Bar' : `${m.fromBoard}pt`;
      const toStr = m.toBoard === 'off' ? 'Goal' : `${m.toBoard}pt`;
      return `${fromStr}→${toStr}${m.isHit ? ' (ヒット!)' : ''}`;
    }).join(', ');

    let advice = `【推奨手】${moveDescs}`;
    if (best.seq.moves.some(m => m.isHit)) {
      advice += ' ★相手の駒をヒットして大きなテンポを得られます。';
    } else if (best.seq.moves.some(m => m.toBoard === 'off')) {
      advice += ' ★駒をベアオフしてゴールを進めましょう。';
    }

    return {
      topMoves: evaluated.slice(0, 3),
      bestSequence: best.seq,
      advice
    };
  }

  /**
   * 悪手チェック（プレイヤーが確定しようとしている手に対する警告）
   */
  static checkBlunder(originalBoard, proposedBoard, player, dice) {
    const sequences = originalBoard.getAllLegalTurnSequences(player, dice);
    if (!sequences || sequences.length <= 1) return null;

    let bestScore = -Infinity;
    for (const seq of sequences) {
      const s = this.evaluateBoard(seq.finalBoard, player, 4, seq.moves);
      if (s > bestScore) bestScore = s;
    }

    const currentScore = this.evaluateBoard(proposedBoard, player, 4);
    const diff = bestScore - currentScore;

    if (diff > 35.0) {
      return {
        isBlunder: true,
        diff,
        message: '【注意】より安全な手、または相手をヒットできる好手があります。本当にこの手で確定しますか？'
      };
    }
    return null;
  }
}
