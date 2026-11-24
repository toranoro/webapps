/**
 * tetris.js - テトリス コアロジック (7-Bag, SRS回転補正, ゴースト, ホールド, スコア)
 */

// 美しいクリスタル・宝石カラーパレット
const PIECE_THEMES = {
    I: {
        name: 'Diamond / Aquamarine',
        primary: '#06b6d4',      // シアン
        secondary: '#0891b2',
        light: '#cffafe',
        glow: 'rgba(6, 182, 212, 0.75)',
        text: '#06b6d4'
    },
    O: {
        name: 'Topaz / Amber Gold',
        primary: '#facc15',      // イエローゴールド
        secondary: '#ca8a04',
        light: '#fef9c3',
        glow: 'rgba(250, 204, 21, 0.75)',
        text: '#facc15'
    },
    T: {
        name: 'Amethyst Violet',
        primary: '#c084fc',      // パープル
        secondary: '#9333ea',
        light: '#f3e8ff',
        glow: 'rgba(192, 132, 252, 0.75)',
        text: '#c084fc'
    },
    S: {
        name: 'Emerald Green',
        primary: '#34d399',      // エメラルドグリーン
        secondary: '#059669',
        light: '#d1fae5',
        glow: 'rgba(52, 211, 153, 0.75)',
        text: '#34d399'
    },
    Z: {
        name: 'Ruby Crimson',
        primary: '#f87171',      // ルビーレッド
        secondary: '#dc2626',
        light: '#fee2e2',
        glow: 'rgba(248, 113, 113, 0.75)',
        text: '#f87171'
    },
    J: {
        name: 'Sapphire Cobalt',
        primary: '#60a5fa',      // サファイアブルー
        secondary: '#2563eb',
        light: '#dbeafe',
        glow: 'rgba(96, 165, 250, 0.75)',
        text: '#60a5fa'
    },
    L: {
        name: 'Citrine Sunset',
        primary: '#fb923c',      // サンセットオレンジ
        secondary: '#ea580c',
        light: '#ffedd5',
        glow: 'rgba(251, 146, 60, 0.75)',
        text: '#fb923c'
    }
};

// 7つのテトロミノ形状（4x4または3x3マトリクス）
const PIECE_SHAPES = {
    I: [
        [0,0,0,0],
        [1,1,1,1],
        [0,0,0,0],
        [0,0,0,0]
    ],
    O: [
        [1,1],
        [1,1]
    ],
    T: [
        [0,1,0],
        [1,1,1],
        [0,0,0]
    ],
    S: [
        [0,1,1],
        [1,1,0],
        [0,0,0]
    ],
    Z: [
        [1,1,0],
        [0,1,1],
        [0,0,0]
    ],
    J: [
        [1,0,0],
        [1,1,1],
        [0,0,0]
    ],
    L: [
        [0,0,1],
        [1,1,1],
        [0,0,0]
    ]
};

// SRS 壁蹴り（Wall Kick）オフレットテーブル
const WALL_KICK_DATA = {
    normal: {
        '0->1': [[0,0], [-1,0], [-1,1], [0,-2], [-1,-2]],
        '1->0': [[0,0], [1,0], [1,-1], [0,2], [1,2]],
        '1->2': [[0,0], [1,0], [1,-1], [0,2], [1,2]],
        '2->1': [[0,0], [-1,0], [-1,1], [0,-2], [-1,-2]],
        '2->3': [[0,0], [1,0], [1,1], [0,-2], [1,-2]],
        '3->2': [[0,0], [-1,0], [-1,-1], [0,2], [-1,2]],
        '3->0': [[0,0], [-1,0], [-1,-1], [0,2], [-1,2]],
        '0->3': [[0,0], [1,0], [1,1], [0,-2], [1,-2]]
    },
    I: {
        '0->1': [[0,0], [-2,0], [1,0], [-2,-1], [1,2]],
        '1->0': [[0,0], [2,0], [-1,0], [2,1], [-1,-2]],
        '1->2': [[0,0], [-1,0], [2,0], [-1,2], [2,-1]],
        '2->1': [[0,0], [1,0], [-2,0], [1,-2], [-2,1]],
        '2->3': [[0,0], [2,0], [-1,0], [2,1], [-1,-2]],
        '3->2': [[0,0], [-2,0], [1,0], [-2,-1], [1,2]],
        '3->0': [[0,0], [1,0], [-2,0], [1,-2], [-2,1]],
        '0->3': [[0,0], [-1,0], [2,0], [-1,2], [2,-1]]
    }
};

