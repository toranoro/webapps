/**
 * main.js - レンダリングエンジン、ゲームループ、タイトル画面、美麗PAUSE、BGMジュークボックス
 */
(function() {
    'use strict';

    // ゲーム本体およびサブシステム
    const game = new TetrisGame(10, 20);
    const sound = window.soundEngine;
    const effect = window.effectEngine;
    const input = new InputHandler(game);

    // キャンバス要素
    const canvas = document.getElementById('tetris-canvas');
    const ctx = canvas.getContext('2d');
    const holdCanvas = document.getElementById('hold-canvas');
    const holdCtx = holdCanvas.getContext('2d');
    const nextCanvas = document.getElementById('next-canvas');
    const nextCtx = nextCanvas.getContext('2d');

    // UI要素
    const scoreVal = document.getElementById('score-val');
    const linesVal = document.getElementById('lines-val');
    const levelVal = document.getElementById('level-val');
    const gameOverModal = document.getElementById('game-over-modal');
    const finalScore = document.getElementById('final-score');
    const restartBtn = document.getElementById('restart-btn');
    const pauseBtn = document.getElementById('btn-pause');
    const muteBtn = document.getElementById('btn-mute');
    const bgmBtn = document.getElementById('btn-bgm');
    const fullscreenBtn = document.getElementById('btn-fullscreen');
    const installBtn = document.getElementById('btn-install');

    // ★ PAUSE モーダル要素
    const pauseModal = document.getElementById('pause-modal');
    const pauseTrackName = document.getElementById('pause-track-name');
    const pauseBtnResume = document.getElementById('pause-btn-resume');
    const pauseBtnRestart = document.getElementById('pause-btn-restart');
    const pauseBtnTitle = document.getElementById('pause-btn-title');
    const pauseBtnNext = document.getElementById('pause-btn-next');
    const pauseBtnMode = document.getElementById('pause-btn-mode');

    // ★ タイトル画面要素
    const titleModal = document.getElementById('title-modal');
    const titleBtnStart = document.getElementById('title-btn-start');
    const btnShowTitle = document.getElementById('btn-show-title');
    const bgmSelectDropdown = document.getElementById('bgm-select-dropdown');
    const titleBtnModeToggle = document.getElementById('title-btn-mode-toggle');
    const bgmFolderInput = document.getElementById('bgm-folder-input');
    const sliderBgm = document.getElementById('slider-bgm');
    const sliderBgmVal = document.getElementById('slider-bgm-val');
    const sliderSfx = document.getElementById('slider-sfx');
    const sliderSfxVal = document.getElementById('slider-sfx-val');

    // Now Playing 表示
    const headerNowPlaying = document.getElementById('header-now-playing');
    const headerTrackName = document.getElementById('header-track-name');

    let lastTime = performance.now();
    let deferredPrompt = null;
    window.isTitleScreenActive = true; // 起動時はタイトル画面

    // 高DPI Retina対応キャンバスリサイズ
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        const holdRect = holdCanvas.getBoundingClientRect();
        if (holdRect.width > 0 && holdRect.height > 0) {
            holdCanvas.width = holdRect.width * dpr;
            holdCanvas.height = holdRect.height * dpr;
            holdCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        const nextRect = nextCanvas.getBoundingClientRect();
        if (nextRect.width > 0 && nextRect.height > 0) {
            nextCanvas.width = nextRect.width * dpr;
            nextCanvas.height = nextRect.height * dpr;
            nextCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    }

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => {
        setTimeout(resizeCanvas, 200);
        setTimeout(resizeCanvas, 500);
    });

    // 角丸矩形描画ヘルパー
    function drawRoundedRect(c, x, y, width, height, radius) {
        c.beginPath();
        c.moveTo(x + radius, y);
        c.lineTo(x + width - radius, y);
        c.quadraticCurveTo(x + width, y, x + width, y + radius);
        c.lineTo(x + width, y + height - radius);
        c.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        c.lineTo(x + radius, y + height);
        c.quadraticCurveTo(x, y + height, x, y + height - radius);
        c.lineTo(x, y + radius);
        c.quadraticCurveTo(x, y, x + radius, y);
        c.closePath();
    }

    /**
     * 美しいクリスタルブロックの描画
     */
    function renderCrystalBlock(targetCtx, x, y, size, theme, isGhost = false, alpha = 1.0) {
        if (!theme) return;
        targetCtx.save();
        targetCtx.globalAlpha = isGhost ? 0.28 : alpha;

        const pad = Math.max(1.5, size * 0.06);
        const bx = x + pad;
        const by = y + pad;
        const bs = size - pad * 2;
        const radius = Math.max(3, bs * 0.22);

        if (isGhost) {
            targetCtx.strokeStyle = theme.primary;
            targetCtx.shadowColor = theme.glow;
            targetCtx.shadowBlur = 8;
            targetCtx.lineWidth = 1.5;
            drawRoundedRect(targetCtx, bx, by, bs, bs, radius);
            targetCtx.stroke();

            const grad = targetCtx.createLinearGradient(bx, by, bx + bs, by + bs);
            grad.addColorStop(0, theme.primary);
            grad.addColorStop(1, 'transparent');
            targetCtx.fillStyle = grad;
            targetCtx.globalAlpha = 0.08;
            targetCtx.fill();
            targetCtx.restore();
            return;
        }

        // 1. 外側のネオングロー
        targetCtx.shadowColor = theme.glow;
        targetCtx.shadowBlur = 12;

        // 2. メインの宝石グラデーション
        const grad = targetCtx.createLinearGradient(bx, by, bx, by + bs);
        grad.addColorStop(0, theme.light);
        grad.addColorStop(0.2, theme.primary);
        grad.addColorStop(0.85, theme.secondary);
        grad.addColorStop(1, '#050510');

        drawRoundedRect(targetCtx, bx, by, bs, bs, radius);
        targetCtx.fillStyle = grad;
        targetCtx.fill();

        // 3. クリスタルの斜め光沢ファセット
        targetCtx.shadowBlur = 0;
        targetCtx.save();
        targetCtx.clip();

        const facetGrad = targetCtx.createLinearGradient(bx, by, bx + bs * 0.7, by + bs * 0.7);
        facetGrad.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
        facetGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.2)');
        facetGrad.addColorStop(0.6, 'transparent');

        targetCtx.fillStyle = facetGrad;
        targetCtx.beginPath();
        targetCtx.moveTo(bx, by);
        targetCtx.lineTo(bx + bs * 0.85, by);
        targetCtx.lineTo(bx, by + bs * 0.85);
        targetCtx.closePath();
        targetCtx.fill();

        targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        targetCtx.lineWidth = 1.2;
        drawRoundedRect(targetCtx, bx + 1, by + 1, bs - 2, bs - 2, radius - 1);
        targetCtx.stroke();

        targetCtx.restore();
        targetCtx.restore();
    }

    // メインボード描画
    function renderBoard() {
        const rect = canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const blockSize = width / game.cols;

        ctx.clearRect(0, 0, width, height);

        ctx.save();
        ctx.translate(effect.shakeOffsetX, effect.shakeOffsetY);

        // ネオングリッド線
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        for (let c = 0; c <= game.cols; c++) {
            ctx.beginPath();
            ctx.moveTo(c * blockSize, 0);
            ctx.lineTo(c * blockSize, height);
            ctx.stroke();
        }
        for (let r = 0; r <= game.rows; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * blockSize);
            ctx.lineTo(width, r * blockSize);
            ctx.stroke();
        }

        // 固定済みブロック描画
        for (let r = game.hiddenRows; r < game.totalRows; r++) {
            for (let c = 0; c < game.cols; c++) {
                const theme = game.grid[r][c];
                if (theme) {
                    const x = c * blockSize;
                    const y = (r - game.hiddenRows) * blockSize;
                    renderCrystalBlock(ctx, x, y, blockSize, theme);
                }
            }
        }

        // ゴーストブロック描画
        if (game.ghostPiece && !game.gameOver && !window.isTitleScreenActive) {
            const p = game.ghostPiece;
            for (let r = 0; r < p.shape.length; r++) {
                for (let c = 0; c < p.shape[r].length; c++) {
                    if (p.shape[r][c]) {
                        const gy = p.y + r - game.hiddenRows;
                        if (gy >= 0) {
                            renderCrystalBlock(ctx, (p.x + c) * blockSize, gy * blockSize, blockSize, p.theme, true);
                        }
                    }
                }
            }
        }

        // 操作中ブロック描画
        if (game.currentPiece && !game.gameOver && !window.isTitleScreenActive) {
            const p = game.currentPiece;
            for (let r = 0; r < p.shape.length; r++) {
                for (let c = 0; c < p.shape[r].length; c++) {
                    if (p.shape[r][c]) {
                        const gy = p.y + r - game.hiddenRows;
                        if (gy >= 0) {
                            renderCrystalBlock(ctx, (p.x + c) * blockSize, gy * blockSize, blockSize, p.theme, false);
                        }
                    }
                }
            }
        }

        effect.render(ctx);
        ctx.restore();
    }

    function renderPreview(cCtx, pieceType, isGrayed = false) {
        const cRect = cCtx.canvas.getBoundingClientRect();
        cCtx.clearRect(0, 0, cRect.width, cRect.height);
        if (!pieceType || cRect.width === 0 || cRect.height === 0) return;

        const shape = PIECE_SHAPES[pieceType];
        const theme = PIECE_THEMES[pieceType];
        const rows = shape.length;
        const cols = shape[0].length;

        const pad = Math.min(8, Math.min(cRect.width, cRect.height) * 0.12);
        const maxDim = Math.max(rows, cols);
        const blockSize = Math.min((cRect.width - pad * 2) / maxDim, (cRect.height - pad * 2) / maxDim);

        const totalW = cols * blockSize;
        const totalH = rows * blockSize;
        const startX = (cRect.width - totalW) / 2;
        const startY = (cRect.height - totalH) / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (shape[r][c]) {
                    renderCrystalBlock(
                        cCtx,
                        startX + c * blockSize,
                        startY + r * blockSize,
                        blockSize,
                        theme,
                        false,
                        isGrayed ? 0.35 : 1.0
                    );
                }
            }
        }
    }

    function renderNextQueue() {
        const rect = nextCanvas.getBoundingClientRect();
        nextCtx.clearRect(0, 0, rect.width, rect.height);
        if (rect.width === 0 || rect.height === 0) return;

        const count = 3;
        const isHorizontal = rect.width > rect.height; // スマホ縦向き時は横並び3つ表示
        const slotWidth = isHorizontal ? rect.width / count : rect.width;
        const slotHeight = isHorizontal ? rect.height : rect.height / count;

        for (let i = 0; i < count; i++) {
            const pType = game.nextPieces[i];
            if (!pType) continue;

            const shape = PIECE_SHAPES[pType];
            const theme = PIECE_THEMES[pType];
            const rows = shape.length;
            const cols = shape[0].length;

            const pad = Math.min(6, Math.min(slotWidth, slotHeight) * 0.12);
            const maxDim = Math.max(rows, cols);
            const blockSize = Math.min((slotWidth - pad * 2) / maxDim, (slotHeight - pad * 2) / maxDim);

            const totalW = cols * blockSize;
            const totalH = rows * blockSize;
            const startX = (isHorizontal ? i * slotWidth : 0) + (slotWidth - totalW) / 2;
            const startY = (isHorizontal ? 0 : i * slotHeight) + (slotHeight - totalH) / 2;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (shape[r][c]) {
                        renderCrystalBlock(
                            nextCtx,
                            startX + c * blockSize,
                            startY + r * blockSize,
                            blockSize,
                            theme,
                            false,
                            i === 0 ? 1.0 : 0.65
                        );
                    }
                }
            }
        }
    }

    // =========================================================
    // ゲームイベント連携
    // =========================================================
    game.onMove = () => sound.playMove(); // ★チャッチャッチャッ音
    game.onRotate = () => sound.playRotate();
    game.onLock = () => sound.playLock();
    game.onHardDrop = (p) => {
        sound.playHardDrop();
        const rect = canvas.getBoundingClientRect();
        const bSize = rect.width / game.cols;
        const dropX = p.x * bSize;
        const dropY = (p.y - game.hiddenRows + p.shape.length) * bSize;
        effect.createHardDropEffect(dropX, dropY, p.shape[0].length * bSize, p.theme.primary);
        effect.triggerShake(5);
    };

    game.onHold = () => sound.playHold();

    game.onLineClear = (indices, lineCount, combo) => {
        sound.playLineClear(lineCount, combo);
        const rect = canvas.getBoundingClientRect();
        const bSize = rect.width / game.cols;

        indices.forEach(idx => {
            const yCoord = (idx - game.hiddenRows) * bSize;
            effect.createLineClearParticles(yCoord, bSize, rect.width, '#67e8f9');
        });

        const shakeMag = lineCount === 4 ? 14 : lineCount * 3.5;
        effect.triggerShake(shakeMag);

        const titles = ['', 'SINGLE!', 'DOUBLE!!', 'TRIPLE!!!', '★ TETRIS ★'];
        const text = titles[lineCount] || `${lineCount} LINES!`;
        const color = lineCount === 4 ? '#facc15' : '#38bdf8';
        effect.addFloatingText(text, rect.width / 2, rect.height * 0.45, color, lineCount === 4 ? 32 : 24);

        if (combo > 0) {
            setTimeout(() => {
                effect.addFloatingText(`COMBO x${combo}`, rect.width / 2, rect.height * 0.52, '#f472b6', 22);
            }, 120);
        }
    };

    game.onLevelUp = (lvl) => {
        sound.playLevelUp();
        const rect = canvas.getBoundingClientRect();
        effect.addFloatingText(`LEVEL ${lvl}!`, rect.width / 2, rect.height * 0.35, '#a855f7', 28);
    };

    game.onGameOver = () => {
        sound.playGameOver();
        finalScore.textContent = game.score.toLocaleString();
        gameOverModal.classList.remove('hidden');
    };

    // =========================================================
    // ★ タイトル画面 & ゲーム開始制御
    // =========================================================
    function startGameFromTitle() {
        window.isTitleScreenActive = false;
        titleModal.classList.add('hidden');
        pauseModal.classList.add('hidden');
        gameOverModal.classList.add('hidden');

        sound.init();
        sound.resume();

        // 選択されたBGMまたはランダム曲を再生
        const selectedIndex = parseInt(bgmSelectDropdown.value, 10);
        if (selectedIndex >= 0) {
            sound.playBgmTrack(selectedIndex);
        } else {
            sound.playRandomBgm();
        }

        game.init();
        resizeCanvas();
    }
    window.startGameFromTitle = startGameFromTitle;

    function showTitleScreen() {
        window.isTitleScreenActive = true;
        titleModal.classList.remove('hidden');
        pauseModal.classList.add('hidden');
        gameOverModal.classList.add('hidden');
    }

    titleBtnStart.addEventListener('click', startGameFromTitle);
    btnShowTitle.addEventListener('click', showTitleScreen);

    // =========================================================
    // ★ 美麗な PAUSE 制御 (ESC / Pキー / ⏸ボタン)
    // =========================================================
    function togglePauseGame() {
        if (window.isTitleScreenActive || game.gameOver) return;

        game.paused = !game.paused;
        if (game.paused) {
            pauseModal.classList.remove('hidden');
            pauseBtn.textContent = '▶';
            updatePauseTrackDisplay();
        } else {
            pauseModal.classList.add('hidden');
            pauseBtn.textContent = '⏸';
        }
    }
    window.togglePauseGame = togglePauseGame;

    function updatePauseTrackDisplay() {
        const cur = sound.getCurrentTrack();
        pauseTrackName.textContent = cur.name || 'Crystal Ambient Synth';
        pauseBtnMode.textContent = sound.playMode === 'loop' ? '🔁 1曲ループ中' : '🔀 ランダム再生中';
        titleBtnModeToggle.textContent = sound.playMode === 'loop' ? '🔁 再生: 1曲ループ' : '🔀 再生: ランダム';
    }

    pauseBtn.addEventListener('click', togglePauseGame);
    headerNowPlaying.addEventListener('click', togglePauseGame);

    pauseBtnResume.addEventListener('click', () => {
        if (game.paused) togglePauseGame();
    });

    pauseBtnRestart.addEventListener('click', () => {
        pauseModal.classList.add('hidden');
        game.paused = false;
        pauseBtn.textContent = '⏸';
        game.init();
    });

    pauseBtnTitle.addEventListener('click', () => {
        showTitleScreen();
    });

    pauseBtnNext.addEventListener('click', () => {
        sound.playRandomBgm();
    });

    pauseBtnMode.addEventListener('click', () => {
        const nextMode = sound.playMode === 'random' ? 'loop' : 'random';
        sound.setPlayMode(nextMode);
        updatePauseTrackDisplay();
    });

    // =========================================================
    // ★ BGMジュークボックス & プレイリスト読み込み
    // =========================================================

    // 曲情報更新時のUI反映
    sound.onTrackChange = (track, mode) => {
        headerTrackName.textContent = track.name || 'Crystal Ambient';
        pauseTrackName.textContent = track.name || 'Crystal Ambient';
        updatePauseTrackDisplay();
    };

    // ドロップダウン更新
    function updateDropdown(list) {
        bgmSelectDropdown.innerHTML = '<option value="-1">🎲 全曲からランダム選曲</option>';
        list.forEach((track, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = `${idx + 1}. ${track.name}`;
            bgmSelectDropdown.appendChild(opt);
        });
    }

    // asset/music/bgm-list.json からの自動読込
    fetch('asset/music/bgm-list.json')
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data) && data.length > 0) {
                sound.setPlaylist(data);
                updateDropdown(data);
                headerTrackName.textContent = `${data.length}曲準備完了 (ランダム)`;
            }
        })
        .catch(err => {
            console.log('No bgm-list.json found or using synth ambient by default.');
            headerTrackName.textContent = 'Crystal Ambient Synth';
        });

    // ドロップダウン選曲
    bgmSelectDropdown.addEventListener('change', (e) => {
        const idx = parseInt(e.target.value, 10);
        if (idx >= 0) {
            sound.playBgmTrack(idx);
        } else {
            sound.playRandomBgm();
        }
    });

    // 再生モードトグル（タイトル画面）
    titleBtnModeToggle.addEventListener('click', () => {
        const nextMode = sound.playMode === 'random' ? 'loop' : 'random';
        sound.setPlayMode(nextMode);
        updatePauseTrackDisplay();
    });

    // ★ 音楽フォルダ（50曲）一括読み込み（神機能）
    bgmFolderInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        const audioFiles = files.filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(f.name));

        if (audioFiles.length > 0) {
            // ファイル名順にソート
            audioFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

            const customList = audioFiles.map(file => ({
                name: file.name.replace(/\.[^/.]+$/, ''),
                url: URL.createObjectURL(file)
            }));

            sound.setPlaylist(customList);
            updateDropdown(customList);
            headerTrackName.textContent = `${customList.length}曲のフォルダを読込完了！`;
            alert(`✨ 音楽フォルダから ${customList.length} 曲のBGMを読み込みました！`);
        }
    });

    // 音量スライダー
    sliderBgm.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        sound.setBgmVolume(val);
        sliderBgmVal.textContent = `${Math.round(val * 100)}%`;
    });

    sliderSfx.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        sound.setSfxVolume(val);
        sliderSfxVal.textContent = `${Math.round(val * 100)}%`;
    });

    // UIボタンイベント
    restartBtn.addEventListener('click', () => {
        gameOverModal.classList.add('hidden');
        game.init();
    });

    muteBtn.addEventListener('click', () => {
        const isMuted = sound.toggleMute();
        muteBtn.textContent = isMuted ? '🔇' : '🔊';
        muteBtn.classList.toggle('active', !isMuted);
    });

    bgmBtn.addEventListener('click', () => {
        if (sound.isBgmPlaying) {
            sound.stopBgm();
            bgmBtn.textContent = '🎵 OFF';
            bgmBtn.classList.remove('active');
        } else {
            sound.resumeBgm();
            bgmBtn.textContent = '🎵 ON';
            bgmBtn.classList.add('active');
        }
    });

    // フルスクリーン対応（iOS Safari向け案内フォールバック付き）
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) {
            alert('📱 iPhone / iPad Safariで全画面表示するには:\nブラウザの共有ボタン（□↑）→「ホーム画面に追加」をタップして、ホーム画面から起動してください！');
            return;
        }
        if (!document.fullscreenElement) {
            const req = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
            if (req) {
                req.call(document.documentElement).catch(() => {});
            }
        } else {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) {
                exit.call(document).catch(() => {});
            }
        }
    });

    document.addEventListener('fullscreenchange', () => {
        fullscreenBtn.textContent = document.fullscreenElement ? '🗗' : '⛶';
        setTimeout(resizeCanvas, 150);
    });

    // PWA インストール対応
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installBtn.classList.remove('hidden');
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            installBtn.classList.add('hidden');
        }
        deferredPrompt = null;
    });

    window.addEventListener('appinstalled', () => {
        installBtn.classList.add('hidden');
        deferredPrompt = null;
    });

    const orientationWarningEl = document.getElementById('orientation-warning');

    // メインループ
    function gameLoop(currentTime) {
        const deltaTime = currentTime - lastTime;
        lastTime = currentTime;

        // スマホ横向き警告が表示されている間は自動停止
        const isOrientationBlocked = orientationWarningEl && getComputedStyle(orientationWarningEl).display !== 'none';

        // タイトル画面、ポーズ中、または横向きブロック中でなければゲームロジック進行
        if (!window.isTitleScreenActive && !game.paused && !isOrientationBlocked) {
            game.update(deltaTime);
        }
        effect.update();

        // UI数値更新
        scoreVal.textContent = game.score.toLocaleString();
        linesVal.textContent = game.lines;
        levelVal.textContent = game.level;

        // 描画
        renderBoard();
        renderPreview(holdCtx, game.holdPiece, !game.canHold);
        renderNextQueue();

        requestAnimationFrame(gameLoop);
    }

    // 初回初期化
    resizeCanvas();
    updatePauseTrackDisplay();
    requestAnimationFrame(gameLoop);
})();
