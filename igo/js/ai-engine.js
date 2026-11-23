/**
 * Web囲碁AIエンジン (js/ai-engine.js)
 * Lv.1〜Lv.4対応 モンテカルロ木探索 (MCTS) & ルールベース思考ルーチン
 */

import { EMPTY, BLACK, WHITE, BOARD_SIZE } from './igo-engine.js';

export class AiEngine {
    constructor(engine) {
        this.engine = engine;
    }

    // AIの思考手を取得（非同期でUIブロックを防止）
    async getBestMove(level = 2, color = this.engine.turn, allowResign = true) {
        return new Promise((resolve) => {
            // UI更新用のレンダリング時間を確保するため微小遅延
            setTimeout(() => {
                // 絶望的な局面での潔い投了チェック
                if (allowResign && this.checkResignation(level, color)) {
                    resolve({ isResign: true });
                    return;
                }

                let move = null;
                switch (level) {
                    case 1:
                        move = this.thinkLevel1(color);
                        break;
                    case 2:
                        move = this.thinkLevel2(color);
                        break;
                    case 3:
                        move = this.thinkMCTS(color, 250);
                        break;
                    case 4:
                        move = this.thinkMCTS(color, 800);
                        break;
                    default:
                        move = this.thinkLevel2(color);
                        break;
                }
                resolve(move);
            }, 60);
        });
    }

    // 潔い投了（負けを認める）判定ロジック
    checkResignation(level, color) {
        // 序盤（24手未満）は投了しない（まだ変化・逆転の余地があるため）
        if (this.engine.history.length < 24) return false;

        // Lv.1 入門は初心者が最後まで整地を体験できるよう投了しない
        if (level === 1) return false;

        const territory = this.engine.calculateTerritory();
        const opponent = color === BLACK ? WHITE : BLACK;

        // AIのビハインド目数（相手スコア - 自分スコア）
        const aiScore = color === BLACK ? territory.blackTotal : territory.whiteTotal;
        const oppScore = opponent === BLACK ? territory.blackTotal : territory.whiteTotal;
        const behindPoints = oppScore - aiScore;

        // レベル別の匙加減（閾値）
        // Lv.2 初級: 20目以上の大差
        if (level === 2 && behindPoints >= 20) {
            return true;
        }

        // Lv.3 中級: 15目以上の大差
        if (level === 3 && behindPoints >= 15) {
            return true;
        }

        // Lv.4 上級: 高段者のように13目以上の大差で潔く投了（九路盤の13目差は19路盤の50目差以上に相当）
        if (level === 4 && behindPoints >= 13) {
            return true;
        }

        return false;
    }

    // Lv.1 入門：ランダム＋基本捕獲
    thinkLevel1(color) {
        const legalMoves = this.engine.getLegalMoves(color);
        if (legalMoves.length === 0) return { isPass: true };

        // 1. 取れる手があれば優先して取る
        const captureMoves = legalMoves.filter(m => m.capturedCount > 0);
        if (captureMoves.length > 0) {
            // 最大の石を取れる手
            captureMoves.sort((a, b) => b.capturedCount - a.capturedCount);
            return captureMoves[0];
        }

        // 2. 自殺手ではない安全な候補からランダムに選ぶ
        // 1線（端っこ）への無駄な着手を少し下げる
        const filtered = legalMoves.filter(m => {
            const isEdge = m.x === 0 || m.x === BOARD_SIZE - 1 || m.y === 0 || m.y === BOARD_SIZE - 1;
            return !isEdge || Math.random() < 0.3;
        });

        const pool = filtered.length > 0 ? filtered : legalMoves;
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        return chosen;
    }

    // Lv.2 初級：アタリの捕獲・脱出 ＋ 星・天元等の定石重視
    thinkLevel2(color) {
        const opponent = color === BLACK ? WHITE : BLACK;
        const legalMoves = this.engine.getLegalMoves(color);
        if (legalMoves.length === 0) return { isPass: true };

        // 1. 相手のアタリの石を取る（最優先）
        const captureMoves = legalMoves.filter(m => m.capturedCount > 0);
        if (captureMoves.length > 0) {
            captureMoves.sort((a, b) => b.capturedCount - a.capturedCount);
            return captureMoves[0];
        }

        // 2. 自分のアタリになっている石を救う手
        const myAtaris = this.engine.getAtariGroups(color);
        if (myAtaris.length > 0) {
            // 呼吸点を増やす、または相手を取って助ける手を模索
            for (const atari of myAtaris) {
                const escapeCoord = this.engine.coord(atari.liberty);
                const check = this.engine.validateMove(escapeCoord.x, escapeCoord.y, color);
                if (check.valid) {
                    return { x: escapeCoord.x, y: escapeCoord.y };
                }
            }
        }

        // 3. 相手の石をアタリにする手
        for (const m of legalMoves) {
            const clone = this.engine.clone();
            clone.play(m.x, m.y);
            const oppAtaris = clone.getAtariGroups(opponent);
            if (oppAtaris.length > 0) {
                return m;
            }
        }

        // 4. 開局時の好点（天元・星）
        const goodPoints = [
            { x: 4, y: 4, weight: 10 }, // 天元
            { x: 2, y: 2, weight: 8 },  // 星
            { x: 6, y: 2, weight: 8 },
            { x: 2, y: 6, weight: 8 },
            { x: 6, y: 6, weight: 8 },
            { x: 4, y: 2, weight: 6 },
            { x: 2, y: 4, weight: 6 },
            { x: 6, y: 4, weight: 6 },
            { x: 4, y: 6, weight: 6 }
        ];

        let bestScore = -9999;
        let bestMove = legalMoves[0];

        for (const m of legalMoves) {
            let score = Math.random() * 2;
            const gp = goodPoints.find(p => p.x === m.x && p.y === m.y);
            if (gp) score += gp.weight;

            // 端の1線は序盤マイナス評価
            if (m.x === 0 || m.x === BOARD_SIZE - 1 || m.y === 0 || m.y === BOARD_SIZE - 1) {
                score -= 3;
            }

            // 自分の石に隣接している手（連携）をプラス
            const neighbors = this.engine.getAdjacentIndices(this.engine.index(m.x, m.y));
            for (const n of neighbors) {
                if (this.engine.board[n] === color) score += 2;
                if (this.engine.board[n] === opponent) score += 1.5;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMove = m;
            }
        }

        return bestMove;
    }

