/**
 * 雅 3D麻雀 メインコントローラ
 */
import { MahjongGame, PHASE } from './engine/game.js';
import {
  WIND_EAST, WIND_SOUTH, WIND_WEST, WIND_NORTH,
  getTileBadge, getTileLabel, getDoraFromIndicator,
} from './engine/tiles.js';
import { chooseAiDiscard, shouldAiRiichi } from './engine/ai.js';
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
    this.assistMode = 'full'; // 'full' | 'hint' | 'off'
    this.tapMode = 'two-step'; // 'two-step' | 'one-step'
    this.viewMode = 'auto';   // 'auto' | 'wide' | 'hand'
    this.riichiSelectMode = false;
    this.yakuNavOpen = false;
    this.selectedTile = null;
    this.hoveredTile = null;
    this.lastDiscardedId = -1;
    this.aiTimer = null;

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
      assistModeText: id('assist-mode-text'),
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
      callAdviceBox: id('call-advice-box'),
      actionButtons: id('action-buttons'),
      assistPanel: id('assist-panel'),
      shantenBadge: id('shanten-badge'),
      assistDetail: id('assist-detail'),
      btnYakuNavToggle: id('btn-yaku-nav-toggle'),
      yakuNavDrawer: id('yaku-nav-drawer'),
      startModal: id('start-modal'),
      btnStartGame: id('btn-start-game'),
      chkTileLabels: id('chk-tile-labels'),
      chkRedFives: id('chk-red-fives'),
      resultModal: id('result-modal'),
      resultContent: id('result-content'),
      btnNextRound: id('btn-next-round'),
      settingsModal: id('settings-modal'),
      setTileLabels: id('set-tile-labels'),
      btnResetCamera: id('btn-reset-camera'),
      btnRestartMatch: id('btn-restart-match'),
      btnCloseSettings: id('btn-close-settings'),
      iosFsModal: id('ios-fs-modal'),
      btnCloseIosFs: id('btn-close-ios-fs'),
    };
  }

  initScene() {
    this.scene = new Mahjong3DScene(this.dom.canvas, {
      shouldHighlightBest: () => this.assistMode === 'full' && !this.riichiSelectMode,
      onTileHover: (tile) => {
        this.hoveredTile = tile;
        this.renderAssistDetail();
      },
      onTileTap: (tile) => this.handlePlayerTileTap(tile),
      onEmptyTap: () => {
        if (!this.riichiSelectMode) {
          this.selectedTile = null;
          this.scene.setSelectedTile(-1);
          this.renderActionButtons();
          this.renderAssistDetail();
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
    // Segmented controls helper
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
    bindSeg('opt-assist-init', (v) => { this.setAssistMode(v); });
    bindSeg('opt-tap-mode', (v) => {
      this.tapMode = v;
      this.syncTapSegmented('set-tap-mode', v);
    });
    bindSeg('set-tap-mode', (v) => {
      this.tapMode = v;
      this.syncTapSegmented('opt-tap-mode', v);
    });

    this.dom.chkTileLabels.addEventListener('change', (e) => {
      const checked = e.target.checked;
      this.dom.setTileLabels.checked = checked;
      this.scene.setBeginnerLabels(checked);
    });
    this.dom.setTileLabels.addEventListener('change', (e) => {
      const checked = e.target.checked;
      this.dom.chkTileLabels.checked = checked;
      this.scene.setBeginnerLabels(checked);
    });

    this.dom.btnStartGame.addEventListener('click', () => {
      soundEngine.ensureContext();
      soundEngine.playSelect();
      this.dom.startModal.classList.add('hidden');
      this.game.matchType = chosenMatchType;
      this.game.useRedFives = this.dom.chkRedFives.checked;
      this.scene.setBeginnerLabels(this.dom.chkTileLabels.checked);
      this.game.startMatch(chosenMatchType);
    });

    this.dom.btnAssistMode.addEventListener('click', () => {
      const order = ['full', 'hint', 'off'];
      const next = order[(order.indexOf(this.assistMode) + 1) % order.length];
      this.setAssistMode(next);
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

    this.dom.btnYakuNavToggle.addEventListener('click', () => {
      this.yakuNavOpen = !this.yakuNavOpen;
      this.dom.yakuNavDrawer.classList.toggle('hidden', !this.yakuNavOpen);
      this.dom.btnYakuNavToggle.textContent = this.yakuNavOpen ? '狙える役 ▲' : '狙える役 ▼';
      soundEngine.playSelect();
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

  setAssistMode(mode) {
    this.assistMode = mode;
    const labels = { full: '徹底ナビ', hint: 'ヒント', off: 'アシストOFF' };
    this.dom.assistModeText.textContent = labels[mode];
    this.dom.btnAssistMode.classList.toggle('active', mode !== 'off');
    this.dom.assistPanel.classList.toggle('hidden', mode === 'off');
    this.scene.rebuildTargetTransforms();
    this.renderAssist();
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
    this.renderAssist();
    this.renderActionButtons();

    // AIターン進行スケジューリング
    if (snapshot.phase === PHASE.AI_TURN) {
      this.aiTimer = setTimeout(() => this.stepAI(), 420);
    } else if (snapshot.phase === PHASE.CALL_WINDOW) {
      this.game.processAiCallResponses();
    }
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

  handlePlayerTileTap(tile) {
    if (this.game.phase !== PHASE.PLAYER_TURN || this.game.turnPlayer !== 0) return;

    const p0 = this.game.players[0];
    // リーチ中はツモ牌のみ打牌可能
    if (p0.isRiichi && p0.drawnTile && tile.id !== p0.drawnTile.id) {
      this.showBanner('リーチ中はツモ牌のみ切れます', 900);
      return;
    }

    // リーチ宣言牌選択モード中
    if (this.riichiSelectMode) {
      const acts = this.currentAssist?.turnActions;
      const valid = acts?.riichiDiscards.some((r) => r.type === tile.type);
      if (!valid) {
        this.showBanner('その牌ではテンパイになりません', 1000);
        return;
      }
      this.game.discardTile(0, tile.id, true);
      return;
    }

    if (this.tapMode === 'one-step') {
      this.game.discardTile(0, tile.id, false);
      return;
    }

    // 2タップモード：1回目で選択浮き上がり、同じ牌をもう一度タップで打牌
    if (this.selectedTile && this.selectedTile.id === tile.id) {
      this.game.discardTile(0, tile.id, false);
    } else {
      soundEngine.playSelect();
      this.selectedTile = tile;
      this.scene.setSelectedTile(tile.id);
      this.renderActionButtons();
      this.renderAssistDetail();
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

    // ドラ表示
    this.dom.doraList.innerHTML = '';
    for (const ind of snapshot.doraIndicators) {
      const actualDora = getDoraFromIndicator(ind.type);
      const chip = createMiniTileElement(actualDora, false);
      chip.title = `表示:${getTileBadge(ind.type)} → ドラ:${getTileLabel(actualDora)}`;
      this.dom.doraList.appendChild(chip);
    }

    // 4家 / 2家 HUD
    const n = snapshot.players.length;
    const seatCardIds = [null, 'seat-right', 'seat-top', 'seat-left'];
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

      if (seatCardIds[slot]) {
        const card = document.getElementById(seatCardIds[slot]);
        if (card) card.classList.toggle('active-turn', snapshot.turnPlayer === i && snapshot.phase !== PHASE.ROUND_END);
      }
    }
  }

  renderAssist() {
    const assist = this.currentAssist;
    if (!assist || this.assistMode === 'off') return;

    // シャンテン表示
    const badge = this.dom.shantenBadge;
    badge.classList.remove('tenpai', 'furiten');
    if (assist.isFuriten) {
      badge.classList.add('furiten');
      badge.textContent = '⚠ フリテン中（ツモのみ可）';
    } else if (assist.shanten <= 0) {
      badge.classList.add('tenpai');
      badge.textContent = assist.shanten === -1 ? '✨ アガリ形完成！' : '🔥 聴牌！アガリ待ち！';
    } else {
      badge.textContent = `あと ${assist.shanten}枚で聴牌（${assist.shanten}シャンテン）`;
    }

    // 狙える役ナビ
    this.dom.yakuNavDrawer.innerHTML = '';
    for (const y of assist.potentialYakus) {
      const card = document.createElement('div');
      card.className = 'yaku-nav-item';
      card.innerHTML = `
        <div class="yaku-nav-top"><span>${y.name}</span><span>${y.hanText}</span></div>
        <div class="yaku-nav-status">${y.status} ${y.callOk ? '（鳴きOK）' : '（門前限定）'}</div>
        <div class="yaku-nav-tip">${y.tip}</div>
      `;
      this.dom.yakuNavDrawer.appendChild(card);
    }

    this.renderAssistDetail();
  }

  renderAssistDetail() {
    const assist = this.currentAssist;
    const container = this.dom.assistDetail;
    container.innerHTML = '';
    if (!assist || this.assistMode === 'off') return;

    // 1) 自分の手番：選択中またはホバー中の牌の打牌プレビュー
    if (assist.isMyTurn) {
      const targetTile = this.selectedTile || this.hoveredTile;
      if (targetTile) {
        const opt = assist.discardOptions.find((o) => o.type === targetTile.type);
        if (opt) {
          const tileChip = createMiniTileElement(targetTile.type, targetTile.isRed);
          container.appendChild(tileChip);

          const text = document.createElement('span');
          const shLabel = opt.nextShanten === 0 ? '聴牌（テンパイ）' : `${opt.nextShanten}シャンテン`;
          text.innerHTML = `を切ると → <strong>${shLabel}</strong>（有効牌 <strong>${opt.ukeireTotal}枚</strong>）`;
          container.appendChild(text);

          if (opt.isBest && this.assistMode === 'full') {
            const star = document.createElement('span');
            star.className = 'best-badge';
            star.textContent = '⭐ おすすめ打牌';
            container.appendChild(star);
          }

          if (this.assistMode === 'full') {
            for (const w of opt.waitsDetail.slice(0, 5)) {
              const wc = document.createElement('span');
              wc.className = 'wait-chip';
              wc.appendChild(createMiniTileElement(w.type));
              const remTxt = document.createElement('span');
              remTxt.textContent = `残${w.remaining}`;
              wc.appendChild(remTxt);
              container.appendChild(wc);
            }
            if (opt.waitsDetail.length > 5) {
              const more = document.createElement('span');
              more.textContent = `他${opt.waitsDetail.length - 5}種`;
              container.appendChild(more);
            }
          }
          return;
        }
      }

      // 未選択時のガイダンス
      const guide = document.createElement('span');
      if (this.riichiSelectMode) {
        guide.textContent = '⚡ リーチ宣言：捨てる牌をタップしてください（テンパイになる牌のみ有効）';
      } else {
        guide.textContent =
          this.tapMode === 'two-step'
            ? 'あなたの番です：牌をタップして確認 → もう1回タップ（または「切る」ボタン）で打牌します'
            : 'あなたの番です：切りたい牌をタップすると打牌します（緑に光る牌がおすすめ）';
      }
      container.appendChild(guide);
      return;
    }

    // 2) 他家の手番で自分がテンパイ中：待ち牌と予想点数を表示
    if (assist.currentWaits.length > 0) {
      const lbl = document.createElement('span');
      lbl.textContent = '待ち牌：';
      container.appendChild(lbl);

      for (const w of assist.currentWaits) {
        const wc = document.createElement('span');
        wc.className = 'wait-chip';
        wc.appendChild(createMiniTileElement(w.type));
        const info = document.createElement('span');
        if (w.noYakuOnRon) {
          info.textContent = `残${w.remaining}（ツモ${w.tsumoPoints}点・ロン役なし）`;
        } else {
          info.textContent = `残${w.remaining}（ロン${w.ronPoints}点 / ツモ${w.tsumoPoints}点）`;
        }
        wc.appendChild(info);
        container.appendChild(wc);
      }
      return;
    }

    const waitTxt = document.createElement('span');
    const curName = this.game.players[this.game.turnPlayer]?.name || '';
    waitTxt.textContent = `${curName} が思考中です…`;
    container.appendChild(waitTxt);
  }

  renderActionButtons() {
    const assist = this.currentAssist;
    const bar = this.dom.actionBar;
    const btns = this.dom.actionButtons;
    const advice = this.dom.callAdviceBox;
    btns.innerHTML = '';
    advice.innerHTML = '';
    advice.classList.add('hidden');

    const makeBtn = (text, cls, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `act-btn ${cls}`;
      b.textContent = text;
      b.addEventListener('click', onClick);
      btns.appendChild(b);
    };

    // 1) 鳴き・ロンウィンドウ
    if (this.game.phase === PHASE.CALL_WINDOW && assist?.callOffer) {
      const offer = assist.callOffer;
      const tile = assist.calledTile;
      const tileName = getTileBadge(tile.type, tile.isRed);

      if (this.assistMode === 'full' && assist.callAdvice) {
        const msgs = [];
        if (assist.callAdvice.pon) msgs.push(assist.callAdvice.pon);
        if (assist.callAdvice.chi) msgs.push(assist.callAdvice.chi);
        if (msgs.length > 0) {
          advice.textContent = msgs[0];
          advice.classList.remove('hidden');
        }
      }

      if (offer.ron) {
        makeBtn(`🔥 ロン！ (${offer.ron.score.ronPay.toLocaleString()}点)`, 'win', () => {
          this.game.submitCallResponse(0, { type: 'ron' });
        });
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
      makeBtn('スルー', 'pass', () => {
        this.game.submitCallResponse(0, { type: 'pass' });
      });

      bar.classList.remove('hidden');
      return;
    }

    // 2) 自分の手番アクション
    if (this.game.phase === PHASE.PLAYER_TURN && this.game.turnPlayer === 0) {
      const acts = assist?.turnActions;
      let any = false;

      if (acts?.canTsumo) {
        any = true;
        makeBtn(`✨ ツモ！ (${acts.tsumoResult.score.total.toLocaleString()}点)`, 'win', () => {
          this.game.declareTsumo(0);
        });
      }

      if (this.selectedTile && !this.riichiSelectMode && this.tapMode === 'two-step') {
        any = true;
        const name = getTileBadge(this.selectedTile.type, this.selectedTile.isRed);
        makeBtn(`${name} を切る`, 'discard', () => {
          this.game.discardTile(0, this.selectedTile.id, false);
        });
      }

      if (acts?.canRiichi) {
        any = true;
        if (this.riichiSelectMode) {
          makeBtn('リーチを取り消す', 'pass', () => {
            this.riichiSelectMode = false;
            this.scene.rebuildTargetTransforms();
            this.renderActionButtons();
            this.renderAssistDetail();
          });
        } else {
          makeBtn('⚡ リーチ宣言', 'riichi', () => {
            this.riichiSelectMode = true;
            this.selectedTile = null;
            this.scene.setSelectedTile(-1);
            this.renderActionButtons();
            this.renderAssistDetail();
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
        makeBtn('九種九牌で流局', 'pass', () => {
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

      // 和了手牌表示
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

      // 成立役＋初心者向け解説
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

    // 点数移動
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