class TetrisGame {
    constructor(cols = 10, rows = 20) {
        this.cols = cols;
        this.rows = rows;
        this.hiddenRows = 2; // 上部隠しバッファ
        this.totalRows = rows + this.hiddenRows;

        this.grid = []; // totalRows x cols (0 or color object)
        this.bag = [];
        this.currentPiece = null;
        this.ghostPiece = null;
        this.holdPiece = null;
        this.canHold = true;
        this.nextPieces = [];

        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.combo = -1; // 連続消去カウント
        this.gameOver = false;
        this.paused = false;

        // タイミングと落下速度
        this.dropInterval = 1000; // ms
        this.dropTimer = 0;
        this.lockDelay = 500; // ms (着地後の猶予)
        this.lockTimer = 0;
        this.isLocking = false;
        this.lockResets = 0;
        this.maxLockResets = 15;

        // イベントコールバック
        this.onLineClear = null;
        this.onLock = null;
        this.onHardDrop = null;
        this.onHold = null;
        this.onMove = null;
        this.onRotate = null;
        this.onLevelUp = null;
        this.onGameOver = null;

        this.init();
    }

    init() {
        // グリッド初期化
        this.grid = Array.from({ length: this.totalRows }, () => Array(this.cols).fill(null));
        this.bag = [];
        this.holdPiece = null;
        this.canHold = true;
        this.nextPieces = [];
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.combo = -1;
        this.gameOver = false;
        this.paused = false;
        this.updateDropInterval();

        // NEXTキューを初期補充（5個）
        for (let i = 0; i < 5; i++) {
            this.nextPieces.push(this.drawFromBag());
        }

        this.spawnPiece();
    }

    // 7-Bagランダマイザー（偏り防止）
    drawFromBag() {
        if (this.bag.length === 0) {
            const types = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
            // Fisher-Yates シャッフル
            for (let i = types.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [types[i], types[j]] = [types[j], types[i]];
            }
            this.bag = types;
        }
        return this.bag.pop();
    }

