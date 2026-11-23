/*
 * main.js - 画面遷移・メニュー設定・対局進行・操作ガード
 * 依存: game-engine.js / ai-worker.js / board-ui.js （この順に読み込む）
 */
(function () {
  'use strict';
  var E = window.ShogiEngine, AI = window.ShogiAI, UI = window.BoardUI;
  var APP_VERSION = '0.8.0';
  var STORAGE_KEY = 'shogi-dojo-config-v1';

  function $(id) { return document.getElementById(id); }

  /* =====================================================
   * 1. 誤操作ガード（ドラッグ / スクロール / ピンチ / ダブルタップ拡大）
   * ===================================================== */
  function installGuards() {
    var opt = { passive: false };
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (n) {
      document.addEventListener(n, function (e) { e.preventDefault(); }, opt);
    });
    document.addEventListener('touchstart', function (e) {
      if (e.touches.length > 1) e.preventDefault();
    }, opt);
    document.addEventListener('touchmove', function (e) {
      if (e.touches.length > 1) { e.preventDefault(); return; }
      var t = e.target;
      if (t && t.closest && t.closest('.scrollable')) return; // 内部スクロール領域のみ許可
      e.preventDefault();
    }, opt);
    ['dragstart', 'selectstart', 'contextmenu'].forEach(function (n) {
      document.addEventListener(n, function (e) { e.preventDefault(); });
    });
    // トラックパッドのピンチ（Ctrl+ホイール）による意図しない拡大を防止
    window.addEventListener('wheel', function (e) { if (e.ctrlKey) e.preventDefault(); }, opt);
    document.addEventListener('scroll', function () { window.scrollTo(0, 0); });
  }

  /* =====================================================
   * 2. レイアウト（盤サイズ計算）
   * ===================================================== */
  function layout() {
    var W = window.innerWidth, H = window.innerHeight, c, app = $('app');
    var land = W > H;
    if (land) {
      c = Math.min((H - 100) / 9, 96);
      var needed = function (v) { return 9 * v + 28 + 2 * Math.max(150, 1.6 * v + 44) + 52; };
      while (needed(c) > W && c > 20) c -= 1;
    } else {
      c = Math.min((W - 48) / 9, (H - 230) / 10.6, 96);
    }
    c = Math.max(20, Math.floor(c));
    app.className = land ? 'landscape' : 'portrait';
    app.style.setProperty('--cell', c + 'px');
    app.style.height = H + 'px';
    app.style.width = W + 'px';
    window.scrollTo(0, 0);
  }

  /* =====================================================
   * 3. メニュー設定
   * ===================================================== */
  var DEFAULT_CONFIG = { mode: 'ai', level: 2, side: 'sente', guide: true, hint: true, blunder: true, warn: true, undo: true, anim: true, drag: true, sound: true, eval: false };

  function radioValue(name) {
    var r = document.querySelector('input[name="' + name + '"]:checked');
    return r ? r.value : null;
  }
  function setRadio(name, value) {
    var list = document.querySelectorAll('input[name="' + name + '"]');
    for (var i = 0; i < list.length; i++) list[i].checked = (list[i].value === String(value));
  }
  function readConfig() {
    return {
      mode: radioValue('mode'),
      level: parseInt(radioValue('level'), 10),
      side: radioValue('side'),
      guide: $('opt-guide').checked,
      hint: $('opt-hint') ? $('opt-hint').checked : true,
      blunder: $('opt-blunder') ? $('opt-blunder').checked : true,
      warn: $('opt-warn').checked,
      undo: $('opt-undo').checked,
      anim: $('opt-anim') ? $('opt-anim').checked : true,
      drag: $('opt-drag') ? $('opt-drag').checked : true,
      sound: $('opt-sound') ? $('opt-sound').checked : true,
      eval: $('opt-eval').checked
    };
  }
  function writeConfig(cfg) {
    setRadio('mode', cfg.mode); setRadio('level', cfg.level); setRadio('side', cfg.side);
    $('opt-guide').checked = !!cfg.guide;
    if ($('opt-hint')) $('opt-hint').checked = cfg.hint !== false;
    if ($('opt-blunder')) $('opt-blunder').checked = cfg.blunder !== false;
    $('opt-warn').checked = !!cfg.warn;
    $('opt-undo').checked = !!cfg.undo;
    if ($('opt-anim')) $('opt-anim').checked = cfg.anim !== false;
    if ($('opt-drag')) $('opt-drag').checked = cfg.drag !== false;
    if ($('opt-sound')) $('opt-sound').checked = cfg.sound !== false;
    $('opt-eval').checked = !!cfg.eval;
    syncMenuState();
  }
  function loadConfig() {
    try {
      var s = window.localStorage.getItem(STORAGE_KEY);
      if (s) return Object.assign({}, DEFAULT_CONFIG, JSON.parse(s));
    } catch (e) { /* 保存不可の環境では既定値 */ }
    return DEFAULT_CONFIG;
  }
  function saveConfig(cfg) {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
  }
  function syncMenuState() {
    var pvp = radioValue('mode') === 'pvp';
    $('grp-level-wrap').disabled = pvp;
    $('grp-side-wrap').disabled = pvp;
    $('grp-level-wrap').classList.toggle('disabled', pvp);
    $('grp-side-wrap').classList.toggle('disabled', pvp);
  }

  /* =====================================================
   * 4. 対局状態
   * ===================================================== */
  var app = null;       // 対局中の状態（メニュー表示中は null）
  var msgTimer = null;
  var genCounter = 0;

  function cur() { return app.states[app.idx]; }
  function lastMoveOf(idx) { return idx > 0 ? app.moves[idx - 1] : null; }
  function atLatest() { return app.idx === app.states.length - 1; }

  function showScreen(name) {
    $('menu-screen').classList.toggle('active', name === 'menu');
    $('game-screen').classList.toggle('active', name === 'game');
  }

  function startGame() {
    var cfg = readConfig();
    saveConfig(cfg);
    if (window.ShogiSound) {
      window.ShogiSound.setEnabled(cfg.sound !== false);
    }
    syncSoundBtn();
    var human = null;
    if (cfg.mode === 'ai') {
      if (cfg.side === 'sente') human = E.BLACK;
      else if (cfg.side === 'gote') human = E.WHITE;
      else human = Math.random() < 0.5 ? E.BLACK : E.WHITE;
    }
    var gen = ++genCounter; // 以前の対局のAIタイマーを確実に無効化するため通算カウンタを使う
    app = {
      cfg: cfg, gen: gen,
      states: [E.newGame()], moves: [], texts: [], idx: 0,
      over: false, resultText: '', thinking: false, animating: false,
      human: human, ai: human === null ? null : 1 - human,
      flipped: human === E.WHITE,
      sel: null, targets: [], hint: null, aiTimer: null, msg: null, kifuCount: -1
    };
    hideModal();
    showScreen('game');
    layout();
    if (cfg.mode === 'ai' && cfg.side === 'random') {
      showMsg('振り駒の結果、あなたは' + (human === E.BLACK ? '先手' : '後手') + 'です。', 'info', 6000);
    }
    render();
    maybeAI();
  }

  /* ---------- 効果音トグル ---------- */
  function syncSoundBtn() {
    var btn = $('btn-sound-toggle');
    if (!btn || !window.ShogiSound) return;
    var enabled = window.ShogiSound.isEnabled();
    btn.textContent = enabled ? '🔊' : '🔇';
    btn.classList.toggle('muted', !enabled);
    btn.title = enabled ? '効果音：ON（タップで消音）' : '効果音：OFF（タップで有効化）';
  }

  function toggleSound() {
    if (!window.ShogiSound) return;
    var next = !window.ShogiSound.isEnabled();
    window.ShogiSound.setEnabled(next);
    if (app && app.cfg) app.cfg.sound = next;
    var opt = $('opt-sound');
    if (opt) opt.checked = next;
    var cfg = readConfig();
    saveConfig(cfg);
    syncSoundBtn();
  }

  function backToMenu() {
    if (app) app.gen++;
    app = null;
    hideModal();
    showScreen('menu');
  }

  /* ---------- メッセージ ---------- */
  function showMsg(text, type, ms) {
    if (!app) return;
    app.msg = { text: text, type: type || 'info' };
    if (msgTimer) clearTimeout(msgTimer);
    msgTimer = setTimeout(function () {
      if (app) { app.msg = null; renderStatus(); }
    }, ms || 4500);
    renderStatus();
  }
  function clearMsg() {
    if (msgTimer) clearTimeout(msgTimer);
    if (app) app.msg = null;
  }

  /* ---------- 操作可否 ---------- */
  function modalOpen() { return !$('modal').hidden; }
  function canInteract() {
    if (!app || app.over || app.thinking || app.animating || !atLatest() || modalOpen()) return false;
    return app.cfg.mode === 'pvp' || cur().turn === app.human;
  }

  /* ---------- 選択 ---------- */
  function clearSel() { app.sel = null; app.targets = []; }

  function selectBoard(x, y) {
    app.sel = { kind: 'board', x: x, y: y };
    app.targets = E.movesFrom(cur(), x, y);
    if (!app.targets.length && app.cfg.warn) {
      showMsg(E.inCheck(cur(), cur().turn) ? '王手を受けています。王手を解消する手を指してください。' : 'その駒は動かせるマスがありません。', 'warn');
    }
  }
  function selectHand(c, t) {
    app.sel = { kind: 'hand', c: c, t: t };
    app.targets = E.dropTargets(cur(), t, c).map(function (p) { return { x: p.x, y: p.y, promo: 0 }; });
    if (!app.targets.length && app.cfg.warn) showMsg('その駒を打てるマスがありません。', 'warn');
  }

  function onCell(x, y) {
    if (dragMoved) {
      setTimeout(function () { dragMoved = false; }, 80);
      return;
    }
    if (!canInteract()) return;
    var s = cur(), pc = s.board[y][x], i, tg = null;
    clearMsg();
    if (app.hint) { app.hint = null; }
    if (app.sel) {
      for (i = 0; i < app.targets.length; i++) {
        if (app.targets[i].x === x && app.targets[i].y === y) tg = app.targets[i];
      }
      if (tg) { executeTarget(tg); return; }
      if (app.sel.kind === 'board' && app.sel.x === x && app.sel.y === y) { clearSel(); render(); return; }
      if (pc && pc.c === s.turn) { selectBoard(x, y); render(); return; }
      explainIllegal(x, y);
      render();
      return;
    }
    if (pc && pc.c === s.turn) selectBoard(x, y);
    else if (pc && app.cfg.warn) showMsg('相手の駒です。自分の駒を選んでください。', 'warn');
    render();
  }

  function onHand(c, t) {
    if (dragMoved) {
      setTimeout(function () { dragMoved = false; }, 80);
      return;
    }
    if (!canInteract() || c !== cur().turn) return;
    if (!cur().hands[c][t]) return;
    clearMsg();
    if (app.hint) { app.hint = null; }
    if (app.sel && app.sel.kind === 'hand' && app.sel.t === t) clearSel();
    else selectHand(c, t);
    render();
  }

  function explainIllegal(x, y) {
    if (!app.cfg.warn) return;
    var s = cur(), sel = app.sel, msg;
    if (sel.kind === 'hand') {
      msg = E.dropReason(s, s.turn, sel.t, x, y, false) || 'そこには打てません。';
    } else {
      var dests = E.pseudoDests(s, sel.x, sel.y), reachable = false;
      for (var i = 0; i < dests.length; i++) if (dests[i][0] === x && dests[i][1] === y) reachable = true;
      if (reachable) {
        msg = E.inCheck(s, s.turn)
          ? '王手を受けています。王手を解消する手を指してください。'
          : 'その手を指すと自玉が取られてしまいます（王手放置）。';
      } else {
        msg = 'その駒はそこへは動けません。';
      }
    }
    showMsg(msg, 'warn');
  }

  function executeTarget(tg) {
    var s = cur(), sel = app.sel;
    if (sel.kind === 'hand') {
      doPlay({ drop: true, t: sel.t, to: { x: tg.x, y: tg.y } });
      return;
    }
    var from = { x: sel.x, y: sel.y }, to = { x: tg.x, y: tg.y };
    if (tg.promo === 1) {
      var pc = s.board[sel.y][sel.x];
      askPromotion(pc, function (promote) { doPlay({ from: from, to: to, promote: promote }); });
    } else {
      doPlay({ from: from, to: to, promote: tg.promo === 2 });
    }
  }

  function doPlay(mv) {
    var r = E.play(cur(), mv, lastMoveOf(app.idx));
    if (!r) { clearSel(); render(); return; }
    animateAndCommit(r);
  }

  /* ---------- 移動アニメーションと着手確定 ---------- */
  function animateAndCommit(r) {
    if (!app || !app.cfg.anim) {
      commit(r);
      return;
    }
    var mv = r.move;
    var s = cur();
    var bottom = app.flipped ? E.WHITE : E.BLACK;
    var piece = mv.drop ? { t: mv.t, c: s.turn, p: false } : s.board[mv.from.y][mv.from.x];
    if (!piece) {
      commit(r);
      return;
    }
    var isOpp = piece.c !== bottom;

    var fromEl = mv.drop ? UI.getHandSlotEl(piece.c, mv.t) : UI.getCellEl(mv.from.x, mv.from.y);
    var toEl = UI.getCellEl(mv.to.x, mv.to.y);

    if (!fromEl || !toEl) {
      commit(r);
      return;
    }

    var r1 = fromEl.getBoundingClientRect();
    var r2 = toEl.getBoundingClientRect();
    if (r1.width === 0 || r2.width === 0) {
      commit(r);
      return;
    }

    app.animating = true;

    var origPieceEl = fromEl.querySelector('.piece');
    if (origPieceEl) origPieceEl.classList.add('anim-hidden');

    var capturedPieceEl = toEl.querySelector('.piece');
    if (capturedPieceEl) capturedPieceEl.classList.add('anim-captured');

    var ghost = document.createElement('div');
    ghost.className = 'anim-ghost';
    ghost.style.left = r1.left + 'px';
    ghost.style.top = r1.top + 'px';
    ghost.style.width = r1.width + 'px';
    ghost.style.height = r1.height + 'px';
    ghost.style.setProperty('--cell', r2.width + 'px');
    ghost.innerHTML = UI.pieceHTML(piece, isOpp);
    document.body.appendChild(ghost);

    var dx = (r2.left + r2.width / 2) - (r1.left + r1.width / 2);
    var dy = (r2.top + r2.height / 2) - (r1.top + r1.height / 2);

    requestAnimationFrame(function () {
      ghost.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
    });

    var finished = false;
    var gen = app.gen;
    function finishAnim() {
      if (finished) return;
      finished = true;
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      if (!app || app.gen !== gen) return;
      app.animating = false;
      commit(r);
    }

    ghost.addEventListener('transitionend', finishAnim);
    setTimeout(finishAnim, 240);
  }

  /* ---------- 着手確定 ---------- */
  function commit(r) {
    var prevState = cur();
    app.states.push(r.state);
    app.moves.push(r.move);
    app.texts.push(r.text);
    app.idx = app.states.length - 1;
    clearSel();
    clearMsg();
    app.hint = null;

    if (window.ShogiSound) {
      window.ShogiSound.playMove(!!(r.move && r.move.captured));
      if (r.move && r.move.promote) {
        setTimeout(function () {
          if (window.ShogiSound) window.ShogiSound.playPromote();
        }, 70);
      }
    }

    var mover = 1 - r.state.turn, st = E.status(r.state);
    var who = mover === E.BLACK ? '先手' : '後手';
    if (st === 'checkmate') {
      finish('詰みです。' + who + 'の勝ちです！', true);
      return;
    }
    if (st === 'stalemate') { finish('指せる手がありません。引き分けです。', false); return; }
    var key = E.positionKey(r.state), n = 0;
    for (var i = 0; i < app.states.length; i++) if (E.positionKey(app.states[i]) === key) n++;
    if (n >= 4) { finish('千日手です。引き分けとします。', false); return; }

    // 悪手警告（コーチ機能）判定
    var isHuman = (app.cfg.mode === 'pvp') || (mover === app.human);
    var isBlunder = false;
    if (isHuman && app.cfg.blunder) {
      try {
        var bl = AI.checkBlunder(prevState, r.move);
        if (bl && bl.isBlunder) isBlunder = true;
      } catch (e) { /* ignore */ }
    }

    if (isBlunder) {
      showBlunderMsg();
    } else if (st === 'check' && app.cfg.warn) {
      if (window.ShogiSound) window.ShogiSound.playCheck();
      showMsg('王手！', 'warn', 3000);
    }

    render();
    maybeAI(isBlunder);
  }

  function showBlunderMsg() {
    if (!app) return;
    app.msg = {
      text: '⚠️ 少し危ない手かもしれません。やり直しますか？',
      type: 'blunder',
      canUndo: true
    };
    if (msgTimer) clearTimeout(msgTimer);
    msgTimer = setTimeout(function () {
      if (app && app.msg && app.msg.type === 'blunder') {
        app.msg = null;
        renderStatus();
      }
    }, 6000);
  }

  function onBlunderUndo(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!app || app.over || app.moves.length < 1) return;
    if (app.aiTimer) {
      clearTimeout(app.aiTimer);
      app.aiTimer = null;
    }
    app.thinking = false;
    app.states.pop();
    app.moves.pop();
    app.texts.pop();
    app.idx = app.states.length - 1;
    clearSel();
    app.hint = null;
    showMsg('手をやり直しました。別の手を考えてみましょう。', 'info', 3000);
    render();
  }

  function onHint() {
    if (!canInteract()) return;
    if (app.hint) {
      app.hint = null;
      render();
      return;
    }
    var s = cur();
    var hintObj = null;
    try {
      hintObj = AI.getHint(s);
    } catch (e) {
      hintObj = null;
    }
    if (!hintObj || !hintObj.move) {
      showMsg('おすすめの手が見つかりませんでした。', 'info', 2500);
      return;
    }
    var mv = hintObj.move;
    if (mv.drop) {
      app.hint = { drop: true, c: s.turn, t: mv.t, to: mv.to };
    } else {
      app.hint = { drop: false, from: mv.from, to: mv.to };
    }
    var txt = E.moveText(s, hintObj.fullMove, lastMoveOf(app.idx));
    showMsg('💡 おすすめの手：' + txt + '（青枠をタップ）', 'info', 6000);
    render();
  }

  function finish(text, win) {
    if (window.ShogiSound) {
      window.ShogiSound.playEnd();
    }
    app.over = true;
    app.resultText = text;
    clearSel();
    render();
    showModal({
      title: '対局終了',
      msg: text,
      buttons: [
        { label: '感想戦へ', cls: 'btn-primary', onClick: function () { hideModal(); render(); } },
        { label: 'メニューへ', cls: 'btn', onClick: backToMenu }
      ]
    });
    void win;
  }

  /* ---------- AI ---------- */
  function maybeAI(isBlunderWaiting) {
    if (!app || app.over || app.cfg.mode !== 'ai' || cur().turn !== app.ai) return;
    var gen = app.gen;
    if (app.aiTimer) clearTimeout(app.aiTimer);

    var waitMs = isBlunderWaiting ? 3800 : 400;

    app.aiTimer = setTimeout(function () {
      app.aiTimer = null;
      if (!app || app.gen !== gen || app.over) return;
      app.thinking = true;
      render();
      setTimeout(function () {
        if (!app || app.gen !== gen) return;
        var s = cur(), mv = null, r = null;
        try { mv = AI.chooseMove(s, app.cfg.level); } catch (e) { mv = null; }
        if (mv) r = E.play(s, mv, lastMoveOf(app.idx));
        if (!r) {
          var all = E.allMoves(s, false);
          if (all.length) r = E.play(s, all[0], lastMoveOf(app.idx));
        }
        app.thinking = false;
        if (r) animateAndCommit(r); else render();
      }, 50);
    }, waitMs);
  }

  /* ---------- 成り選択 ---------- */
  function askPromotion(pc, cb) {
    var base = { t: pc.t, c: pc.c, p: false }, prom = { t: pc.t, c: pc.c, p: true };
    var bottom = app.flipped ? E.WHITE : E.BLACK;
    showModal({
      title: '成りますか？',
      preview: UI.pieceHTML(base, pc.c !== bottom) + '<span class="arrow">→</span>' + UI.pieceHTML(prom, pc.c !== bottom),
      buttons: [
        { label: '成る', cls: 'btn-primary', onClick: function () { hideModal(); cb(true); } },
        { label: '不成', cls: 'btn', onClick: function () { hideModal(); cb(false); } },
        { label: 'やめる', cls: 'btn btn-sub', onClick: function () { hideModal(); render(); } }
      ]
    });
  }

  /* ---------- モーダル ---------- */
  function showModal(o) {
    $('modal-title').textContent = o.title || '';
    $('modal-msg').textContent = o.msg || '';
    $('modal-msg').style.display = o.msg ? '' : 'none';
    $('modal-preview').innerHTML = o.preview || '';
    $('modal-preview').style.display = o.preview ? '' : 'none';
    var box = $('modal-btns');
    box.innerHTML = '';
    (o.buttons || []).forEach(function (b) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = b.cls || 'btn';
      el.textContent = b.label;
      el.addEventListener('click', b.onClick);
      box.appendChild(el);
    });
    $('modal').hidden = false;
  }
  function hideModal() { $('modal').hidden = true; }

  /* ---------- 操作パネル ---------- */
  function onUndo() {
    if (!app || app.over || app.thinking || !app.cfg.undo) return;
    var n = app.cfg.mode === 'ai' ? 2 : 1;
    if (app.moves.length < n) return;
    if (app.cfg.mode === 'ai' && cur().turn !== app.human) return;
    for (var i = 0; i < n; i++) { app.states.pop(); app.moves.pop(); app.texts.pop(); }
    app.idx = app.states.length - 1;
    clearSel();
    showMsg('1手戻しました。', 'info', 2500);
    render();
  }

  function onResign() {
    if (!app || app.over || app.thinking) return;
    var loser = app.cfg.mode === 'ai' ? app.human : cur().turn;
    var who = loser === E.BLACK ? '先手' : '後手';
    showModal({
      title: '投了しますか？',
      msg: who + 'が投了すると、相手の勝ちになります。',
      buttons: [
        { label: '投了する', cls: 'btn-primary', onClick: function () {
          hideModal();
          finish(who + 'が投了しました。' + (loser === E.BLACK ? '後手' : '先手') + 'の勝ちです。', true);
        } },
        { label: 'やめる', cls: 'btn', onClick: hideModal }
      ]
    });
  }

  function onMenu() {
    if (!app) return;
    if (app.over) { backToMenu(); return; }
    showModal({
      title: 'メニューへ戻りますか？',
      msg: '対局中の内容は失われます。',
      buttons: [
        { label: 'メニューへ戻る', cls: 'btn-primary', onClick: backToMenu },
        { label: 'やめる', cls: 'btn', onClick: hideModal }
      ]
    });
  }

  function onFlip() { if (!app) return; app.flipped = !app.flipped; render(); }

  function review(to) {
    if (!app || !app.over) return;
    var max = app.states.length - 1;
    app.idx = Math.max(0, Math.min(max, to));
    render();
  }

  /* =====================================================
   * 5. 描画
   * ===================================================== */
  function playerName(c) {
    if (app.cfg.mode === 'pvp') return { n: 'プレイヤー' + (c === E.BLACK ? '1' : '2'), s: (c === E.BLACK ? '先手 ▲' : '後手 △') };
    if (c === app.human) return { n: 'あなた', s: (c === E.BLACK ? '先手 ▲' : '後手 △') };
    var lv = AI.LEVELS[app.cfg.level];
    return { n: 'コンピュータ', s: (c === E.BLACK ? '先手 ▲' : '後手 △') + ' Lv.' + app.cfg.level + ' ' + lv.name };
  }

  function renderInfo(el, c) {
    var p = playerName(c), s = cur();
    el.querySelector('.pname').textContent = p.n;
    el.querySelector('.psub').textContent = p.s;
    el.classList.toggle('turn', !app.over && s.turn === c && atLatest());
  }

  function renderStatus() {
    if (!app) return;
    var bar = $('status-bar'), txt = $('status-text'), s = cur(), text, type = 'normal';
    if (app.msg) {
      text = app.msg.text;
      type = app.msg.type;
      if (app.msg.canUndo) {
        txt.innerHTML = '<span>' + text + '</span><button type="button" class="status-undo-btn" id="btn-status-undo">やり直す</button>';
        var undoB = $('btn-status-undo');
        if (undoB) undoB.onclick = onBlunderUndo;
        bar.className = 'status ' + type;
        return;
      }
    }
    else if (app.over && atLatest()) { text = app.resultText; type = 'result'; }
    else if (app.over) { text = '感想戦：' + app.idx + '手目 / 全' + (app.states.length - 1) + '手'; }
    else if (app.thinking) { text = 'コンピュータが考えています…'; }
    else {
      var who = s.turn === E.BLACK ? '先手' : '後手';
      text = (app.cfg.mode === 'ai' ? (s.turn === app.human ? 'あなた' : 'コンピュータ') + '（' + who + '）' : who) + 'の番です';
      if (app.cfg.warn && E.inCheck(s, s.turn)) { text += '　王手されています！'; type = 'warn'; }
    }
    txt.textContent = text;
    bar.className = 'status ' + type;
  }

  function render() {
    if (!app) return;
    var s = cur();
    var interact = canInteract();
    var chk = E.inCheck(s, s.turn) ? s.turn : null;
    UI.render({
      state: s, flipped: app.flipped, selected: app.sel, targets: app.targets,
      hint: app.hint,
      lastMove: lastMoveOf(app.idx), guide: app.cfg.guide, checkColor: chk,
      handEnabled: [interact && s.turn === E.BLACK, interact && s.turn === E.WHITE]
    });

    var bottom = app.flipped ? E.WHITE : E.BLACK;
    renderInfo($('info-top'), 1 - bottom);
    renderInfo($('info-bottom'), bottom);
    renderStatus();

    // 形勢判断バー
    $('eval-wrap').style.display = app.cfg.eval ? '' : 'none';
    if (app.cfg.eval) {
      var sc = E.evaluate(s), pct = 100 / (1 + Math.exp(-sc / 1200));
      $('eval-black').style.width = pct.toFixed(1) + '%';
      var lbl = Math.abs(sc) < 150 ? '互角' : (sc > 0 ? '先手有利' : '後手有利');
      if (Math.abs(sc) >= 1500) lbl = sc > 0 ? '先手優勢' : '後手優勢';
      $('eval-label').textContent = lbl;
    }

    // ボタン状態
    var hintBtn = $('btn-hint');
    if (hintBtn) {
      hintBtn.style.display = app.cfg.hint ? '' : 'none';
      hintBtn.disabled = !interact;
    }
    var undoBtn = $('btn-undo');
    undoBtn.style.display = app.cfg.undo ? '' : 'none';
    var n = app.cfg.mode === 'ai' ? 2 : 1;
    undoBtn.disabled = app.over || app.thinking || app.moves.length < n || (app.cfg.mode === 'ai' && s.turn !== app.human);
    $('btn-resign').disabled = app.over || app.thinking;
    $('review').style.display = app.over ? 'block' : 'none';
    $('rv-first').disabled = $('rv-prev').disabled = app.idx === 0;
    $('rv-next').disabled = $('rv-last').disabled = atLatest();

    renderKifu();
  }

  function renderKifu() {
    var el = $('kifu'), html = '', i;
    for (i = 0; i < app.texts.length; i++) {
      html += '<div class="kifu-item' + (app.idx === i + 1 ? ' current' : '') + '" data-i="' + (i + 1) + '">' +
        (i + 1) + ' ' + app.texts[i] + '</div>';
    }
    el.innerHTML = html;
    var c = el.querySelector('.current');
    if (c) el.scrollTop = c.offsetTop - el.clientHeight / 2;
    else if (app.idx === app.states.length - 1) el.scrollTop = el.scrollHeight;
  }

  /* =====================================================
   * 6. ドラッグ＆ドロップ操作
   * ===================================================== */
  var dragState = null;
  var dragMoved = false;

  function initDragDrop() {
    var boardEl = $('board');
    var handTop = $('hand-top');
    var handBottom = $('hand-bottom');

    function getLiveSourceEl(source) {
      if (!source) return null;
      if (source.kind === 'board') {
        return UI.getCellEl(source.x, source.y);
      } else if (source.kind === 'hand') {
        return UI.getHandSlotEl(source.c, source.t);
      }
      return null;
    }

    function onPointerDown(e) {
      if (!canInteract() || !app || !app.cfg.drag) return;
      if (e.button !== undefined && e.button !== 0) return;

      var target = e.target;
      var cell = target.closest ? target.closest('.cell') : null;
      var handSlot = target.closest ? target.closest('.hand-slot') : null;
      if (!cell && !handSlot) return;

      var s = cur();
      var source = null;
      var piece = null;
      var sourceEl = null;

      if (cell) {
        var x = parseInt(cell.getAttribute('data-x'), 10);
        var y = parseInt(cell.getAttribute('data-y'), 10);
        var pc = s.board[y][x];
        if (!pc || pc.c !== s.turn) return;
        source = { kind: 'board', x: x, y: y };
        piece = pc;
        sourceEl = cell;
      } else if (handSlot) {
        var c = parseInt(handSlot.getAttribute('data-c'), 10);
        var t = handSlot.getAttribute('data-t');
        if (c !== s.turn || !s.hands[c][t]) return;
        source = { kind: 'hand', c: c, t: t };
        piece = { t: t, c: c, p: false };
        sourceEl = handSlot;
      }

      if (!source) return;

      dragMoved = false;
      dragState = {
        pointerId: e.pointerId,
        pointerType: e.pointerType || 'mouse',
        startX: e.clientX,
        startY: e.clientY,
        source: source,
        sourceEl: sourceEl,
        piece: piece,
        isDragging: false,
        ghost: null,
        hoverCell: null
      };

      if (source.kind === 'board') {
        selectBoard(source.x, source.y);
      } else {
        selectHand(source.c, source.t);
      }
      render();

      // render() 後に DOM が再構築されるため、最新の要素参照を再取得
      var liveEl = getLiveSourceEl(source);
      if (liveEl) {
        dragState.sourceEl = liveEl;
      }

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp, { passive: false });
      window.addEventListener('pointercancel', onPointerCancel, { passive: false });
    }

    function onPointerMove(e) {
      if (!dragState || e.pointerId !== dragState.pointerId) return;

      var dx = e.clientX - dragState.startX;
      var dy = e.clientY - dragState.startY;
      var dist = Math.hypot(dx, dy);

      var isTouch = (dragState.pointerType === 'touch' || dragState.pointerType === 'pen');

      if (!dragState.isDragging) {
        if (dist > 7) {
          dragState.isDragging = true;
          dragMoved = true;

          var liveEl = getLiveSourceEl(dragState.source) || dragState.sourceEl;
          var r1 = liveEl ? liveEl.getBoundingClientRect() : { left: e.clientX, top: e.clientY, width: 56, height: 56 };

          var appEl = $('app');
          var cellSize = (appEl ? parseFloat(getComputedStyle(appEl).getPropertyValue('--cell')) : 56) || 56;
          var ghostW = (r1.width > 12) ? r1.width : cellSize;
          var ghostH = (r1.height > 12) ? r1.height : Math.round(ghostW * 1.08);

          var ghost = document.createElement('div');
          ghost.className = 'drag-ghost';
          ghost.style.width = ghostW + 'px';
          ghost.style.height = ghostH + 'px';
          ghost.style.setProperty('--cell', ghostW + 'px');

          var initY = isTouch ? (e.clientY - ghostH * 0.8) : (e.clientY - ghostH / 2);
          ghost.style.left = (e.clientX - ghostW / 2) + 'px';
          ghost.style.top = initY + 'px';

          var bottom = app.flipped ? E.WHITE : E.BLACK;
          var isOpp = dragState.piece.c !== bottom;
          ghost.innerHTML = UI.pieceHTML(dragState.piece, isOpp);
          document.body.appendChild(ghost);
          dragState.ghost = ghost;

          if (liveEl) {
            var pEl = liveEl.querySelector('.piece');
            if (pEl) pEl.classList.add('anim-hidden');
          }
        } else {
          return;
        }
      }

      if (e.cancelable) e.preventDefault();

      var ghostEl = dragState.ghost;
      if (ghostEl) {
        var w = ghostEl.offsetWidth || 56;
        var h = ghostEl.offsetHeight || 60;
        var curY = isTouch ? (e.clientY - h * 0.8) : (e.clientY - h / 2);
        ghostEl.style.left = (e.clientX - w / 2) + 'px';
        ghostEl.style.top = curY + 'px';
      }

      var elem = document.elementFromPoint(e.clientX, e.clientY);
      var cell = elem ? (elem.closest ? elem.closest('.cell') : null) : null;

      if (dragState.hoverCell !== cell) {
        if (dragState.hoverCell) dragState.hoverCell.classList.remove('drag-hover');
        if (cell) cell.classList.add('drag-hover');
        dragState.hoverCell = cell;
      }
    }

    function onPointerUp(e) {
      if (!dragState || e.pointerId !== dragState.pointerId) return;
      cleanupDrag(e, false);
    }

    function onPointerCancel(e) {
      if (!dragState || e.pointerId !== dragState.pointerId) return;
      cleanupDrag(e, true);
    }

    function cleanupDrag(e, isCancel) {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);

      var ds = dragState;
      dragState = null;

      if (ds.hoverCell) {
        ds.hoverCell.classList.remove('drag-hover');
      }

      if (!ds.isDragging || !ds.ghost) {
        return;
      }

      var dropElem = isCancel ? null : document.elementFromPoint(e.clientX, e.clientY);
      var destCell = dropElem ? (dropElem.closest ? dropElem.closest('.cell') : null) : null;
      var targetMove = null;

      if (destCell) {
        var tx = parseInt(destCell.getAttribute('data-x'), 10);
        var ty = parseInt(destCell.getAttribute('data-y'), 10);
        for (var i = 0; i < app.targets.length; i++) {
          if (app.targets[i].x === tx && app.targets[i].y === ty) {
            targetMove = app.targets[i];
            break;
          }
        }
      }

      var ghost = ds.ghost;

      if (targetMove && destCell) {
        var r2 = destCell.getBoundingClientRect();
        ghost.classList.add('snapping');
        ghost.style.left = r2.left + 'px';
        ghost.style.top = r2.top + 'px';
        ghost.style.transform = 'scale(1)';

        setTimeout(function () {
          if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
          executeTarget(targetMove);
        }, 90);
      } else {
        var liveEl = getLiveSourceEl(ds.source) || ds.sourceEl;
        var r1 = liveEl ? liveEl.getBoundingClientRect() : { left: e.clientX, top: e.clientY };

        ghost.classList.add('snapping');
        ghost.style.left = r1.left + 'px';
        ghost.style.top = r1.top + 'px';
        ghost.style.transform = 'scale(1)';

        if (destCell && app.cfg.warn) {
          explainIllegal(parseInt(destCell.getAttribute('data-x'), 10), parseInt(destCell.getAttribute('data-y'), 10));
        }

        setTimeout(function () {
          if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
          var curEl = getLiveSourceEl(ds.source) || ds.sourceEl;
          if (curEl) {
            var pEl = curEl.querySelector('.piece');
            if (pEl) pEl.classList.remove('anim-hidden');
          }
          render();
        }, 140);
      }
    }

    [boardEl, handTop, handBottom].forEach(function (el) {
      if (el) el.addEventListener('pointerdown', onPointerDown);
    });
  }

  /* ---------- 全画面表示 ---------- */
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  }

  function toggleFullscreen() {
    var elem = document.documentElement;
    if (!isFullscreen()) {
      var req = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.mozRequestFullScreen || elem.msRequestFullscreen;
      if (req) {
        req.call(elem).catch(function () {});
      } else {
        showMsg('この端末では「ホーム画面に追加」すると全画面になります。', 'info', 4500);
      }
    } else {
      var exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      if (exit) {
        exit.call(document).catch(function () {});
      }
    }
  }

  function syncFullscreenBtn() {
    var btn = $('btn-full');
    if (!btn) return;
    btn.textContent = isFullscreen() ? '戻す' : '全画面';
  }

  /* =====================================================
   * 7. 初期化
   * ===================================================== */
  function init() {
    $('app-version').textContent = APP_VERSION;
    installGuards();
    layout();
    window.addEventListener('resize', layout);
    window.addEventListener('orientationchange', function () { setTimeout(layout, 250); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);

    UI.init({
      board: $('board'), fileLabels: $('file-labels'), rankLabels: $('rank-labels'),
      handTop: $('hand-top'), handBottom: $('hand-bottom')
    }, { onCell: onCell, onHand: onHand });

    initDragDrop();

    writeConfig(loadConfig());
    var radios = document.querySelectorAll('input[name="mode"]');
    for (var i = 0; i < radios.length; i++) radios[i].addEventListener('change', syncMenuState);

    $('btn-start').addEventListener('click', startGame);
    var hintBtn = $('btn-hint');
    if (hintBtn) hintBtn.addEventListener('click', onHint);
    $('btn-undo').addEventListener('click', onUndo);
    $('btn-resign').addEventListener('click', onResign);
    $('btn-flip').addEventListener('click', onFlip);
    var fullBtn = $('btn-full');
    if (fullBtn) fullBtn.addEventListener('click', toggleFullscreen);
    var sndBtn = $('btn-sound-toggle');
    if (sndBtn) sndBtn.addEventListener('click', toggleSound);
    var sndOpt = $('opt-sound');
    if (sndOpt) {
      sndOpt.addEventListener('change', function () {
        if (window.ShogiSound) window.ShogiSound.setEnabled(sndOpt.checked);
        var cfg = readConfig();
        saveConfig(cfg);
        syncSoundBtn();
      });
    }
    if (window.ShogiSound) {
      var initialCfg = loadConfig();
      window.ShogiSound.setEnabled(initialCfg.sound !== false);
    }
    syncSoundBtn();

    $('btn-menu').addEventListener('click', onMenu);
    $('rv-first').addEventListener('click', function () { review(0); });
    $('rv-prev').addEventListener('click', function () { review(app.idx - 1); });
    $('rv-next').addEventListener('click', function () { review(app.idx + 1); });
    $('rv-last').addEventListener('click', function () { review(app.states.length); });
    $('kifu').addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.getAttribute('data-i') && app && app.over) review(parseInt(t.getAttribute('data-i'), 10));
    });

    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        syncFullscreenBtn();
        setTimeout(layout, 100);
      });
    });
    syncFullscreenBtn();

    var qrBtn = $('btn-show-qr');
    if (qrBtn) qrBtn.addEventListener('click', openQrModal);
    var closeQrBtn = $('btn-close-qr');
    if (closeQrBtn) closeQrBtn.addEventListener('click', closeQrModal);
    var copyBtn = $('btn-copy-url');
    if (copyBtn) copyBtn.addEventListener('click', copyQrUrl);
    var qrModal = $('qr-modal');
    if (qrModal) {
      qrModal.addEventListener('click', function (e) {
        if (e.target === qrModal) closeQrModal();
      });
    }
  }

  /* =====================================================
   * 8. QRコード共有モーダル
   * ===================================================== */
  function openQrModal() {
    var modal = $('qr-modal');
    if (!modal) return;
    var rawUrl = window.location.href.split('#')[0];
    var input = $('qr-url-text');
    if (input) input.value = rawUrl;

    var container = $('qr-code-container');
    if (container && window.QRCode) {
      try {
        var svgHtml = QRCode.generateSVG(rawUrl, { size: 220, margin: 2, colorDark: '#2d1808', colorLight: '#ffffff' });
        container.innerHTML = svgHtml;
      } catch (e) {
        container.innerHTML = '<p style="color:red">QRコード生成エラー</p>';
      }
    }
    modal.hidden = false;
  }

  function closeQrModal() {
    var modal = $('qr-modal');
    if (modal) modal.hidden = true;
  }

  function copyQrUrl() {
    var input = $('qr-url-text');
    var btn = $('btn-copy-url');
    if (!input) return;
    var text = input.value;

    function onCopied() {
      if (!btn) return;
      var orig = btn.textContent;
      btn.textContent = '完了！';
      btn.style.background = '#3ddc6f';
      btn.style.color = '#fff';
      setTimeout(function () {
        btn.textContent = orig;
        btn.style.background = '';
        btn.style.color = '';
      }, 1800);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onCopied).catch(function () {
        input.select();
        document.execCommand('copy');
        onCopied();
      });
    } else {
      input.select();
      document.execCommand('copy');
      onCopied();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
