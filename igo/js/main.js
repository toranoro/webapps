/**
 * Web囲碁道場 メインスクリプト (js/main.js)
 * 画面遷移・対局制御・AI連携・マルチデバイス対応・PWA制御
 */

import { IgoEngine, BLACK, WHITE, EMPTY } from './igo-engine.js';
import { BoardUI } from './board-ui.js';
import { AiEngine } from './ai-engine.js';

class IgoApp {
    constructor() {
        this.engine = new IgoEngine(9, 6.5);
        this.ai = new AiEngine(this.engine);
        this.boardUI = null;

        // 設定状態
        this.config = {
            mode: 'ai',           // 'ai' | 'pvp'
            aiLevel: 2,           // 1..4
            playerColor: 'black', // 'black' | 'white' | 'random'
            handicap: 0,          // 0, 2, 3, 4
            showAtari: true,
            notifyIllegal: true,
            allowUndo: true,
            showAdvantage: true,
            confirmMode: false,
            allowAiResign: true,
            soundEnabled: true
        };

        this.actualPlayerColor = BLACK; // 実際のプレイヤーの手番
        this.deferredPrompt = null; // PWAインストールイベント保持
        this.isAiThinking = false;
        this.reviewIndex = -1; // 感想戦の現在表示手インデックス

        this.initDOM();
        this.initPWAAndDeviceSupport();
        this.initEvents();
    }

    initDOM() {
        // 碁盤UIの初期化
        const boardContainer = document.getElementById('board-container');
        this.boardUI = new BoardUI(boardContainer, {
            confirmMode: this.config.confirmMode,
            showAtariWarning: this.config.showAtari,
            soundEnabled: this.config.soundEnabled
        });

        // 盤面交点クリック時の処理
        this.boardUI.onPointClick = (x, y) => this.handleBoardClick(x, y);
    }

