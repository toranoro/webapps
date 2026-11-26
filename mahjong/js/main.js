/**
 * 雅 3D麻雀 メインコントローラ
 */
import { MahjongGame, PHASE } from './engine/game.js';
import {
  WIND_EAST, WIND_SOUTH, WIND_WEST, WIND_NORTH,
  getTileBadge, getTileLabel, getDoraFromIndicator,
} from './engine/tiles.js';
import { chooseAiDiscard, shouldAiRiichi } from './engine/ai.js';
import { ATLAS_COLS, CELL_W, CELL_H, getAtlasSlotIndex } from './render/tileAtlas.js';
import { Mahjong3DScene } from './render/webglScene.js';
import { soundEngine } from './audio/sound.js';
import { createMiniTileElement } from './ui/tileMiniSvg.js';
import {
  setupViewportGuards,
  registerNoCacheServiceWorker,
  setupInstallAndFullscreen,
} from './ui/pwaAndGuard.js';

const WIND_LABELS = {
  [WIND_EAST]: '東',
  [WIND_SOUTH]: '南',
  [WIND_WEST]: '西',
  [WIND_NORTH]: '北',
};
const KANJI_ROUNDS = ['一', '二', '三', '四'];

class MahjongApp {
  constructor() {
    this.redGuideEnabled = true;
    this.autoRiichi = true;
    this.tapMode = 'two-step'; // 'two-step' | 'one-step'
    this.viewMode = 'auto';   // 'auto' | 'wide' | 'hand'
    this.riichiSelectMode = false;
    this.selectedTile = null;
    this.lastDiscardedId = -1;
    this.aiTimer = null;
    this.autoRiichiTimer = null;
    this.bigTileButtons = new Map();

    setupViewportGuards();
    registerNoCacheServiceWorker();

    this.cacheDom();
    this.initScene();
    this.initGame();
    this.bindUI();

    setupInstallAndFullscreen({
      installBtn: this.dom.btnInstall,
      fullscreenBtn: this.dom.btnFullscreen,
      iosFsModal: this.dom.iosFsModal,
      closeIosFsBtn: this.dom.btnCloseIosFs,
    });
  }

  cacheDom() {
    const id = (s) => document.getElementById(s);
    this.dom = {
      canvas: id('mahjong-canvas'),
      roundLabel: id('round-label'),
      honbaLabel: id('honba-label'),
      wallLabel: id('wall-label'),
      kyotakuLabel: id('kyotaku-label'),
      doraList: id('dora-list'),
      btnAssistMode: id('btn-assist-mode'),
      btnAutoRiichi: id('btn-auto-riichi'),
      btnViewMode: id('btn-view-mode'),
      viewModeText: id('view-mode-text'),
      btnSound: id('btn-sound'),
      soundIcon: id('sound-icon'),
      btnInstall: id('btn-install'),
      btnFullscreen: id('btn-fullscreen'),
      btnManual: id('btn-manual'),
      btnSettings: id('btn-settings'),
      callBanner: id('call-banner'),
      actionBar: id('action-bar'),
      actionButtons: id('action-buttons'),
      bigHandScroll: id('big-hand-scroll'),
      startModal: id('start-modal'),
      btnStartGame: id('btn-start-game'),
      chkAutoRiichi: id('chk-auto-riichi'),
      chkTileLabels: id('chk-tile-labels'),
      chkRedFives: id('chk-red-fives'),
      resultModal: id('result-modal'),
      resultContent: id('result-content'),
      btnNextRound: id('btn-next-round'),
      settingsModal: id('settings-modal'),
      setAutoRiichi: id('set-auto-riichi'),
      setTileLabels: id('set-tile-labels'),
      btnResetCamera: id('btn-reset-camera'),
      btnRestartMatch: id('btn-restart-match'),
      btnCloseSettings: id('btn-close-settings'),
      iosFsModal: id('ios-fs-modal'),
      btnCloseIosFs: id('btn-close-ios-fs'),
    };
  }

