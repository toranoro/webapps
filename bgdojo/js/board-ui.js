/**
 * バックギャモン道場 (bgdojo) - 盤面描画・UIインタラクション
 * board-ui.js
 * 
 * - 高視認性SVG/HTML5盤面レンダリング
 * - 駒スタック表示（6枚以上の数字バッジ対応）
 * - リアルタイム合法手ハイライト
 * - ダイス・ダブリングキューブ表示
 * - ピップカウント・スコア表示
 */

import { PLAYER_WHITE, PLAYER_BLACK, BackgammonBoard } from './bg-rules.js';

export class BoardUI {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      showPointNumbers: true,
      highContrast: false,
      ...options
    };

    this.selectedNormPoint = null;
    this.highlightedDestinations = [];
    this.onMoveSelected = null; // (fromNorm, toNorm) => void
    this.onCheckerClick = null;  // (fromNorm) => void

    this.initBoardDOM();
  }

  initBoardDOM() {
    this.container.innerHTML = `
      <div class="board-frame" id="board-frame">
        <!-- 上部ポイント (13〜24) -->
        <div class="points-row top-row" id="points-top">
          <div class="quadrant outer-quadrant" id="quadrant-top-outer"></div>
          <div class="center-bar-slot top-bar-slot" id="bar-top"></div>
          <div class="quadrant inner-quadrant" id="quadrant-top-inner"></div>
        </div>

        <!-- 中央バー & ダイスエリア -->
        <div class="board-center-divider" id="board-divider">
          <div class="bar-area" id="bar-area">
            <div class="bar-player-slot" id="bar-slot-black" title="黒のバー駒"></div>
            <div class="cube-slot" id="cube-slot" title="ダブリングキューブ"></div>
            <div class="bar-player-slot" id="bar-slot-white" title="白のバー駒"></div>
          </div>
          <div class="dice-arena" id="dice-arena">
            <div class="dice-container" id="dice-container"></div>
          </div>
        </div>

        <!-- 下部ポイント (12〜1) -->
        <div class="points-row bottom-row" id="points-bottom">
          <div class="quadrant outer-quadrant" id="quadrant-bottom-outer"></div>
          <div class="center-bar-slot bottom-bar-slot" id="bar-bottom"></div>
          <div class="quadrant inner-quadrant" id="quadrant-bottom-inner"></div>
        </div>

        <!-- 右端ベアオフトレイ -->
        <div class="bearoff-tray" id="bearoff-tray">
          <div class="bearoff-slot top-bearoff" id="bearoff-black" title="黒のベアオフ（ゴール）"></div>
          <div class="bearoff-divider"></div>
          <div class="bearoff-slot bottom-bearoff" id="bearoff-white" title="白のベアオフ（ゴール）"></div>
        </div>
      </div>
    `;

    // 24個のポイント要素を生成
    // 上段: 13〜18 (アウター左), 19〜24 (インナー右)
    const topOuter = document.getElementById('quadrant-top-outer');
    for (let pt = 13; pt <= 18; pt++) {
      topOuter.appendChild(this.createPointElement(pt, 'top', (pt % 2 === 1) ? 'dark' : 'light'));
    }
    const topInner = document.getElementById('quadrant-top-inner');
    for (let pt = 19; pt <= 24; pt++) {
      topInner.appendChild(this.createPointElement(pt, 'top', (pt % 2 === 1) ? 'dark' : 'light'));
    }

    // 下段: 12〜7 (アウター左), 6〜1 (インナー右)
    const bottomOuter = document.getElementById('quadrant-bottom-outer');
    for (let pt = 12; pt >= 7; pt--) {
      bottomOuter.appendChild(this.createPointElement(pt, 'bottom', (pt % 2 === 1) ? 'dark' : 'light'));
    }
    const bottomInner = document.getElementById('quadrant-bottom-inner');
    for (let pt = 6; pt >= 1; pt--) {
      bottomInner.appendChild(this.createPointElement(pt, 'bottom', (pt % 2 === 1) ? 'dark' : 'light'));
    }

    // ベアオフスロットのクリックイベント
    document.getElementById('bearoff-white').addEventListener('click', () => {
      this.handleBearOffClick(PLAYER_WHITE);
    });
    document.getElementById('bearoff-black').addEventListener('click', () => {
      this.handleBearOffClick(PLAYER_BLACK);
    });

    // バーのクリックイベント
    document.getElementById('bar-slot-white').addEventListener('click', () => {
      this.handleBarClick(PLAYER_WHITE);
    });
    document.getElementById('bar-slot-black').addEventListener('click', () => {
      this.handleBarClick(PLAYER_BLACK);
    });
  }

  createPointElement(pointNum, position, colorClass) {
    const el = document.createElement('div');
    el.className = `board-point ${position} ${colorClass}`;
    el.id = `point-${pointNum}`;
    el.dataset.point = pointNum;

    el.innerHTML = `
      <div class="triangle-graphic"></div>
      <div class="point-number">${pointNum}</div>
      <div class="checkers-stack" id="stack-${pointNum}"></div>
    `;

    el.addEventListener('click', (e) => {
      this.handlePointClick(pointNum);
    });

    return el;
  }

  /**
   * 盤面全体のレンダリング
   * @param {BackgammonBoard} board 
   * @param {number} activePlayer 
   * @param {number[]} movableNormPoints 動かせる駒のある正規化ポイント
   */
  render(board, activePlayer, movableNormPoints = []) {
    // 1. 各ポイントの駒を描画
    for (let pt = 1; pt <= 24; pt++) {
      const ptInfo = board.points[pt];
      const stackEl = document.getElementById(`stack-${pt}`);
      const pointEl = document.getElementById(`point-${pt}`);
      stackEl.innerHTML = '';

      const normPt = BackgammonBoard.toNormalized(activePlayer, pt);
      const isMovable = movableNormPoints.includes(normPt);
      const isSelected = (this.selectedNormPoint === normPt);
      const isDestination = this.highlightedDestinations.some(d => d.toBoard === pt);

      pointEl.classList.toggle('movable-point', isMovable);
      pointEl.classList.toggle('selected-point', isSelected);
      pointEl.classList.toggle('destination-point', isDestination);

      if (ptInfo.count > 0) {
        this.renderCheckersStack(stackEl, ptInfo.player, ptInfo.count, isMovable, isSelected);
      }
    }

    // 2. バーの描画
    this.renderBar(board, activePlayer, movableNormPoints);

    // 3. ベアオフトレイの描画
    this.renderBearOff(board, activePlayer);
  }

  renderCheckersStack(container, player, count, isMovable, isSelected) {
    const playerClass = player === PLAYER_WHITE ? 'checker-white' : 'checker-black';
    const maxVisible = 5;
    const visibleCount = Math.min(count, maxVisible);

    for (let i = 0; i < visibleCount; i++) {
      const ch = document.createElement('div');
      ch.className = `checker ${playerClass}`;
      if (isMovable) ch.classList.add('can-move');
      if (isSelected) ch.classList.add('selected');

      // 6枚以上の場合は最上段（最後）の駒にバッジを表示
      if (i === visibleCount - 1 && count > maxVisible) {
        const badge = document.createElement('span');
        badge.className = 'checker-badge';
        badge.textContent = count;
        ch.appendChild(badge);
      }
      container.appendChild(ch);
    }
  }

  renderBar(board, activePlayer, movableNormPoints) {
    const barWhiteEl = document.getElementById('bar-slot-white');
    const barBlackEl = document.getElementById('bar-slot-black');

    barWhiteEl.innerHTML = '';
    barBlackEl.innerHTML = '';

    const whiteCount = board.bar[PLAYER_WHITE];
    const blackCount = board.bar[PLAYER_BLACK];

    const isWhiteMovable = (activePlayer === PLAYER_WHITE && movableNormPoints.includes(25));
    const isBlackMovable = (activePlayer === PLAYER_BLACK && movableNormPoints.includes(25));

    const isWhiteSelected = (activePlayer === PLAYER_WHITE && this.selectedNormPoint === 25);
    const isBlackSelected = (activePlayer === PLAYER_BLACK && this.selectedNormPoint === 25);

    barWhiteEl.classList.toggle('movable-bar', isWhiteMovable);
    barWhiteEl.classList.toggle('selected-bar', isWhiteSelected);
    barBlackEl.classList.toggle('movable-bar', isBlackMovable);
    barBlackEl.classList.toggle('selected-bar', isBlackSelected);

    if (whiteCount > 0) {
      this.renderCheckersStack(barWhiteEl, PLAYER_WHITE, whiteCount, isWhiteMovable, isWhiteSelected);
      const label = document.createElement('div');
      label.className = 'bar-count-label';
      label.textContent = `Bar: ${whiteCount}`;
      barWhiteEl.appendChild(label);
    }

    if (blackCount > 0) {
      this.renderCheckersStack(barBlackEl, PLAYER_BLACK, blackCount, isBlackMovable, isBlackSelected);
      const label = document.createElement('div');
      label.className = 'bar-count-label';
      label.textContent = `Bar: ${blackCount}`;
      barBlackEl.appendChild(label);
    }
  }

  renderBearOff(board, activePlayer) {
    const offWhiteEl = document.getElementById('bearoff-white');
    const offBlackEl = document.getElementById('bearoff-black');

    offWhiteEl.innerHTML = '';
    offBlackEl.innerHTML = '';

    const whiteOff = board.off[PLAYER_WHITE];
    const blackOff = board.off[PLAYER_BLACK];

    const isWhiteDest = this.highlightedDestinations.some(d => d.toBoard === 'off' && activePlayer === PLAYER_WHITE);
    const isBlackDest = this.highlightedDestinations.some(d => d.toBoard === 'off' && activePlayer === PLAYER_BLACK);

    offWhiteEl.classList.toggle('destination-point', isWhiteDest);
    offBlackEl.classList.toggle('destination-point', isBlackDest);

    // 白のオフ駒表示
    offWhiteEl.innerHTML = `
      <div class="bearoff-label">白 OFF</div>
      <div class="bearoff-checkers-list">
        ${this.generateOffBars(whiteOff, 'white')}
      </div>
      <div class="bearoff-number">${whiteOff} / 15</div>
    `;

    // 黒のオフ駒表示
    offBlackEl.innerHTML = `
      <div class="bearoff-label">黒 OFF</div>
      <div class="bearoff-checkers-list">
        ${this.generateOffBars(blackOff, 'black')}
      </div>
      <div class="bearoff-number">${blackOff} / 15</div>
    `;
  }

  generateOffBars(count, color) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `<div class="bearoff-bar bearoff-bar-${color}"></div>`;
    }
    return html;
  }

  /**
   * ダイスの表示
   * @param {number[]} dice 出目配列 (例: [3, 5] または [4, 4, 4, 4])
   * @param {number[]} usedIndices 使用済みインデックス
   * @param {number} player 手番プレイヤー
   */
  renderDice(dice, usedIndices = [], player = PLAYER_WHITE) {
    const arena = document.getElementById('dice-container');
    arena.innerHTML = '';

    if (!dice || dice.length === 0) return;

    dice.forEach((val, idx) => {
      const isUsed = usedIndices.includes(idx);
      const dieEl = document.createElement('div');
      dieEl.className = `bg-die die-player-${player === PLAYER_WHITE ? 'white' : 'black'}`;
      if (isUsed) dieEl.classList.add('die-used');

      dieEl.innerHTML = this.getDieDotsHTML(val);
      arena.appendChild(dieEl);
    });
  }

  getDieDotsHTML(val) {
    const dotPatterns = {
      1: ['center'],
      2: ['top-left', 'bottom-right'],
      3: ['top-left', 'center', 'bottom-right'],
      4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
      6: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right']
    };

    const dots = dotPatterns[val] || [];
    return dots.map(pos => `<span class="die-dot dot-${pos}"></span>`).join('');
  }

  /**
   * ダブリングキューブの表示
   * @param {number} value 1, 2, 4, 8, 16, 32, 64
   * @param {number|'center'} owner 1: 白, -1: 黒, 0/'center': 中央
   */
  renderCube(value = 1, owner = 0) {
    const cubeEl = document.getElementById('cube-slot');
    cubeEl.className = `cube-slot cube-val-${value}`;
    if (owner === PLAYER_WHITE) cubeEl.classList.add('owner-white');
    else if (owner === PLAYER_BLACK) cubeEl.classList.add('owner-black');
    else cubeEl.classList.add('owner-center');

    cubeEl.innerHTML = `
      <div class="cube-cube">
        <span class="cube-text">${value === 1 ? '64' : value}</span>
      </div>
    `;
  }

  /**
   * ユーザー操作ハンドラ
   */
  handlePointClick(pointNum) {
    if (this.onCheckerClick) {
      this.onCheckerClick(pointNum);
    }
  }

  handleBarClick(player) {
    if (this.onCheckerClick) {
      this.onCheckerClick('bar');
    }
  }

  handleBearOffClick(player) {
    if (this.onCheckerClick) {
      this.onCheckerClick('off');
    }
  }

  setSelected(normPt, destinations = []) {
    this.selectedNormPoint = normPt;
    this.highlightedDestinations = destinations;
  }

  clearSelection() {
    this.selectedNormPoint = null;
    this.highlightedDestinations = [];
  }
}