    // Lv.3 & Lv.4：モンテカルロ木探索 (MCTS)
    thinkMCTS(color, iterations = 300) {
        const legalMoves = this.engine.getLegalMoves(color);
        if (legalMoves.length === 0) return { isPass: true };

        // 相手の石が取れる手があれば候補として重視
        const immediateCapture = legalMoves.filter(m => m.capturedCount > 0);
        if (immediateCapture.length > 0 && Math.random() < 0.85) {
            immediateCapture.sort((a, b) => b.capturedCount - a.capturedCount);
            // 複数石取れるなら即座に着手
            if (immediateCapture[0].capturedCount >= 2) {
                return immediateCapture[0];
            }
        }

        // MCTS探索ルート
        const candidates = legalMoves.map(move => ({
            move,
            wins: 0,
            visits: 0
        }));

        const startTime = Date.now();
        const maxTimeMs = iterations > 500 ? 1200 : 500;

        for (let iter = 0; iter < iterations; iter++) {
            // 時間制限チェック（長時間UIが止まらないよう保護）
            if (iter % 50 === 0 && (Date.now() - startTime) > maxTimeMs) {
                break;
            }

            // UCB1で候補選択
            let selectedCandidate = null;
            let bestUcb = -Infinity;
            const totalVisits = iter + 1;

            for (const cand of candidates) {
                if (cand.visits === 0) {
                    selectedCandidate = cand;
                    break;
                }
                // UCB1 formula: winRate + C * sqrt(ln(N) / n)
                const winRate = cand.wins / cand.visits;
                const ucb = winRate + 1.2 * Math.sqrt(Math.log(totalVisits) / cand.visits);
                if (ucb > bestUcb) {
                    bestUcb = ucb;
                    selectedCandidate = cand;
                }
            }

            if (!selectedCandidate) selectedCandidate = candidates[0];

            // シミュレーション（ロールアウト）
            const simEngine = this.engine.clone();
            simEngine.play(selectedCandidate.move.x, selectedCandidate.move.y);

            const isWin = this.simulatePlayout(simEngine, color, 30);
            if (isWin) {
                selectedCandidate.wins += 1;
            }
            selectedCandidate.visits += 1;
        }

        // 最多訪問回数の手を選択
        candidates.sort((a, b) => b.visits - a.visits);
        const topCandidate = candidates[0];

        // あまりにも勝率が低い、または訪問数が0の場合はパス
        if (topCandidate.visits > 0 && (topCandidate.wins / topCandidate.visits) < 0.05 && legalMoves.length < 5) {
            return { isPass: true };
        }

        return topCandidate.move;
    }

    // ランダム・軽量ロールアウト（深さ制限付き）
    simulatePlayout(engine, myColor, maxDepth = 25) {
        let depth = 0;
        while (!engine.isGameOver && depth < maxDepth) {
            const moves = engine.getLegalMoves(engine.turn);
            if (moves.length === 0) {
                engine.pass();
            } else {
                // アタリ取りを優先した軽量ヒューリスティック選択
                const captures = moves.filter(m => m.capturedCount > 0);
                const pick = captures.length > 0 && Math.random() < 0.7
                    ? captures[Math.floor(Math.random() * captures.length)]
                    : moves[Math.floor(Math.random() * moves.length)];
                engine.play(pick.x, pick.y);
            }
            depth++;
        }

        // 終局地合いまたは石数で判定
        const res = engine.calculateTerritory();
        return res.winner === myColor;
    }

    // 形勢判断・優勢度予測 (-1.0: 白圧倒的優勢 〜 +1.0: 黒圧倒的優勢)
    evaluatePosition() {
        const territory = this.engine.calculateTerritory();
        const blackScore = territory.blackTotal;
        const whiteScore = territory.whiteTotal;
        const diff = blackScore - whiteScore;
        // シグモイド関数的に -1.0〜+1.0 に正規化 (10目差で約73%優勢)
        const advantage = Math.tanh(diff / 12.0);
        return {
            advantage, // -1(白優勢) 〜 +1(黒優勢)
            blackScore,
            whiteScore,
            summary: territory.summary
        };
    }
}