  getRedBorderTypes() {
    if (!this.redGuideEnabled) return null;
    if (this.game.phase !== PHASE.PLAYER_TURN || this.game.turnPlayer !== 0) return null;
    const assist = this.currentAssist;
    if (!assist) return null;
    // ツモ上がり可能なときは打牌赤枠は出さない
    if (assist.turnActions?.canTsumo) return null;

    if (this.riichiSelectMode && assist.turnActions?.riichiDiscards) {
      return new Set(assist.turnActions.riichiDiscards.map((r) => r.type));
    }
    if (assist.bestDiscardType !== null && assist.bestDiscardType !== undefined) {
      return new Set([assist.bestDiscardType]);
    }
    return null;
  }

  initScene() {
    this.scene = new Mahjong3DScene(this.dom.canvas, {
      getRedBorderTypes: () => this.getRedBorderTypes(),
      onTileTap: (tile) => this.handlePlayerTileTap(tile, 'upper'),
      onEmptyTap: () => {
        if (!this.riichiSelectMode) {
          this.clearSelection();
        }
      },
    });
  }

  initGame() {
    this.game = new MahjongGame({
      matchType: 'tonpu',
      useRedFives: true,
      enableTobi: true,
    });

    this.game.subscribe((eventType, detail, snapshot) => {
      this.onGameEvent(eventType, detail, snapshot);
    });
  }

