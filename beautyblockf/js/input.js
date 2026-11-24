/**
 * input.js - マルチデバイス入力（キーボード、JKLI対応、オンスクリーンボタン、スワイプ）
 * 矢印キー/WASDに加え、ユーザー好みの「jkli（j:左, l:右, i:回転, k:下）」を完全サポート。
 */
class InputHandler {
    constructor(game) {
        this.game = game;

        // DAS / ARR (Delayed Auto Shift / Auto Repeat Rate) - PCキーボード快適化
        this.keys = {};
        this.dasTimeouts = {};
        this.arrIntervals = {};
        this.dasDelay = 140; // 初回リピートまでの遅延 (ms)
        this.arrRate = 35;   // リピート間隔 (ms)

        // スワイプ・タッチ操作用
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchStartTime = 0;
        this.lastSwipeX = 0;
        this.lastSwipeY = 0;
        this.isSwiping = false;

        this.initKeyboard();
        this.initTouchControls();
        this.preventAccidentalGestures();
    }

    // PCキーボード入力設定（JKLI派キーバインド完全統合）
    initKeyboard() {
        window.addEventListener('keydown', (e) => {
            // タイトル画面表示中またはゲーム未開始の場合
            if (window.isTitleScreenActive) {
                if (e.code === 'Space' || e.code === 'Enter') {
                    if (window.startGameFromTitle) window.startGameFromTitle();
                }
                return;
            }

            // ゲームオーバー時
            if (this.game.gameOver) {
                if (e.code === 'Space' || e.code === 'Enter') {
                    this.game.init();
                    const modal = document.getElementById('game-over-modal');
                    if (modal) modal.classList.add('hidden');
                    return;
                }
            }

            // スクロール等のブラウザ既定動作を防止するキー
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }

            // 一時停止/ポーズ（ESC または P）
            if (e.code === 'KeyP' || e.code === 'Escape') {
                e.preventDefault();
                if (window.togglePauseGame) {
                    window.togglePauseGame();
                } else {
                    this.game.paused = !this.game.paused;
                }
                return;
            }

            // ポーズ中は移動操作を受け付けない
            if (this.game.paused) return;

            if (this.keys[e.code]) return; // 長押し重複イベント抑止
            this.keys[e.code] = true;

            switch (e.code) {
                // 左移動: 矢印左 / A / J (★jkli派対応)
                case 'ArrowLeft':
                case 'KeyA':
                case 'KeyJ':
                    this.game.move(-1);
                    this.startDas('left', () => this.game.move(-1));
                    break;

                // 右移動: 矢印右 / D / L (★jkli派対応)
                case 'ArrowRight':
                case 'KeyD':
                case 'KeyL':
                    this.game.move(1);
                    this.startDas('right', () => this.game.move(1));
                    break;

                // ソフトドロップ（少し落ち）: 矢印下 / S / K (★jkli派対応)
                case 'ArrowDown':
                case 'KeyS':
                case 'KeyK':
                    this.game.softDrop();
                    this.startDas('down', () => this.game.softDrop(), 60, 30);
                    break;

                // 右回転（時計回り）: 矢印上 / X / W / I (★jkli派対応)
                case 'ArrowUp':
                case 'KeyW':
                case 'KeyX':
                case 'KeyI':
                    this.game.rotate(1);
                    break;

                // 左回転（反時計回り）: Z / Control / U
                case 'KeyZ':
                case 'KeyU':
                case 'ControlLeft':
                case 'ControlRight':
                    this.game.rotate(-1);
                    break;

                // ハードドロップ: Space
                case 'Space':
                    this.game.hardDrop();
                    break;

                // ホールド: C / Shift / H
                case 'KeyC':
                case 'KeyH':
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.game.hold();
                    break;
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            if (['ArrowLeft', 'KeyA', 'KeyJ'].includes(e.code)) this.stopDas('left');
            if (['ArrowRight', 'KeyD', 'KeyL'].includes(e.code)) this.stopDas('right');
            if (['ArrowDown', 'KeyS', 'KeyK'].includes(e.code)) this.stopDas('down');
        });
    }

    startDas(id, action, delay = this.dasDelay, rate = this.arrRate) {
        this.stopDas(id);
        this.dasTimeouts[id] = setTimeout(() => {
            this.arrIntervals[id] = setInterval(action, rate);
        }, delay);
    }

