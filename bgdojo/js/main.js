/**
 * バックギャモン道場 (bgdojo) - メインコントローラー
 * main.js
 */

import { PLAYER_WHITE, PLAYER_BLACK, BackgammonBoard } from './bg-rules.js';
import { AIEngine } from './ai-engine.js';
import { BoardUI } from './board-ui.js';
import { sound } from './audio.js';

class BgDojoApp {
  constructor() {
    this.board = new BackgammonBoard();
    this.ui = null;

    // ゲーム設定
    this.config = {
      mode: 'ai', // 'ai' | 'pvp'
      matchPoints: 1,
      useCube: true,
      aiLevel: 3,
      assist: {
        highlight: true,
        pip: true,
        undo: true,
        hint: true
      }
    };

    // マッチ状態
    this.matchState = {
      whiteScore: 0,
      blackScore: 0,
      gameNumber: 1,
      isCrawford: false
    };

    // 現在のゲーム状態
    this.activePlayer = PLAYER_WHITE; // 1: 白, -1: 黒
    this.turnPhase = 'opening'; // 'opening' | 'roll' | 'moving' | 'gameover'
    this.currentDice = [];
    this.remainingDice = [];
    this.usedDiceIndices = [];
    this.cube = { value: 1, owner: 0 }; // owner: 0 (中央), 1 (白), -1 (黒)

    // ターン内Undo履歴
    this.turnHistory = []; // { board, remainingDice, usedDiceIndices, movesDone }
    this.originalTurnBoard = null;

    // PWA & フルスクリーン
    this.deferredPrompt = null;

    this.init();
  }

  init() {
    this.ui = new BoardUI('board-container');

    // UIイベントリスナー
    this.ui.onCheckerClick = (pointOrSlot) => this.handleCheckerClick(pointOrSlot);

    this.initDOMEvents();
    this.initGestureBlocker();
    this.initPWA();
    this.updatePipDisplays();
    this.ui.render(this.board, this.activePlayer);
  }

  /* --------------------------------------------------------------------------
     DOMイベント初期化
     -------------------------------------------------------------------------- */
  initDOMEvents() {
    // 画面切り替え & 設定UI
    this.setupMenuControls();

    // トップナビボタン
    document.getElementById('btn-manual').addEventListener('click', () => {
      window.open('manual/index.html', '_blank');
    });

    const btnSound = document.getElementById('btn-sound');
    btnSound.addEventListener('click', () => {
      const state = sound.toggleSound();
      btnSound.textContent = state ? '🔊 音ON' : '🔇 音OFF';
    });

    document.getElementById('btn-fullscreen').addEventListener('click', () => {
      this.toggleFullScreen();
    });

    // ゲームアクションボタン
    document.getElementById('btn-roll-dice').addEventListener('click', () => {
      sound.playDiceRoll();
      this.handleRollButtonClick();
    });

    document.getElementById('btn-double-cube').addEventListener('click', () => {
      this.handleHumanDoubleRequest();
    });

    document.getElementById('btn-undo-move').addEventListener('click', () => {
      this.handleUndoMove();
    });

    document.getElementById('btn-confirm-turn').addEventListener('click', () => {
      this.handleConfirmTurn();
    });

    document.getElementById('btn-hint').addEventListener('click', () => {
      this.showHintModal();
    });

    document.getElementById('btn-resign').addEventListener('click', () => {
      if (confirm('投了しますか？（相手の勝利となります）')) {
        this.handleResign(this.activePlayer);
      }
    });

    document.getElementById('btn-back-menu').addEventListener('click', () => {
      if (confirm('対局を中断してメニューに戻りますか？')) {
        this.switchScreen('menu-screen');
      }
    });

    // モーダルボタン
    document.getElementById('btn-hint-close').addEventListener('click', () => {
      document.getElementById('modal-hint').classList.remove('active');
    });

    document.getElementById('btn-cube-take').addEventListener('click', () => {
      this.handleCubeResponse(true);
    });

    document.getElementById('btn-cube-drop').addEventListener('click', () => {
      this.handleCubeResponse(false);
    });

    document.getElementById('btn-gameover-next').addEventListener('click', () => {
      document.getElementById('modal-gameover').classList.remove('active');
      this.startNewGame();
    });

    document.getElementById('btn-gameover-menu').addEventListener('click', () => {
      document.getElementById('modal-gameover').classList.remove('active');
      this.switchScreen('menu-screen');
    });
  }

