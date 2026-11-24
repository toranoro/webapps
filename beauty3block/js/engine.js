(function (global) {
  'use strict';
  const B3B = (global.Beauty3Block = global.Beauty3Block || {});

  const COLS = 6;
  const VISIBLE_ROWS = 13;
  const BUFFER_ROWS = 3;
  const ROWS = VISIBLE_ROWS + BUFFER_ROWS; // 16 total
  const SPAWN_COL = 2;

  const PRESETS = {
    relax: { label: 'Relax', baseSpeed: 1.35, speedStep: 0.22, jewelTypes: 5 },
    classic: { label: 'Classic', baseSpeed: 1.85, speedStep: 0.32, jewelTypes: 6 },
    master: { label: 'Master', baseSpeed: 2.8, speedStep: 0.44, jewelTypes: 6 }
  };

  // 4-way orientation offsets [dc, dr] around the center gem (index 1)
  const ORIENTATION_OFFSETS = [
    [[0, -1], [0, 0], [0, 1]],  // 0: Vertical (top -> bottom)
    [[1, 0], [0, 0], [-1, 0]],  // 1: Horizontal (90° CW: g0 right, g2 left)
    [[0, 1], [0, 0], [0, -1]],  // 2: Vertical inverted (180°)
    [[-1, 0], [0, 0], [1, 0]]   // 3: Horizontal inverted (270° CW / 90° CCW)
  ];

  class ColumnsEngine {
    constructor({ audio } = {}) {
      this.audio = audio || null;
      this.board = this._createEmptyBoard();

      this.state = 'IDLE'; // IDLE | FALLING | FLASHING | GRAVITY | PAUSED | GAMEOVER
      this.prevStateBeforePause = 'FALLING';

      this.score = 0;
      this.bestScore = this._loadBestScore();
      this.level = 1;
      this.gemsCleared = 0;
      this.maxChain = 0;
      this.currentChain = 0;

      this.settings = {
        preset: 'classic',
        ghost: true,
        magicEnabled: true
      };

      this.active = null; // { col, y, ori, gems: [g0, g1, g2], lockTimer, lockResets, isMagic, rotateAnim }
      this.nextTriplet = [0, 1, 2];
      this.nextIsMagic = false;
      this.nextMagicThreshold = 70;

      this.softDropping = false;
      this.matchedCells = []; // [{ r, c, id }]
      this.flashTimer = 0;
      this.flashDuration = 0.34;

      // Gravity cascade animation items: [{ c, fromR, toR, id }]
      this.fallingPieces = [];
      this.gravityProgress = 0;
      this.gravityDuration = 0.16;

      // Visual juice buffers
      this.particles = [];
      this.popups = [];
      this.trails = [];
      this.boardShake = 0;
      this.boardFlash = 0;
      this.timeSec = 0;

      this.onStateChange = null;
    }

    _createEmptyBoard() {
      return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    }

    _loadBestScore() {
      try {
        const val = global.localStorage.getItem('beauty3block_best_score');
        return val ? Math.max(0, parseInt(val, 10) || 0) : 0;
      } catch (_) {
        return 0;
      }
    }

    _saveBestScore() {
      try {
        global.localStorage.setItem('beauty3block_best_score', String(this.bestScore));
      } catch (_) {}
    }

    _randomGemId() {
      const count = (PRESETS[this.settings.preset] || PRESETS.classic).jewelTypes;
      return Math.floor(Math.random() * count);
    }

    _generateTriplet(allowMagic = false) {
      if (allowMagic && this.settings.magicEnabled && this.gemsCleared >= this.nextMagicThreshold) {
        this.nextMagicThreshold += 75;
        return { gems: [B3B.MAGIC_ID, B3B.MAGIC_ID, B3B.MAGIC_ID], isMagic: true };
      }
      const g0 = this._randomGemId();
      const g1 = this._randomGemId();
      let g2 = this._randomGemId();
      if (g0 === g1 && g1 === g2 && Math.random() < 0.72) {
        g2 = (g2 + 1 + Math.floor(Math.random() * 4)) % (PRESETS[this.settings.preset] || PRESETS.classic).jewelTypes;
      }
      return { gems: [g0, g1, g2], isMagic: false };
    }

    startNewGame() {
      this.board = this._createEmptyBoard();
      this.score = 0;
      this.level = 1;
      this.gemsCleared = 0;
      this.maxChain = 0;
      this.currentChain = 0;
      this.nextMagicThreshold = 70;

      this.matchedCells = [];
      this.fallingPieces = [];
      this.particles = [];
      this.popups = [];
      this.trails = [];
      this.boardShake = 0;
      this.boardFlash = 0;
      this.softDropping = false;

      const firstNext = this._generateTriplet(false);
      this.nextTriplet = firstNext.gems;
      this.nextIsMagic = firstNext.isMagic;

      this.state = 'FALLING';
      this._spawnActive();
      this._emitChange();
    }

    returnToTitle() {
      this.board = this._createEmptyBoard();
      this.active = null;
      this.matchedCells = [];
      this.fallingPieces = [];
      this.particles = [];
      this.popups = [];
      this.trails = [];
      this.boardShake = 0;
      this.boardFlash = 0;
      this.softDropping = false;
      this.score = 0;
      this.level = 1;
      this.gemsCleared = 0;
      this.currentChain = 0;
      this.state = 'IDLE';
      this._emitChange();
    }

    togglePause() {
      if (this.state === 'IDLE' || this.state === 'GAMEOVER') return;
      if (this.state === 'PAUSED') {
        this.state = this.prevStateBeforePause || 'FALLING';
      } else {
        this.prevStateBeforePause = this.state;
        this.state = 'PAUSED';
        this.softDropping = false;
      }
      this._emitChange();
    }

    pauseIfPlaying() {
      if (this.state === 'FALLING' || this.state === 'FLASHING' || this.state === 'GRAVITY') {
        this.prevStateBeforePause = this.state;
        this.state = 'PAUSED';
        this.softDropping = false;
        this._emitChange();
      }
    }

    _emitChange() {
      if (typeof this.onStateChange === 'function') {
        this.onStateChange(this);
      }
    }

    getCellOffsets(ori = 0) {
      return ORIENTATION_OFFSETS[((ori % 4) + 4) % 4];
    }

    getActiveCells(col = this.active?.col, baseY = this.active?.y, ori = this.active?.ori, gems = this.active?.gems) {
      if (!gems) return [];
      const offsets = this.getCellOffsets(ori);
      return offsets.map(([dc, dr], idx) => ({
        c: col + dc,
        r: baseY + dr,
        id: gems[idx]
      }));
    }

    _canPlace(col, rowInt, ori) {
      if (!Number.isFinite(col) || !Number.isFinite(rowInt)) return false;
      const offsets = this.getCellOffsets(ori);
      for (const [dc, dr] of offsets) {
        const c = col + dc;
        const r = rowInt + dr;
        if (c < 0 || c >= COLS || r >= ROWS) return false;
        if (r >= 0 && this.board[r] && this.board[r][c] !== null) return false;
      }
      return true;
    }

    _spawnActive() {
      if (this.board[BUFFER_ROWS][SPAWN_COL] !== null) {
        this._triggerGameOver();
        return;
      }

      const occupiedRowBelowTop = this.board[BUFFER_ROWS + 1][SPAWN_COL] !== null;
      this.active = {
        col: SPAWN_COL,
        // Start immediately visible at the top of the playfield unless stacked near ceiling
        y: occupiedRowBelowTop ? BUFFER_ROWS - 1.0 : BUFFER_ROWS - 0.15,
        ori: 0,
        gems: this.nextTriplet.slice(),
        isMagic: this.nextIsMagic,
        lockTimer: 0,
        lockResets: 0,
        rotateAnim: 0
      };

      const upcoming = this._generateTriplet(true);
      this.nextTriplet = upcoming.gems;
      this.nextIsMagic = upcoming.isMagic;
      this.currentChain = 0;
      this._emitChange();
    }

    _triggerGameOver() {
      this.state = 'GAMEOVER';
      this.active = null;
      this.softDropping = false;
      this._saveBestScore();
      if (this.audio) this.audio.playGameOver();
      this._emitChange();
    }

    getFallSpeed() {
      const p = PRESETS[this.settings.preset] || PRESETS.classic;
      return Math.min(16, p.baseSpeed + (this.level - 1) * p.speedStep);
    }

    _isGrounded() {
      if (!this.active) return false;
      const rFloor = Math.floor(this.active.y);
      if (!Number.isFinite(rFloor)) return true;
      return !this._canPlace(this.active.col, rFloor + 1, this.active.ori);
    }

    getGhostPivotRow() {
      if (!this.active) return null;
      let r = Math.floor(this.active.y);
      if (!Number.isFinite(r)) return null;
      let steps = 0;
      while (steps < ROWS && this._canPlace(this.active.col, r + 1, this.active.ori)) {
        r++;
        steps++;
      }
      return r;
    }

    moveHorizontal(dx) {
      if (this.state !== 'FALLING' || !this.active) return false;
      const targetCol = this.active.col + dx;
      const rFloor = Math.floor(this.active.y);
      const rCeil = Math.ceil(this.active.y - 0.08);
      if (!this._canPlace(targetCol, rFloor, this.active.ori) || !this._canPlace(targetCol, rCeil, this.active.ori)) {
        return false;
      }
      this.active.col = targetCol;
      if (this._isGrounded() && this.active.lockResets < 8) {
        this.active.lockTimer = 0;
        this.active.lockResets++;
      }
      if (this.audio) this.audio.playMove();
      return true;
    }

    // 90-degree physical rotation of the 3-block bar (CW / CCW) with wall & floor kicks
    rotateBlock(clockwise = true) {
      if (this.state !== 'FALLING' || !this.active) return false;
      const act = this.active;
      const nextOri = (act.ori + (clockwise ? 1 : 3)) % 4;
      const rFloor = Math.floor(act.y);
      const rCeil = Math.ceil(act.y - 0.08);

      const kicks = [
        [0, 0],
        [-1, 0],
        [1, 0],
        [0, -1],
        [-1, -1],
        [1, -1]
      ];

      for (const [kx, ky] of kicks) {
        if (
          this._canPlace(act.col + kx, rFloor + ky, nextOri) &&
          this._canPlace(act.col + kx, rCeil + ky, nextOri)
        ) {
          act.col += kx;
          act.y += ky;
          act.ori = nextOri;
          act.rotateAnim = 1;
          if (this._isGrounded() && act.lockResets < 8) {
            act.lockTimer = 0;
            act.lockResets++;
          }
          if (this.audio) this.audio.playRotate();
          return true;
        }
      }
      return false;
    }

    // Cycle the 3 gems inside the bar (入れ替え)
    cycleGems(reverse = false) {
      if (this.state !== 'FALLING' || !this.active) return false;
      const g = this.active.gems;
      if (reverse) {
        this.active.gems = [g[1], g[2], g[0]];
      } else {
        this.active.gems = [g[2], g[0], g[1]];
      }
      this.active.rotateAnim = 1;
      if (this._isGrounded() && this.active.lockResets < 8) {
        this.active.lockTimer = 0;
        this.active.lockResets++;
      }
      if (this.audio) this.audio.playRotate();
      return true;
    }

    rotate(reverse = false) {
      return this.cycleGems(reverse);
    }

    setSoftDrop(enabled) {
      this.softDropping = Boolean(enabled);
    }

    hardDrop() {
      if (this.state !== 'FALLING' || !this.active) return;
      const startY = this.active.y;
      const targetPivotRow = this.getGhostPivotRow();
      if (targetPivotRow === null) return;

      const dist = Math.max(0, Math.round(targetPivotRow - startY));
      this.score += dist * 2;
      this._updateBest();

      if (dist > 0.5) {
        const cells = this.getActiveCells(this.active.col, targetPivotRow, this.active.ori, this.active.gems);
        const minC = Math.min(...cells.map((x) => x.c));
        const maxC = Math.max(...cells.map((x) => x.c));
        const maxR = Math.max(...cells.map((x) => x.r));
        const minOffsetR = Math.min(...this.getCellOffsets(this.active.ori).map((o) => o[1]));
        this.trails.push({
          col: minC,
          colSpan: maxC - minC + 1,
          fromY: startY + minOffsetR,
          toY: maxR,
          life: 1,
          isMagic: this.active.isMagic
        });
      }

      this.active.y = targetPivotRow;
      this.boardShake = Math.min(1, this.boardShake + 0.45);
      if (this.audio) this.audio.playHardDrop();
      this._lockActive();
    }

    _lockActive() {
      if (!this.active) return;
      const pivotRow = Math.floor(this.active.y);
      const cells = this.getActiveCells(this.active.col, pivotRow, this.active.ori, this.active.gems);
      const isMagic = this.active.isMagic;

      const placed = [];
      for (const cell of cells) {
        if (cell.r >= 0 && cell.r < ROWS && cell.c >= 0 && cell.c < COLS) {
          this.board[cell.r][cell.c] = cell.id;
          placed.push(cell);
        }
      }

      this.active = null;
      this.softDropping = false;

      if (isMagic) {
        this._resolveMagicJewel(placed);
        return;
      }

      if (this.audio) this.audio.playLock();

      // If horizontal bar overhung empty space, let unsupported gems drop smoothly first
      const drops = this._collectGravityDrops();
      if (drops.length > 0) {
        this.fallingPieces = drops;
        this.gravityProgress = 0;
        this.state = 'GRAVITY';
        this._emitChange();
        return;
      }

      this._checkMatches(false);
    }

    _resolveMagicJewel(placedCells) {
      const matches = [];
      const seen = new Set();

      const addCell = (r, c) => {
        const key = `${r},${c}`;
        if (!seen.has(key) && r >= 0 && r < ROWS && c >= 0 && c < COLS && this.board[r][c] !== null) {
          seen.add(key);
          matches.push({ r, c, id: this.board[r][c] });
        }
      };

      const targetColors = new Set();
      let sumC = 0;
      let sumR = 0;
      for (const cell of placedCells) {
        addCell(cell.r, cell.c);
        sumC += cell.c;
        sumR += cell.r;
        const below = cell.r + 1;
        if (below < ROWS && this.board[below][cell.c] !== null && this.board[below][cell.c] !== B3B.MAGIC_ID) {
          targetColors.add(this.board[below][cell.c]);
        }
      }

      if (targetColors.size > 0) {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (targetColors.has(this.board[r][c])) {
              addCell(r, c);
            }
          }
        }
      }

      this.matchedCells = matches;
      this.currentChain = 1;
      this.flashTimer = 0;
      this.state = 'FLASHING';
      this.boardFlash = 0.85;
      this.boardShake = 0.8;

      const count = matches.length;
      const bonus = targetColors.size === 0 ? 500 : count * 60 * this.level;
      this.score += bonus;
      this._updateBest();

      const avgC = placedCells.length > 0 ? sumC / placedCells.length + 0.5 : COLS / 2;
      const avgR = placedCells.length > 0 ? sumR / placedCells.length : BUFFER_ROWS + 2;
      const popupText = targetColors.size === 0 ? 'MAGIC +500' : `PRISM CLEAR! +${bonus}`;
      this.popups.push({
        x: avgC,
        y: Math.max(BUFFER_ROWS + 1, avgR),
        text: popupText,
        sub: `${count} GEMS`,
        life: 1,
        color: '#ffffff'
      });

      if (this.audio) this.audio.playMagic();
      this._emitChange();
    }

    _collectGravityDrops() {
      const drops = [];
      for (let c = 0; c < COLS; c++) {
        let writeRow = ROWS - 1;
        for (let r = ROWS - 1; r >= 0; r--) {
          const id = this.board[r][c];
          if (id !== null) {
            if (r !== writeRow) {
              drops.push({ c, fromR: r, toR: writeRow, id });
              this.board[writeRow][c] = id;
              this.board[r][c] = null;
            }
            writeRow--;
          }
        }
      }
      return drops;
    }

    _checkMatches(isCascade) {
      const matched = new Set();
      const dirs = [
        [1, 0],  // Horizontal
        [0, 1],  // Vertical
        [1, 1],  // Diagonal \
        [1, -1]  // Diagonal /
      ];

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const id = this.board[r][c];
          if (id === null || id === B3B.MAGIC_ID) continue;

          for (const [dc, dr] of dirs) {
            const line = [[r, c]];
            let nr = r + dr;
            let nc = c + dc;
            while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && this.board[nr][nc] === id) {
              line.push([nr, nc]);
              nr += dr;
              nc += dc;
            }
            if (line.length >= 3) {
              for (const [lr, lc] of line) {
                matched.add(`${lr},${lc}`);
              }
            }
          }
        }
      }

      if (matched.size > 0) {
        this.currentChain += 1;
        if (this.currentChain > this.maxChain) {
          this.maxChain = this.currentChain;
        }

        const cells = [];
        let sumX = 0;
        let sumY = 0;
        for (const key of matched) {
          const [r, c] = key.split(',').map(Number);
          cells.push({ r, c, id: this.board[r][c] });
          sumX += c + 0.5;
          sumY += r + 0.5;
        }

        this.matchedCells = cells;
        this.flashTimer = 0;
        this.state = 'FLASHING';

        const count = cells.length;
        const chainMult = this.currentChain === 1 ? 1 : Math.pow(2, this.currentChain - 1);
        const pts = count * 30 * chainMult * this.level;
        this.score += pts;
        this._updateBest();

        if (this.currentChain >= 2) {
          this.boardShake = Math.min(1, 0.35 + this.currentChain * 0.15);
          this.boardFlash = Math.min(0.65, 0.2 + this.currentChain * 0.1);
        }

        const label = this.currentChain >= 2 ? `${this.currentChain} CHAIN!` : `+${pts}`;
        const sub = this.currentChain >= 2 ? `+${pts}` : count >= 4 ? `${count} GEMS!` : '';
        this.popups.push({
          x: sumX / count,
          y: Math.max(BUFFER_ROWS + 0.8, sumY / count),
          text: label,
          sub,
          life: 1,
          color: this.currentChain >= 3 ? '#ffe066' : this.currentChain === 2 ? '#8cf5ff' : '#ffffff'
        });

        if (this.audio) this.audio.playMatch(this.currentChain, count);
        this._emitChange();
        return;
      }

      if (this._hasOverflowAboveVisible()) {
        this._triggerGameOver();
        return;
      }

      this.state = 'FALLING';
      this._spawnActive();
    }

    _hasOverflowAboveVisible() {
      for (let r = 0; r < BUFFER_ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (this.board[r][c] !== null) return true;
        }
      }
      return false;
    }

    _clearMatchedAndStartGravity() {
      const clearedCount = this.matchedCells.length;
      for (const cell of this.matchedCells) {
        this._spawnShards(cell.c, cell.r, cell.id);
        this.board[cell.r][cell.c] = null;
      }
      this.matchedCells = [];

      const prevLevel = this.level;
      this.gemsCleared += clearedCount;
      this.level = 1 + Math.floor(this.gemsCleared / 35);
      if (this.level > prevLevel && this.audio) {
        this.audio.playLevelUp();
        this.popups.push({
          x: COLS / 2,
          y: BUFFER_ROWS + 4,
          text: `LEVEL ${this.level}`,
          sub: 'SPEED UP!',
          life: 1.25,
          color: '#ffd166'
        });
      }

      const drops = this._collectGravityDrops();
      if (drops.length > 0) {
        this.fallingPieces = drops;
        this.gravityProgress = 0;
        this.state = 'GRAVITY';
      } else {
        this._checkMatches(true);
      }
      this._emitChange();
    }

    _spawnShards(col, row, jewelId) {
      if (this.particles.length >= 100) return;
      const def = B3B.JEWEL_DEFS[jewelId];
      const color = def ? def.shard : '#ffffff';
      const count = 7;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const speed = 1.6 + Math.random() * 3.4;
        this.particles.push({
          x: col + 0.5,
          y: row + 0.5,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.2,
          size: 0.11 + Math.random() * 0.12,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 10,
          life: 1,
          color: jewelId === B3B.MAGIC_ID ? `hsl(${Math.random() * 360}, 95%, 72%)` : color
        });
      }
    }

    _updateBest(persist = true) {
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        if (persist) {
          this._saveBestScore();
        }
      }
    }

    update(dt) {
      const clampedDt = Number.isFinite(dt) ? Math.min(0.05, Math.max(0, dt)) : 0.016;
      this.timeSec += clampedDt;

      if (this.state !== 'PAUSED') {
        this._updateJuice(clampedDt);
      }

      if (this.state === 'FALLING' && this.active) {
        if (this.active.rotateAnim > 0) {
          this.active.rotateAnim = Math.max(0, this.active.rotateAnim - clampedDt * 8);
        }

        const speed = this.softDropping ? Math.max(13, this.getFallSpeed() * 5.2) : this.getFallSpeed();
        if (!this._isGrounded()) {
          const prevFloor = Math.floor(this.active.y);
          const nextY = this.active.y + speed * clampedDt;
          const maxValidY = this.getGhostPivotRow();
          if (maxValidY !== null && nextY >= maxValidY) {
            this.active.y = maxValidY;
          } else {
            this.active.y = nextY;
          }
          const rFloor = Math.floor(this.active.y);
          if (this.softDropping && rFloor > prevFloor) {
            this.score += 1;
            this._updateBest(false);
          }
        } else {
          this.active.y = Math.floor(this.active.y);
          this.active.lockTimer += clampedDt * (this.softDropping ? 2.4 : 1);
          if (this.active.lockTimer >= 0.38) {
            this._updateBest(true);
            this._lockActive();
          }
        }
      } else if (this.state === 'FLASHING') {
        this.flashTimer += clampedDt;
        if (this.flashTimer >= this.flashDuration) {
          this._clearMatchedAndStartGravity();
        }
      } else if (this.state === 'GRAVITY') {
        this.gravityProgress += clampedDt / this.gravityDuration;
        if (this.gravityProgress >= 1) {
          this.fallingPieces = [];
          this.gravityProgress = 1;
          this._checkMatches(true);
        }
      }
    }

    _updateJuice(dt) {
      if (this.boardShake > 0) {
        this.boardShake = Math.max(0, this.boardShake - dt * 4.5);
      }
      if (this.boardFlash > 0) {
        this.boardFlash = Math.max(0, this.boardFlash - dt * 2.8);
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 8.5 * dt;
        p.rot += p.vrot * dt;
        p.life -= dt * 1.9;
        if (p.life <= 0) this.particles.splice(i, 1);
      }

      for (let i = this.popups.length - 1; i >= 0; i--) {
        const pop = this.popups[i];
        pop.y -= dt * 1.35;
        pop.life -= dt * 1.05;
        if (pop.life <= 0) this.popups.splice(i, 1);
      }

      for (let i = this.trails.length - 1; i >= 0; i--) {
        this.trails[i].life -= dt * 4.2;
        if (this.trails[i].life <= 0) this.trails.splice(i, 1);
      }
    }
  }

  B3B.COLS = COLS;
  B3B.VISIBLE_ROWS = VISIBLE_ROWS;
  B3B.BUFFER_ROWS = BUFFER_ROWS;
  B3B.ROWS = ROWS;
  B3B.PRESETS = PRESETS;
  B3B.ColumnsEngine = ColumnsEngine;
})(window);
