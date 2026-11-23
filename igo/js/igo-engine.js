/**
 * Web囲碁エンジン (js/igo-engine.js)
 * 9x9盤面対応の囲碁ルール・状態管理・判定エンジン
 */

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export const BOARD_SIZE = 9;

export class IgoEngine {
    constructor(size = BOARD_SIZE, komi = 6.5) {
        this.size = size;
        this.komi = komi;
        this.reset();
    }

    reset() {
        // 0: 空, 1: 黒, 2: 白 (1次元配列 size*size)
        this.board = new Array(this.size * this.size).fill(EMPTY);
        this.turn = BLACK; // 最初は黒番
        this.captures = { [BLACK]: 0, [WHITE]: 0 }; // 各色の取った石の数 (アゲハマ)
        this.history = []; // 棋譜履歴 { board, turn, captures, lastMove, koPoint }
        this.koPoint = null; // コウによる着手禁止座標 (index)
        this.consecutivePasses = 0; // 連続パス数
        this.isGameOver = false;
        this.winner = null;
        this.scoreResult = null;
        this.lastMove = null; // 直前の着手 { x, y, color, isPass }
    }

    index(x, y) {
        if (x < 0 || x >= this.size || y < 0 || y >= this.size) return -1;
        return y * this.size + x;
    }

    coord(idx) {
        return {
            x: idx % this.size,
            y: Math.floor(idx / this.size)
        };
    }

    getAdjacentIndices(idx) {
        const { x, y } = this.coord(idx);
        const neighbors = [];
        if (x > 0) neighbors.push(this.index(x - 1, y));
        if (x < this.size - 1) neighbors.push(this.index(x + 1, y));
        if (y > 0) neighbors.push(this.index(x, y - 1));
        if (y < this.size - 1) neighbors.push(this.index(x, y + 1));
        return neighbors;
    }

    // 連 (グループ) とその呼吸点 (空点) を取得
    getGroupAndLiberties(idx, boardState = this.board) {
        const color = boardState[idx];
        if (color === EMPTY) return { group: [], liberties: new Set() };

        const group = [];
        const liberties = new Set();
        const visited = new Set();
        const queue = [idx];
        visited.add(idx);

        while (queue.length > 0) {
            const current = queue.shift();
            group.push(current);

            const neighbors = this.getAdjacentIndices(current);
            for (const n of neighbors) {
                if (boardState[n] === EMPTY) {
                    liberties.add(n);
                } else if (boardState[n] === color && !visited.has(n)) {
                    visited.add(n);
                    queue.push(n);
                }
            }
        }

        return { group, liberties };
    }

    // 着手の妥当性検証
    validateMove(x, y, color = this.turn) {
        if (this.isGameOver) return { valid: false, reason: 'ゲームは既に終了しています。' };
        if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
            return { valid: false, reason: '盤外です。' };
        }

        const idx = this.index(x, y);
        if (this.board[idx] !== EMPTY) {
            return { valid: false, reason: '既に石が置かれています。' };
        }

        // コウの禁止
        if (this.koPoint === idx) {
            return { valid: false, reason: 'コウ（同形反復）のため、この手番では打てません。' };
        }

        // 仮想的に石を置いて判定
        const opponent = color === BLACK ? WHITE : BLACK;
        const testBoard = [...this.board];
        testBoard[idx] = color;

        // 隣接する相手の石の呼吸点をチェックして取れるか判定
        const neighbors = this.getAdjacentIndices(idx);
        let capturedCount = 0;
        const capturedStones = [];

        for (const n of neighbors) {
            if (testBoard[n] === opponent) {
                const { group, liberties } = this.getGroupAndLiberties(n, testBoard);
                if (liberties.size === 0) {
                    capturedCount += group.length;
                    capturedStones.push(...group);
                    for (const stone of group) {
                        testBoard[stone] = EMPTY;
                    }
                }
            }
        }

        // 自殺手の判定
        const { liberties: myLiberties } = this.getGroupAndLiberties(idx, testBoard);
        if (myLiberties.size === 0 && capturedCount === 0) {
            return { valid: false, reason: '自殺手（呼吸点がない点への着手）は禁止されています。' };
        }

