/*
 * board-ui.js - 盤面・駒台・ハイライトの描画（DOM生成と更新）
 * 駒は CSS（五角形 + 漢字）で描画。将来は assets/pieces の画像に差し替え可能
 * （pieceHTML() だけ変更すればよい）。
 * 公開API: window.BoardUI
 */
(function (global) {
  'use strict';
  var E = global.ShogiEngine;

  var els = {}, handlers = {};
  var cellEls = [];            // 表示順 [r][k]
  var built = false;

  function pieceHTML(pc, opp) {
    var ch = pc.p ? E.KANJI_PROM[pc.t] : (pc.t === 'K' && pc.c === E.WHITE ? '玉' : E.KANJI[pc.t]);
    var cls = 'piece' + (pc.p ? ' promoted' : '') + (opp ? ' opp' : '');
    return '<div class="' + cls + '"><span>' + ch + '</span></div>';
  }

  function init(refs, h) {
    els = refs;
    handlers = h;
    build();
  }

  function build() {
    var r, k, row, cell, i;
    els.board.innerHTML = '';
    cellEls = [];
    for (r = 0; r < 9; r++) {
      row = [];
      for (k = 0; k < 9; k++) {
        cell = document.createElement('div');
        cell.className = 'cell';
        cell.setAttribute('role', 'button');
        els.board.appendChild(cell);
        row.push(cell);
      }
      cellEls.push(row);
    }
    els.fileLabels.innerHTML = '';
    for (i = 0; i < 9; i++) els.fileLabels.appendChild(document.createElement('span'));
    els.rankLabels.innerHTML = '';
    for (i = 0; i < 9; i++) els.rankLabels.appendChild(document.createElement('span'));

    els.board.addEventListener('click', function (ev) {
      var t = ev.target;
      while (t && t !== els.board && !t.hasAttribute('data-x')) t = t.parentNode;
      if (!t || t === els.board) return;
      handlers.onCell(parseInt(t.getAttribute('data-x'), 10), parseInt(t.getAttribute('data-y'), 10));
    });
    [els.handTop, els.handBottom].forEach(function (hEl) {
      hEl.addEventListener('click', function (ev) {
        var t = ev.target;
        while (t && t !== hEl && !t.hasAttribute('data-t')) t = t.parentNode;
        if (!t || t === hEl) return;
        handlers.onHand(parseInt(t.getAttribute('data-c'), 10), t.getAttribute('data-t'));
      });
    });
    built = true;
  }

  /*
   * vm: {
   *   state, flipped, selected:{kind:'board',x,y}|{kind:'hand',c,t}|null,
   *   targets:[{x,y,promo}], lastMove, guide, checkColor (0|1|null),
   *   handEnabled:[bool,bool]   // 各陣営の持ち駒を選択可能か
   * }
   */
  function render(vm) {
    if (!built) return;
    var s = vm.state, r, k, x, y, pc, cell, cls, i;
    var tmap = {};
    (vm.targets || []).forEach(function (t) { tmap[t.x + ',' + t.y] = t; });
    var bottomColor = vm.flipped ? E.WHITE : E.BLACK;
    var topColor = 1 - bottomColor;
    var ck = (vm.checkColor === 0 || vm.checkColor === 1) ? s.kings[vm.checkColor] : null;

    for (r = 0; r < 9; r++) {
      for (k = 0; k < 9; k++) {
        x = vm.flipped ? 8 - k : k;
        y = vm.flipped ? 8 - r : r;
        pc = s.board[y][x];
        cell = cellEls[r][k];
        cls = 'cell';
        if (vm.selected && vm.selected.kind === 'board' && vm.selected.x === x && vm.selected.y === y) cls += ' selected';
        if (vm.lastMove && vm.lastMove.to.x === x && vm.lastMove.to.y === y) cls += ' last-to';
        if (vm.lastMove && vm.lastMove.from && vm.lastMove.from.x === x && vm.lastMove.from.y === y) cls += ' last-from';
        if (ck && ck.x === x && ck.y === y) cls += ' in-check';
        if (vm.guide && tmap[x + ',' + y]) cls += pc ? ' target-capture' : ' target';
        if (vm.hint) {
          if (!vm.hint.drop && vm.hint.from && vm.hint.from.x === x && vm.hint.from.y === y) cls += ' hint-from';
          if (vm.hint.to && vm.hint.to.x === x && vm.hint.to.y === y) cls += ' hint-to';
        }
        cell.className = cls;
        cell.setAttribute('data-x', x);
        cell.setAttribute('data-y', y);
        cell.innerHTML = pc ? pieceHTML(pc, pc.c !== bottomColor) : '';
      }
    }

    // 座標ラベル（筋: 9..1 / 段: 一..九。反転時は逆順）
    for (i = 0; i < 9; i++) {
      els.fileLabels.children[i].textContent = E.ZEN_NUM[vm.flipped ? i + 1 : 9 - i];
      els.rankLabels.children[i].textContent = E.KAN_NUM[vm.flipped ? 9 - i : i + 1];
    }

    renderHand(els.handTop, s, topColor, vm, bottomColor);
    renderHand(els.handBottom, s, bottomColor, vm, bottomColor);
  }

  function renderHand(el, s, c, vm, bottomColor) {
    var html = '';
    E.HAND_ORDER.forEach(function (t) {
      var n = s.hands[c][t];
      var cls = 'hand-slot';
      if (!n) cls += ' empty';
      if (vm.handEnabled && vm.handEnabled[c] && n) cls += ' enabled';
      if (vm.selected && vm.selected.kind === 'hand' && vm.selected.c === c && vm.selected.t === t) cls += ' selected';
      if (vm.hint && vm.hint.drop && vm.hint.c === c && vm.hint.t === t) cls += ' hint-from';
      var inner = '';
      if (n > 0) {
        inner = pieceHTML({ t: t, c: c, p: false }, c !== bottomColor) +
          '<span class="count">' + (n > 1 ? '×' + n : '') + '</span>';
      }
      html += '<div class="' + cls + '" data-c="' + c + '" data-t="' + t + '">' + inner + '</div>';
    });
    el.innerHTML = html;
  }

  function getCellEl(x, y) {
    if (!els.board) return null;
    return els.board.querySelector('.cell[data-x="' + x + '"][data-y="' + y + '"]');
  }

  function getHandSlotEl(c, t) {
    return document.querySelector('.hand-slot[data-c="' + c + '"][data-t="' + t + '"]');
  }

  global.BoardUI = { init: init, render: render, pieceHTML: pieceHTML, getCellEl: getCellEl, getHandSlotEl: getHandSlotEl };
})(window);
