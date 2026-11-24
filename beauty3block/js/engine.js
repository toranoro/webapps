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

      this.active = null; // { col, y, gems: [top, mid, bot], lockTimer, lockResets, isMagic }
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
      } catch (_) {
        // Ignore storage restrictions
      }
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
      // Avoid monotonous 3-same-gem triplets too frequently while keeping occasional lucky ones
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

    _spawnActive() {
      // Check spawn column top visible cell
      if (this.board[BUFFER_ROWS][SPAWN_COL] !== null) {
        this._triggerGameOver();
        return;
      }

      this.active = {
        col: SPAWN_COL,
        y: BUFFER_ROWS - 0.85,
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
      if (this.audio) this.audio.playGameOver();
      this._emitChange();
    }

    getFallSpeed() {
      const p = PRESETS[this.settings.preset] || PRESETS.classic;
      return Math.min(16, p.baseSpeed + (this.level - 1) * p.speedStep);
    }

    _canOccupy(col, rowBottom) {
      if (col < 0 || col >= COLS) return false;
      if (rowBottom >= ROWS) return false;
      for (let i = 0; i < 3; i++) {
        const r = rowBottom - i;
        if (r >= 0 && this.board[r][col] !== null) return false;
      }
      return true;
    }

    _isGrounded() {
      if (!this.active) return false;
      const rBottom = Math.floor(this.active.y);
      if (rBottom + 1 >= ROWS) return true;
      return this.board[rBottom + 1][this.active.col] !== null;
    }

    getGhostBottomRow() {
      if (!this.active) return null;
      let r = Math.floor(this.active.y);
      while (r + 1 < ROWS && this.board[r + 1][this.active.col] === null) {
        r++;
      }
      return r;
    }

    moveHorizontal(dx) {
      if (this.state !== 'FALLING' || !this.active) return false;
      const targetCol = this.active.col + dx;
      const rCeil = Math.ceil(this.active.y - 0.08);
      const rFloor = Math.floor(this.active.y);
      if (!this._canOccupy(targetCol, rCeil) || !this._canOccupy(targetCol, rFloor)) {
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

    rotate(reverse = false) {
      if (this.state !== 'FALLING' || !this.active) return false;
      const g = this.active.gems;
      if (reverse) {
        this.active.gems = [g[1], g[2], g[0]];
      } else {
        // Classic Columns downward cycle: top->mid, mid->bot, bot->top
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

    setSoftDrop(enabled) {
      this.softDropping = Boolean(enabled);
    }

    hardDrop() {
      if (this.state !== 'FALLING' || !this.active) return;
      const startY = this.active.y;
      const targetRow = this.getGhostBottomRow();
      if (targetRow === null) return;

      const dist = Math.max(0, Math.round(targetRow - startY));
      this.score += dist * 2;

      // Add vertical light trail for satisfying visual impact
      if (dist > 0.5) {
        this.trails.push({
          col: this.active.col,
          fromY: startY - 2,
          toY: targetRow,
          life: 1,
          isMagic: this.active.isMagic
        });
      }

      this.active.y = targetRow;
      this.boardShake = Math.min(1, this.boardShake + 0.45);
      if (this.audio) this.audio.playHardDrop();
      this._lockActive();
    }

    _lockActive() {
      if (!this.active) return;
      const col = this.active.col;
      const rBottom = Math.min(ROWS - 1, Math.floor(this.active.y));
      const gems = this.active.gems;
      const isMagic = this.active.isMagic;

      // Place top (rBottom - 2), mid (rBottom - 1), bottom (rBottom)
      for (let i = 0; i < 3; i++) {
        const r = rBottom - (2 - i);
        if (r >= 0 && r < ROWS) {
          this.board[r][col] = gems[i];
        }
      }

      this.active = null;
      this.softDropping = false;

      if (isMagic) {
        this._resolveMagicJewel(col, rBottom);
        return;
      }

      if (this.audio) this.audio.playLock();
      this._checkMatches(false);
    }

    _resolveMagicJewel(col, rBottom) {
      const belowRow = rBottom + 1;
      const matches = [];
      const seen = new Set();

      const addCell = (r, c) => {
        const key = `${r},${c}`;
        if (!seen.has(key) && r >= 0 && r < ROWS && this.board[r][c] !== null) {
          seen.add(key);
          matches.push({ r, c, id: this.board[r][c] });
        }
      };

      // Clear the 3 magic jewels themselves
      for (let i = 0; i < 3; i++) {
        addCell(rBottom - i, col);
      }

      let targetColor = null;
      if (belowRow < ROWS && this.board[belowRow][col] !== null) {
        targetColor = this.board[belowRow][col];
      }

      if (targetColor !== null && targetColor !== B3B.MAGIC_ID) {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (this.board[r][c] === targetColor) {
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
      const bonus = targetColor === null ? 500 : count * 60 * this.level;
      this.score += bonus;
      this._updateBest();

      const popupText = targetColor === null ? 'MAGIC +500' : `PRISM CLEAR! +${bonus}`;
      this.popups.push({
        x: col + 0.5,
        y: Math.max(BUFFER_ROWS + 1, rBottom - 1),
        text: popupText,
        sub: `${count} GEMS`,
        life: 1,
        color: '#ffffff'
      });

      if (this.audio) this.audio.playMagic();
      this._emitChange();
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

      // No more matches — check top overflow (above visible area)
      if (this._hasOverflowAboveVisible()) {
        this._triggerGameOver();
        return;
      }

      // Advance to next triplet
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

      // Compute gravity drops per column
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
      const def = B3B.JEWEL_DEFS[jewelId];
      const color = def ? def.shard : '#ffffff';
      const count = 8;
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

    _updateBest() {
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        this._saveBestScore();
      }
    }

    update(dt) {
      const clampedDt = Math.min(0.05, Math.max(0, dt));
      this.timeSec += clampedDt;

      // Update visual juice particles regardless of paused/active transitions
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
          const rFloor = Math.floor(nextY);
          // Clamp cleanly if we touch floor or occupied cell
          let maxValidY = ROWS - 1;
          for (let r = prevFloor + 1; r < ROWS; r++) {
            if (this.board[r][this.active.col] !== null) {
              maxValidY = r - 1;
              break;
            }
          }
          if (nextY >= maxValidY) {
            this.active.y = maxValidY;
          } else {
            this.active.y = nextY;
          }
          if (this.softDropping && rFloor > prevFloor) {
            this.score += 1;
            this._updateBest();
          }
        } else {
          this.active.y = Math.floor(this.active.y);
          this.active.lockTimer += clampedDt * (this.softDropping ? 2.4 : 1);
          if (this.active.lockTimer >= 0.38) {
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
        p.vy += 8.5 * dt; // crystal shard gravity
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