  setupMenuControls() {
    // ボタンボタングループの選択切替汎用処理
    const setupButtonGroup = (groupId, onSelect) => {
      const group = document.getElementById(groupId);
      if (!group) return;
      const btns = group.querySelectorAll('.btn-option');
      btns.forEach(btn => {
        btn.addEventListener('click', () => {
          btns.forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          onSelect(btn.dataset.value);
        });
      });
    };

    setupButtonGroup('group-mode', val => {
      this.config.mode = val;
      const aiWrapper = document.getElementById('group-ai-level-wrapper');
      aiWrapper.style.display = (val === 'ai') ? 'flex' : 'none';
    });

    setupButtonGroup('group-match', val => {
      this.config.matchPoints = parseInt(val, 10);
    });

    setupButtonGroup('group-cube', val => {
      this.config.useCube = (val === 'on');
    });

    setupButtonGroup('group-ai-level', val => {
      this.config.aiLevel = parseInt(val, 10);
    });

    // チェックボックス
    document.getElementById('chk-highlight').addEventListener('change', e => {
      this.config.assist.highlight = e.target.checked;
      this.refreshBoardUI();
    });
    document.getElementById('chk-pip').addEventListener('change', e => {
      this.config.assist.pip = e.target.checked;
      document.getElementById('pip-display').style.display = e.target.checked ? 'flex' : 'none';
    });
    document.getElementById('chk-undo').addEventListener('change', e => {
      this.config.assist.undo = e.target.checked;
      document.getElementById('btn-undo-move').style.display = e.target.checked ? 'block' : 'none';
    });
    document.getElementById('chk-hint').addEventListener('change', e => {
      this.config.assist.hint = e.target.checked;
      document.getElementById('btn-hint').style.display = e.target.checked ? 'block' : 'none';
    });

    // 対局開始ボタン
    document.getElementById('btn-start-game').addEventListener('click', () => {
      this.startMatch();
    });
  }

  switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }

  /* --------------------------------------------------------------------------
     誤操作・ジェスチャー・ズーム防止
     -------------------------------------------------------------------------- */
  initGestureBlocker() {
    // 画面のダブルタップズームやピンチイン・アウトを抑止
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

    // 意図しないドラッグ・スクロール防止 (盤面エリア)
    document.getElementById('game-screen').addEventListener('touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });
  }

  /* --------------------------------------------------------------------------
     PWA インストール & フルスクリーン
     -------------------------------------------------------------------------- */
  initPWA() {
    // Service Worker 登録
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js?v=20261123_1').then(reg => {
        // キャッシュ更新チェック
        reg.update();
      }).catch(err => console.log('SW registration failed:', err));
    }

    const btnInstall = document.getElementById('btn-install');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      btnInstall.style.display = 'inline-flex';
    });

    btnInstall.addEventListener('click', async () => {
      if (this.deferredPrompt) {
        this.deferredPrompt.prompt();
        const choice = await this.deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          btnInstall.style.display = 'none';
        }
        this.deferredPrompt = null;
      }
    });
  }

  toggleFullScreen() {
    const doc = window.document;
    const docEl = doc.documentElement;

    const requestFS = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
    const exitFS = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

    if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
      if (requestFS) {
        requestFS.call(docEl).catch(err => {
          alert('全画面表示に切り替えます。iOS Safariの場合はホーム画面に追加すると全画面アプリとして起動できます。');
        });
      }
    } else {
      if (exitFS) exitFS.call(doc);
    }
  }

  /* --------------------------------------------------------------------------
     マッチ & 対局開始フロー
     -------------------------------------------------------------------------- */
  startMatch() {
    this.matchState.whiteScore = 0;
    this.matchState.blackScore = 0;
    this.matchState.gameNumber = 1;
    this.matchState.isCrawford = false;

    this.switchScreen('game-screen');
    this.startNewGame();
  }

  startNewGame() {
    this.board.initStandard();
    this.cube = { value: 1, owner: 0 };
    this.turnHistory = [];
    this.ui.clearSelection();

    // クロフォードルールのチェック
    if (this.config.matchPoints > 1 && !this.matchState.isCrawford) {
      const wNeeds = this.config.matchPoints - this.matchState.whiteScore;
      const bNeeds = this.config.matchPoints - this.matchState.blackScore;
      if (wNeeds === 1 || bNeeds === 1) {
        this.matchState.isCrawford = true;
        this.logMessage('【クロフォードルール適用】このゲームではダブリングキューブの使用が禁止されます。');
      }
    }

    this.updateStatusHeader();
    this.ui.renderCube(this.cube.value, this.cube.owner);
    this.refreshBoardUI();

    // オープニングロール (先攻決め)
    this.runOpeningRoll();
  }

  updateStatusHeader() {
    const p1 = 'あなた';
    const p2 = this.config.mode === 'ai' ? `AI (Lv.${this.config.aiLevel})` : 'プレイヤー2';
    const matchText = `${p1} ${this.matchState.whiteScore} - ${this.matchState.blackScore} ${p2} (${this.config.matchPoints}ptマッチ)`;
    document.getElementById('match-score-text').textContent = matchText;
  }

  logMessage(msg) {
    const logBox = document.getElementById('game-log');
    const row = document.createElement('div');
    row.textContent = msg;
    logBox.appendChild(row);
    logBox.scrollTop = logBox.scrollHeight;
  }

  setMessage(msg) {
    document.getElementById('game-message').textContent = msg;
  }

  updatePipDisplays() {
    const whitePip = this.board.getPipCount(PLAYER_WHITE);
    const blackPip = this.board.getPipCount(PLAYER_BLACK);
    const diff = blackPip - whitePip;

    document.getElementById('pip-white-text').textContent = `白: ${whitePip}`;
    document.getElementById('pip-black-text').textContent = `黒: ${blackPip}`;
    
    let diffStr = '(同点)';
    if (diff > 0) diffStr = `(白が ${diff} リード)`;
    else if (diff < 0) diffStr = `(黒が ${-diff} リード)`;

    document.getElementById('pip-diff-text').textContent = diffStr;
  }

  /* --------------------------------------------------------------------------
     オープニングロール (先手決め)
     -------------------------------------------------------------------------- */
  runOpeningRoll() {
    this.turnPhase = 'opening';
    this.setMessage('先手決定ダイスを振ります...');
    this.logMessage('--- オープニングロール (出目が大きい側が先手) ---');

    document.getElementById('btn-roll-dice').disabled = true;
    document.getElementById('btn-double-cube').style.display = 'none';
    document.getElementById('btn-confirm-turn').style.display = 'none';

    setTimeout(() => {
      let dWhite = Math.floor(Math.random() * 6) + 1;
      let dBlack = Math.floor(Math.random() * 6) + 1;

      sound.playDiceRoll();
      this.ui.renderDice([dWhite, dBlack], [], PLAYER_WHITE);

      if (dWhite === dBlack) {
        this.setMessage(`白: ${dWhite}, 黒: ${dBlack} (同点のため振り直し)`);
        this.logMessage(`オープニング同点 (${dWhite}-${dBlack})。再ロール...`);
        setTimeout(() => this.runOpeningRoll(), 1200);
        return;
      }

      if (dWhite > dBlack) {
        this.activePlayer = PLAYER_WHITE;
        this.setMessage(`白: ${dWhite}, 黒: ${dBlack} → 白 (あなた) の先手！`);
        this.logMessage(`白 ${dWhite} vs 黒 ${dBlack} → 白が先手番を獲得 (${dWhite}-${dBlack})`);
      } else {
        this.activePlayer = PLAYER_BLACK;
        const oppName = this.config.mode === 'ai' ? 'AI' : '黒';
        this.setMessage(`白: ${dWhite}, 黒: ${dBlack} → ${oppName} の先手！`);
        this.logMessage(`白 ${dWhite} vs 黒 ${dBlack} → ${oppName} が先手番を獲得 (${dBlack}-${dWhite})`);
      }

      // バックギャモン公式ルール: オープニングロールで出た2つの目をそのまま先手の手番として使用！
      this.currentDice = [dWhite, dBlack];
      this.remainingDice = [dWhite, dBlack];
      this.usedDiceIndices = [];
      this.originalTurnBoard = this.board.clone();

      setTimeout(() => {
        this.beginTurnMoving();
      }, 1400);
    }, 600);
  }

  /* --------------------------------------------------------------------------
     通常手番サイクル
     -------------------------------------------------------------------------- */
  startTurn() {
    this.turnPhase = 'roll';
    this.currentDice = [];
    this.remainingDice = [];
    this.usedDiceIndices = [];
    this.turnHistory = [];
    this.ui.clearSelection();

    const isAI = (this.config.mode === 'ai' && this.activePlayer === PLAYER_BLACK);
    this.updateTurnUI();

    // ダブリングキューブの使用可否チェック
    const canUseCube = this.config.useCube && 
                       !this.matchState.isCrawford && 
                       (this.cube.owner === 0 || this.cube.owner === this.activePlayer) &&
                       (this.cube.value < 64);

    if (isAI) {
      this.setMessage('AIが思考中...');
      // AI のダブリング判定
      if (canUseCube) {
        const action = AIEngine.evaluateCubeAction(this.board, PLAYER_BLACK, this.cube.value, this.config.aiLevel);
        if (action === 'double') {
          setTimeout(() => this.triggerAIDoubleRequest(), 800);
          return;
        }
      }
      setTimeout(() => this.executeAIRollAndMove(), 900);
    } else {
      // 人間プレイヤーの手番
      this.setMessage('ダイスを振ってください');
      document.getElementById('btn-roll-dice').disabled = false;
      document.getElementById('btn-confirm-turn').style.display = 'none';
      document.getElementById('btn-undo-move').disabled = true;

      const btnDouble = document.getElementById('btn-double-cube');
      if (canUseCube) {
        btnDouble.style.display = 'block';
        btnDouble.textContent = `×${this.cube.value * 2} ダブル提案`;
        btnDouble.disabled = false;
      } else {
        btnDouble.style.display = 'none';
      }
    }
  }

  updateTurnUI() {
    const isWhite = (this.activePlayer === PLAYER_WHITE);
    const pName = isWhite ? '白 (あなた)' : (this.config.mode === 'ai' ? `AI (Lv.${this.config.aiLevel})` : '黒');
    
    document.getElementById('turn-player-name').textContent = pName;
    const miniChecker = document.getElementById('turn-mini-checker');
    miniChecker.className = `player-mini-checker ${isWhite ? 'checker-white' : 'checker-black'}`;
    document.getElementById('turn-phase-badge').textContent = (this.turnPhase === 'roll') ? 'ロール待ち' : '移動中';
  }

  /* --------------------------------------------------------------------------
     ダイスロール & 移動フェーズ開始
     -------------------------------------------------------------------------- */
  handleRollButtonClick() {
    document.getElementById('btn-roll-dice').disabled = true;
    document.getElementById('btn-double-cube').style.display = 'none';

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;

    if (d1 === d2) {
      this.currentDice = [d1, d1, d1, d1];
      this.remainingDice = [d1, d1, d1, d1];
      this.logMessage(`${this.getPlayerLabel()} がゾロ目を出しました！ [${d1}, ${d1}, ${d1}, ${d1}]`);
      this.setMessage(`ゾロ目！ ${d1} が4回使えます`);
    } else {
      this.currentDice = [d1, d2];
      this.remainingDice = [d1, d2];
      this.logMessage(`${this.getPlayerLabel()} のロール: [${d1}, ${d2}]`);
      this.setMessage(`出目: ${d1} と ${d2}`);
    }

    this.usedDiceIndices = [];
    this.originalTurnBoard = this.board.clone();

    this.ui.renderDice(this.currentDice, this.usedDiceIndices, this.activePlayer);
    this.beginTurnMoving();
  }

  getPlayerLabel() {
    if (this.activePlayer === PLAYER_WHITE) return '白';
    return this.config.mode === 'ai' ? 'AI' : '黒';
  }

  beginTurnMoving() {
    this.turnPhase = 'moving';
    this.updateTurnUI();

    // 合法手の存在確認
    const legalSeqs = this.board.getAllLegalTurnSequences(this.activePlayer, this.remainingDice);
    if (!legalSeqs || legalSeqs.length === 0) {
      sound.playHit();
      this.setMessage('動かせる駒がありません（パス）');
      this.logMessage(`${this.getPlayerLabel()} は動かせる手がなくパスしました。`);
      setTimeout(() => this.passTurn(), 1400);
      return;
    }

    this.refreshBoardUI();

    const isHuman = (this.config.mode === 'pvp' || this.activePlayer === PLAYER_WHITE);
    if (!isHuman) {
      this.executeAIMoves();
    }
  }

  /* --------------------------------------------------------------------------
     人間プレイヤーの駒移動インタラクション
     -------------------------------------------------------------------------- */
  handleCheckerClick(pointOrSlot) {
    if (this.turnPhase !== 'moving') return;
    const isHuman = (this.config.mode === 'pvp' || this.activePlayer === PLAYER_WHITE);
    if (!isHuman) return;

    let clickedNorm = null;
    if (pointOrSlot === 'bar') {
      clickedNorm = 25;
    } else if (pointOrSlot === 'off') {
      clickedNorm = 0;
    } else {
      clickedNorm = BackgammonBoard.toNormalized(this.activePlayer, pointOrSlot);
    }

    // 既に駒が選択されている状態で、クリック先が移動可能先ポイントの場合
    if (this.ui.selectedNormPoint !== null) {
      const targetDest = this.ui.highlightedDestinations.find(d => d.toNorm === clickedNorm);
      if (targetDest) {
        // 移動実行
        this.performStepMove(this.ui.selectedNormPoint, targetDest.toNorm, targetDest.die);
        return;
      }
    }

    // 新たな駒を選択
    const movableList = this.getCurrentlyMovableNormPoints();
    if (movableList.includes(clickedNorm)) {
      this.ui.clearSelection();
      const destinations = this.getDestinationsForNorm(clickedNorm);

      if (destinations.length === 1) {
        // 行き先が1箇所しかない場合は直感操作として自動即移動！
        this.performStepMove(clickedNorm, destinations[0].toNorm, destinations[0].die);
      } else {
        this.ui.setSelected(clickedNorm, destinations);
        this.refreshBoardUI();
      }
    } else {
      this.ui.clearSelection();
      this.refreshBoardUI();
    }
  }

  getCurrentlyMovableNormPoints() {
    const legalSeqs = this.board.getAllLegalTurnSequences(this.activePlayer, this.remainingDice);
    const movable = new Set();
    legalSeqs.forEach(seq => {
      if (seq.moves.length > 0) {
        movable.add(seq.moves[0].fromNorm);
      }
    });
    return Array.from(movable);
  }

  getDestinationsForNorm(fromNorm) {
    const destinations = [];
    const triedDice = new Set();

    for (let i = 0; i < this.remainingDice.length; i++) {
      const die = this.remainingDice[i];
      if (triedDice.has(die)) continue;

      const res = this.board.checkSingleMove(this.activePlayer, fromNorm, die);
      if (res.valid) {
        // その単発移動を行った後に、全体として合法なシーケンスが成立するか検証
        const testBoard = this.board.clone();
        testBoard.applyMove(this.activePlayer, fromNorm, res.toNorm);
        const nextDice = [...this.remainingDice];
        nextDice.splice(i, 1);

        // 残りの目での合法手を検索
        const nextSeqs = testBoard.getAllLegalTurnSequences(this.activePlayer, nextDice);
        // 全体の最大手数・最大出目ルールと整合するか
        const totalSeqs = this.board.getAllLegalTurnSequences(this.activePlayer, this.remainingDice);
        const maxMoves = totalSeqs.length > 0 ? totalSeqs[0].moves.length : 0;

        const canAchieveMax = (nextSeqs.length > 0 && nextSeqs[0].moves.length + 1 === maxMoves) ||
                              (nextSeqs.length === 0 && maxMoves === 1);

        if (canAchieveMax) {
          triedDice.add(die);
          destinations.push({
            toNorm: res.toNorm,
            die,
            toBoard: res.toNorm === 0 ? 'off' : BackgammonBoard.fromNormalized(this.activePlayer, res.toNorm)
          });
        }
      }
    }
    return destinations;
  }

  performStepMove(fromNorm, toNorm, die) {
    // Undo用に現在の状態を退避
    this.turnHistory.push({
      board: this.board.clone(),
      remainingDice: [...this.remainingDice],
      usedDiceIndices: [...this.usedDiceIndices]
    });

    // 駒移動を実行
    const moveRes = this.board.applyMove(this.activePlayer, fromNorm, toNorm);
    if (toNorm === 0) {
      sound.playBearOff();
    } else if (moveRes.isHit) {
      sound.playHit();
    } else {
      sound.playCheckerMove();
    }

    // ダイス消費処理
    const dieIdx = this.remainingDice.indexOf(die);
    if (dieIdx !== -1) {
      this.remainingDice.splice(dieIdx, 1);
    }
    // 未使用のダイスインデックスを1つ使用済みにする
    for (let i = 0; i < this.currentDice.length; i++) {
      if (this.currentDice[i] === die && !this.usedDiceIndices.includes(i)) {
        this.usedDiceIndices.push(i);
        break;
      }
    }

    this.ui.clearSelection();
    this.refreshBoardUI();

    // 勝利判定
    const winCheck = this.board.checkWin();
    if (winCheck.gameOver) {
      this.handleGameOver(winCheck);
      return;
    }

    // ターン内Undoボタンの有効化
    if (this.config.assist.undo) {
      document.getElementById('btn-undo-move').disabled = false;
    }

    // 残りダイスがあるか、または動かせる手があるか
    const nextLegalSeqs = this.board.getAllLegalTurnSequences(this.activePlayer, this.remainingDice);
    if (this.remainingDice.length === 0 || !nextLegalSeqs || nextLegalSeqs.length === 0) {
      // ターン完了可能！確定ボタンを表示
      const btnConfirm = document.getElementById('btn-confirm-turn');
      btnConfirm.style.display = 'block';
      this.setMessage('すべての手を終えました。「ターン確定」を押してください');
    } else {
      this.setMessage(`あと ${this.remainingDice.length} 個の出目を動かしてください`);
    }
  }

  handleUndoMove() {
    if (this.turnHistory.length === 0) return;
    const prev = this.turnHistory.pop();
    this.board = prev.board;
    this.remainingDice = prev.remainingDice;
    this.usedDiceIndices = prev.usedDiceIndices;

    this.ui.clearSelection();
    document.getElementById('btn-confirm-turn').style.display = 'none';
    if (this.turnHistory.length === 0) {
      document.getElementById('btn-undo-move').disabled = true;
    }

    this.refreshBoardUI();
    this.setMessage('1手戻しました');
  }

  handleConfirmTurn() {
    // 悪手チェック（アシスト設定がONの場合）
    if (this.config.assist.hint && this.originalTurnBoard) {
      const blunder = AIEngine.checkBlunder(this.originalTurnBoard, this.board, this.activePlayer, this.currentDice);
      if (blunder && blunder.isBlunder) {
        if (!confirm(`${blunder.message}`)) {
          return; // 確定をキャンセルして指し直す
        }
      }
    }

    document.getElementById('btn-confirm-turn').style.display = 'none';
    document.getElementById('btn-undo-move').disabled = true;
    this.passTurn();
  }

  /* --------------------------------------------------------------------------
     AI の思考 & 移動実行
     -------------------------------------------------------------------------- */
  executeAIRollAndMove() {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;

    sound.playDiceRoll();

    if (d1 === d2) {
      this.currentDice = [d1, d1, d1, d1];
      this.remainingDice = [d1, d1, d1, d1];
      this.logMessage(`AI のロール: ゾロ目 [${d1}, ${d1}, ${d1}, ${d1}]`);
      this.setMessage(`AIのゾロ目！ ${d1} が4回`);
    } else {
      this.currentDice = [d1, d2];
      this.remainingDice = [d1, d2];
      this.logMessage(`AI のロール: [${d1}, ${d2}]`);
      this.setMessage(`AIの出目: ${d1} と ${d2}`);
    }

    this.usedDiceIndices = [];
    this.ui.renderDice(this.currentDice, this.usedDiceIndices, PLAYER_BLACK);

    this.turnPhase = 'moving';
    this.updateTurnUI();

    setTimeout(() => {
      this.executeAIMoves();
    }, 600);
  }

  executeAIMoves() {
    const bestResult = AIEngine.selectBestMove(this.board, PLAYER_BLACK, this.remainingDice, this.config.aiLevel);
    if (!bestResult.sequence || bestResult.sequence.moves.length === 0) {
      sound.playHit();
      this.setMessage('AIは動かせる手がありません（パス）');
      this.logMessage('AI は動かせる手がなくパスしました。');
      setTimeout(() => this.passTurn(), 1200);
      return;
    }

    const moves = bestResult.sequence.moves;
    let stepIndex = 0;

    const playNextStep = () => {
      if (stepIndex >= moves.length) {
        // AIターン完了
        setTimeout(() => {
          const winCheck = this.board.checkWin();
          if (winCheck.gameOver) {
            this.handleGameOver(winCheck);
          } else {
            this.passTurn();
          }
        }, 500);
        return;
      }

      const m = moves[stepIndex];
      const moveRes = this.board.applyMove(PLAYER_BLACK, m.fromNorm, m.toNorm);
      if (m.toNorm === 0) {
        sound.playBearOff();
      } else if (moveRes.isHit) {
        sound.playHit();
      } else {
        sound.playCheckerMove();
      }

      // 出目使用表示
      if (this.usedDiceIndices.length < this.currentDice.length) {
        this.usedDiceIndices.push(this.usedDiceIndices.length);
      }

      const fromName = m.fromBoard === 'bar' ? 'Bar' : `${m.fromBoard}pt`;
      const toName = m.toBoard === 'off' ? 'Goal' : `${m.toBoard}pt`;
      this.logMessage(`AI: ${fromName} → ${toName} (出目 ${m.die})${moveRes.isHit ? ' [HIT!]' : ''}`);

      this.refreshBoardUI();
      stepIndex++;
      setTimeout(playNextStep, 500);
    };

    setTimeout(playNextStep, 400);
  }

  /* --------------------------------------------------------------------------
     手番交代
     -------------------------------------------------------------------------- */
  passTurn() {
    this.activePlayer = -this.activePlayer;
    this.startTurn();
  }

  refreshBoardUI() {
    const isHuman = (this.config.mode === 'pvp' || this.activePlayer === PLAYER_WHITE);
    const movableList = (this.turnPhase === 'moving' && this.config.assist.highlight && isHuman) 
      ? this.getCurrentlyMovableNormPoints() 
      : [];

    this.ui.render(this.board, this.activePlayer, movableList);
    this.ui.renderDice(this.currentDice, this.usedDiceIndices, this.activePlayer);
    this.updatePipDisplays();
  }

  /* --------------------------------------------------------------------------
     ダブリングキューブ処理
     -------------------------------------------------------------------------- */
  handleHumanDoubleRequest() {
    sound.playCube();
    const nextVal = this.cube.value * 2;
    this.logMessage(`あなた がダブル (×${nextVal}) を提案しました！`);
    document.getElementById('btn-double-cube').style.display = 'none';

    if (this.config.mode === 'ai') {
      // AI のテイク/ドロップ判断
      this.setMessage('AIがダブル提案を検討中...');
      setTimeout(() => {
        const resp = AIEngine.evaluateCubeResponse(this.board, PLAYER_BLACK, nextVal, this.config.aiLevel);
        if (resp === 'take') {
          sound.playCube();
          this.cube.value = nextVal;
          this.cube.owner = PLAYER_BLACK; // テイクした側がキューブを保持
          this.ui.renderCube(this.cube.value, this.cube.owner);
          this.logMessage(`AI はダブルを受託(Take)しました！ (キューブ: ×${nextVal})`);
          this.setMessage(`AIがダブルを受託しました (現在 ×${nextVal})`);
        } else {
          // ドロップ (AIが投了)
          this.logMessage('AI はダブルを辞退(Drop)しました。');
          this.handleResign(PLAYER_BLACK, this.cube.value);
        }
      }, 1000);
    } else {
      // 2人対戦時の相手側確認モーダル
      this.showCubeModal(nextVal);
    }
  }

  triggerAIDoubleRequest() {
    sound.playCube();
    const nextVal = this.cube.value * 2;
    this.logMessage(`AI がダブル (×${nextVal}) を提案してきました！`);
    this.showCubeModal(nextVal);
  }

  showCubeModal(nextVal) {
    document.getElementById('modal-cube-val').textContent = `${nextVal}倍`;
    document.getElementById('modal-cube').classList.add('active');
  }

  handleCubeResponse(accepted) {
    document.getElementById('modal-cube').classList.remove('active');
    const nextVal = this.cube.value * 2;

    if (accepted) {
      sound.playCube();
      this.cube.value = nextVal;
      this.cube.owner = this.activePlayer;
      this.ui.renderCube(this.cube.value, this.cube.owner);
      this.logMessage(`ダブルを受託(Take)しました。(キューブ: ×${nextVal})`);
      this.setMessage(`ダブル受託！ (現在 ×${nextVal})`);
      if (this.config.mode === 'ai' && this.activePlayer === PLAYER_BLACK) {
        this.executeAIRollAndMove();
      }
    } else {
      this.logMessage('ダブルを辞退(Drop)しました。');
      this.handleResign(this.activePlayer, this.cube.value);
    }
  }

  /* --------------------------------------------------------------------------
     勝敗 & 終局処理
     -------------------------------------------------------------------------- */
  handleResign(resigningPlayer, cubeVal = this.cube.value) {
    const winner = -resigningPlayer;
    const earnedPoints = cubeVal;
    this.finishGame(winner, earnedPoints, '投了');
  }

  handleGameOver(winCheck) {
    sound.playWin();
    const typeNames = {
      single: 'シングル勝ち (1点)',
      gammon: 'ギャモン勝ち (2点)',
      backgammon: 'バックギャモン勝ち (3点)'
    };

    const earnedPoints = winCheck.points * this.cube.value;
    this.finishGame(winCheck.winner, earnedPoints, typeNames[winCheck.winType]);
  }

  finishGame(winner, earnedPoints, reason) {
    this.turnPhase = 'gameover';
    if (winner === PLAYER_WHITE) {
      this.matchState.whiteScore += earnedPoints;
    } else {
      this.matchState.blackScore += earnedPoints;
    }

    this.updateStatusHeader();

    const winnerName = (winner === PLAYER_WHITE) ? '白 (あなた)' : (this.config.mode === 'ai' ? 'AI' : '黒');
    const isMatchOver = (this.matchState.whiteScore >= this.config.matchPoints) || 
                        (this.matchState.blackScore >= this.config.matchPoints);

    const modal = document.getElementById('modal-gameover');
    const titleEl = document.getElementById('modal-gameover-title');
    const bodyEl = document.getElementById('modal-gameover-body');
    const btnNext = document.getElementById('btn-gameover-next');

    if (isMatchOver) {
      titleEl.textContent = '🏆 マッチ終了！';
      bodyEl.innerHTML = `
        <h3 style="color: var(--accent-gold); margin-bottom: 8px;">勝者: ${winnerName}</h3>
        <p>最終スコア: 白 ${this.matchState.whiteScore} - ${this.matchState.blackScore} 黒 (${this.config.matchPoints}ptマッチ)</p>
        <p style="margin-top: 8px; color: var(--text-sub);">勝敗理由: ${reason} (獲得: +${earnedPoints}点)</p>
      `;
      btnNext.style.display = 'none';
    } else {
      titleEl.textContent = 'ゲーム終了！';
      bodyEl.innerHTML = `
        <h3 style="color: var(--accent-gold); margin-bottom: 8px;">この局の勝者: ${winnerName}</h3>
        <p>獲得ポイント: +${earnedPoints}点 (${reason})</p>
        <p style="margin-top: 8px;">現在スコア: 白 ${this.matchState.whiteScore} - ${this.matchState.blackScore} 黒 (${this.config.matchPoints}ptマッチ)</p>
      `;
      btnNext.style.display = 'block';
    }

    modal.classList.add('active');
  }

  /* --------------------------------------------------------------------------
     ヒントモーダル
     -------------------------------------------------------------------------- */
  showHintModal() {
    const isHuman = (this.config.mode === 'pvp' || this.activePlayer === PLAYER_WHITE);
    if (!isHuman) return;

    const modal = document.getElementById('modal-hint');
    const body = document.getElementById('modal-hint-body');

    if (this.turnPhase !== 'moving' || this.remainingDice.length === 0) {
      body.innerHTML = '<p>ダイスを振った後にヒントをリクエストできます。</p>';
    } else {
      const hint = AIEngine.getPlayerHint(this.board, this.activePlayer, this.remainingDice);
      let html = `<p style="font-weight: 700; color: var(--accent-gold); margin-bottom: 8px;">${hint.advice}</p>`;
      if (hint.topMoves && hint.topMoves.length > 0) {
        html += '<ol style="padding-left: 20px; line-height: 1.6;">';
        hint.topMoves.forEach((item, idx) => {
          const moveStrs = item.seq.moves.map(m => {
            const f = m.fromBoard === 'bar' ? 'Bar' : `${m.fromBoard}pt`;
            const t = m.toBoard === 'off' ? 'Goal' : `${m.toBoard}pt`;
            return `${f}→${t}${m.isHit ? ' (Hit)' : ''}`;
          }).join(', ');
          html += `<li><strong>${moveStrs}</strong> (評価: ${Math.round(item.score)})</li>`;
        });
        html += '</ol>';
      }
      body.innerHTML = html;
    }

    modal.classList.add('active');
  }
}

// アプリケーション起動
window.addEventListener('DOMContentLoaded', () => {
  window.bgDojo = new BgDojoApp();
});
