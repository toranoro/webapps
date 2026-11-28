/* Web BASIC 2.0 - UI, Mobile OS Keyboard, Viewport Lock, Fullscreen & PWA Controller */
(function (global) {
  'use strict';

  var WB = global.WebBasic = global.WebBasic || {};

  var APP_VERSION = '2.0.2';
  var term = document.getElementById('term');
  var canvas = document.getElementById('gfx');
  var sysbar = document.getElementById('sysbar');
  var vkeybar = document.getElementById('vkeybar');
  var statusBadge = document.getElementById('statusBadge');
  var btnStop = document.getElementById('btnStop');
  var btnKbd = document.getElementById('btnKbd');
  var btnLayout = document.getElementById('btnLayout');
  var btnFull = document.getElementById('btnFull');
  var btnInstall = document.getElementById('btnInstall');
  var btnSamples = document.getElementById('btnSamples');
  var btnToggleBar = document.getElementById('btnToggleBar');
  var fileLoader = document.getElementById('fileLoader');
  var sampleModal = document.getElementById('sampleModal');
  var sampleList = document.getElementById('sampleList');
  var installModal = document.getElementById('installModal');
  var installModalBody = document.getElementById('installModalBody');

  var gfx = new WB.GfxEngine(canvas);
  var audio = new WB.AudioEngine();

  // ====== 状態管理 ======
  var composing = false;
  var insertPos = 0;
  var inputWaiter = null;
  var autoState = null; // { current, step }
  var keyQueue = [];
  var deferredPrompt = null;
  var snapshotDuringRun = '';
  var lastEnterHandledAt = 0;
  var lastKeydownHandledAt = 0;

  // ====== 端末出力ユーティリティ ======
  function setCaret(pos) {
    var clamped = Math.max(0, Math.min(term.value.length, pos));
    term.selectionStart = term.selectionEnd = clamped;
  }

  function focusTerm() {
    try {
      term.focus({ preventScroll: true });
    } catch (e) {
      term.focus();
    }
  }

  function getLineAt(text, pos) {
    var start = text.lastIndexOf('\n', pos - 1) + 1;
    var end = text.indexOf('\n', pos);
    if (end === -1) end = text.length;
    return { start: start, end: end, line: text.slice(start, end) };
  }

  function insertTextAt(pos, str) {
    var t = term.value;
    var p = Math.max(0, Math.min(t.length, pos));
    term.value = t.slice(0, p) + str + t.slice(p);
    if (p <= insertPos) insertPos += str.length;
    return p + str.length;
  }

  function ensureNextLinePosition(endIndex) {
    var t = term.value;
    if (endIndex < t.length && t.charAt(endIndex) === '\n') {
      return endIndex + 1;
    }
    term.value = t.slice(0, endIndex) + '\n' + t.slice(endIndex);
    return endIndex + 1;
  }

  function scrollToBottom() {
    term.scrollTop = term.scrollHeight;
  }

  function emit(line) {
    var s = String(line) + '\n';
    insertPos = insertTextAt(insertPos, s);
    snapshotDuringRun = term.value;
    scrollToBottom();
  }

  function emitInline(str) {
    insertPos = insertTextAt(insertPos, String(str));
    snapshotDuringRun = term.value;
    scrollToBottom();
  }

  function emitSys(s) { emit(s); }
  function emitOk(s) { emit('[OK] ' + s); }
  function emitErr(s) { emit('[ERR] ' + s); }

  function clsText() {
    term.value = '';
    insertPos = 0;
    snapshotDuringRun = '';
    setCaret(0);
  }

  function pushKey(k) {
    if (!k) return;
    if (keyQueue.length < 64) keyQueue.push(k);
  }

  // ====== BASIC ランタイム初期化 ======
  var io = {
    gfx: gfx,
    audio: audio,
    emit: emit,
    emitInline: emitInline,
    emitSys: emitSys,
    emitOk: emitOk,
    emitErr: emitErr,
    cls: clsText,
    popKey: function () {
      return keyQueue.length > 0 ? keyQueue.shift() : '';
    },
    popKeys: function (n) {
      var out = '';
      while (out.length < n && keyQueue.length > 0) out += keyQueue.shift();
      return out;
    },
    requestInput: function (promptText) {
      return new Promise(function (resolve) {
        if (promptText) emitInline(promptText);
        setCaret(insertPos);
        focusTerm();
        inputWaiter = function (userText) {
          inputWaiter = null;
          resolve(userText);
        };
      });
    },
    cancelInput: function () {
      if (typeof inputWaiter === 'function') {
        var w = inputWaiter;
        inputWaiter = null;
        w('');
      }
    },
    onStateChange: function (state) {
      statusBadge.className = 'badge badge-' + state;
      statusBadge.textContent = state.toUpperCase();
      if (state === 'running') {
        btnStop.classList.add('active');
        snapshotDuringRun = term.value;
      } else {
        btnStop.classList.remove('active');
      }
    },
    onAuto: function (start, step) {
      autoState = { current: start, step: step };
      emitSys('AUTO ' + start + ',' + step);
      var nextStr = (term.value.slice(-1) === '\n' || term.value === '' ? '' : '\n') + start + ' ';
      insertPos = insertTextAt(term.value.length, nextStr);
      setCaret(insertPos);
      scrollToBottom();
    },
    onEditLine: function (fullLine) {
      var prefix = (term.value.slice(-1) === '\n' || term.value === '') ? '' : '\n';
      insertPos = insertTextAt(term.value.length, prefix + fullLine);
      setCaret(insertPos);
      scrollToBottom();
      focusTerm();
    },
    onSaveFile: function (name) {
      var fname = name || 'program';
      if (fname.indexOf('.') === -1) fname += '.bas';
      var lines = rt.sortedLines();
      var textContent = '';
      for (var i = 0; i < lines.length; i++) {
        textContent += lines[i] + ' ' + rt.program[lines[i]] + '\n';
      }
      var blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      emitOk('ダウンロードしました: ' + fname);
    },
    onLoadFile: function () {
      fileLoader.click();
    },
    onShowSamples: function (query) {
      if (!query) {
        openSampleModal();
        return;
      }
      var q = query.toUpperCase();
      var found = null;
      var idx = parseInt(q, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= WB.SAMPLES.length) {
        found = WB.SAMPLES[idx - 1];
      } else {
        for (var i = 0; i < WB.SAMPLES.length; i++) {
          if (WB.SAMPLES[i].id === q) { found = WB.SAMPLES[i]; break; }
        }
      }
      if (!found) {
        emitErr('サンプルが見つかりません: ' + query);
        return;
      }
      loadProgramText(found.code, found.id + ' (Sample)');
    },
    onOpenManual: function () {
      window.open('manual/index.html', '_blank', 'noopener');
    },
    onUiSetting: function (key, val) {
      if (key === 'upper') {
        document.documentElement.dataset.upper = val;
        savePref('upper', val);
        emitOk('UPPERCASE: ' + val);
      } else if (key === 'font') {
        document.documentElement.dataset.font = val;
        gfx.cachedFontStr = '';
        savePref('font', val);
        emitOk('フォント: ' + val);
      } else if (key === 'size') {
        document.documentElement.style.setProperty('--font-size', val + 'px');
        savePref('size', val);
        emitOk('サイズ: ' + val + 'px');
      } else if (key === 'theme') {
        document.documentElement.dataset.theme = val;
        savePref('theme', val);
        emitOk('テーマ: ' + val);
      }
    }
  };

  var rt = new WB.BasicRuntime(io);
  WB.runtime = rt;

  function loadProgramText(text, label) {
    rt.clearProgram();
    var lines = text.split(/\r?\n/);
    var count = 0;
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      var m = s.match(/^(\d+)\s+(.*)$/);
      if (m) {
        rt.setLine(parseInt(m[1], 10), m[2].trim());
        count++;
      }
    }
    emitSys('LOADED: ' + label + ' (' + count + ' lines)');
  }

  // ====== Enter 実行 / コマンド処理 ======
  async function submitCurrentLine() {
    audio.unlock();
    var text = term.value;
    var pos = term.selectionStart;
    var info = getLineAt(text, pos);
    insertPos = ensureNextLinePosition(info.end);

    var raw = info.line.replace(/^\s*>\s?/, '');
    var trimmed = raw.trim();

    if (typeof inputWaiter === 'function') {
      var w = inputWaiter;
      setCaret(insertPos);
      w(raw);
      return;
    }

    if (autoState && /^\d+$/.test(trimmed)) {
      autoState = null;
      emitSys('AUTO END');
      setCaret(insertPos);
      scrollToBottom();
      return;
    }

    var isAutoStart = /^AUTO(\s|$)/i.test(trimmed);

    if (trimmed !== '') {
      await rt.execCommand(trimmed);
    }

    if (isAutoStart && autoState) {
      setCaret(insertPos);
      scrollToBottom();
      return;
    }

    if (autoState) {
      autoState.current += autoState.step;
      var nextStr = autoState.current + ' ';
      if (term.value.slice(-1) !== '\n' && term.value !== '') nextStr = '\n' + nextStr;
      insertPos = insertTextAt(term.value.length, nextStr);
    }

    setCaret(insertPos);
    if (insertPos >= term.value.length - 2) scrollToBottom();
  }

  // ====== キーボード入力処理 (PC + Android IME + iOS Safari) ======
  function mapSpecialKey(key) {
    if (key === 'ArrowUp') return '\x1e';
    if (key === 'ArrowDown') return '\x1f';
    if (key === 'ArrowLeft') return '\x1d';
    if (key === 'ArrowRight') return '\x1c';
    if (key === 'Escape') return '\x1b';
    if (key === 'Enter') return '\r';
    if (key === 'Backspace') return '\b';
    if (key.length === 1) return key;
    return '';
  }

  term.addEventListener('compositionstart', function () { composing = true; });
  term.addEventListener('compositionend', function () { composing = false; });

  term.addEventListener('keydown', async function (ev) {
    audio.unlock();

    // 実行中断 (Ctrl+C または Esc)
    if ((ev.ctrlKey && (ev.key === 'c' || ev.key === 'C')) || ev.key === 'Escape') {
      if (rt.running) {
        ev.preventDefault();
        rt.stop();
        return;
      }
      if (autoState) {
        ev.preventDefault();
        autoState = null;
        emitSys('AUTO END');
        return;
      }
    }

    // F1..F5 ファンクションキー
    if (ev.key === 'F1' || ev.key === 'F2' || ev.key === 'F3' || ev.key === 'F4' || ev.key === 'F5') {
      ev.preventDefault();
      triggerFKey(parseInt(ev.key.slice(1), 10));
      return;
    }

    // RUN中 (INPUT待ち以外) の INKEY$ 入力キャプチャ
    if (rt.running && !inputWaiter) {
      if (ev.key && ev.key !== 'Unidentified' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        var mapped = mapSpecialKey(ev.key);
        if (mapped) {
          ev.preventDefault();
          lastKeydownHandledAt = performance.now();
          pushKey(mapped.toUpperCase());
          return;
        }
      }
      return;
    }

    if (ev.key === 'Enter' && ev.shiftKey) return;
    if (ev.key !== 'Enter') return;
    if (composing || ev.isComposing) return;

    ev.preventDefault();
    lastEnterHandledAt = performance.now();
    await submitCurrentLine();
  });

  // Android Chrome / Gboard 等のIMEフォールバック (key==="Unidentified"対策)
  term.addEventListener('beforeinput', function (ev) {
    audio.unlock();
    var now = performance.now();
    if (rt.running && !inputWaiter) {
      if (now - lastKeydownHandledAt < 50) {
        if (ev.cancelable) ev.preventDefault();
        return;
      }
      if (ev.inputType === 'insertLineBreak') {
        if (ev.cancelable) ev.preventDefault();
        pushKey('\r');
      } else if (ev.data) {
        if (ev.cancelable) ev.preventDefault();
        for (var i = 0; i < ev.data.length; i++) {
          pushKey(ev.data[i].toUpperCase());
        }
      }
      return;
    }
    if (ev.inputType === 'insertLineBreak' && !composing) {
      if (ev.cancelable) ev.preventDefault();
      if (now - lastEnterHandledAt < 50) return;
      lastEnterHandledAt = now;
      submitCurrentLine();
    }
  });

  term.addEventListener('input', function () {
    // beforeinput をキャンセルできなかったモバイルIME向けのフォールバック
    if (rt.running && !inputWaiter) {
      var cur = term.value;
      if (cur.length > snapshotDuringRun.length) {
        var diff = cur.slice(snapshotDuringRun.length);
        for (var i = 0; i < diff.length; i++) {
          var ch = diff[i];
          if (ch === '\n') pushKey('\r');
          else pushKey(ch.toUpperCase());
        }
      }
      term.value = snapshotDuringRun;
      setCaret(insertPos);
      return;
    }
    // スマートクォートの自動正規化
    if (!composing && /[“”‘’]/.test(term.value)) {
      var sel = term.selectionStart;
      term.value = WB.Expr.normalizeQuotes(term.value);
      setCaret(sel);
    }
  });

  // ペースト時スマートプログラム登録
  term.addEventListener('paste', function (e) {
    var text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text) return;
    var lines = text.split(/\r?\n/);
    var progLines = 0;
    for (var i = 0; i < Math.min(lines.length, 5); i++) {
      if (/^\s*\d+\s+/.test(lines[i])) progLines++;
    }
    if (progLines > 0) {
      e.preventDefault();
      var count = 0;
      for (var j = 0; j < lines.length; j++) {
        var m = lines[j].trim().match(/^(\d+)\s+(.*)$/);
        if (m) {
          rt.setLine(parseInt(m[1], 10), m[2].trim());
          count++;
        }
      }
      emitSys('[Paste] ' + count + '行を登録しました。');
      scrollToBottom();
    }
  });

  // ファイル選択 (LOAD)
  fileLoader.addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      loadProgramText(ev.target.result || '', file.name);
      fileLoader.value = '';
    };
    reader.readAsText(file);
  });

  // ====== ツールバー / ファンクションキー ======
  async function triggerFKey(num) {
    audio.unlock();
    if (num === 1) { io.onLoadFile(); }
    else if (num === 2) { io.onSaveFile('program'); }
    else if (num === 3) { await rt.execCommand('LIST'); }
    else if (num === 4) { await rt.run(); }
    else if (num === 5) { clsText(); gfx.cls(); }
    focusTerm();
  }

  document.querySelectorAll('.btn-fk').forEach(function (btn) {
    btn.addEventListener('click', function () {
      triggerFKey(parseInt(btn.dataset.fk, 10));
    });
  });

  btnStop.addEventListener('click', function () {
    rt.stop();
    if (autoState) {
      autoState = null;
      emitSys('AUTO END');
    }
    focusTerm();
  });

  btnToggleBar.addEventListener('click', function () {
    sysbar.classList.toggle('collapsed');
    updateVisualViewport();
  });

  btnKbd.addEventListener('click', function () {
    vkeybar.classList.toggle('hidden');
    btnKbd.classList.toggle('btn-active', !vkeybar.classList.contains('hidden'));
    focusTerm();
    updateVisualViewport();
  });

  btnLayout.addEventListener('click', function () {
    var cur = document.documentElement.dataset.layout;
    var next = (cur === 'split') ? 'overlay' : 'split';
    document.documentElement.dataset.layout = next;
    btnLayout.classList.toggle('btn-active', next === 'split');
    btnLayout.textContent = next === 'split' ? 'OVER' : 'SPLIT';
    savePref('layout', next);
  });

  // 補助キーバー操作 (フォーカスを奪わずに文字挿入・操作)
  vkeybar.addEventListener('pointerdown', function (e) {
    var btn = e.target.closest('.vkey');
    if (!btn) return;
    e.preventDefault();
    audio.unlock();

    var ch = btn.dataset.ch;
    var act = btn.dataset.act;
    var nav = btn.dataset.nav;

    if (act === 'focuskbd') {
      focusTerm();
      return;
    }
    if (act === 'esc') {
      if (rt.running) rt.stop();
      else pushKey('\x1b');
      return;
    }
    if (act === 'enter') {
      if (rt.running && !inputWaiter) { pushKey('\r'); return; }
      submitCurrentLine();
      return;
    }
    if (nav) {
      if (rt.running && !inputWaiter) {
        pushKey(mapSpecialKey(nav));
        return;
      }
      var p = term.selectionStart;
      if (nav === 'ArrowLeft') setCaret(p - 1);
      else if (nav === 'ArrowRight') setCaret(p + 1);
      else if (nav === 'ArrowUp') {
        var infoUp = getLineAt(term.value, p);
        if (infoUp.start > 0) setCaret(infoUp.start - 1);
      } else if (nav === 'ArrowDown') {
        var infoDn = getLineAt(term.value, p);
        if (infoDn.end < term.value.length) setCaret(infoDn.end + 1);
      }
      focusTerm();
      return;
    }
    if (ch) {
      if (rt.running && !inputWaiter) {
        pushKey(ch);
        return;
      }
      var curPos = term.selectionStart;
      var nextPos = insertTextAt(curPos, ch);
      setCaret(nextPos);
      focusTerm();
    }
  });

  // ====== サンプルモーダル ======
  function openSampleModal() {
    sampleList.innerHTML = '';
    WB.SAMPLES.forEach(function (sp) {
      var item = document.createElement('div');
      item.className = 'sample-item';

      var info = document.createElement('div');
      var title = document.createElement('div');
      title.className = 'sample-item-title';
      title.textContent = sp.title;
      var desc = document.createElement('div');
      desc.className = 'sample-item-desc';
      desc.textContent = sp.desc;
      info.appendChild(title);
      info.appendChild(desc);

      var acts = document.createElement('div');
      acts.className = 'sample-actions';

      var btnLoad = document.createElement('button');
      btnLoad.type = 'button';
      btnLoad.className = 'btn';
      btnLoad.textContent = 'LOAD';
      btnLoad.addEventListener('click', function () {
        closeModal('sampleModal');
        loadProgramText(sp.code, sp.id);
      });

      var btnRun = document.createElement('button');
      btnRun.type = 'button';
      btnRun.className = 'btn btn-run';
      btnRun.textContent = 'RUN';
      btnRun.addEventListener('click', async function () {
        closeModal('sampleModal');
        loadProgramText(sp.code, sp.id);
        await rt.run();
      });

      acts.appendChild(btnLoad);
      acts.appendChild(btnRun);
      item.appendChild(info);
      item.appendChild(acts);
      sampleList.appendChild(item);
    });
    sampleModal.classList.remove('hidden');
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  btnSamples.addEventListener('click', openSampleModal);
  document.querySelectorAll('.modal-close').forEach(function (b) {
    b.addEventListener('click', function () { closeModal(b.dataset.close); });
  });
  document.querySelectorAll('.modal').forEach(function (m) {
    m.addEventListener('click', function (e) {
      if (e.target === m) m.classList.add('hidden');
    });
  });

  // ====== 全画面表示 & PWA インストール ======
  function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true;
  }

  function showInstallGuide(isIosSafari) {
    if (isIosSafari) {
      installModalBody.innerHTML =
        '<p><strong>iPad / iPhone Safari での全画面表示方法：</strong></p>' +
        '<ol>' +
        '<li>画面上部または下部の Safari ツールバーにある <strong>共有ボタン（□に↑）</strong> をタップします。</li>' +
        '<li>メニューから <strong>「ホーム画面に追加」</strong> を選択して追加します。</li>' +
        '<li>ホーム画面の <strong>Web BASIC</strong> アイコンから起動すると、アドレスバーのないフルスクリーンアプリとして動作します。</li>' +
        '</ol>';
    } else {
      installModalBody.innerHTML =
        '<p><strong>Chrome アプリインストール / 全画面表示：</strong></p>' +
        '<ul>' +
        '<li>ブラウザのメニュー（⋮）から <strong>「アプリをインストール」</strong> または <strong>「ホーム画面に追加」</strong> を選択できます。</li>' +
        '<li>PC / Android Chrome では右上の <strong>⛶ FULL</strong> ボタンで即座に全画面表示へ切り替えられます。</li>' +
        '</ul>';
    }
    installModal.classList.remove('hidden');
  }

  btnFull.addEventListener('click', function () {
    var docEl = document.documentElement;
    var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
      return;
    }
    var req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
    if (req) {
      try {
        var p = req.call(docEl, { navigationUI: 'hide' });
        if (p && p.catch) {
          p.catch(function () { showInstallGuide(isIos()); });
        }
      } catch (e) {
        showInstallGuide(isIos());
      }
    } else {
      showInstallGuide(isIos());
    }
  });

  document.addEventListener('fullscreenchange', function () {
    var active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    btnFull.classList.toggle('btn-active', active);
  });

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    btnInstall.classList.remove('hidden');
  });

  if (isIos() && !isStandalone()) {
    btnInstall.classList.remove('hidden');
  }

  btnInstall.addEventListener('click', async function () {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) {}
      deferredPrompt = null;
      btnInstall.classList.add('hidden');
    } else {
      showInstallGuide(isIos());
    }
  });

  // ====== ビューポート追従 (縦/横回転 & OSキーボード出現対策) ======
  function updateVisualViewport() {
    var vv = window.visualViewport;
    var w = vv ? vv.width : window.innerWidth;
    var h = vv ? vv.height : window.innerHeight;
    var top = vv ? vv.offsetTop : 0;
    var root = document.documentElement.style;
    root.setProperty('--vv-width', Math.round(w) + 'px');
    root.setProperty('--vv-height', Math.round(h) + 'px');
    root.setProperty('--vv-top', Math.round(top) + 'px');
    if (document.activeElement === term) {
      scrollToBottom();
    }
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateVisualViewport);
    window.visualViewport.addEventListener('scroll', updateVisualViewport);
  }
  window.addEventListener('resize', updateVisualViewport);
  window.addEventListener('orientationchange', function () {
    setTimeout(updateVisualViewport, 120);
    setTimeout(updateVisualViewport, 350);
  });

  // ====== 誤操作（ピンチ・ドラッグ・不要スクロール）完全抑止 ======
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (evName) {
    document.addEventListener(evName, function (e) { e.preventDefault(); }, { passive: false });
  });

  document.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
      return;
    }
    var target = e.target;
    if (target.closest && (target.closest('#term') || target.closest('.vkey-scroll') || target.closest('.sample-list') || target.closest('.modal-body'))) {
      return;
    }
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('wheel', function (e) {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });

  // ====== 設定永続化 & Service Worker (キャッシュ無効設計) ======
  function savePref(k, v) {
    try { localStorage.setItem('webbasic_pref:' + k, String(v)); } catch (e) {}
  }
  function loadPref(k, def) {
    try {
      var v = localStorage.getItem('webbasic_pref:' + k);
      return v !== null ? v : def;
    } catch (e) { return def; }
  }

  function registerNoCacheSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    navigator.serviceWorker.register('sw.js?v=' + APP_VERSION, { updateViaCache: 'none' })
      .then(function (reg) { reg.update(); })
      .catch(function () {});
  }

  // ====== 初期化 ======
  function init() {
    document.documentElement.dataset.upper = loadPref('upper', 'on');
    document.documentElement.dataset.font = loadPref('font', 'mono');
    document.documentElement.dataset.theme = loadPref('theme', 'pc98');
    var layout = loadPref('layout', 'overlay');
    document.documentElement.dataset.layout = layout;
    if (layout === 'split') {
      btnLayout.classList.add('btn-active');
      btnLayout.textContent = 'OVER';
    }
    var savedSize = loadPref('size', '');
    if (savedSize) {
      document.documentElement.style.setProperty('--font-size', savedSize + 'px');
    }

    // タッチ端末では初期状態で補助キーバーを表示しやすくする
    if (window.matchMedia('(pointer: coarse)').matches) {
      vkeybar.classList.remove('hidden');
      btnKbd.classList.add('btn-active');
    }

    gfx.resize(640, 400);
    clsText();
    term.value = 'WEB BASIC ' + APP_VERSION + ' 起動\nHELP で命令一覧 / SAMPLE でサンプル表示\nREADY.\n';
    insertPos = term.value.length;
    setCaret(insertPos);
    updateVisualViewport();
    registerNoCacheSW();

    // PCの場合は即座に入力フォーカス
    if (!window.matchMedia('(pointer: coarse)').matches) {
      focusTerm();
    }
  }

  init();
})(window);
