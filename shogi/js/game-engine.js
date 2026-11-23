/*
 * game-engine.js - 将棋ルールエンジン（外部ライブラリ不要・ビルド不要）
 *
 * HANDOVER.md では shogi.js のラッパーを想定していたが、外部ライブラリを
 * 取得しない方針のため、同等機能（合法手・二歩・打ち歩詰め・成り判定・詰み判定）
 * を自前実装している。公開API: window.ShogiEngine
 *
 * 座標系: board[y][x]
 *   x = 0..8  (x=0 が 9筋 = 画面左端 / 先手視点)
 *   y = 0..8  (y=0 が 一段目 = 画面上端 / 後手陣)
 *   筋 = 9 - x , 段 = y + 1
 * 駒: { t:'P'|'L'|'N'|'S'|'G'|'B'|'R'|'K', c:0|1, p:boolean }
 *   c=0 先手(下側・上へ進む) / c=1 後手(上側・下へ進む)
 */
(function (global) {
  'use strict';

  var BLACK = 0, WHITE = 1;
  var HAND_ORDER = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
  var KANJI = { P: '歩', L: '香', N: '桂', S: '銀', G: '金', B: '角', R: '飛', K: '王' };
  var KANJI_PROM = { P: 'と', L: '杏', N: '圭', S: '全', B: '馬', R: '龍' };
  var FULLNAME = { P: '歩', L: '香', N: '桂', S: '銀', G: '金', B: '角', R: '飛', K: '玉' };
  var PROMOTABLE = { P: 1, L: 1, N: 1, S: 1, B: 1, R: 1 };
  var ZEN_NUM = ['０', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
  var KAN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  var DIRS8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  var DIAG = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  var ORTH = [[0, -1], [-1, 0], [1, 0], [0, 1]];

  /* ---------- 駒の動きテーブル ---------- */
  function makeVec(t, p, c) {
    var f = c === BLACK ? -1 : 1;
    var gold = [[-1, f], [0, f], [1, f], [-1, 0], [1, 0], [0, -f]];
    if (p && (t === 'P' || t === 'L' || t === 'N' || t === 'S')) return { steps: gold, slides: [] };
    switch (t) {
      case 'K': return { steps: DIRS8, slides: [] };
      case 'G': return { steps: gold, slides: [] };
      case 'P': return { steps: [[0, f]], slides: [] };
      case 'L': return { steps: [], slides: [[0, f]] };
      case 'N': return { steps: [[-1, 2 * f], [1, 2 * f]], slides: [] };
      case 'S': return { steps: [[-1, f], [0, f], [1, f], [-1, -f], [1, -f]], slides: [] };
      case 'B': return { steps: p ? ORTH : [], slides: DIAG };
      case 'R': return { steps: p ? DIAG : [], slides: ORTH };
    }
    return { steps: [], slides: [] };
  }
  var VEC = [{}, {}];
  (function () {
    var types = ['P', 'L', 'N', 'S', 'G', 'B', 'R', 'K'];
    for (var c = 0; c < 2; c++) {
      for (var i = 0; i < types.length; i++) {
        VEC[c][types[i]] = makeVec(types[i], false, c);
        VEC[c]['+' + types[i]] = makeVec(types[i], true, c);
      }
    }
  })();
  function vecOf(pc) { return VEC[pc.c][(pc.p ? '+' : '') + pc.t]; }

  /* ---------- 状態操作 ---------- */
  function emptyHand() { return { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 }; }

  function newGame() {
    var b = [], y, x;
    for (y = 0; y < 9; y++) { b.push([null, null, null, null, null, null, null, null, null]); }
    var back = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L'];
    for (x = 0; x < 9; x++) {
      b[0][x] = { t: back[x], c: WHITE, p: false };
      b[8][x] = { t: back[x], c: BLACK, p: false };
      b[2][x] = { t: 'P', c: WHITE, p: false };
      b[6][x] = { t: 'P', c: BLACK, p: false };
    }
    b[1][1] = { t: 'R', c: WHITE, p: false };
    b[1][7] = { t: 'B', c: WHITE, p: false };
    b[7][1] = { t: 'B', c: BLACK, p: false };
    b[7][7] = { t: 'R', c: BLACK, p: false };
    return {
      board: b,
      hands: [emptyHand(), emptyHand()],
      turn: BLACK,
      kings: [{ x: 4, y: 8 }, { x: 4, y: 0 }],
      moveNo: 0
    };
  }

  function clone(s) {
    var b = new Array(9);
    for (var y = 0; y < 9; y++) b[y] = s.board[y].slice();
    return {
      board: b,
      hands: [Object.assign({}, s.hands[0]), Object.assign({}, s.hands[1])],
      turn: s.turn,
      kings: [s.kings[0], s.kings[1]],
      moveNo: s.moveNo
    };
  }

  function inb(x, y) { return x >= 0 && x < 9 && y >= 0 && y < 9; }

  /* ---------- 利き判定 ---------- */
  // (x,y) のマスが byColor の駒に攻撃されているか
  function isAttacked(board, x, y, by) {
    var i, d, nx, ny, q, v, k, dist;
    for (i = 0; i < 8; i++) {
      d = DIRS8[i];
      nx = x + d[0]; ny = y + d[1]; dist = 1;
      while (inb(nx, ny)) {
        q = board[ny][nx];
        if (q) {
          if (q.c === by) {
            v = vecOf(q);
            // q から (x,y) へのベクトルは (-d)
            if (dist === 1) {
              for (k = 0; k < v.steps.length; k++) {
                if (v.steps[k][0] === -d[0] && v.steps[k][1] === -d[1]) return true;
              }
            }
            for (k = 0; k < v.slides.length; k++) {
              if (v.slides[k][0] === -d[0] && v.slides[k][1] === -d[1]) return true;
            }
          }
          break;
        }
        nx += d[0]; ny += d[1]; dist++;
      }
    }
    // 桂馬
    var f = by === BLACK ? -1 : 1;
    for (i = -1; i <= 1; i += 2) {
      nx = x - i; ny = y - 2 * f;
      if (inb(nx, ny)) {
        q = board[ny][nx];
        if (q && q.c === by && q.t === 'N' && !q.p) return true;
      }
    }
    return false;
  }

  function inCheck(s, c) {
    var k = s.kings[c];
    return isAttacked(s.board, k.x, k.y, 1 - c);
  }

  /* ---------- 移動先生成 ---------- */
  // 自玉の安全を考慮しない移動先（[x,y]配列）
  function pseudoDests(s, x, y) {
    var pc = s.board[y][x], out = [];
    if (!pc) return out;
    var v = vecOf(pc), i, nx, ny, q;
    for (i = 0; i < v.steps.length; i++) {
      nx = x + v.steps[i][0]; ny = y + v.steps[i][1];
      if (!inb(nx, ny)) continue;
      q = s.board[ny][nx];
      if (!q || q.c !== pc.c) out.push([nx, ny]);
    }
    for (i = 0; i < v.slides.length; i++) {
      nx = x + v.slides[i][0]; ny = y + v.slides[i][1];
      while (inb(nx, ny)) {
        q = s.board[ny][nx];
        if (!q) { out.push([nx, ny]); }
        else { if (q.c !== pc.c) out.push([nx, ny]); break; }
        nx += v.slides[i][0]; ny += v.slides[i][1];
      }
    }
    return out;
  }

  function inZone(c, y) { return c === BLACK ? y <= 2 : y >= 6; }
  function mustPromote(t, c, y) {
    if (t === 'P' || t === 'L') return c === BLACK ? y === 0 : y === 8;
    if (t === 'N') return c === BLACK ? y <= 1 : y >= 7;
    return false;
  }
  // 0: 成れない 1: 任意 2: 強制
  function promoState(pc, fy, ty) {
    if (pc.p || !PROMOTABLE[pc.t]) return 0;
    if (mustPromote(pc.t, pc.c, ty)) return 2;
    if (inZone(pc.c, fy) || inZone(pc.c, ty)) return 1;
    return 0;
  }

  // 自玉が取られない着手か（盤上の駒の移動）
  function moveKeepsKingSafe(s, fx, fy, tx, ty) {
    var b = s.board, pc = b[fy][fx], cap = b[ty][tx];
    b[ty][tx] = pc; b[fy][fx] = null;
    var k = pc.t === 'K' ? { x: tx, y: ty } : s.kings[pc.c];
    var ok = !isAttacked(b, k.x, k.y, 1 - pc.c);
    b[fy][fx] = pc; b[ty][tx] = cap;
    return ok;
  }

  // 合法な移動先 [{x,y,promo}]
  function movesFrom(s, x, y) {
    var pc = s.board[y][x], res = [];
    if (!pc) return res;
    var d = pseudoDests(s, x, y);
    for (var i = 0; i < d.length; i++) {
      if (moveKeepsKingSafe(s, x, y, d[i][0], d[i][1])) {
        res.push({ x: d[i][0], y: d[i][1], promo: promoState(pc, y, d[i][1]) });
      }
    }
    return res;
  }

  /* ---------- 打ち込み ---------- */
  function hasLegalMove(s, c, skipUchi) {
    var x, y, pc, d, i, t;
    for (y = 0; y < 9; y++) {
      for (x = 0; x < 9; x++) {
        pc = s.board[y][x];
        if (pc && pc.c === c) {
          d = pseudoDests(s, x, y);
          for (i = 0; i < d.length; i++) {
            if (moveKeepsKingSafe(s, x, y, d[i][0], d[i][1])) return true;
          }
        }
      }
    }
    for (i = 0; i < HAND_ORDER.length; i++) {
      t = HAND_ORDER[i];
      if (s.hands[c][t] > 0) {
        for (y = 0; y < 9; y++) {
          for (x = 0; x < 9; x++) {
            if (!s.board[y][x] && dropReason(s, c, t, x, y, skipUchi) === null) return true;
          }
        }
      }
    }
    return false;
  }

  // 打てない理由（打てるなら null）
  function dropReason(s, c, t, x, y, skipUchi) {
    var b = s.board, i;
    if (b[y][x]) return 'そこには既に駒があります。';
    if (mustPromote(t, c, y)) return '行き場のない駒は打てません。';
    if (t === 'P') {
      for (i = 0; i < 9; i++) {
        var q = b[i][x];
        if (q && q.c === c && q.t === 'P' && !q.p) return '二歩です。同じ筋に歩が2枚になる打ち方は反則です。';
      }
    }
    b[y][x] = { t: t, c: c, p: false };
    var k = s.kings[c];
    var safe = !isAttacked(b, k.x, k.y, 1 - c);
    b[y][x] = null;
    if (!safe) return '王手を放置したままになるため、そこには打てません。';
    if (t === 'P' && !skipUchi) {
      var f = c === BLACK ? -1 : 1, ek = s.kings[1 - c];
      if (ek.x === x && ek.y === y + f) {
        var ns = clone(s);
        ns.board[y][x] = { t: 'P', c: c, p: false };
        ns.hands[c].P--;
        ns.turn = 1 - c;
        if (!hasLegalMove(ns, 1 - c, true)) return '打ち歩詰めです。歩を打って詰ますのは反則です。';
      }
    }
    return null;
  }

  function dropTargets(s, t, c) {
    var res = [], x, y;
    c = (c === undefined) ? s.turn : c;
    if (!s.hands[c][t]) return res;
    for (y = 0; y < 9; y++) {
      for (x = 0; x < 9; x++) {
        if (!s.board[y][x] && dropReason(s, c, t, x, y, false) === null) res.push({ x: x, y: y });
      }
    }
    return res;
  }

  /* ---------- 着手の適用 ---------- */
  // mv: {drop:true,t,to:{x,y}} | {from:{x,y},to:{x,y},promote:boolean}
  // 戻り値: 新しい状態 (入力は変更しない)
  function applyMove(s, mv) {
    var ns = clone(s), c = s.turn;
    if (mv.drop) {
      ns.board[mv.to.y][mv.to.x] = { t: mv.t, c: c, p: false };
      ns.hands[c][mv.t]--;
    } else {
      var pc = ns.board[mv.from.y][mv.from.x];
      var cap = ns.board[mv.to.y][mv.to.x];
      if (cap) ns.hands[c][cap.t]++;
      ns.board[mv.from.y][mv.from.x] = null;
      ns.board[mv.to.y][mv.to.x] = mv.promote ? { t: pc.t, c: pc.c, p: true } : pc;
      if (pc.t === 'K') ns.kings[c] = { x: mv.to.x, y: mv.to.y };
    }
    ns.turn = 1 - c;
    ns.moveNo = s.moveNo + 1;
    return ns;
  }

  /* ---------- 棋譜表記 ---------- */
  function squareText(x, y) { return ZEN_NUM[9 - x] + KAN_NUM[y + 1]; }
  function pieceName(pc) { return pc.p ? KANJI_PROM[pc.t] : (pc.t === 'K' ? '玉' : KANJI[pc.t]); }

  function moveText(before, mv, prevMv) {
    var c = before.turn, mark = c === BLACK ? '▲' : '△', txt;
    var same = prevMv && prevMv.to.x === mv.to.x && prevMv.to.y === mv.to.y;
    var sq = same ? '同　' : squareText(mv.to.x, mv.to.y);
    if (mv.drop) return mark + sq + FULLNAME[mv.t] + '打';
    var pc = before.board[mv.from.y][mv.from.x];
    txt = mark + sq + pieceName(pc);
    if (mv.promote) txt += '成';
    else if (promoState(pc, mv.from.y, mv.to.y) === 1) txt += '不成';
    return txt;
  }

  /* ---------- 着手の検証つき実行 ---------- */
  // 戻り値: {state, move, text} | null
  function play(s, mv, prevMv) {
    var m;
    if (mv.drop) {
      if (!s.hands[s.turn][mv.t]) return null;
      if (dropReason(s, s.turn, mv.t, mv.to.x, mv.to.y, false) !== null) return null;
      m = { drop: true, t: mv.t, to: { x: mv.to.x, y: mv.to.y }, promote: false, captured: null };
    } else {
      var pc = s.board[mv.from.y][mv.from.x];
      if (!pc || pc.c !== s.turn) return null;
      var list = movesFrom(s, mv.from.x, mv.from.y), found = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].x === mv.to.x && list[i].y === mv.to.y) found = list[i];
      }
      if (!found) return null;
      var promote = !!mv.promote;
      if (found.promo === 0) promote = false;
      if (found.promo === 2) promote = true;
      var cap = s.board[mv.to.y][mv.to.x];
      m = {
        drop: false, t: pc.t, from: { x: mv.from.x, y: mv.from.y }, to: { x: mv.to.x, y: mv.to.y },
        promote: promote, captured: cap ? cap.t : null
      };
    }
    return { state: applyMove(s, m), move: m, text: moveText(s, m, prevMv) };
  }

  /* ---------- 全合法手（AI用） ---------- */
  function allMoves(s, skipUchi) {
    var res = [], x, y, pc, list, i, t, c = s.turn;
    for (y = 0; y < 9; y++) {
      for (x = 0; x < 9; x++) {
        pc = s.board[y][x];
        if (!pc || pc.c !== c) continue;
        list = movesFrom(s, x, y);
        for (i = 0; i < list.length; i++) {
          var base = { drop: false, t: pc.t, from: { x: x, y: y }, to: { x: list[i].x, y: list[i].y }, captured: s.board[list[i].y][list[i].x] };
          if (list[i].promo >= 1) res.push(Object.assign({ promote: true }, base));
          if (list[i].promo !== 2) res.push(Object.assign({ promote: false }, base));
        }
      }
    }
    for (i = 0; i < HAND_ORDER.length; i++) {
      t = HAND_ORDER[i];
      if (!s.hands[c][t]) continue;
      for (y = 0; y < 9; y++) {
        for (x = 0; x < 9; x++) {
          if (!s.board[y][x] && dropReason(s, c, t, x, y, !!skipUchi) === null) {
            res.push({ drop: true, t: t, to: { x: x, y: y }, promote: false, captured: null });
          }
        }
      }
    }
    return res;
  }

  /* ---------- 局面状態・評価 ---------- */
  // 'ongoing' | 'check' | 'checkmate' | 'stalemate' (手番側から見た状態)
  function status(s) {
    var chk = inCheck(s, s.turn);
    if (!hasLegalMove(s, s.turn, false)) return chk ? 'checkmate' : 'stalemate';
    return chk ? 'check' : 'ongoing';
  }

  function positionKey(s) {
    var str = '', x, y, pc;
    for (y = 0; y < 9; y++) for (x = 0; x < 9; x++) {
      pc = s.board[y][x];
      str += pc ? (pc.c ? pc.t.toLowerCase() : pc.t) + (pc.p ? '+' : '') : '.';
    }
    for (var c = 0; c < 2; c++) for (var i = 0; i < 7; i++) str += '|' + s.hands[c][HAND_ORDER[i]];
    return str + s.turn;
  }

  var VAL = { P: 100, L: 300, N: 400, S: 500, G: 600, B: 850, R: 1000, K: 0 };
  var VALP = { P: 700, L: 600, N: 600, S: 600, B: 1100, R: 1300, K: 0 };
  // 先手から見た評価値（歩=100）。位置評価は簡易（前進ボーナス）
  function evaluate(s) {
    var sc = 0, x, y, pc, v, adv, i;
    for (y = 0; y < 9; y++) for (x = 0; x < 9; x++) {
      pc = s.board[y][x];
      if (!pc) continue;
      v = pc.p ? VALP[pc.t] : VAL[pc.t];
      if (!pc.p && pc.t !== 'K' && pc.t !== 'G') {
        adv = pc.c === BLACK ? (8 - y) : y;
        v += adv * 3;
      }
      sc += pc.c === BLACK ? v : -v;
    }
    for (i = 0; i < 7; i++) {
      var t = HAND_ORDER[i];
      sc += (s.hands[0][t] - s.hands[1][t]) * (VAL[t] * 1.1);
    }
    return sc;
  }

  global.ShogiEngine = {
    BLACK: BLACK, WHITE: WHITE, HAND_ORDER: HAND_ORDER,
    KANJI: KANJI, KANJI_PROM: KANJI_PROM, ZEN_NUM: ZEN_NUM, KAN_NUM: KAN_NUM,
    newGame: newGame, clone: clone, inCheck: inCheck,
    pseudoDests: pseudoDests, movesFrom: movesFrom, dropTargets: dropTargets,
    dropReason: dropReason, applyMove: applyMove, play: play, allMoves: allMoves,
    hasLegalMove: hasLegalMove, status: status, positionKey: positionKey,
    evaluate: evaluate, moveText: moveText, promoState: promoState
  };
})(window);