    // PWA & マルチデバイス（iOS / Android / PC）制御
    initPWAAndDeviceSupport() {
        // 1. Service Worker登録 (PWA & キャッシュ管理)
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => {
                        console.log('ServiceWorker registered:', reg.scope);
                        // 定期的な更新チェック
                        reg.update();
                    })
                    .catch(err => console.log('ServiceWorker error:', err));
            });
        }

        // 2. PWAインストールプロンプトの捕捉
        const pwaBtn = document.getElementById('btn-pwa-install');
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            if (pwaBtn) pwaBtn.style.display = 'inline-flex';
        });

        if (pwaBtn) {
            pwaBtn.addEventListener('click', async () => {
                if (this.deferredPrompt) {
                    this.deferredPrompt.prompt();
                    const { outcome } = await this.deferredPrompt.userChoice;
                    console.log('PWA prompt outcome:', outcome);
                    this.deferredPrompt = null;
                    pwaBtn.style.display = 'none';
                } else {
                    // iOS Safariなどの場合はガイドモーダルを表示
                    this.showModal('ios-guide-modal');
                }
            });
        }

        // 3. ピンチズームやドラッグスクロールの抑止（iPad / Android）
        document.addEventListener('gesturestart', (e) => e.preventDefault());
        document.addEventListener('gesturechange', (e) => e.preventDefault());
        document.addEventListener('gestureend', (e) => e.preventDefault());

        // ダブルタップによるズーム防止
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });

        // 4. iOS Safari向け全画面案内
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
        if (isIOS && !isStandalone && pwaBtn) {
            pwaBtn.style.display = 'inline-flex';
            pwaBtn.textContent = '📲 全画面化（ホーム追加）';
        }
    }

    initEvents() {
        // 対戦モード選択
        document.querySelectorAll('#mode-selector .select-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#mode-selector .select-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.config.mode = btn.dataset.mode;
                document.getElementById('ai-level-card').style.display = this.config.mode === 'ai' ? 'block' : 'none';
            });
        });

        // AIレベル選択
        document.querySelectorAll('#ai-level-selector .select-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#ai-level-selector .select-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.config.aiLevel = parseInt(btn.dataset.level, 10);
            });
        });

        // 手番選択
        document.querySelectorAll('#color-selector .select-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#color-selector .select-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.config.playerColor = btn.dataset.color;
            });
        });

        // ハンデ選択
        document.querySelectorAll('#handicap-selector .select-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#handicap-selector .select-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.config.handicap = parseInt(btn.dataset.handicap, 10);
            });
        });

        // トグル設定
        document.getElementById('toggle-atari').addEventListener('change', (e) => {
            this.config.showAtari = e.target.checked;
            this.boardUI.options.showAtariWarning = this.config.showAtari;
            this.boardUI.update(this.engine);
        });

        document.getElementById('toggle-illegal').addEventListener('change', (e) => {
            this.config.notifyIllegal = e.target.checked;
        });

        document.getElementById('toggle-undo').addEventListener('change', (e) => {
            this.config.allowUndo = e.target.checked;
            const btnUndo = document.getElementById('btn-undo');
            if (btnUndo) btnUndo.disabled = !this.config.allowUndo;
        });

        document.getElementById('toggle-advantage').addEventListener('change', (e) => {
            this.config.showAdvantage = e.target.checked;
            document.getElementById('adv-container').style.display = this.config.showAdvantage ? 'block' : 'none';
        });

        const toggleAiResign = document.getElementById('toggle-ai-resign');
        if (toggleAiResign) {
            toggleAiResign.addEventListener('change', (e) => {
                this.config.allowAiResign = e.target.checked;
            });
        }

        document.getElementById('toggle-confirm').addEventListener('change', (e) => {
            this.config.confirmMode = e.target.checked;
            this.boardUI.options.confirmMode = this.config.confirmMode;
            document.getElementById('btn-confirm-move').style.display = this.config.confirmMode ? 'flex' : 'none';
        });

        document.getElementById('toggle-sound').addEventListener('change', (e) => {
            this.config.soundEnabled = e.target.checked;
            this.boardUI.options.soundEnabled = this.config.soundEnabled;
            this.updateSoundButtonUI();
        });

        // 対局開始ボタン
        document.getElementById('btn-start-game').addEventListener('click', () => {
            this.startNewGame();
        });

        // メニュー画面のサブボタン
        document.getElementById('btn-open-manual').addEventListener('click', () => {
            window.open('manual/index.html', '_blank');
        });

        document.getElementById('btn-menu-fullscreen').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // 対局画面の操作ボタン
        document.getElementById('btn-back-menu').addEventListener('click', () => {
            if (confirm('対局を中断してメニューに戻りますか？')) {
                this.showScreen('menu-screen');
            }
        });

        document.getElementById('btn-toggle-sound-game').addEventListener('click', () => {
            this.config.soundEnabled = !this.config.soundEnabled;
            this.boardUI.options.soundEnabled = this.config.soundEnabled;
            document.getElementById('toggle-sound').checked = this.config.soundEnabled;
            this.updateSoundButtonUI();
        });

        document.getElementById('btn-game-manual').addEventListener('click', () => {
            window.open('manual/index.html', '_blank');
        });

        document.getElementById('btn-game-fullscreen').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // パス
        document.getElementById('btn-pass').addEventListener('click', () => {
            this.handlePass();
        });

        // 待った
        document.getElementById('btn-undo').addEventListener('click', () => {
            this.handleUndo();
        });

        // ヒント
        document.getElementById('btn-hint').addEventListener('click', () => {
            this.handleHint();
        });

        // 投了
        document.getElementById('btn-resign').addEventListener('click', () => {
            if (confirm('本当に投了しますか？')) {
                this.handleResign();
            }
        });

        // 誤タップ防止確定ボタン
        document.getElementById('btn-confirm-move').addEventListener('click', () => {
            this.boardUI.confirmCurrentGhost();
        });

        // 終局モーダル内操作
        document.getElementById('btn-modal-rematch').addEventListener('click', () => {
            this.hideModal('result-modal');
            this.startNewGame();
        });

        document.getElementById('btn-modal-close').addEventListener('click', () => {
            this.hideModal('result-modal');
            this.showToast('感想戦モードです。終局盤面をご確認いただけます。');
        });

        document.getElementById('btn-modal-menu').addEventListener('click', () => {
            this.hideModal('result-modal');
            this.showScreen('menu-screen');
        });

        // 感想戦（棋譜再生）
        document.getElementById('btn-review-first').addEventListener('click', () => this.reviewStep(0));
        document.getElementById('btn-review-prev').addEventListener('click', () => this.reviewStep(this.reviewIndex - 1));
        document.getElementById('btn-review-next').addEventListener('click', () => this.reviewStep(this.reviewIndex + 1));
        document.getElementById('btn-review-last').addEventListener('click', () => this.reviewStep(this.engine.history.length));

        // iOS ガイドモーダル閉じる
        document.getElementById('btn-close-ios-guide').addEventListener('click', () => {
            this.hideModal('ios-guide-modal');
        });
    }

    // 画面切り替え
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(screenId);
        if (target) target.classList.add('active');
    }

    // モーダル表示/非表示
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('active');
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
    }

    // トースト通知表示
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2600);
    }

    // サウンドボタン表示更新
    updateSoundButtonUI() {
        const btn = document.getElementById('btn-toggle-sound-game');
        if (btn) {
            btn.textContent = this.config.soundEnabled ? '🔊' : '🔇';
            btn.title = this.config.soundEnabled ? 'サウンド: ON' : 'サウンド: OFF';
        }
    }

    // 全画面切り替え（Chrome / Safari / iPad対応）
    toggleFullscreen() {
        const doc = window.document;
        const docEl = doc.documentElement;

        const requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
        const cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

        const isFullscreen = doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;

        if (!isFullscreen) {
            if (requestFullScreen) {
                requestFullScreen.call(docEl).catch(err => {
                    console.log('Fullscreen error:', err);
                    // iOS SafariなどでFullscreen APIが非対応の場合のガイド
                    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                    if (isIOS) {
                        this.showModal('ios-guide-modal');
                    }
                });
            } else {
                this.showModal('ios-guide-modal');
            }
        } else {
            if (cancelFullScreen) {
                cancelFullScreen.call(doc);
            }
        }
    }

    // 対局開始
    startNewGame() {
        // 手番の決定
        if (this.config.playerColor === 'random') {
            this.actualPlayerColor = Math.random() < 0.5 ? BLACK : WHITE;
        } else {
            this.actualPlayerColor = this.config.playerColor === 'black' ? BLACK : WHITE;
        }

        // コミ設定（置き石局の場合はコミ0.5）
        const komi = this.config.handicap > 0 ? 0.5 : 6.5;
        this.engine = new IgoEngine(9, komi);
        this.ai = new AiEngine(this.engine);

        // 置き石ハンデ
        if (this.config.handicap > 0) {
            this.engine.setHandicap(this.config.handicap);
        }

        // UIオプションの更新
        this.boardUI.options.confirmMode = this.config.confirmMode;
        this.boardUI.options.showAtariWarning = this.config.showAtari;
        this.boardUI.options.soundEnabled = this.config.soundEnabled;
        this.boardUI.clearHint();
        this.boardUI.clearTerritoryResult();

        // プレイヤー表示の初期化
        this.updatePlayerCardLabels();
        this.updateGameStateUI();

        // 画面切り替え
        this.showScreen('game-screen');

        // AIの先手手番チェック
        if (this.config.mode === 'ai' && this.engine.turn !== this.actualPlayerColor) {
            this.triggerAiMove();
        }
    }

    updatePlayerCardLabels() {
        const nameBlack = document.getElementById('name-black');
        const nameWhite = document.getElementById('name-white');
        const modeBadge = document.getElementById('game-mode-badge');

        if (this.config.mode === 'ai') {
            const levelNames = ['', '入門(Lv.1)', '初級(Lv.2)', '中級(Lv.3)', '上級(Lv.4)'];
            const aiTitle = `AI [${levelNames[this.config.aiLevel]}]`;

            if (this.actualPlayerColor === BLACK) {
                nameBlack.textContent = 'あなた (黒番)';
                nameWhite.textContent = `${aiTitle} (白番)`;
            } else {
                nameBlack.textContent = `${aiTitle} (黒番)`;
                nameWhite.textContent = 'あなた (白番)';
            }
            modeBadge.textContent = `人間 vs ${aiTitle}`;
        } else {
            nameBlack.textContent = '黒番プレイヤー';
            nameWhite.textContent = '白番プレイヤー';
            modeBadge.textContent = '対人戦 (1台共有)';
        }
    }

    // 盤面クリック時の着手処理
    handleBoardClick(x, y) {
        if (this.engine.isGameOver || this.isAiThinking) return;

        // AI戦かつAIの手番の時は操作不可
        if (this.config.mode === 'ai' && this.engine.turn !== this.actualPlayerColor) {
            return;
        }

        // 着手妥当性チェック
        const validation = this.engine.validateMove(x, y, this.engine.turn);
        if (!validation.valid) {
            if (this.config.notifyIllegal) {
                this.showToast(validation.reason, 'warning');
            }
            return;
        }

        // 着手実行
        const result = this.engine.play(x, y);
        if (result.valid) {
            this.boardUI.clearHint();

            // 効果音
            if (result.capturedCount > 0) {
                this.boardUI.playCaptureSound();
            } else {
                this.boardUI.playStoneSound();
            }

            // アタリ警告音
            if (this.config.showAtari) {
                const ataris = this.engine.getAtariGroups();
                if (ataris.length > 0) {
                    this.boardUI.playAtariSound();
                }
            }

            this.updateGameStateUI();

            // AIのターン判定
            if (!this.engine.isGameOver && this.config.mode === 'ai' && this.engine.turn !== this.actualPlayerColor) {
                this.triggerAiMove();
            }
        }
    }

    // AIの思考と着手
    async triggerAiMove() {
        this.isAiThinking = true;
        this.updateGameStateUI();

        const move = await this.ai.getBestMove(this.config.aiLevel, this.engine.turn, this.config.allowAiResign);

        this.isAiThinking = false;

        if (move && move.isResign) {
            this.showToast('AIが投了しました。「参りました！見事な碁でした。」', 'info');
            this.handleResign(true);
            return;
        } else if (move && move.isPass) {
            this.showToast('AIがパスしました。', 'info');
            this.handlePass(true);
        } else if (move) {
            const result = this.engine.play(move.x, move.y);
            if (result.valid) {
                if (result.capturedCount > 0) {
                    this.boardUI.playCaptureSound();
                } else {
                    this.boardUI.playStoneSound();
                }

                if (this.config.showAtari) {
                    const ataris = this.engine.getAtariGroups();
                    if (ataris.length > 0) {
                        this.boardUI.playAtariSound();
                    }
                }
            }
        }

        this.updateGameStateUI();
    }

    // パス処理
    handlePass(isAi = false) {
        if (this.engine.isGameOver || this.isAiThinking) return;

        const passResult = this.engine.pass();
        this.boardUI.clearHint();

        if (passResult.valid) {
            const passUser = passResult.move.color === BLACK ? '黒' : '白';
            if (!isAi) {
                this.showToast(`${passUser}番がパスしました。`, 'info');
            }

            if (passResult.isGameOver) {
                // 連続パスによる終局
                this.endGame(passResult.scoreResult);
            } else {
                this.updateGameStateUI();

                // 対AI戦で相手の手番ならAI着手をトリガー
                if (this.config.mode === 'ai' && this.engine.turn !== this.actualPlayerColor) {
                    this.triggerAiMove();
                }
            }
        }
    }

    // 待った処理
    handleUndo() {
        if (!this.config.allowUndo || this.isAiThinking || this.engine.history.length === 0) {
            return;
        }

        // AI戦では自分とAIの着手を2手戻す
        const steps = this.config.mode === 'ai' ? 2 : 1;
        const success = this.engine.undo(steps);
        if (success) {
            this.boardUI.clearHint();
            this.boardUI.clearTerritoryResult();
            this.showToast(`着手を${steps}手戻しました。`);
            this.updateGameStateUI();
        }
    }

    // ヒント機能
    async handleHint() {
        if (this.engine.isGameOver || this.isAiThinking) return;

        this.showToast('AIがおすすめの手を探索中...', 'info');
        const hintMove = await this.ai.getBestMove(3, this.engine.turn);

        if (hintMove && !hintMove.isPass) {
            this.boardUI.setHint(hintMove.x, hintMove.y);
            this.showToast(`推奨手: [${hintMove.x + 1}, ${hintMove.y + 1}] に着手マークを表示しました。`);
        } else {
            this.showToast('推奨手: 「パス」が最善手です。');
        }
    }

    // 投了処理
    handleResign(isAi = false) {
        if (this.engine.isGameOver || this.isAiThinking) return;

        const resigningColor = this.engine.turn;
        const result = this.engine.resign(resigningColor);
        if (isAi) {
            const winnerStr = resigningColor === BLACK ? '白(あなた)' : '黒(あなた)';
            result.text = `AIが投了しました（${winnerStr}の中押し勝ち）`;
        }
        this.endGame(result);
    }

    // 終局処理
    endGame(scoreResult) {
        this.updateGameStateUI();

        // 地合い計算と盤面ハイライト
        const territory = this.engine.calculateTerritory();
        this.boardUI.setTerritoryResult(territory);

        // 結果モーダルの表示更新
        const resultTitle = document.getElementById('result-title');
        const resBlackTerritory = document.getElementById('res-black-territory');
        const resBlackCaptures = document.getElementById('res-black-captures');
        const resWhiteTerritory = document.getElementById('res-white-territory');
        const resWhiteCaptures = document.getElementById('res-white-captures');
        const resKomi = document.getElementById('res-komi');
        const resWinnerLabel = document.getElementById('res-winner-label');
        const resWinnerValue = document.getElementById('res-winner-value');

        resBlackTerritory.textContent = territory.blackTerritory;
        resBlackCaptures.textContent = territory.blackCaptures;
        resWhiteTerritory.textContent = territory.whiteTerritory;
        resWhiteCaptures.textContent = territory.whiteCaptures;
        resKomi.textContent = `${territory.komi} 目`;

        if (scoreResult && scoreResult.resignation) {
            resultTitle.textContent = '終局（投了）';
            resWinnerLabel.textContent = '勝敗:';
            resWinnerValue.textContent = scoreResult.text;
        } else {
            resultTitle.textContent = '終局（地合い集計）';
            resWinnerLabel.textContent = '結果:';
            resWinnerValue.textContent = territory.summary;
        }

        // 感想戦インデックスの初期化
        this.reviewIndex = this.engine.history.length;
        this.updateReviewUI();

        this.showModal('result-modal');
    }

    // UI表示の全体更新
    updateGameStateUI() {
        this.boardUI.update(this.engine);

        // アゲハマ（取った石）表示
        document.getElementById('captures-black').textContent = this.engine.captures[BLACK];
        document.getElementById('captures-white').textContent = this.engine.captures[WHITE];

        // プレイヤーカードのアクティブハイライト
        const cardBlack = document.getElementById('card-black');
        const cardWhite = document.getElementById('card-white');
        const indicatorBlack = document.getElementById('turn-indicator-black');
        const indicatorWhite = document.getElementById('turn-indicator-white');

        cardBlack.classList.remove('active-turn');
        cardWhite.classList.remove('active-turn');

        if (this.engine.isGameOver) {
            indicatorBlack.textContent = '終局';
            indicatorWhite.textContent = '終局';
        } else if (this.engine.turn === BLACK) {
            cardBlack.classList.add('active-turn');
            indicatorBlack.textContent = this.isAiThinking ? '思考中...' : '手番';
            indicatorWhite.textContent = '待機中';
        } else {
            cardWhite.classList.add('active-turn');
            indicatorWhite.textContent = this.isAiThinking ? '思考中...' : '手番';
            indicatorBlack.textContent = '待機中';
        }

        // 下部ステータスメッセージ
        const statusMsg = document.getElementById('status-message');
        const moveCounter = document.getElementById('move-counter');
        moveCounter.textContent = `${this.engine.history.length}手目`;

        if (this.engine.isGameOver) {
            statusMsg.textContent = '対局が終了しました。結果をご確認ください。';
        } else if (this.isAiThinking) {
            statusMsg.textContent = 'AIが次の手を思考しています...';
        } else {
            const turnStr = this.engine.turn === BLACK ? '黒番' : '白番';
            statusMsg.textContent = `${turnStr}の手番です。交点をタップして石を置いてください。`;
        }

        // 待ったボタンの活性・非活性
        const btnUndo = document.getElementById('btn-undo');
        if (btnUndo) {
            btnUndo.disabled = !this.config.allowUndo || this.engine.history.length === 0 || this.isAiThinking;
        }

        // 地合い優勢度バーの更新
        if (this.config.showAdvantage) {
            const evalPos = this.ai.evaluatePosition();
            // -1 (白100%) 〜 +1 (黒100%) を 0% 〜 100% にマッピング
            const blackPercent = Math.max(5, Math.min(95, Math.round((evalPos.advantage + 1) * 50)));
            const advBar = document.getElementById('adv-bar-black');
            if (advBar) {
                advBar.style.width = `${blackPercent}%`;
            }
        }
    }

    // 感想戦・棋譜再生
    reviewStep(stepIndex) {
        const totalMoves = this.engine.history.length;
        this.reviewIndex = Math.max(0, Math.min(stepIndex, totalMoves));

        if (this.reviewIndex === totalMoves) {
            // 終局盤面
            this.boardUI.update(this.engine);
        } else {
            // 過去の局面を再現
            const snapshot = this.engine.history[this.reviewIndex];
            const tempEngine = {
                board: snapshot.board,
                turn: snapshot.turn,
                lastMove: snapshot.lastMove,
                getAtariGroups: () => [],
                index: (x, y) => this.engine.index(x, y)
            };
            this.boardUI.update(tempEngine);
        }

        this.updateReviewUI();
    }

    updateReviewUI() {
        const total = this.engine.history.length;
        const label = document.getElementById('review-step-label');
        if (label) {
            label.textContent = this.reviewIndex === total ? `終局(${total})` : `${this.reviewIndex} / ${total}手`;
        }

        const btnPrev = document.getElementById('btn-review-prev');
        const btnNext = document.getElementById('btn-review-next');
        const btnFirst = document.getElementById('btn-review-first');
        const btnLast = document.getElementById('btn-review-last');

        if (btnFirst) btnFirst.disabled = this.reviewIndex <= 0;
        if (btnPrev) btnPrev.disabled = this.reviewIndex <= 0;
        if (btnNext) btnNext.disabled = this.reviewIndex >= total;
        if (btnLast) btnLast.disabled = this.reviewIndex >= total;
    }
}

// アプリケーション起動
window.addEventListener('DOMContentLoaded', () => {
    window.igoApp = new IgoApp();
});