    // 行列の時計回り回転
    rotateMatrix(matrix) {
        const N = matrix.length;
        const result = Array.from({ length: N }, () => Array(N).fill(0));
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                result[c][N - 1 - r] = matrix[r][c];
            }
        }
        return result;
    }

    // 行列の反時計回り回転
    rotateMatrixCCW(matrix) {
        const N = matrix.length;
        const result = Array.from({ length: N }, () => Array(N).fill(0));
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                result[N - 1 - c][r] = matrix[r][c];
            }
        }
        return result;
    }

    spawnPiece(type = null) {
        const pType = type || this.nextPieces.shift();
        if (!type) {
            this.nextPieces.push(this.drawFromBag());
        }

        const shape = PIECE_SHAPES[pType].map(row => [...row]);
        const startX = Math.floor((this.cols - shape[0].length) / 2);
        const startY = this.hiddenRows - 1;

        this.currentPiece = {
            type: pType,
            shape: shape,
            x: startX,
            y: startY,
            rotation: 0, // 0: 初期, 1: 90度, 2: 180度, 3: 270度
            theme: PIECE_THEMES[pType]
        };

        this.canHold = true;
        this.isLocking = false;
        this.lockTimer = 0;
        this.lockResets = 0;

        // スポーン時点で衝突していればゲームオーバー
        if (this.checkCollision(this.currentPiece.x, this.currentPiece.y, this.currentPiece.shape)) {
            this.gameOver = true;
            if (this.onGameOver) this.onGameOver();
        }

        this.updateGhost();
    }

    // 衝突判定
    checkCollision(offsetX, offsetY, matrix) {
        for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix[r].length; c++) {
                if (matrix[r][c]) {
                    const gx = offsetX + c;
                    const gy = offsetY + r;

                    // 左右・底面の壁判定
                    if (gx < 0 || gx >= this.cols || gy >= this.totalRows) {
                        return true;
                    }

                    // 既存ブロックとの衝突（盤面内のみ）
                    if (gy >= 0 && this.grid[gy][gx]) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // ゴーストブロック位置の更新
    updateGhost() {
        if (!this.currentPiece) {
            this.ghostPiece = null;
            return;
        }
        let ghostY = this.currentPiece.y;
        while (!this.checkCollision(this.currentPiece.x, ghostY + 1, this.currentPiece.shape)) {
            ghostY++;
        }
        this.ghostPiece = {
            ...this.currentPiece,
            y: ghostY
        };
    }

    // 移動処理（左右）
    move(dx) {
        if (this.gameOver || this.paused || !this.currentPiece) return false;
        if (!this.checkCollision(this.currentPiece.x + dx, this.currentPiece.y, this.currentPiece.shape)) {
            this.currentPiece.x += dx;
            this.updateGhost();
            if (this.isLocking && this.lockResets < this.maxLockResets) {
                this.lockTimer = 0;
                this.lockResets++;
            }
            if (this.onMove) this.onMove();
            return true;
        }
        return false;
    }

    // 回転処理 (dir: 1 = 時計回り, -1 = 反時計回り)
    rotate(dir = 1) {
        if (this.gameOver || this.paused || !this.currentPiece) return false;
        const p = this.currentPiece;
        if (p.type === 'O') return true; // Oミノは回転不要

        const nextShape = dir === 1 ? this.rotateMatrix(p.shape) : this.rotateMatrixCCW(p.shape);
        const nextRot = (p.rotation + (dir === 1 ? 1 : 3)) % 4;
        const kickKey = `${p.rotation}->${nextRot}`;

        const kickTable = p.type === 'I' ? WALL_KICK_DATA.I : WALL_KICK_DATA.normal;
        const kicks = kickTable[kickKey] || [[0,0]];

        for (const [kx, ky] of kicks) {
            // kyは数学的座標系(上がプラス)なので、グリッドではマイナス
            if (!this.checkCollision(p.x + kx, p.y - ky, nextShape)) {
                p.x += kx;
                p.y -= ky;
                p.shape = nextShape;
                p.rotation = nextRot;
                this.updateGhost();

                if (this.isLocking && this.lockResets < this.maxLockResets) {
                    this.lockTimer = 0;
                    this.lockResets++;
                }

                if (this.onRotate) this.onRotate();
                return true;
            }
        }
        return false;
    }

    // ソフトドロップ（下移動）
    softDrop() {
        if (this.gameOver || this.paused || !this.currentPiece) return false;
        if (!this.checkCollision(this.currentPiece.x, this.currentPiece.y + 1, this.currentPiece.shape)) {
            this.currentPiece.y++;
            this.score += 1; // ソフトドロップボーナス
            this.dropTimer = 0;
            return true;
        } else {
            // 接地
            this.isLocking = true;
            return false;
        }
    }

    // ハードドロップ（即時着地＆固定）
    hardDrop() {
        if (this.gameOver || this.paused || !this.currentPiece) return;
        let dropDistance = 0;
        while (!this.checkCollision(this.currentPiece.x, this.currentPiece.y + 1, this.currentPiece.shape)) {
            this.currentPiece.y++;
            dropDistance++;
        }
        this.score += dropDistance * 2; // ハードドロップボーナス

        if (this.onHardDrop) {
            this.onHardDrop(this.currentPiece);
        }

        this.lockPiece();
    }

    // ホールド機能
    hold() {
        if (this.gameOver || this.paused || !this.canHold || !this.currentPiece) return;
        const currentType = this.currentPiece.type;

        if (this.holdPiece === null) {
            this.holdPiece = currentType;
            this.spawnPiece();
        } else {
            const nextType = this.holdPiece;
            this.holdPiece = currentType;
            this.spawnPiece(nextType);
        }

        this.canHold = false;
        if (this.onHold) this.onHold(this.holdPiece);
    }

    // ミノを盤面に固定してライン消去を判定
    lockPiece() {
        const p = this.currentPiece;
        for (let r = 0; r < p.shape.length; r++) {
            for (let c = 0; c < p.shape[r].length; c++) {
                if (p.shape[r][c]) {
                    const gy = p.y + r;
                    const gx = p.x + c;
                    if (gy >= 0 && gy < this.totalRows && gx >= 0 && gx < this.cols) {
                        this.grid[gy][gx] = p.theme;
                    }
                }
            }
        }

        if (this.onLock) {
            this.onLock(p);
        }

        this.checkLines();
        this.spawnPiece();
    }

    // ライン消去判定
    checkLines() {
        const clearedIndices = [];
        for (let r = 0; r < this.totalRows; r++) {
            if (this.grid[r].every(cell => cell !== null)) {
                clearedIndices.push(r);
            }
        }

        if (clearedIndices.length > 0) {
            this.combo++;

            // スコア計算
            const basePoints = [0, 100, 300, 500, 800];
            const linePoints = (basePoints[clearedIndices.length] || 1000) * this.level;
            const comboPoints = this.combo > 0 ? (50 * this.combo * this.level) : 0;
            this.score += linePoints + comboPoints;

            // ライン数・レベル更新
            this.lines += clearedIndices.length;
            const newLevel = Math.floor(this.lines / 10) + 1;
            if (newLevel > this.level) {
                this.level = newLevel;
                this.updateDropInterval();
                if (this.onLevelUp) this.onLevelUp(this.level);
            }

            // グリッドから消去行を削除し、上部に空行を追加
            for (const r of clearedIndices) {
                this.grid.splice(r, 1);
                this.grid.unshift(Array(this.cols).fill(null));
            }

            if (this.onLineClear) {
                this.onLineClear(clearedIndices, clearedIndices.length, this.combo);
            }
        } else {
            this.combo = -1; // コンボ途切れ
        }
    }

    // レベルに応じた落下間隔の更新
    updateDropInterval() {
        // レベル1で1000ms、レベル15で約100msまで段階的に加速
        this.dropInterval = Math.max(80, Math.pow(0.8 - ((this.level - 1) * 0.007), this.level - 1) * 1000);
    }

    // 時間経過（メインループから呼ばれる）
    update(deltaTime) {
        if (this.gameOver || this.paused || !this.currentPiece) return;

        // 接地状態の処理
        const isTouching = this.checkCollision(this.currentPiece.x, this.currentPiece.y + 1, this.currentPiece.shape);
        if (isTouching) {
            this.isLocking = true;
            this.lockTimer += deltaTime;
            if (this.lockTimer >= this.lockDelay) {
                this.lockPiece();
                return;
            }
        } else {
            this.isLocking = false;
            this.lockTimer = 0;
        }

        // 自然落下
        this.dropTimer += deltaTime;
        if (this.dropTimer >= this.dropInterval) {
            this.dropTimer = 0;
            if (!isTouching) {
                this.currentPiece.y++;
            }
        }
    }
}

window.TetrisGame = TetrisGame;
window.PIECE_THEMES = PIECE_THEMES;
window.PIECE_SHAPES = PIECE_SHAPES;