  bindUI() {
    const bindSeg = (containerId, onSelect) => {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('.seg-btn');
        if (!btn) return;
        el.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        onSelect(btn.dataset.val);
      });
    };

    let chosenMatchType = 'tonpu';
    bindSeg('opt-match-type', (v) => { chosenMatchType = v; });
    bindSeg('opt-assist-init', (v) => { this.setRedGuide(v === 'on'); });
    bindSeg('opt-tap-mode', (v) => {
      this.tapMode = v;
      this.syncTapSegmented('set-tap-mode', v);
    });
    bindSeg('set-tap-mode', (v) => {
      this.tapMode = v;
      this.syncTapSegmented('opt-tap-mode', v);
    });

    this.dom.chkAutoRiichi.addEventListener('change', (e) => {
      this.setAutoRiichi(e.target.checked);
    });
    this.dom.setAutoRiichi.addEventListener('change', (e) => {
      this.setAutoRiichi(e.target.checked);
    });

    this.dom.chkTileLabels.addEventListener('change', (e) => {
      const checked = e.target.checked;
      this.dom.setTileLabels.checked = checked;
      this.scene.setBeginnerLabels(checked);
      this.renderBigHandTray(this.game.getSnapshot());
    });
    this.dom.setTileLabels.addEventListener('change', (e) => {
      const checked = e.target.checked;
      this.dom.chkTileLabels.checked = checked;
      this.scene.setBeginnerLabels(checked);
      this.renderBigHandTray(this.game.getSnapshot());
    });

    this.dom.btnStartGame.addEventListener('click', () => {
      soundEngine.ensureContext();
      soundEngine.playSelect();
      this.dom.startModal.classList.add('hidden');
      this.game.matchType = chosenMatchType;
      this.game.useRedFives = this.dom.chkRedFives.checked;
      this.setAutoRiichi(this.dom.chkAutoRiichi.checked);
      this.scene.setBeginnerLabels(this.dom.chkTileLabels.checked);
      this.game.startMatch(chosenMatchType);
    });

    this.dom.btnAssistMode.addEventListener('click', () => {
      this.setRedGuide(!this.redGuideEnabled);
      soundEngine.playSelect();
    });

    this.dom.btnAutoRiichi.addEventListener('click', () => {
      this.setAutoRiichi(!this.autoRiichi);
      soundEngine.playSelect();
    });

    this.dom.btnViewMode.addEventListener('click', () => {
      const order = ['auto', 'wide', 'hand'];
      const labels = { auto: '標準視点', wide: '卓俯瞰', hand: '手牌拡大' };
      this.viewMode = order[(order.indexOf(this.viewMode) + 1) % order.length];
      this.dom.viewModeText.textContent = labels[this.viewMode];
      this.scene.setViewMode(this.viewMode);
      soundEngine.playSelect();
    });

    this.dom.btnSound.addEventListener('click', () => {
      const next = !soundEngine.enabled;
      soundEngine.setEnabled(next);
      this.dom.soundIcon.textContent = next ? '🔊' : '🔇';
      this.dom.btnSound.classList.toggle('active', next);
      if (next) soundEngine.playSelect();
    });

    this.dom.btnManual.addEventListener('click', () => {
      window.open('./manual/index.html', '_blank', 'noopener');
    });

    this.dom.btnSettings.addEventListener('click', () => {
      this.dom.settingsModal.classList.remove('hidden');
    });
    this.dom.btnCloseSettings.addEventListener('click', () => {
      this.dom.settingsModal.classList.add('hidden');
    });
    this.dom.btnResetCamera.addEventListener('click', () => {
      this.scene.resetCameraTilt();
      this.dom.settingsModal.classList.add('hidden');
      soundEngine.playSelect();
    });
    this.dom.btnRestartMatch.addEventListener('click', () => {
      this.dom.settingsModal.classList.add('hidden');
      this.dom.resultModal.classList.add('hidden');
      this.dom.startModal.classList.remove('hidden');
    });

    this.dom.btnNextRound.addEventListener('click', () => {
      this.dom.resultModal.classList.add('hidden');
      if (this.game.phase === PHASE.MATCH_END) {
        this.dom.startModal.classList.remove('hidden');
      } else {
        this.game.proceedNextRound();
      }
      soundEngine.playSelect();
    });
  }

  syncTapSegmented(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    el.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.val === val));
  }

  setRedGuide(enabled) {
    this.redGuideEnabled = !!enabled;
    this.dom.btnAssistMode.classList.toggle('active', this.redGuideEnabled);
    this.scene.rebuildTargetTransforms();
    this.syncBigHandTrayStates();
  }

  setAutoRiichi(enabled) {
    this.autoRiichi = !!enabled;
    this.dom.chkAutoRiichi.checked = this.autoRiichi;
    this.dom.setAutoRiichi.checked = this.autoRiichi;
    this.dom.btnAutoRiichi.classList.toggle('active', this.autoRiichi);
    if (this.autoRiichi) {
      this.scheduleAutoRiichiIfNeeded();
    } else {
      clearTimeout(this.autoRiichiTimer);
    }
  }

  clearSelection() {
    this.selectedTile = null;
    this.scene.setSelectedTile(-1);
    this.syncBigHandTrayStates();
  }

  showBanner(text, duration = 1200) {
    this.dom.callBanner.textContent = text;
    this.dom.callBanner.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      this.dom.callBanner.classList.add('hidden');
    }, duration);
  }

  onGameEvent(eventType, detail, snapshot) {
    clearTimeout(this.aiTimer);
    clearTimeout(this.autoRiichiTimer);

    if (eventType === 'ROUND_START') {
      this.lastDiscardedId = -1;
      this.selectedTile = null;
      this.riichiSelectMode = false;
      this.scene.setSelectedTile(-1);
    } else if (eventType === 'DRAW') {
      if (detail.playerIndex === 0) soundEngine.playDraw();
    } else if (eventType === 'DISCARD') {
      this.lastDiscardedId = detail.tile.id;
      this.selectedTile = null;
      this.riichiSelectMode = false;
      this.scene.setSelectedTile(-1);
      if (detail.isRiichi) {
        soundEngine.playRiichi();
        this.showBanner(`${snapshot.players[detail.playerIndex].name}：リーチ！`, 1400);
      } else {
        soundEngine.playDiscard(false);
      }
    } else if (eventType === 'MELD') {
      soundEngine.playCall();
      const callNames = { pon: 'ポン！', chi: 'チー！', minkan: 'カン！', ankan: 'カン！', kakan: 'カン！' };
      this.showBanner(`${snapshot.players[detail.playerIndex].name}：${callNames[detail.meldType] || '鳴き'}`, 1050);
    } else if (eventType === 'ROUND_END') {
      if (detail.type === 'win') {
        soundEngine.playWin();
      }
      this.showRoundResult(detail, snapshot);
    } else if (eventType === 'MATCH_END') {
      this.showMatchResult(detail);
    }

    const assist = this.game.getPlayerAssist(0);
    this.currentAssist = assist;
    this.scene.updateGameState(snapshot, assist, this.lastDiscardedId);
    this.renderHUD(snapshot);
    this.renderBigHandTray(snapshot);
    this.renderActionButtons();

    if (snapshot.phase === PHASE.AI_TURN) {
      this.aiTimer = setTimeout(() => this.stepAI(), 420);
    } else if (snapshot.phase === PHASE.CALL_WINDOW) {
      this.game.processAiCallResponses();
    } else if (snapshot.phase === PHASE.PLAYER_TURN && snapshot.turnPlayer === 0) {
      this.scheduleAutoRiichiIfNeeded();
    }
  }

  scheduleAutoRiichiIfNeeded() {
    clearTimeout(this.autoRiichiTimer);
    if (!this.autoRiichi) return;
    if (this.game.phase !== PHASE.PLAYER_TURN || this.game.turnPlayer !== 0) return;
    const p0 = this.game.players[0];
    if (!p0.isRiichi || !p0.drawnTile) return;

    const acts = this.currentAssist?.turnActions;
    // ツモアガリできる場合は自動停止し「ツモ！」ボタンの押下を待つ
    if (acts?.canTsumo) return;

    const drawnId = p0.drawnTile.id;
    this.autoRiichiTimer = setTimeout(() => {
      if (
        this.autoRiichi &&
        this.game.phase === PHASE.PLAYER_TURN &&
        this.game.turnPlayer === 0 &&
        this.game.players[0].isRiichi &&
        this.game.players[0].drawnTile?.id === drawnId
      ) {
        this.game.discardTile(0, drawnId, false);
      }
    }, 450);
  }

  stepAI() {
    if (this.game.phase !== PHASE.AI_TURN) return;
    const idx = this.game.turnPlayer;
    const p = this.game.players[idx];
    const acts = this.game.getTurnActions(idx);

    if (acts.canTsumo) {
      this.game.declareTsumo(idx);
      return;
    }

    if (acts.ankanOptions.length > 0 && Math.random() < 0.7) {
      this.game.declareAnkan(idx, acts.ankanOptions[0]);
      return;
    }

    const discardTile = chooseAiDiscard(p, this.game);
    if (discardTile) {
      const doRiichi = acts.canRiichi && shouldAiRiichi(p, discardTile, this.game);
      this.game.discardTile(idx, discardTile.id, doRiichi);
    }
  }

  handlePlayerTileTap(tile, source = 'upper') {
    if (this.game.phase !== PHASE.PLAYER_TURN || this.game.turnPlayer !== 0) return;

    const acts = this.currentAssist?.turnActions;
    if (acts?.canTsumo) {
      this.showBanner('アガれます！「ツモ！」を押してください', 1000);
      return;
    }

    const p0 = this.game.players[0];
    if (p0.isRiichi && p0.drawnTile && tile.id !== p0.drawnTile.id) {
      this.showBanner('リーチ中はツモ牌のみ切れます', 900);
      return;
    }

    if (this.riichiSelectMode) {
      const valid = acts?.riichiDiscards.some((r) => r.type === tile.type);
      if (!valid) {
        this.showBanner('赤枠の牌でリーチできます', 1000);
        return;
      }
      this.game.discardTile(0, tile.id, true);
      return;
    }

    if (this.tapMode === 'one-step') {
      this.game.discardTile(0, tile.id, false);
      return;
    }

    // 2タップモード：1回目で上段・下段ともにスッと上昇、同じ牌をもう一度タップで打牌
    if (this.selectedTile && this.selectedTile.id === tile.id) {
      this.game.discardTile(0, tile.id, false);
    } else {
      soundEngine.playSelect();
      this.selectedTile = tile;
      this.scene.setSelectedTile(tile.id);
      this.syncBigHandTrayStates(source === 'upper');
    }
  }

  renderHUD(snapshot) {
    const windStr = WIND_LABELS[snapshot.roundWind] || '東';
    this.dom.roundLabel.textContent = `${windStr}${KANJI_ROUNDS[snapshot.roundNumber]}局`;
    this.dom.honbaLabel.textContent = `${snapshot.honba}本場`;
    this.dom.wallLabel.textContent = `残 ${snapshot.wallRemaining}`;

    if (snapshot.riichiSticks > 0) {
      this.dom.kyotakuLabel.textContent = `供託 ${snapshot.riichiSticks}本`;
      this.dom.kyotakuLabel.classList.remove('hidden');
    } else {
      this.dom.kyotakuLabel.classList.add('hidden');
    }

    this.dom.doraList.innerHTML = '';
    for (const ind of snapshot.doraIndicators) {
      const actualDora = getDoraFromIndicator(ind.type);
      const chip = createMiniTileElement(actualDora, false);
      chip.title = `表示:${getTileBadge(ind.type)} → ドラ:${getTileLabel(actualDora)}`;
      this.dom.doraList.appendChild(chip);
    }

    const n = snapshot.players.length;
    const seatCardIds = ['seat-self', 'seat-right', 'seat-top', 'seat-left'];
    document.getElementById('seat-right')?.classList.toggle('hidden', n === 2);
    document.getElementById('seat-left')?.classList.toggle('hidden', n === 2);

    for (let i = 0; i < n; i++) {
      const p = snapshot.players[i];
      const slot = n === 2 ? (i === 0 ? 0 : 2) : i;
      const windEl = document.getElementById(`seat-wind-${slot}`);
      const nameEl = document.getElementById(`seat-name-${slot}`);
      const scoreEl = document.getElementById(`seat-score-${slot}`);
      const riichiEl = document.getElementById(`seat-riichi-${slot}`);

      if (windEl) {
        windEl.textContent = WIND_LABELS[p.seatWind];
        windEl.classList.toggle('dealer', i === snapshot.dealerIndex);
      }
      if (nameEl) nameEl.textContent = p.name;
      if (scoreEl) scoreEl.textContent = p.score.toLocaleString();
      if (riichiEl) riichiEl.classList.toggle('hidden', !p.isRiichi);

      const card = document.getElementById(seatCardIds[slot]);
      if (card) card.classList.toggle('active-turn', snapshot.turnPlayer === i && snapshot.phase !== PHASE.ROUND_END);
    }
  }

  renderBigHandTray(snapshot) {
    const container = this.dom.bigHandScroll;
    if (!container || !snapshot) return;
    const p0 = snapshot.players[0];
    const hand = p0.hand;
    const hasDrawnGap = snapshot.turnPlayer === 0 && p0.drawnTileId !== -1 && hand.some((t) => t.id === p0.drawnTileId);

    const ordered = [];
    let drawnEntry = null;
    for (const t of hand) {
      if (hasDrawnGap && t.id === p0.drawnTileId) drawnEntry = t;
      else ordered.push(t);
    }
    if (drawnEntry) ordered.push(drawnEntry);

    const atlas = this.scene.getAtlasCanvas();
    container.innerHTML = '';
    this.bigTileButtons.clear();

    for (const t of ordered) {
      const isDrawn = hasDrawnGap && t.id === p0.drawnTileId;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'big-tile-btn';
      if (isDrawn) btn.classList.add('is-drawn');
      btn.setAttribute('aria-label', getTileBadge(t.type, t.isRed));

      const cvs = document.createElement('canvas');
      cvs.width = 160;
      cvs.height = 220;
      const ctx = cvs.getContext('2d');
      const slot = getAtlasSlotIndex(t.type, t.isRed);
      const col = slot % ATLAS_COLS;
      const row = Math.floor(slot / ATLAS_COLS);
      ctx.drawImage(atlas, col * CELL_W, row * CELL_H, CELL_W, CELL_H, 0, 0, cvs.width, cvs.height);

      btn.appendChild(cvs);
      btn.addEventListener('click', () => this.handlePlayerTileTap(t, 'lower'));
      container.appendChild(btn);
      this.bigTileButtons.set(t.id, { btn, tile: t, isDrawn });
    }

    this.syncBigHandTrayStates(false);
    // 新しくツモった時はツモ牌が見える右端へ横スクロール（scrollIntoViewは使わずコンテナ内scrollLeftのみ操作）
    if (hasDrawnGap && drawnEntry) {
      requestAnimationFrame(() => {
        container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' });
      });
    }
  }

  scrollBigTileToCenter(btn) {
    const container = this.dom.bigHandScroll;
    if (!container || !btn) return;
    const targetLeft = btn.offsetLeft - (container.clientWidth - btn.offsetWidth) * 0.5;
    container.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }

  syncBigHandTrayStates(scrollSelectedIntoView = false) {
    const p0 = this.game.players[0];
    const isRiichiLocked = p0.isRiichi && this.game.turnPlayer === 0;
    const redTypes = this.getRedBorderTypes();

    for (const [id, item] of this.bigTileButtons.entries()) {
      const isSel = this.selectedTile && this.selectedTile.id === id;
      const isRedGuide = !!(redTypes && redTypes.has(item.tile.type));
      const dimmed = isRiichiLocked && !item.isDrawn;

      item.btn.classList.toggle('selected', !!isSel);
      item.btn.classList.toggle('red-guide', isRedGuide);
      item.btn.classList.toggle('dimmed', dimmed);

      if (scrollSelectedIntoView && isSel) {
        this.scrollBigTileToCenter(item.btn);
      }
    }
  }

  renderActionButtons() {
    const assist = this.currentAssist;
    const bar = this.dom.actionBar;
    const btns = this.dom.actionButtons;
    btns.innerHTML = '';

    const makeBtn = (text, cls, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `act-btn ${cls}`;
      b.textContent = text;
      b.addEventListener('click', onClick);
      btns.appendChild(b);
    };

    // 1) 鳴き・ロンウィンドウ（卓上の空きスペース＝上段の上部に配置）
    if (this.game.phase === PHASE.CALL_WINDOW && assist?.callOffer) {
      const offer = assist.callOffer;
      const tile = assist.calledTile;
      const tileName = getTileBadge(tile.type, tile.isRed);

      // ロン可能なときは「やめる」ボタンを出さず、達成感のある「ロン！」のみを表示
      if (offer.ron) {
        makeBtn(`🔥 ロン！`, 'win', () => {
          this.game.submitCallResponse(0, { type: 'ron' });
        });
        bar.classList.remove('hidden');
        return;
      }

      if (offer.pon) {
        makeBtn(`ポン (${tileName})`, 'call', () => {
          this.game.submitCallResponse(0, { type: 'pon', option: offer.pon });
        });
      }
      if (offer.minkan) {
        makeBtn(`カン (${tileName})`, 'call', () => {
          this.game.submitCallResponse(0, { type: 'minkan', option: offer.minkan });
        });
      }
      if (offer.chi && offer.chi.length > 0) {
        for (const opt of offer.chi) {
          const pairLabel = opt.handTiles.map((t) => getTileBadge(t.type, t.isRed)).join('・');
          makeBtn(`チー [${pairLabel}]`, 'call', () => {
            this.game.submitCallResponse(0, { type: 'chi', option: opt });
          });
        }
      }
      makeBtn('やめる', 'pass', () => {
        this.game.submitCallResponse(0, { type: 'pass' });
      });

      bar.classList.remove('hidden');
      return;
    }

    // 2) 自分の手番アクション
    if (this.game.phase === PHASE.PLAYER_TURN && this.game.turnPlayer === 0) {
      const acts = assist?.turnActions;

      // ツモアガリ可能なときは「やめる」ボタン無しで大きく「ツモ！」のみ表示
      if (acts?.canTsumo) {
        makeBtn(`✨ ツモ！`, 'win', () => {
          this.game.declareTsumo(0);
        });
        bar.classList.remove('hidden');
        return;
      }

      let any = false;
      if (acts?.canRiichi) {
        any = true;
        if (this.riichiSelectMode) {
          makeBtn('リーチをやめる', 'pass', () => {
            this.riichiSelectMode = false;
            this.scene.rebuildTargetTransforms();
            this.syncBigHandTrayStates();
            this.renderActionButtons();
          });
        } else {
          makeBtn('⚡ リーチ', 'riichi', () => {
            this.riichiSelectMode = true;
            this.clearSelection();
            this.scene.rebuildTargetTransforms();
            this.syncBigHandTrayStates();
            this.renderActionButtons();
          });
        }
      }

      if (acts?.ankanOptions.length > 0) {
        any = true;
        for (const t of acts.ankanOptions) {
          makeBtn(`暗槓 (${getTileBadge(t)})`, 'call', () => {
            this.game.declareAnkan(0, t);
          });
        }
      }

      if (acts?.kakanOptions.length > 0) {
        any = true;
        for (const k of acts.kakanOptions) {
          makeBtn(`加槓 (${getTileBadge(k.tile.type)})`, 'call', () => {
            this.game.declareKakan(0, k.meldIndex, k.tile.id);
          });
        }
      }

      if (acts?.canKyuushu) {
        any = true;
        makeBtn('九種九牌', 'pass', () => {
          this.game.declareKyuushu(0);
        });
      }

      bar.classList.toggle('hidden', !any);
      return;
    }

    bar.classList.add('hidden');
  }

  showRoundResult(res, snapshot) {
    const box = this.dom.resultContent;
    box.innerHTML = '';

    if (res.type === 'win') {
      const winner = snapshot.players[res.winnerIdx];
      const wr = res.winResult;
      const winKind = wr.isTsumo ? 'ツモアガリ' : 'ロンアガリ';
      const limitStr = wr.score.limitName ? `【${wr.score.limitName}】` : '';

      const header = document.createElement('div');
      header.className = 'res-header';
      header.innerHTML = `
        <div class="res-win-type">${winner.name} ${winKind}！</div>
        <div class="res-score-big">${limitStr} ${wr.score.total.toLocaleString()}点</div>
        <div style="font-size:0.84rem;color:#c8d8cf;margin-top:4px;">
          ${wr.isYakuman ? '役満' : `${wr.han}翻 ${wr.fu}符`}
          ${res.honbaUsed > 0 ? `（${res.honbaUsed}本場含む）` : ''}
          ${res.usedKyotaku > 0 ? `（供託リーチ棒 ${res.usedKyotaku}本含む）` : ''}
        </div>
      `;
      box.appendChild(header);

      const handRow = document.createElement('div');
      handRow.className = 'res-hand-row';
      for (const t of winner.hand) {
        handRow.appendChild(createMiniTileElement(t.type, t.isRed));
      }
      if (!wr.isTsumo && res.winTile) {
        const sep = document.createElement('span');
        sep.textContent = ' ＋ ';
        sep.style.margin = '0 4px';
        handRow.appendChild(sep);
        handRow.appendChild(createMiniTileElement(res.winTile.type, res.winTile.isRed));
      }
      for (const m of winner.melds) {
        const sep = document.createElement('span');
        sep.textContent = ' | ';
        sep.style.margin = '0 4px';
        handRow.appendChild(sep);
        for (const mt of m.tiles) {
          handRow.appendChild(createMiniTileElement(mt.type, mt.isRed));
        }
      }
      box.appendChild(handRow);

      const yakuList = document.createElement('div');
      yakuList.className = 'res-yaku-list';
      for (const y of wr.yakus) {
        const item = document.createElement('div');
        item.className = 'res-yaku-item';
        item.innerHTML = `
          <div class="res-yaku-top">
            <span>${y.name}</span>
            <span>${y.yakuman ? '役満' : `${y.han}翻`}</span>
          </div>
          <div class="res-yaku-desc">${y.desc}</div>
        `;
        yakuList.appendChild(item);
      }
      box.appendChild(yakuList);
    } else {
      const header = document.createElement('div');
      header.className = 'res-header';
      header.innerHTML = `
        <div class="res-win-type">流局</div>
        <div style="font-size:0.9rem;color:#c8d8cf;margin-top:6px;">${res.reason}</div>
      `;
      box.appendChild(header);
    }

    const deltasGrid = document.createElement('div');
    deltasGrid.className = 'res-deltas';
    for (let i = 0; i < snapshot.players.length; i++) {
      const p = snapshot.players[i];
      const d = res.deltas[i];
      const dStr = d > 0 ? `+${d.toLocaleString()}` : d < 0 ? d.toLocaleString() : '±0';
      const cls = d > 0 ? 'delta-pos' : d < 0 ? 'delta-neg' : '';
      const card = document.createElement('div');
      card.className = 'res-delta-card';
      card.innerHTML = `<span>${p.name}</span><span>${p.score.toLocaleString()} (<span class="${cls}">${dStr}</span>)</span>`;
      deltasGrid.appendChild(card);
    }
    box.appendChild(deltasGrid);

    this.dom.btnNextRound.textContent = '次の局へ進む';
    this.dom.resultModal.classList.remove('hidden');
  }

  showMatchResult(res) {
    const box = this.dom.resultContent;
    box.innerHTML = `
      <div class="res-header">
        <div class="res-win-type">対局終了！</div>
        <div style="font-size:0.88rem;color:#c8d8cf;margin-top:4px;">${res.reason}</div>
      </div>
      <div class="res-yaku-list">
        ${res.rankings.map((r, idx) => `
          <div class="res-yaku-item">
            <div class="res-yaku-top">
              <span>${idx + 1}位：${r.name}</span>
              <span>${r.score.toLocaleString()}点</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    this.dom.btnNextRound.textContent = 'タイトルへ戻る';
    this.dom.resultModal.classList.remove('hidden');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__mahjongApp = new MahjongApp();
});
