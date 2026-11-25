(function (global) {
  'use strict';
  const B3B = (global.Beauty3Block = global.Beauty3Block || {});

  function loadSettings() {
    try {
      const raw = global.localStorage.getItem('beauty3block_settings');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function saveSettings(settings) {
    try {
      global.localStorage.setItem('beauty3block_settings', JSON.stringify(settings));
    } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    const audio = new B3B.JewelAudio();
    const renderer = new B3B.JewelRenderer();
    const engine = new B3B.ColumnsEngine({ audio });

    const saved = loadSettings();
    const defaultTrack =
      (B3B.BGM_TRACKS && B3B.BGM_TRACKS[1] && B3B.BGM_TRACKS[1].file) ||
      (B3B.BGM_TRACKS && B3B.BGM_TRACKS[0] && B3B.BGM_TRACKS[0].file) ||
      '';
    const appSettings = {
      sound: saved && typeof saved.sound === 'boolean' ? saved.sound : true,
      bgmEnabled: saved && typeof saved.bgmEnabled === 'boolean' ? saved.bgmEnabled : true,
      bgmMode: saved && (saved.bgmMode === 'random' || saved.bgmMode === 'repeat') ? saved.bgmMode : 'random',
      bgmTrack: saved && typeof saved.bgmTrack === 'string' ? saved.bgmTrack : defaultTrack,
      bgmVolume: saved && typeof saved.bgmVolume === 'number' ? saved.bgmVolume : 0.55,
      ghost: saved && typeof saved.ghost === 'boolean' ? saved.ghost : true,
      magicEnabled: saved && typeof saved.magicEnabled === 'boolean' ? saved.magicEnabled : true,
      preset: saved && B3B.PRESETS[saved.preset] ? saved.preset : 'classic',
      showPadInLandscape: saved && typeof saved.showPadInLandscape === 'boolean' ? saved.showPadInLandscape : false
    };

    audio.setEnabled(appSettings.sound);
    engine.settings.ghost = appSettings.ghost;
    engine.settings.magicEnabled = appSettings.magicEnabled;
    engine.settings.preset = appSettings.preset;

    const bgmNowEls = document.querySelectorAll('[data-bind="bgm-now"]');
    const bgm = new B3B.BGMPlayer({
      onTrackChange: (track, player) => {
        const label = !player.enabled
          ? '♪ BGM OFF'
          : player.unsupported
          ? '♪ OGG非対応ブラウザのためBGM無効'
          : track
          ? `♪ ${track.title}${player.mode === 'repeat' ? ' [リピート]' : ' [ランダム]'}`
          : '♪ 曲が見つかりません';
        bgmNowEls.forEach((el) => {
          el.textContent = label;
        });
      }
    });
    bgm.configure({
      enabled: appSettings.bgmEnabled,
      mode: appSettings.bgmMode,
      selectedFile: appSettings.bgmTrack,
      volume: appSettings.bgmVolume
    });

    // DOM Elements
    const boardStage = document.getElementById('board-stage');
    const boardFrame = document.getElementById('board-frame');
    const boardCanvas = document.getElementById('board-canvas');
    const boardCtx = boardCanvas.getContext('2d');

    const nextCanvases = [
      document.getElementById('next-canvas-side'),
      document.getElementById('next-canvas-top')
    ].filter(Boolean);

    const scoreEls = document.querySelectorAll('[data-bind="score"]');
    const bestEls = document.querySelectorAll('[data-bind="best"]');
    const levelEls = document.querySelectorAll('[data-bind="level"]');
    const gemsEls = document.querySelectorAll('[data-bind="gems"]');
    const chainEls = document.querySelectorAll('[data-bind="chain"]');
    const presetBadges = document.querySelectorAll('[data-bind="preset"]');

    const overlayEl = document.getElementById('board-overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlaySubtitle = document.getElementById('overlay-subtitle');
    const overlayStats = document.getElementById('overlay-stats');
    const overlayFinalScore = document.getElementById('overlay-final-score');
    const overlayFinalChain = document.getElementById('overlay-final-chain');
    const titleBgmBox = document.getElementById('title-bgm-box');
    const btnPrimaryPlay = document.getElementById('btn-primary-play');
    const btnReturnTitle = document.getElementById('btn-return-title');
    const btnOverlaySettings = document.getElementById('btn-overlay-settings');

    const btnPauseList = document.querySelectorAll('[data-action="pause"]');
    const btnSoundList = document.querySelectorAll('[data-action="sound"]');
    const btnBgmList = document.querySelectorAll('[data-action="bgm"]');
    const btnBgmNextList = document.querySelectorAll('[data-action="bgm-next"]');
    const btnBgmStopList = document.querySelectorAll('[data-action="bgm-stop"]');
    const btnReturnTitleList = document.querySelectorAll('[data-action="return-title"]');
    const bgmModeButtons = document.querySelectorAll('[data-bgm-mode]');
    const bgmSelects = document.querySelectorAll('[data-bgm-select]');
    const btnFullscreenList = document.querySelectorAll('[data-action="fullscreen"]');
    const btnInstallList = document.querySelectorAll('[data-action="install"]');
    const btnSettingsList = document.querySelectorAll('[data-action="settings"]');

    const settingsModal = document.getElementById('settings-modal');
    const iosModal = document.getElementById('ios-modal');
    const rotateGuard = document.getElementById('rotate-guard');

    const toggleBgmInput = document.getElementById('opt-bgm');
    const bgmVolumeInput = document.getElementById('opt-bgm-volume');
    const toggleSoundInput = document.getElementById('opt-sound');
    const toggleGhostInput = document.getElementById('opt-ghost');
    const toggleMagicInput = document.getElementById('opt-magic');
    const toggleLandPadInput = document.getElementById('opt-landpad');
    const presetButtons = document.querySelectorAll('[data-preset]');

    // Populate BGM track dropdowns
    bgmSelects.forEach((sel) => {
      sel.innerHTML = '';
      (B3B.BGM_TRACKS || []).forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.file;
        opt.textContent = t.title;
        sel.appendChild(opt);
      });
      if (appSettings.bgmTrack) {
        sel.value = appSettings.bgmTrack;
      }
    });

    // Layout metrics & cached static board background
    let cellSize = 36;
    let boardWidth = cellSize * B3B.COLS;
    let boardHeight = cellSize * B3B.VISIBLE_ROWS;
    let dpr = Math.min(2, global.devicePixelRatio || 1);
    let resizeRafPending = false;
    let bgCacheCanvas = null;
    let bgCacheKey = '';

    function ensureBgCache() {
      const key = `${boardWidth}x${boardHeight}x${dpr}`;
      if (bgCacheCanvas && bgCacheKey === key) return bgCacheCanvas;
      const cv = bgCacheCanvas || document.createElement('canvas');
      cv.width = Math.max(1, Math.round(boardWidth * dpr));
      cv.height = Math.max(1, Math.round(boardHeight * dpr));
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      const bgGrad = g.createLinearGradient(0, 0, 0, boardHeight);
      bgGrad.addColorStop(0, '#0a0e24');
      bgGrad.addColorStop(0.55, '#0e1330');
      bgGrad.addColorStop(1, '#161133');
      g.fillStyle = bgGrad;
      g.fillRect(0, 0, boardWidth, boardHeight);

      for (let r = 0; r < B3B.VISIBLE_ROWS; r++) {
        for (let c = 0; c < B3B.COLS; c++) {
          if ((r + c) % 2 === 0) {
            g.fillStyle = 'rgba(255, 255, 255, 0.018)';
            g.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
          }
        }
      }

      g.strokeStyle = 'rgba(160, 190, 255, 0.065)';
      g.lineWidth = 1;
      for (let c = 1; c < B3B.COLS; c++) {
        const x = c * cellSize + 0.5;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, boardHeight);
        g.stroke();
      }
      for (let r = 1; r < B3B.VISIBLE_ROWS; r++) {
        const y = r * cellSize + 0.5;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(boardWidth, y);
        g.stroke();
      }

      // Subtle 3-zone tap divider ticks (top: CW, middle: swap, bottom: CCW)
      g.save();
      g.strokeStyle = 'rgba(120, 220, 255, 0.16)';
      g.setLineDash([4, 6]);
      [boardHeight / 3, (boardHeight * 2) / 3].forEach((zy) => {
        const y = Math.round(zy) + 0.5;
        g.beginPath();
        g.moveTo(4, y);
        g.lineTo(boardWidth - 4, y);
        g.stroke();
      });
      g.restore();

      bgCacheCanvas = cv;
      bgCacheKey = key;
      return cv;
    }

    function resizeBoard() {
      resizeRafPending = false;
      if (!boardStage || !boardCanvas || !boardFrame) return;
      const rect = boardStage.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const pad = 10;
      const availW = Math.max(120, rect.width - pad * 2);
      const availH = Math.max(220, rect.height - pad * 2);

      const maxCellW = Math.floor(availW / B3B.COLS);
      const maxCellH = Math.floor(availH / B3B.VISIBLE_ROWS);
      const nextCell = Math.max(16, Math.min(maxCellW, maxCellH, 54));
      const nextW = nextCell * B3B.COLS;
      const nextH = nextCell * B3B.VISIBLE_ROWS;
      const nextDpr = Math.min(2, global.devicePixelRatio || 1);
      const pxW = Math.round(nextW * nextDpr);
      const pxH = Math.round(nextH * nextDpr);

      cellSize = nextCell;
      boardWidth = nextW;
      boardHeight = nextH;
      dpr = nextDpr;

      if (boardCanvas.width !== pxW || boardCanvas.height !== pxH) {
        boardCanvas.style.width = `${boardWidth}px`;
        boardCanvas.style.height = `${boardHeight}px`;
        boardCanvas.width = pxW;
        boardCanvas.height = pxH;
      }

      const frameW = `${boardWidth + 12}px`;
      const frameH = `${boardHeight + 12}px`;
      if (boardFrame.style.width !== frameW) boardFrame.style.width = frameW;
      if (boardFrame.style.height !== frameH) boardFrame.style.height = frameH;

      ensureBgCache();
      drawNextPreviews();
    }

    function scheduleResize() {
      if (resizeRafPending) return;
      resizeRafPending = true;
      global.requestAnimationFrame(resizeBoard);
    }

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => scheduleResize());
      ro.observe(boardStage);
    }
    global.addEventListener('resize', scheduleResize);
    global.addEventListener('orientationchange', () => {
      setTimeout(scheduleResize, 120);
      checkRotateGuard();
    });

    function checkRotateGuard() {
      if (!rotateGuard) return;
      const style = global.getComputedStyle(rotateGuard);
      const isRotatedBlocked = style.display !== 'none';
      if (isRotatedBlocked) {
        engine.pauseIfPlaying();
      }
      bgm.setRotateSuspended(isRotatedBlocked);
    }

    function drawNextPreviews() {
      for (const cv of nextCanvases) {
        const ctx = cv.getContext('2d');
        const boxW = cv.clientWidth || parseInt(cv.getAttribute('width'), 10) || 56;
        const boxH = cv.clientHeight || parseInt(cv.getAttribute('height'), 10) || 132;
        const localDpr = Math.min(2, global.devicePixelRatio || 1);
        const targetW = Math.round(boxW * localDpr);
        const targetH = Math.round(boxH * localDpr);
        if (cv.width !== targetW || cv.height !== targetH) {
          cv.width = targetW;
          cv.height = targetH;
        }
        ctx.setTransform(localDpr, 0, 0, localDpr, 0, 0);
        ctx.clearRect(0, 0, boxW, boxH);

        const gemSize = Math.min(boxW * 0.78, (boxH - 8) / 3);
        const startX = (boxW - gemSize) * 0.5;
        const startY = (boxH - gemSize * 3) * 0.5;
        const triplet = engine.nextTriplet || [0, 1, 2];

        for (let i = 0; i < 3; i++) {
          renderer.drawJewel(
            ctx,
            triplet[i],
            startX,
            startY + i * gemSize,
            gemSize,
            engine.timeSec
          );
        }
      }
    }

    function syncHUD() {
      scoreEls.forEach((el) => {
        el.textContent = engine.score.toLocaleString();
      });
      bestEls.forEach((el) => {
        el.textContent = engine.bestScore.toLocaleString();
      });
      levelEls.forEach((el) => {
        el.textContent = String(engine.level);
      });
      gemsEls.forEach((el) => {
        el.textContent = String(engine.gemsCleared);
      });
      chainEls.forEach((el) => {
        el.textContent = String(engine.maxChain);
      });
      presetBadges.forEach((el) => {
        el.textContent = (B3B.PRESETS[engine.settings.preset] || B3B.PRESETS.classic).label;
      });

      const paused = engine.state === 'PAUSED';
      btnPauseList.forEach((btn) => {
        btn.setAttribute('aria-pressed', String(paused));
        const label = btn.querySelector('.btn-label');
        if (label) label.textContent = paused ? 'RESUME' : 'PAUSE';
      });

      const wasIdle = document.body.classList.contains('state-idle');
      const isIdle = engine.state === 'IDLE';
      document.body.classList.toggle('state-idle', isIdle);
      if (wasIdle !== isIdle) {
        resizeBoard();
      }

      // Overlay visibility & text
      if (engine.state === 'IDLE') {
        overlayEl.hidden = false;
        overlayTitle.textContent = 'BEAUTY 3-BLOCK';
        overlaySubtitle.textContent = '宝石を揃えて連鎖する、至高のコラムス体験';
        overlayStats.hidden = true;
        if (titleBgmBox) titleBgmBox.hidden = false;
        if (btnReturnTitle) btnReturnTitle.hidden = true;
        btnPrimaryPlay.textContent = 'GAME START';
      } else if (engine.state === 'PAUSED') {
        overlayEl.hidden = false;
        overlayTitle.textContent = 'PAUSED';
        overlaySubtitle.textContent = '一休み中 — 準備ができたら再開しましょう';
        overlayStats.hidden = true;
        if (titleBgmBox) titleBgmBox.hidden = false;
        if (btnReturnTitle) btnReturnTitle.hidden = false;
        btnPrimaryPlay.textContent = 'RESUME';
      } else if (engine.state === 'GAMEOVER') {
        overlayEl.hidden = false;
        overlayTitle.textContent = 'GAME OVER';
        overlaySubtitle.textContent =
          engine.score > 0 && engine.score >= engine.bestScore
            ? 'NEW RECORD! 素晴らしい輝きです！'
            : 'もう一度チャレンジしましょう';
        overlayStats.hidden = false;
        if (titleBgmBox) titleBgmBox.hidden = false;
        if (btnReturnTitle) btnReturnTitle.hidden = false;
        overlayFinalScore.textContent = engine.score.toLocaleString();
        overlayFinalChain.textContent = `${engine.maxChain} CHAIN`;
        btnPrimaryPlay.textContent = 'PLAY AGAIN';
      } else {
        overlayEl.hidden = true;
      }

      drawNextPreviews();
    }

    engine.onStateChange = syncHUD;

    function syncSettingsUI() {
      if (toggleBgmInput) toggleBgmInput.checked = appSettings.bgmEnabled;
      if (bgmVolumeInput) bgmVolumeInput.value = String(Math.round(appSettings.bgmVolume * 100));
      if (toggleSoundInput) toggleSoundInput.checked = appSettings.sound;
      if (toggleGhostInput) toggleGhostInput.checked = appSettings.ghost;
      if (toggleMagicInput) toggleMagicInput.checked = appSettings.magicEnabled;
      if (toggleLandPadInput) toggleLandPadInput.checked = appSettings.showPadInLandscape;

      document.body.classList.toggle('show-landscape-pad', appSettings.showPadInLandscape);

      presetButtons.forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.preset === appSettings.preset);
      });

      bgmModeButtons.forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.bgmMode === appSettings.bgmMode);
      });

      bgmSelects.forEach((sel) => {
        if (appSettings.bgmTrack && sel.value !== appSettings.bgmTrack) {
          sel.value = appSettings.bgmTrack;
        }
      });

      btnSoundList.forEach((btn) => {
        btn.setAttribute('aria-pressed', String(!appSettings.sound));
        btn.classList.toggle('is-muted', !appSettings.sound);
        const icon = btn.querySelector('.sound-state');
        if (icon) icon.textContent = appSettings.sound ? 'ON' : 'OFF';
      });

      btnBgmList.forEach((btn) => {
        btn.setAttribute('aria-pressed', String(!appSettings.bgmEnabled));
        btn.classList.toggle('is-muted', !appSettings.bgmEnabled);
        const stateEl = btn.querySelector('.bgm-state');
        if (stateEl) stateEl.textContent = appSettings.bgmEnabled ? 'ON' : 'OFF';
      });
    }

    // PWA & Fullscreen integration
    const pwa = new B3B.PWAController({
      onInstallReady: (ready) => {
        btnInstallList.forEach((btn) => {
          btn.hidden = !ready;
        });
      },
      onFullscreenChange: (active) => {
        btnFullscreenList.forEach((btn) => {
          btn.setAttribute('aria-pressed', String(active));
          btn.classList.toggle('is-active', active);
        });
        setTimeout(resizeBoard, 80);
      },
      onShowIOSGuide: () => {
        if (iosModal) {
          engine.pauseIfPlaying();
          iosModal.hidden = false;
        }
      }
    });
    pwa.init();

    // Show install/fullscreen hint button on iOS Safari non-standalone
    if (pwa.isIOS && !pwa.isStandalone) {
      btnInstallList.forEach((btn) => {
        btn.hidden = false;
      });
    }

    // Button actions
    btnPrimaryPlay.addEventListener('click', () => {
      if (engine.state === 'PAUSED') {
        engine.togglePause();
      } else {
        engine.startNewGame();
      }
      renderBoard();
      audio.unlock();
      bgm.startOrResume();
    });

    if (btnOverlaySettings) {
      btnOverlaySettings.addEventListener('click', () => {
        audio.unlock();
        if (settingsModal) settingsModal.hidden = false;
      });
    }

    btnPauseList.forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.unlock();
        bgm.startOrResume();
        if (engine.state === 'IDLE' || engine.state === 'GAMEOVER') {
          engine.startNewGame();
        } else {
          engine.togglePause();
        }
      });
    });

    btnSoundList.forEach((btn) => {
      btn.addEventListener('click', () => {
        appSettings.sound = !appSettings.sound;
        audio.setEnabled(appSettings.sound);
        if (appSettings.sound) audio.unlock();
        saveSettings(appSettings);
        syncSettingsUI();
      });
    });

    btnBgmList.forEach((btn) => {
      btn.addEventListener('click', () => {
        appSettings.bgmEnabled = !appSettings.bgmEnabled;
        bgm.setEnabled(appSettings.bgmEnabled, true);
        saveSettings(appSettings);
        syncSettingsUI();
      });
    });

    btnBgmNextList.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!appSettings.bgmEnabled) {
          appSettings.bgmEnabled = true;
          bgm.setEnabled(true, false);
        }
        if (appSettings.bgmMode === 'repeat') {
          const tracks = B3B.BGM_TRACKS || [];
          const curIdx = tracks.findIndex((t) => t.file === appSettings.bgmTrack);
          const nextIdx = tracks.length > 0 ? (curIdx + 1) % tracks.length : 0;
          if (tracks[nextIdx]) {
            appSettings.bgmTrack = tracks[nextIdx].file;
            bgm.setSelectedTrack(appSettings.bgmTrack, true);
          }
        } else {
          bgm.playNextRandom();
        }
        saveSettings(appSettings);
        syncSettingsUI();
      });
    });

    bgmModeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.bgmMode;
        if (mode !== 'random' && mode !== 'repeat') return;
        appSettings.bgmMode = mode;
        if (!appSettings.bgmEnabled) {
          appSettings.bgmEnabled = true;
          bgm.setEnabled(true, false);
        }
        bgm.setMode(mode, true);
        saveSettings(appSettings);
        syncSettingsUI();
      });
    });

    bgmSelects.forEach((sel) => {
      sel.addEventListener('change', () => {
        appSettings.bgmTrack = sel.value;
        appSettings.bgmMode = 'repeat';
        if (!appSettings.bgmEnabled) {
          appSettings.bgmEnabled = true;
          bgm.setEnabled(true, false);
        }
        bgm.setMode('repeat', false);
        bgm.setSelectedTrack(appSettings.bgmTrack, true);
        saveSettings(appSettings);
        syncSettingsUI();
      });
    });

    function handleReturnToTitle() {
      bgm.stop();
      engine.returnToTitle();
      if (settingsModal) settingsModal.hidden = true;
      syncSettingsUI();
    }

    if (btnReturnTitle) {
      btnReturnTitle.addEventListener('click', handleReturnToTitle);
    }
    btnReturnTitleList.forEach((btn) => {
      btn.addEventListener('click', handleReturnToTitle);
    });

    btnBgmStopList.forEach((btn) => {
      btn.addEventListener('click', () => {
        bgm.stop();
      });
    });

    btnFullscreenList.forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.unlock();
        pwa.toggleFullscreen();
      });
    });

    btnInstallList.forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.unlock();
        pwa.promptInstall();
      });
    });

    btnSettingsList.forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.unlock();
        engine.pauseIfPlaying();
        if (settingsModal) settingsModal.hidden = false;
      });
    });

    // Modal close buttons & backdrop click
    document.querySelectorAll('[data-close-modal]').forEach((el) => {
      el.addEventListener('click', () => {
        const target = document.getElementById(el.dataset.closeModal);
        if (target) target.hidden = true;
      });
    });

    [settingsModal, iosModal].forEach((modal) => {
      if (!modal) return;
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.hidden = true;
        }
      });
    });

    // Settings bindings
    if (toggleBgmInput) {
      toggleBgmInput.addEventListener('change', () => {
        appSettings.bgmEnabled = toggleBgmInput.checked;
        bgm.setEnabled(appSettings.bgmEnabled, true);
        saveSettings(appSettings);
        syncSettingsUI();
      });
    }
    if (bgmVolumeInput) {
      bgmVolumeInput.addEventListener('input', () => {
        const vol = Math.max(0, Math.min(1, Number(bgmVolumeInput.value) / 100));
        appSettings.bgmVolume = vol;
        bgm.setVolume(vol);
        saveSettings(appSettings);
      });
    }
    if (toggleSoundInput) {
      toggleSoundInput.addEventListener('change', () => {
        appSettings.sound = toggleSoundInput.checked;
        audio.setEnabled(appSettings.sound);
        if (appSettings.sound) audio.unlock();
        saveSettings(appSettings);
        syncSettingsUI();
      });
    }
    if (toggleGhostInput) {
      toggleGhostInput.addEventListener('change', () => {
        appSettings.ghost = toggleGhostInput.checked;
        engine.settings.ghost = appSettings.ghost;
        saveSettings(appSettings);
      });
    }
    if (toggleMagicInput) {
      toggleMagicInput.addEventListener('change', () => {
        appSettings.magicEnabled = toggleMagicInput.checked;
        engine.settings.magicEnabled = appSettings.magicEnabled;
        saveSettings(appSettings);
      });
    }
    if (toggleLandPadInput) {
      toggleLandPadInput.addEventListener('change', () => {
        appSettings.showPadInLandscape = toggleLandPadInput.checked;
        saveSettings(appSettings);
        syncSettingsUI();
        setTimeout(resizeBoard, 40);
      });
    }
    presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.preset;
        if (!B3B.PRESETS[p]) return;
        appSettings.preset = p;
        engine.settings.preset = p;
        saveSettings(appSettings);
        syncSettingsUI();
        syncHUD();
      });
    });

    // Keyboard controls with smooth DAS/ARR
    const keysHeld = new Set();
    let dasDir = 0;
    let dasTimer = 0;
    let arrTimer = 0;

    const isLeftKey = (code) => code === 'ArrowLeft' || code === 'KeyA' || code === 'KeyJ';
    const isRightKey = (code) => code === 'ArrowRight' || code === 'KeyD' || code === 'KeyL';
    const isSoftDropKey = (code) => code === 'ArrowDown' || code === 'KeyS' || code === 'KeyK';
    const isRotateKey = (code) => code === 'ArrowUp' || code === 'KeyW' || code === 'KeyX' || code === 'KeyI';

    document.addEventListener('keydown', (e) => {
      if (settingsModal && !settingsModal.hidden) {
        if (e.key === 'Escape') settingsModal.hidden = true;
        return;
      }
      if (iosModal && !iosModal.hidden) {
        if (e.key === 'Escape') iosModal.hidden = true;
        return;
      }

      const code = e.code;
      const handledCodes = [
        'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp',
        'Space', 'KeyA', 'KeyD', 'KeyS', 'KeyW', 'KeyX', 'KeyZ',
        'KeyJ', 'KeyL', 'KeyK', 'KeyI', 'KeyF', 'KeyG',
        'KeyP', 'Escape', 'KeyM', 'Enter'
      ];
      if (handledCodes.includes(code)) {
        e.preventDefault();
      }
      audio.unlock();
      bgm.unlockAndMaybeStart();

      if (code === 'KeyP' || code === 'Escape') {
        engine.togglePause();
        return;
      }
      if (code === 'KeyM') {
        appSettings.sound = !appSettings.sound;
        audio.setEnabled(appSettings.sound);
        saveSettings(appSettings);
        syncSettingsUI();
        return;
      }
      if (code === 'Enter' && (engine.state === 'IDLE' || engine.state === 'GAMEOVER')) {
        bgm.startOrResume();
        engine.startNewGame();
        return;
      }
      if (engine.state === 'IDLE' && code === 'Space') {
        bgm.startOrResume();
        engine.startNewGame();
        return;
      }

      if (e.repeat) return;
      keysHeld.add(code);

      if (isLeftKey(code)) {
        dasDir = -1;
        dasTimer = 0;
        arrTimer = 0;
        engine.moveHorizontal(-1);
      } else if (isRightKey(code)) {
        dasDir = 1;
        dasTimer = 0;
        arrTimer = 0;
        engine.moveHorizontal(1);
      } else if (isRotateKey(code)) {
        engine.cycleGems(false);
      } else if (code === 'KeyZ') {
        engine.cycleGems(true);
      } else if (code === 'KeyG') {
        engine.rotateBlock(true);
      } else if (code === 'KeyF') {
        engine.rotateBlock(false);
      } else if (isSoftDropKey(code)) {
        engine.setSoftDrop(true);
      } else if (code === 'Space') {
        engine.hardDrop();
      }
    });

    document.addEventListener('keyup', (e) => {
      const code = e.code;
      keysHeld.delete(code);
      if (isSoftDropKey(code)) {
        if (!keysHeld.has('ArrowDown') && !keysHeld.has('KeyS') && !keysHeld.has('KeyK')) {
          engine.setSoftDrop(false);
        }
      }
      if (isLeftKey(code) || isRightKey(code)) {
        const leftHeld = keysHeld.has('ArrowLeft') || keysHeld.has('KeyA') || keysHeld.has('KeyJ');
        const rightHeld = keysHeld.has('ArrowRight') || keysHeld.has('KeyD') || keysHeld.has('KeyL');
        if (leftHeld && !rightHeld) {
          dasDir = -1;
          dasTimer = 0;
        } else if (rightHeld && !leftHeld) {
          dasDir = 1;
          dasTimer = 0;
        } else {
          dasDir = 0;
        }
      }
    });

    // Virtual Touch Buttons (clean touchstart/touchend + mouse fallback, no setPointerCapture stalls)
    function bindHoldButton(selector, onPress, onRepeat, onRelease) {
      document.querySelectorAll(selector).forEach((btn) => {
        let timer = null;
        let interval = null;
        let activeTouch = false;

        const clearTimers = () => {
          if (timer) clearTimeout(timer);
          if (interval) clearInterval(interval);
          timer = null;
          interval = null;
          btn.classList.remove('is-pressed');
        };

        const press = (e) => {
          e.preventDefault();
          e.stopPropagation();
          audio.unlock();
          btn.classList.add('is-pressed');
          onPress();
          if (onRepeat) {
            clearTimers();
            btn.classList.add('is-pressed');
            timer = setTimeout(() => {
              interval = setInterval(onRepeat, 62);
            }, 170);
          }
        };

        const release = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          clearTimers();
          if (onRelease) onRelease();
        };

        btn.addEventListener('touchstart', (e) => {
          activeTouch = true;
          press(e);
        }, { passive: false });
        btn.addEventListener('touchend', release, { passive: false });
        btn.addEventListener('touchcancel', release, { passive: false });

        btn.addEventListener('mousedown', (e) => {
          if (activeTouch) {
            activeTouch = false;
            return;
          }
          press(e);
        });
        btn.addEventListener('mouseup', release);
        btn.addEventListener('mouseleave', () => {
          if (btn.classList.contains('is-pressed')) release();
        });
      });
    }

    bindHoldButton('[data-pad="left"]', () => engine.moveHorizontal(-1), () => engine.moveHorizontal(-1));
    bindHoldButton('[data-pad="right"]', () => engine.moveHorizontal(1), () => engine.moveHorizontal(1));
    bindHoldButton('[data-pad="swap"]', () => engine.cycleGems(false));
    bindHoldButton('[data-pad="rotate-cw"]', () => engine.rotateBlock(true));
    bindHoldButton('[data-pad="harddrop"]', () => engine.hardDrop());
    bindHoldButton(
      '[data-pad="down"]',
      () => engine.setSoftDrop(true),
      null,
      () => engine.setSoftDrop(false)
    );

    // Direct Intuitive Touch & Mouse Gestures on Playfield Canvas
    let gestureState = null;

    function beginGesture(clientX, clientY) {
      if (engine.state !== 'FALLING') return;
      audio.unlock();
      gestureState = {
        startX: clientX,
        startY: clientY,
        lastStepX: clientX,
        startTime: performance.now(),
        movedHoriz: false,
        movedDown: false,
        rotatedUp: false,
        softActive: false
      };
    }

    function moveGesture(clientX, clientY) {
      if (!gestureState) return;
      const dxStep = clientX - gestureState.lastStepX;
      const totalDy = clientY - gestureState.startY;
      const stepThreshold = Math.max(18, cellSize * 0.72);

      if (Math.abs(dxStep) >= stepThreshold) {
        const steps = Math.trunc(dxStep / stepThreshold);
        const dir = steps > 0 ? 1 : -1;
        for (let i = 0; i < Math.abs(steps); i++) {
          engine.moveHorizontal(dir);
        }
        gestureState.lastStepX += steps * stepThreshold;
        gestureState.movedHoriz = true;
      }

      if (!gestureState.rotatedUp && !gestureState.movedHoriz && totalDy <= -Math.max(24, cellSize * 0.72)) {
        gestureState.rotatedUp = true;
        engine.rotateBlock(true);
      }

      if (totalDy >= cellSize * 0.85 && !gestureState.movedHoriz && !gestureState.rotatedUp) {
        gestureState.movedDown = true;
        if (!gestureState.softActive) {
          gestureState.softActive = true;
          engine.setSoftDrop(true);
        }
      }
    }

    function endGesture(clientX, clientY) {
      if (!gestureState) return;
      const elapsed = performance.now() - gestureState.startTime;
      const totalDx = clientX - gestureState.startX;
      const totalDy = clientY - gestureState.startY;

      if (gestureState.softActive) {
        engine.setSoftDrop(false);
      }

      const isQuickFlickDown =
        !gestureState.rotatedUp &&
        totalDy > Math.max(38, cellSize * 1.15) &&
        elapsed < 220 &&
        Math.abs(totalDx) < cellSize * 1.2;
      const isTap =
        !gestureState.movedHoriz &&
        !gestureState.movedDown &&
        !gestureState.rotatedUp &&
        Math.hypot(totalDx, totalDy) < 14 &&
        elapsed < 320;

      if (isQuickFlickDown) {
        engine.hardDrop();
      } else if (isTap) {
        const rect = boardCanvas.getBoundingClientRect();
        const relY = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
        if (relY < 1 / 3) {
          engine.rotateBlock(true); // Top 1/3: Clockwise 90°
        } else if (relY > 2 / 3) {
          engine.rotateBlock(false); // Bottom 1/3: Counter-Clockwise 90°
        } else {
          engine.cycleGems(false); // Middle 1/3: Swap gems
        }
      }

      gestureState = null;
    }

    boardCanvas.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || engine.state !== 'FALLING') return;
      e.preventDefault();
      beginGesture(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    boardCanvas.addEventListener('touchmove', (e) => {
      if (!gestureState || e.touches.length !== 1) return;
      e.preventDefault();
      moveGesture(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    boardCanvas.addEventListener('touchend', (e) => {
      if (!gestureState) return;
      e.preventDefault();
      const t = (e.changedTouches && e.changedTouches[0]) || null;
      endGesture(t ? t.clientX : gestureState.startX, t ? t.clientY : gestureState.startY);
    }, { passive: false });

    boardCanvas.addEventListener('touchcancel', () => {
      if (gestureState && gestureState.softActive) {
        engine.setSoftDrop(false);
      }
      gestureState = null;
    });

    boardCanvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      beginGesture(e.clientX, e.clientY);
    });
    global.addEventListener('mousemove', (e) => {
      if (gestureState) moveGesture(e.clientX, e.clientY);
    });
    global.addEventListener('mouseup', (e) => {
      if (gestureState) endGesture(e.clientX, e.clientY);
    });

    // Board rendering
    function renderBoard() {
      boardCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      boardCtx.clearRect(0, 0, boardWidth, boardHeight);

      boardCtx.save();
      if (engine.boardShake > 0) {
        const amp = engine.boardShake * 3.5;
        const sx = (Math.random() - 0.5) * amp;
        const sy = Math.random() * amp;
        boardCtx.translate(sx, sy);
      }

      // Cached velvet background & subtle grid (single drawImage per frame)
      const bg = ensureBgCache();
      boardCtx.drawImage(bg, 0, 0, boardWidth, boardHeight);

      // Spawn warning highlight at top row of spawn column (col 2)
      const dangerOccupied = engine.board[B3B.BUFFER_ROWS + 1][2] !== null;
      if (dangerOccupied) {
        const pulse = 0.25 + 0.2 * Math.sin(engine.timeSec * 8);
        boardCtx.fillStyle = `rgba(255, 70, 110, ${pulse})`;
        boardCtx.fillRect(2 * cellSize, 0, cellSize, cellSize);
      }

      // Hard drop light trails
      for (const tr of engine.trails) {
        const x = tr.col * cellSize;
        const w = (tr.colSpan || 1) * cellSize;
        const y1 = Math.max(0, (tr.fromY - B3B.BUFFER_ROWS) * cellSize);
        const y2 = (tr.toY - B3B.BUFFER_ROWS + 1) * cellSize;
        const grad = boardCtx.createLinearGradient(x, y1, x, y2);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        grad.addColorStop(1, tr.isMagic ? `rgba(255, 230, 140, ${0.45 * tr.life})` : `rgba(140, 220, 255, ${0.35 * tr.life})`);
        boardCtx.fillStyle = grad;
        boardCtx.fillRect(x + 2, y1, Math.max(2, w - 4), Math.max(0, y2 - y1));
      }

      // Build map of falling gravity pieces & matched cells
      const fallingDestinations = new Set();
      if (engine.state === 'GRAVITY') {
        for (const fp of engine.fallingPieces) {
          fallingDestinations.add(`${fp.toR},${fp.c}`);
        }
      }

      const matchedMap = new Map();
      if (engine.state === 'FLASHING') {
        for (const m of engine.matchedCells) {
          matchedMap.set(`${m.r},${m.c}`, m);
        }
      }

      // Settled jewels on board
      for (let r = B3B.BUFFER_ROWS; r < B3B.ROWS; r++) {
        for (let c = 0; c < B3B.COLS; c++) {
          const id = engine.board[r][c];
          if (id === null) continue;
          if (fallingDestinations.has(`${r},${c}`)) continue;

          const x = c * cellSize;
          const y = (r - B3B.BUFFER_ROWS) * cellSize;

          if (matchedMap.has(`${r},${c}`)) {
            const prog = engine.flashTimer / engine.flashDuration;
            const pulse = 0.5 + 0.5 * Math.sin(prog * Math.PI * 6);
            const scale = 1 + 0.12 * Math.sin(prog * Math.PI);
            renderer.drawJewel(boardCtx, id, x, y, cellSize, engine.timeSec, {
              scale,
              flash: pulse * 0.78,
              alpha: 1 - prog * 0.35
            });
          } else {
            renderer.drawJewel(boardCtx, id, x, y, cellSize, engine.timeSec);
          }
        }
      }

      // Animated gravity cascade pieces
      if (engine.state === 'GRAVITY') {
        const t = Math.min(1, engine.gravityProgress);
        const eased = t * t * (3 - 2 * t);
        for (const fp of engine.fallingPieces) {
          const curR = fp.fromR + (fp.toR - fp.fromR) * eased;
          if (curR >= B3B.BUFFER_ROWS - 1) {
            const x = fp.c * cellSize;
            const y = (curR - B3B.BUFFER_ROWS) * cellSize;
            renderer.drawJewel(boardCtx, fp.id, x, y, cellSize, engine.timeSec);
          }
        }
      }

      // Ghost preview & Active triplet
      if (engine.active && (engine.state === 'FALLING' || engine.state === 'PAUSED')) {
        const act = engine.active;
        const ghostPivot = engine.getGhostPivotRow();
        if (engine.settings.ghost && ghostPivot !== null && ghostPivot > act.y + 0.3) {
          const ghostCells = engine.getActiveCells(act.col, ghostPivot, act.ori, act.gems);
          for (const gc of ghostCells) {
            if (gc.r >= B3B.BUFFER_ROWS && gc.c >= 0 && gc.c < B3B.COLS) {
              renderer.drawJewel(
                boardCtx,
                gc.id,
                gc.c * cellSize,
                (gc.r - B3B.BUFFER_ROWS) * cellSize,
                cellSize,
                engine.timeSec,
                { ghost: true }
              );
            }
          }
        }

        // Active 3-gem bar (supports vertical and horizontal orientations)
        const activeCells = engine.getActiveCells(act.col, act.y, act.ori, act.gems);
        let minCol = B3B.COLS - 1;
        let maxCol = 0;
        for (const ac of activeCells) {
          minCol = Math.min(minCol, ac.c);
          maxCol = Math.max(maxCol, ac.c);
          if (ac.r > B3B.BUFFER_ROWS - 1.2) {
            const x = ac.c * cellSize;
            const y = (ac.r - B3B.BUFFER_ROWS) * cellSize;
            const rotScale = act.rotateAnim > 0 ? 1 + 0.08 * Math.sin(act.rotateAnim * Math.PI) : 1;
            renderer.drawJewel(boardCtx, ac.id, x, y, cellSize, engine.timeSec, {
              scale: rotScale
            });
          }
        }

        // Subtle focus column bracket on active span
        const spanCols = Math.max(1, maxCol - minCol + 1);
        boardCtx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        boardCtx.lineWidth = 1;
        boardCtx.strokeRect(minCol * cellSize + 1, 1, spanCols * cellSize - 2, boardHeight - 2);
      }

      // Crystal shard particles
      for (const p of engine.particles) {
        const px = p.x * cellSize;
        const py = (p.y - B3B.BUFFER_ROWS) * cellSize;
        const sz = p.size * cellSize;
        boardCtx.save();
        boardCtx.globalAlpha = Math.max(0, Math.min(1, p.life));
        boardCtx.translate(px, py);
        boardCtx.rotate(p.rot);
        boardCtx.fillStyle = p.color;
        boardCtx.beginPath();
        boardCtx.moveTo(0, -sz);
        boardCtx.lineTo(sz * 0.75, 0);
        boardCtx.lineTo(0, sz);
        boardCtx.lineTo(-sz * 0.75, 0);
        boardCtx.closePath();
        boardCtx.fill();
        boardCtx.restore();
      }

      // Floating score & chain popups
      for (const pop of engine.popups) {
        const px = Math.min(boardWidth - 36, Math.max(36, pop.x * cellSize));
        const py = Math.max(24, (pop.y - B3B.BUFFER_ROWS) * cellSize);
        boardCtx.save();
        boardCtx.globalAlpha = Math.max(0, Math.min(1, pop.life * 1.2));
        boardCtx.textAlign = 'center';
        boardCtx.textBaseline = 'middle';
        const fontSize = Math.max(13, Math.round(cellSize * 0.44));
        boardCtx.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
        boardCtx.lineWidth = 4;
        boardCtx.strokeStyle = 'rgba(9, 11, 26, 0.88)';
        boardCtx.strokeText(pop.text, px, py);
        boardCtx.fillStyle = pop.color || '#ffffff';
        boardCtx.fillText(pop.text, px, py);

        if (pop.sub) {
          const subSize = Math.max(10, Math.round(cellSize * 0.3));
          boardCtx.font = `700 ${subSize}px system-ui, -apple-system, sans-serif`;
          boardCtx.strokeText(pop.sub, px, py + fontSize * 0.85);
          boardCtx.fillStyle = '#d7e6ff';
          boardCtx.fillText(pop.sub, px, py + fontSize * 0.85);
        }
        boardCtx.restore();
      }

      // Board-wide prism flash
      if (engine.boardFlash > 0) {
        boardCtx.fillStyle = `rgba(255, 255, 255, ${engine.boardFlash * 0.25})`;
        boardCtx.fillRect(0, 0, boardWidth, boardHeight);
      }

      boardCtx.restore();
    }

    // Main animation loop
    let lastTime = performance.now();
    let hudScoreCache = -1;

    function tick(now) {
      try {
        const rawDt = (now - lastTime) / 1000;
        lastTime = now;
        const dt = Number.isFinite(rawDt) ? Math.min(0.05, Math.max(0, rawDt)) : 0.016;

        // Keyboard DAS/ARR horizontal repeat
        if (dasDir !== 0 && engine.state === 'FALLING') {
          dasTimer += dt;
          if (dasTimer >= 0.15) {
            arrTimer += dt;
            while (arrTimer >= 0.05) {
              engine.moveHorizontal(dasDir);
              arrTimer -= 0.05;
            }
          }
        }

        engine.update(dt);

        if (engine.score !== hudScoreCache) {
          hudScoreCache = engine.score;
          scoreEls.forEach((el) => {
            el.textContent = engine.score.toLocaleString();
          });
          bestEls.forEach((el) => {
            el.textContent = engine.bestScore.toLocaleString();
          });
        }

        renderBoard();
        if (engine.nextIsMagic) {
          drawNextPreviews();
        }
      } catch (_) {
        // Guard against transient device/canvas errors so loop never freezes
      } finally {
        global.requestAnimationFrame(tick);
      }
    }

    syncSettingsUI();
    syncHUD();
    resizeBoard();
    checkRotateGuard();
    global.requestAnimationFrame(tick);
  });
})(window);
