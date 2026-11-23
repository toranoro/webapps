/**
 * Web囲碁盤UIコンポーネント (js/board-ui.js)
 * 9x9碁盤描画・石の描画・ハイライト・Web Audio効果音
 */

import { EMPTY, BLACK, WHITE, BOARD_SIZE } from './igo-engine.js';

export class BoardUI {
    constructor(containerElement, options = {}) {
        this.container = containerElement;
        this.options = {
            confirmMode: false, // 誤タップ防止モード (1タップ目ゴースト -> 再タップ確定)
            showAtariWarning: true, // アタリ警告
            soundEnabled: true, // 効果音
            ...options
        };

        this.selectedPoint = null; // 誤タップ防止時の仮選択点 { x, y }
        this.hintPoint = null; // ヒント表示点 { x, y }
        this.territoryResult = null; // 地合い表示用データ
        this.onPointClick = null; // コールバック (x, y) => void

        this.audioCtx = null;
        this.initAudio();
        this.renderBoardSkeleton();
    }

    // Web Audio APIの初期化（ユーザーの初回操作時にresume）
    initAudio() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.audioCtx = new AudioContext();
            }
        } catch (e) {
            console.warn('Web Audio not supported:', e);
        }
    }

    playStoneSound() {
        if (!this.options.soundEnabled || !this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const now = this.audioCtx.currentTime;
        // 石を盤面に置く「パチッ」という硬質で心地よい木と石の音
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        // クリックノイズ付加
        const osc2 = this.audioCtx.createOscillator();
        const gain2 = this.audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1200, now);
        osc2.frequency.exponentialRampToValueAtTime(300, now + 0.03);
        gain2.gain.setValueAtTime(0.3, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc2.connect(gain2);
        gain2.connect(this.audioCtx.destination);

        osc.start(now);
        osc2.start(now);
        osc.stop(now + 0.1);
        osc2.stop(now + 0.05);
    }

    playCaptureSound() {
        if (!this.options.soundEnabled || !this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const now = this.audioCtx.currentTime;
        // 石を取り上げる音（複数石の爽快な音）
        [0, 0.04, 0.08].forEach((delay, idx) => {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500 + idx * 200, now + delay);
            osc.frequency.exponentialRampToValueAtTime(300, now + delay + 0.07);

            gain.gain.setValueAtTime(0.2, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.07);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.start(now + delay);
            osc.stop(now + delay + 0.08);
        });
    }

    playAtariSound() {
        if (!this.options.soundEnabled || !this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const now = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.08); // C#5

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
    }

    // 碁盤の外枠・座標ラベル・交点グリッドの初期生成
    renderBoardSkeleton() {
        this.container.innerHTML = '';
        this.container.classList.add('igo-board-wrapper');

        const boardElement = document.createElement('div');
        boardElement.className = 'igo-board';
        boardElement.id = 'igo-board';

        // 座標ラベル用（横：1〜9、縦：一〜九）
        const kanjiNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

        // 左上角の余白セル (grid-column: 1, grid-row: 1)
        const cornerCell = document.createElement('div');
        cornerCell.className = 'board-coord-corner';
        boardElement.appendChild(cornerCell);

        // 上部座標 (1-9) (grid-column: 2, grid-row: 1)
        const topCoord = document.createElement('div');
        topCoord.className = 'board-coord-row top';
        for (let x = 1; x <= BOARD_SIZE; x++) {
            const span = document.createElement('span');
            span.textContent = x;
            topCoord.appendChild(span);
        }
        boardElement.appendChild(topCoord);

        // 左側座標 (一-九) (grid-column: 1, grid-row: 2)
        const leftCoord = document.createElement('div');
        leftCoord.className = 'board-coord-col left';
        for (let y = 0; y < BOARD_SIZE; y++) {
            const span = document.createElement('span');
            span.textContent = kanjiNumbers[y];
            leftCoord.appendChild(span);
        }
        boardElement.appendChild(leftCoord);

        // メイン碁盤本体（木目・グリッド）(grid-column: 2, grid-row: 2)
        const gridArea = document.createElement('div');
        gridArea.className = 'board-grid-area';

        // グリッド線描画用SVG
        const svgLines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgLines.setAttribute('class', 'board-lines-svg');
        svgLines.setAttribute('viewBox', '0 0 100 100');

        const step = 100 / (BOARD_SIZE - 1);
        for (let i = 0; i < BOARD_SIZE; i++) {
            const pos = (i * step).toFixed(2);
            // 横線
            const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            hLine.setAttribute('x1', '0');
            hLine.setAttribute('y1', pos);
            hLine.setAttribute('x2', '100');
            hLine.setAttribute('y2', pos);
            svgLines.appendChild(hLine);

            // 縦線
            const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            vLine.setAttribute('x1', pos);
            vLine.setAttribute('y1', '0');
            vLine.setAttribute('x2', pos);
            vLine.setAttribute('y2', '100');
            svgLines.appendChild(vLine);
        }

        // 星（天元 4,4 / 四隅 2,2; 6,2; 2,6; 6,6）
        const starPoints = [
            { x: 2, y: 2 }, { x: 6, y: 2 },
            { x: 4, y: 4 }, // 天元
            { x: 2, y: 6 }, { x: 6, y: 6 }
        ];
        starPoints.forEach(p => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', (p.x * step).toFixed(2));
            circle.setAttribute('cy', (p.y * step).toFixed(2));
            circle.setAttribute('r', '1.8');
            circle.setAttribute('class', 'star-point');
            svgLines.appendChild(circle);
        });

        gridArea.appendChild(svgLines);

        // 交点タップ用セル（9x9 = 81個）
        const cellsLayer = document.createElement('div');
        cellsLayer.className = 'board-cells-layer';

        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                const cell = document.createElement('div');
                cell.className = 'board-cell';
                cell.dataset.x = x;
                cell.dataset.y = y;

                cell.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleCellClick(x, y);
                });

                // タッチデバイスでの不要なドラッグやジェスチャー抑止
                cell.addEventListener('touchstart', (e) => {
                    // タップ直後のスクロール誤認を防止
                }, { passive: true });

                cellsLayer.appendChild(cell);
            }
        }

        gridArea.appendChild(cellsLayer);
        boardElement.appendChild(gridArea);

        this.container.appendChild(boardElement);
        this.boardElement = boardElement;
        this.cellsLayer = cellsLayer;
    }

    handleCellClick(x, y) {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        if (this.options.confirmMode) {
            // 誤タップ防止モードの場合
            if (this.selectedPoint && this.selectedPoint.x === x && this.selectedPoint.y === y) {
                // 2回目タップで確定
                this.selectedPoint = null;
                if (this.onPointClick) this.onPointClick(x, y);
            } else {
                // 1回目タップで仮選択（ゴースト表示）
                this.selectedPoint = { x, y };
                if (this.lastEngine) {
                    this.update(this.lastEngine);
                }
            }
        } else {
            // 即時着手モード
            this.selectedPoint = null;
            if (this.onPointClick) this.onPointClick(x, y);
        }
    }

    // 盤面状態の再描画
    update(engine) {
        this.lastEngine = engine;
        const cells = this.cellsLayer.children;
        const atariGroups = this.options.showAtariWarning ? engine.getAtariGroups() : [];
        const atariSet = new Set();
        atariGroups.forEach(g => g.group.forEach(idx => atariSet.add(idx)));

        const lastMove = engine.lastMove;
        const lastMoveIndex = (lastMove && !lastMove.isPass) ? engine.index(lastMove.x, lastMove.y) : -1;

        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const x = parseInt(cell.dataset.x, 10);
            const y = parseInt(cell.dataset.y, 10);
            const idx = engine.index(x, y);
            const stoneColor = engine.board[idx];

            // クラスのリセット
            cell.className = 'board-cell';
            cell.innerHTML = '';

            // 石の描画
            if (stoneColor !== EMPTY) {
                const stone = document.createElement('div');
                stone.className = `stone ${stoneColor === BLACK ? 'black-stone' : 'white-stone'}`;

                // 最終手マーカー
                if (idx === lastMoveIndex) {
                    stone.classList.add('last-move');
                    const marker = document.createElement('span');
                    marker.className = 'last-move-marker';
                    stone.appendChild(marker);
                }

                // アタリ警告ハイライト
                if (atariSet.has(idx)) {
                    stone.classList.add('in-atari');
                    const atariBadge = document.createElement('span');
                    atariBadge.className = 'atari-badge';
                    atariBadge.textContent = '!';
                    stone.appendChild(atariBadge);
                }

                cell.appendChild(stone);
            } else {
                // 空点の場合

                // 誤タップ防止モードの仮選択ゴースト石
                if (this.selectedPoint && this.selectedPoint.x === x && this.selectedPoint.y === y) {
                    const ghostStone = document.createElement('div');
                    ghostStone.className = `stone ghost-stone ${engine.turn === BLACK ? 'black-ghost' : 'white-ghost'}`;
                    cell.appendChild(ghostStone);
                }

                // ヒント表示
                if (this.hintPoint && this.hintPoint.x === x && this.hintPoint.y === y) {
                    const hintMarker = document.createElement('div');
                    hintMarker.className = 'hint-marker';
                    cell.appendChild(hintMarker);
                }

                // 地合い計算表示モード
                if (this.territoryResult && this.territoryResult.territoryMap) {
                    const territoryOwner = this.territoryResult.territoryMap[idx];
                    if (territoryOwner === BLACK) {
                        const territoryDot = document.createElement('div');
                        territoryDot.className = 'territory-square black-territory';
                        cell.appendChild(territoryDot);
                    } else if (territoryOwner === WHITE) {
                        const territoryDot = document.createElement('div');
                        territoryDot.className = 'territory-square white-territory';
                        cell.appendChild(territoryDot);
                    } else if (territoryOwner === 3) {
                        const dameDot = document.createElement('div');
                        dameDot.className = 'dame-dot';
                        cell.appendChild(dameDot);
                    }
                }
            }
        }
    }

    setHint(x, y) {
        this.hintPoint = { x, y };
        if (this.lastEngine) this.update(this.lastEngine);
    }

    clearHint() {
        this.hintPoint = null;
        if (this.lastEngine) this.update(this.lastEngine);
    }

    setTerritoryResult(result) {
        this.territoryResult = result;
        if (this.lastEngine) this.update(this.lastEngine);
    }

    clearTerritoryResult() {
        this.territoryResult = null;
        if (this.lastEngine) this.update(this.lastEngine);
    }

    confirmCurrentGhost() {
        if (this.selectedPoint && this.onPointClick) {
            const { x, y } = this.selectedPoint;
            this.selectedPoint = null;
            this.onPointClick(x, y);
        }
    }

    cancelCurrentGhost() {
        this.selectedPoint = null;
        if (this.lastEngine) this.update(this.lastEngine);
    }
}