    stopDas(id) {
        if (this.dasTimeouts[id]) {
            clearTimeout(this.dasTimeouts[id]);
            this.dasTimeouts[id] = null;
        }
        if (this.arrIntervals[id]) {
            clearInterval(this.arrIntervals[id]);
            this.arrIntervals[id] = null;
        }
    }

    // オンスクリーンボタンとCanvasスワイプ操作の設定
    initTouchControls() {
        const bindButton = (id, onTrigger, isRepeatable = false) => {
            const el = document.getElementById(id);
            if (!el) return;

            const handlePress = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.game.gameOver || this.game.paused || window.isTitleScreenActive) return;

                onTrigger();

                if (isRepeatable) {
                    this.startDas(id, onTrigger, 160, 50);
                }
            };

            const handleRelease = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isRepeatable) {
                    this.stopDas(id);
                }
            };

            el.addEventListener('touchstart', handlePress, { passive: false });
            el.addEventListener('touchend', handleRelease, { passive: false });
            el.addEventListener('touchcancel', handleRelease, { passive: false });

            el.addEventListener('mousedown', handlePress);
            el.addEventListener('mouseup', handleRelease);
            el.addEventListener('mouseleave', handleRelease);
        };

        bindButton('btn-left', () => this.game.move(-1), true);
        bindButton('btn-right', () => this.game.move(1), true);
        bindButton('btn-down', () => this.game.softDrop(), true);
        bindButton('btn-rot-cw', () => this.game.rotate(1));
        bindButton('btn-rot-ccw', () => this.game.rotate(-1));
        bindButton('btn-hard-drop', () => this.game.hardDrop());
        bindButton('btn-hold', () => this.game.hold());

        // ゲーム画面上のジェスチャースワイプ対応
        const canvas = document.getElementById('tetris-canvas');
        if (!canvas) return;

        const cellThreshold = 24;

        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1 || this.game.paused || window.isTitleScreenActive) return;
            const t = e.touches[0];
            this.touchStartX = t.clientX;
            this.touchStartY = t.clientY;
            this.lastSwipeX = t.clientX;
            this.lastSwipeY = t.clientY;
            this.touchStartTime = Date.now();
            this.isSwiping = false;
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length !== 1 || this.game.gameOver || this.game.paused || window.isTitleScreenActive) return;
            e.preventDefault();
            const t = e.touches[0];
            const dx = t.clientX - this.lastSwipeX;
            const dy = t.clientY - this.lastSwipeY;

            if (Math.abs(dx) >= cellThreshold) {
                const steps = Math.trunc(dx / cellThreshold);
                for (let s = 0; s < Math.abs(steps); s++) {
                    this.game.move(steps > 0 ? 1 : -1);
                }
                this.lastSwipeX += steps * cellThreshold;
                this.isSwiping = true;
            }

            if (dy >= cellThreshold) {
                const steps = Math.trunc(dy / cellThreshold);
                for (let s = 0; s < Math.abs(steps); s++) {
                    this.game.softDrop();
                }
                this.lastSwipeY += steps * cellThreshold;
                this.isSwiping = true;
            }
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            if (this.game.gameOver || this.game.paused || window.isTitleScreenActive) return;
            const touchDuration = Date.now() - this.touchStartTime;
            const totalDx = (e.changedTouches[0]?.clientX || this.lastSwipeX) - this.touchStartX;
            const totalDy = (e.changedTouches[0]?.clientY || this.lastSwipeY) - this.touchStartY;
            const totalDist = Math.hypot(totalDx, totalDy);

            if (!this.isSwiping && totalDist < 12 && touchDuration < 250) {
                this.game.rotate(1);
            } else if (totalDy < -45 && Math.abs(totalDx) < 40 && touchDuration < 300) {
                this.game.hardDrop();
            }
        }, { passive: false });
    }

    // 操作以外のドラッグ、スクロール、ピンチイン・ピンチアウトの完全抑止
    preventAccidentalGestures() {
        document.addEventListener('touchmove', (e) => {
            // スクロール可能な要素（マニュアルやBGMリストなど）以外を抑制
            if (!e.target.closest('.scrollable-area')) {
                e.preventDefault();
            }
        }, { passive: false });

        document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
        document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
        document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });

        document.addEventListener('contextmenu', (e) => {
            if (e.target.closest('#app-container, #touch-controls, #tetris-canvas, .modal-card')) {
                e.preventDefault();
            }
        });

        document.addEventListener('dragstart', (e) => e.preventDefault());
    }
}

window.InputHandler = InputHandler;