        return {
            valid: true,
            capturedCount,
            capturedStones
        };
    }

    // 着手実行
    play(x, y) {
        const color = this.turn;
        const validation = this.validateMove(x, y, color);
        if (!validation.valid) {
            return validation;
        }

        // 局面の履歴保存（待ったや棋譜再生用）
        this.saveHistory();

        const idx = this.index(x, y);
        this.board[idx] = color;
        const opponent = color === BLACK ? WHITE : BLACK;
        let capturedCount = 0;
        const capturedStones = [];

        // 相手の石を取る処理
        const neighbors = this.getAdjacentIndices(idx);
        for (const n of neighbors) {
            if (this.board[n] === opponent) {
                const { group, liberties } = this.getGroupAndLiberties(n);
                if (liberties.size === 0) {
                    for (const stone of group) {
                        this.board[stone] = EMPTY;
                        capturedStones.push(stone);
                    }
                    capturedCount += group.length;
                }
            }
        }

        this.captures[color] += capturedCount;

        // コウ判定: 1石だけ取り、自分の置いた石の呼吸点も1つで、取られた相手も1石だった場合
        if (capturedCount === 1) {
            const { group: myGroup, liberties: myLiberties } = this.getGroupAndLiberties(idx);
            if (myGroup.length === 1 && myLiberties.size === 1) {
                this.koPoint = capturedStones[0];
            } else {
                this.koPoint = null;
            }
        } else {
            this.koPoint = null;
        }

        this.consecutivePasses = 0;
        this.lastMove = { x, y, color, isPass: false, capturedCount, capturedStones };
        this.turn = opponent;

        return {
            valid: true,
            capturedCount,
            capturedStones,
            move: this.lastMove
        };
    }

    // パス
    pass() {
        if (this.isGameOver) return { valid: false, reason: 'ゲームは終了しています。' };

        this.saveHistory();
        this.koPoint = null;
        this.consecutivePasses++;

        const move = { x: -1, y: -1, color: this.turn, isPass: true };
        this.lastMove = move;
        this.turn = this.turn === BLACK ? WHITE : BLACK;

        // 2回連続パスで終局
        if (this.consecutivePasses >= 2) {
            this.isGameOver = true;
            this.scoreResult = this.calculateTerritory();
        }

        return {
            valid: true,
            isGameOver: this.isGameOver,
            scoreResult: this.scoreResult,
            move
        };
    }

    // 投了
    resign(color = this.turn) {
        this.isGameOver = true;
        const winner = color === BLACK ? WHITE : BLACK;
        this.winner = winner;
        this.scoreResult = {
            resignation: true,
            winner,
            text: `${color === BLACK ? '黒' : '白'}の投了により、${winner === BLACK ? '黒' : '白'}の勝ち`
        };
        return this.scoreResult;
    }

    // 局面履歴保存
    saveHistory() {
        this.history.push({
            board: [...this.board],
            turn: this.turn,
            captures: { ...this.captures },
            koPoint: this.koPoint,
            consecutivePasses: this.consecutivePasses,
            lastMove: this.lastMove ? { ...this.lastMove } : null
        });
    }

    // 待った（1手戻す。AI戦では通常2手戻す）
    undo(steps = 1) {
        if (this.history.length === 0) return false;

        const actualSteps = Math.min(steps, this.history.length);
        let previousState = null;

        for (let i = 0; i < actualSteps; i++) {
            previousState = this.history.pop();
        }

        if (previousState) {
            this.board = previousState.board;
            this.turn = previousState.turn;
            this.captures = previousState.captures;
            this.koPoint = previousState.koPoint;
            this.consecutivePasses = previousState.consecutivePasses;
            this.lastMove = previousState.lastMove;
            this.isGameOver = false;
            this.winner = null;
            this.scoreResult = null;
            return true;
        }
        return false;
    }

    // アタリ（呼吸点1つ）になっているグループの抽出
    getAtariGroups(targetColor = null) {
        const atariGroups = [];
        const visited = new Set();

        for (let i = 0; i < this.board.length; i++) {
            const stone = this.board[i];
            if (stone === EMPTY || visited.has(i)) continue;
            if (targetColor !== null && stone !== targetColor) continue;

            const { group, liberties } = this.getGroupAndLiberties(i);
            group.forEach(idx => visited.add(idx));

            if (liberties.size === 1) {
                atariGroups.push({
                    color: stone,
                    group,
                    liberty: Array.from(liberties)[0]
                });
            }
        }

        return atariGroups;
    }

    // 地合い計算（Territory Counting）
    // 空きマスから黒/白への到達可能性を判定
    calculateTerritory() {
        const territory = new Array(this.board.length).fill(EMPTY); // 1: 黒地, 2: 白地, 3: ダメ(中立)
        const visitedEmpty = new Set();

        let blackTerritoryCount = 0;
        let whiteTerritoryCount = 0;
        let dameCount = 0;

        for (let i = 0; i < this.board.length; i++) {
            if (this.board[i] !== EMPTY || visitedEmpty.has(i)) continue;

            // 空点のクラスタを探索
            const cluster = [];
            const queue = [i];
            visitedEmpty.add(i);

            let reachesBlack = false;
            let reachesWhite = false;

            while (queue.length > 0) {
                const curr = queue.shift();
                cluster.push(curr);

                const neighbors = this.getAdjacentIndices(curr);
                for (const n of neighbors) {
                    const cell = this.board[n];
                    if (cell === BLACK) {
                        reachesBlack = true;
                    } else if (cell === WHITE) {
                        reachesWhite = true;
                    } else if (cell === EMPTY && !visitedEmpty.has(n)) {
                        visitedEmpty.add(n);
                        queue.push(n);
                    }
                }
            }

            let owner = EMPTY;
            if (reachesBlack && !reachesWhite) {
                owner = BLACK;
                blackTerritoryCount += cluster.length;
            } else if (reachesWhite && !reachesBlack) {
                owner = WHITE;
                whiteTerritoryCount += cluster.length;
            } else {
                owner = 3; // ダメ
                dameCount += cluster.length;
            }

            for (const idx of cluster) {
                territory[idx] = owner;
            }
        }

        // 日本ルール計算（地 + アゲハマ + 白コミ）
        const blackTotal = blackTerritoryCount + this.captures[BLACK];
        const whiteTotal = whiteTerritoryCount + this.captures[WHITE] + this.komi;

        // 中国ルール計算（盤上の生石 + 地 + 白コミ）参考値
        let blackStonesOnBoard = 0;
        let whiteStonesOnBoard = 0;
        for (let i = 0; i < this.board.length; i++) {
            if (this.board[i] === BLACK) blackStonesOnBoard++;
            if (this.board[i] === WHITE) whiteStonesOnBoard++;
        }
        const blackChinese = blackStonesOnBoard + blackTerritoryCount;
        const whiteChinese = whiteStonesOnBoard + whiteTerritoryCount + this.komi;

        const diff = Math.abs(blackTotal - whiteTotal);
        let winner = null;
        if (blackTotal > whiteTotal) {
            winner = BLACK;
        } else if (whiteTotal > blackTotal) {
            winner = WHITE;
        }

        return {
            territoryMap: territory,
            blackTerritory: blackTerritoryCount,
            whiteTerritory: whiteTerritoryCount,
            dameCount,
            blackCaptures: this.captures[BLACK],
            whiteCaptures: this.captures[WHITE],
            komi: this.komi,
            blackTotal,
            whiteTotal,
            blackChinese,
            whiteChinese,
            winner,
            diff: diff.toFixed(1),
            summary: winner === BLACK
                ? `黒の${diff.toFixed(1)}目勝ち（黒: ${blackTotal}目 / 白: ${whiteTotal}目 [コミ${this.komi}]）`
                : `白の${diff.toFixed(1)}目勝ち（白: ${whiteTotal}目 [コミ${this.komi}] / 黒: ${blackTotal}目）`
        };
    }

    // ハンディキャップ（置き石）の設定
    setHandicap(stones = 0) {
        this.reset();
        if (stones <= 1) return;

        // 9路盤の星の位置 (0-indexed)
        // 3-3: (2, 2) => 20
        // 7-3: (6, 2) => 24
        // 3-7: (2, 6) => 56
        // 7-7: (6, 6) => 60
        // 天元: (4, 4) => 40
        const starPoints = {
            2: [this.index(6, 2), this.index(2, 6)],
            3: [this.index(6, 2), this.index(2, 6), this.index(6, 6)],
            4: [this.index(2, 2), this.index(6, 2), this.index(2, 6), this.index(6, 6)],
            5: [this.index(2, 2), this.index(6, 2), this.index(2, 6), this.index(6, 6), this.index(4, 4)]
        };

        const points = starPoints[stones] || [];
        for (const pt of points) {
            this.board[pt] = BLACK;
        }

        // 置き石対局の場合、白から着手開始、コミは0.5目
        this.turn = WHITE;
        this.komi = 0.5;
    }

    // 全合法手のリストを取得
    getLegalMoves(color = this.turn) {
        const legalMoves = [];
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                const check = this.validateMove(x, y, color);
                if (check.valid) {
                    legalMoves.push({ x, y, ...check });
                }
            }
        }
        return legalMoves;
    }

    // クローン（AI探索・シミュレーション用）
    clone() {
        const copy = new IgoEngine(this.size, this.komi);
        copy.board = [...this.board];
        copy.turn = this.turn;
        copy.captures = { ...this.captures };
        copy.koPoint = this.koPoint;
        copy.consecutivePasses = this.consecutivePasses;
        copy.isGameOver = this.isGameOver;
        copy.lastMove = this.lastMove ? { ...this.lastMove } : null;
        return copy;
    }
}
