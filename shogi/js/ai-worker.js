/*
 * ai-worker.js - 簡易思考ルーチン（プロトタイプ版）
 *
 * ・ミニマックス法(ネガマックス) + αβ枝刈り + 駒得/前進の評価関数
 * ・file:// で index.html を直接開いても動くよう、現状はメインスレッド上で
 *   時間制限つきの反復深化で動かす（Chrome は file:// から Web Worker を
 *   生成できないため）。
 * ・本格AI導入時(Phase 2)は、このファイルの ShogiAI.chooseMove を Worker 内へ
 *   移すか、YaneuraOu(Wasm) / USI 連携に差し替える。呼び出し口は
 *   ShogiAI.chooseMove(state, level) のみ。
 * 公開API: window.ShogiAI
 */
(function (global) {
  'use strict';
  var E = global.ShogiEngine;

  var LEVELS = {
    1: { name: '入門', depth: 0, time: 0, noise: 0 },
    2: { name: '初級', depth: 1, time: 500, noise: 120 },
    3: { name: '中級', depth: 2, time: 1500, noise: 25 },
    4: { name: '上級', depth: 3, time: 3000, noise: 0 },
    5: { name: '最強', depth: 4, time: 6000, noise: 0 }
  };

  var deadline = 0, nodes = 0;
  function TimeUp() {}

  function orderMoves(list) {
    var V = { P: 1, L: 3, N: 4, S: 5, G: 6, B: 8, R: 10, K: 0 };
    list.forEach(function (m) {
      m._o = (m.captured ? 10 + V[m.captured.t] * 2 - V[m.t] / 10 : 0) + (m.promote ? 3 : 0);
    });
    list.sort(function (a, b) { return b._o - a._o; });
    return list;
  }

  function sign(s) { return s.turn === E.BLACK ? 1 : -1; }

  function qsearch(s, alpha, beta, qd) {
    var stand = sign(s) * E.evaluate(s);
    if (qd <= 0) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    var list = E.allMoves(s, true).filter(function (m) { return m.captured; });
    orderMoves(list);
    for (var i = 0; i < list.length; i++) {
      var v = -qsearch(E.applyMove(s, list[i]), -beta, -alpha, qd - 1);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  function search(s, depth, alpha, beta, ply) {
    if ((++nodes & 255) === 0 && Date.now() > deadline) throw new TimeUp();
    if (depth <= 0) return qsearch(s, alpha, beta, 2);
    var list = E.allMoves(s, true);
    if (!list.length) return -30000 + ply;
    orderMoves(list);
    var best = -Infinity;
    for (var i = 0; i < list.length; i++) {
      var v = -search(E.applyMove(s, list[i]), depth - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  function strip(m) {
    if (m.drop) return { drop: true, t: m.t, to: m.to };
    return { from: m.from, to: m.to, promote: m.promote };
  }

  // 戻り値: {drop,t,to} | {from,to,promote} | null (指し手なし)
  function chooseMove(state, level) {
    var cfg = LEVELS[level] || LEVELS[3];
    var moves = E.allMoves(state, false);
    if (!moves.length) return null;

    if (cfg.depth === 0) {
      var caps = moves.filter(function (m) { return m.captured; });
      if (caps.length && Math.random() < 0.3) moves = caps;
      return strip(moves[Math.floor(Math.random() * moves.length)]);
    }

    orderMoves(moves);
    var bestMove = moves[0];
    var sg = sign(state);
    nodes = 0;
    deadline = Date.now() + cfg.time;

    for (var d = 1; d <= cfg.depth; d++) {
      var iterBest = null, iterScore = -Infinity, alpha = -Infinity, beta = Infinity;
      try {
        for (var i = 0; i < moves.length; i++) {
          var ns = E.applyMove(state, moves[i]);
          var v = -search(ns, d - 1, -beta, -alpha, 1);
          v += (cfg.noise ? (Math.random() - 0.5) * 2 * cfg.noise : 0);
          if (v > iterScore) { iterScore = v; iterBest = moves[i]; }
          if (v > alpha) alpha = v;
        }
        bestMove = iterBest;
        // 次反復の探索順を良くする
        moves = moves.filter(function (m) { return m !== iterBest; });
        moves.unshift(iterBest);
        if (iterScore > 20000) break; // 詰みを発見
      } catch (e) {
        if (e instanceof TimeUp) break;
        throw e;
      }
    }
    void sg;
    return strip(bestMove);
  }

  // 推奨手（ヒント）を取得（深さ2で素早く高精度に計算）
  function getHint(state) {
    var moves = E.allMoves(state, false);
    if (!moves.length) return null;
    orderMoves(moves);
    var bestMove = moves[0];
    var bestScore = -Infinity;
    nodes = 0;
    deadline = Date.now() + 1000;
    var depth = 2;
    try {
      for (var i = 0; i < moves.length; i++) {
        var ns = E.applyMove(state, moves[i]);
        var v = -search(ns, depth - 1, -Infinity, Infinity, 1);
        if (v > bestScore) {
          bestScore = v;
          bestMove = moves[i];
        }
      }
    } catch (e) {
      if (!(e instanceof TimeUp)) throw e;
    }
    return {
      move: strip(bestMove),
      fullMove: bestMove,
      score: bestScore
    };
  }

  // 悪手（最善手より評価値が大きく落ちる手）かどうかを判定
  function checkBlunder(beforeState, playedMove) {
    var hint = getHint(beforeState);
    if (!hint || !hint.move) return { isBlunder: false, loss: 0 };

    var afterState = E.applyMove(beforeState, playedMove);
    nodes = 0;
    deadline = Date.now() + 600;
    var playedScore = -Infinity;
    try {
      playedScore = -search(afterState, 1, -Infinity, Infinity, 1);
    } catch (e) {
      playedScore = sign(beforeState) * E.evaluate(afterState);
    }

    var loss = hint.score - playedScore;
    var isSame = false;
    if (playedMove.drop && hint.move.drop) {
      isSame = (playedMove.t === hint.move.t && playedMove.to.x === hint.move.to.x && playedMove.to.y === hint.move.to.y);
    } else if (!playedMove.drop && !hint.move.drop) {
      isSame = (playedMove.from.x === hint.move.from.x && playedMove.from.y === hint.move.from.y &&
                playedMove.to.x === hint.move.to.x && playedMove.to.y === hint.move.to.y);
    }

    var isBlunder = !isSame && (loss >= 280);
    return {
      isBlunder: isBlunder,
      loss: loss,
      bestMove: hint.move
    };
  }

  global.ShogiAI = { LEVELS: LEVELS, chooseMove: chooseMove, getHint: getHint, checkBlunder: checkBlunder };
})(window);
