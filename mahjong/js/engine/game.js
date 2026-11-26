/**
 * 本格4人打ち麻雀 ゲームステートマシン＆初心者アシスト生成エンジン
 */
import {
  WIND_EAST, WIND_SOUTH, WIND_WEST, WIND_NORTH,
  createDeck, shuffleDeck, sortTiles, tilesToCounts,
  getTileBadge, isYaochu, isDragon, getNumber, getSuit,
} from './tiles.js';
import { calcShanten, getWaits, analyzeDiscardOptions } from './shanten.js';
import { evaluateWin, analyzePotentialYaku } from './yaku.js';
import { buildVisibleCounts, chooseAiAction } from './ai.js';

export const PHASE = {
  IDLE: 'IDLE',
  PLAYER_TURN: 'PLAYER_TURN',
  AI_TURN: 'AI_TURN',
  CALL_WINDOW: 'CALL_WINDOW',
  ROUND_END: 'ROUND_END',
  MATCH_END: 'MATCH_END',
};

const WIND_CYCLE = [WIND_EAST, WIND_SOUTH, WIND_WEST, WIND_NORTH];
const DEFAULT_NAMES = ['あなた', '花鳥（AI）', '風月（AI）', '雅（AI）'];

class PlayerState {
  constructor(index, name, isHuman) {
    this.index = index;
    this.name = name;
    this.isHuman = isHuman;
    this.score = 25000;
    this.resetRound(WIND_EAST);
  }

  resetRound(seatWind) {
    this.seatWind = seatWind;
    this.hand = [];
    this.melds = [];
    this.discards = [];
    this.isRiichi = false;
    this.isDoubleRiichi = false;
    this.isIppatsu = false;
    this.riichiTurnIndex = -1;
    this.tempFuriten = false;
    this.riichiFuriten = false;
    this.drawnTile = null;
  }

  isMenzen() { return this.melds.every((m) => m.type === 'ankan'); }
  hasDiscardedType(type) { return this.discards.some((d) => d.tile.type === type); }
}

export class MahjongGame {
  constructor(options = {}) {
    this.matchType = options.matchType || 'tonpu';
    this.useRedFives = options.useRedFives !== false;
    this.enableTobi = options.enableTobi !== false;
    this.rng = options.rng || Math.random;
    this.listeners = new Set();

    this.players = [
      new PlayerState(0, options.playerName || DEFAULT_NAMES[0], true),
      new PlayerState(1, DEFAULT_NAMES[1], false),
      new PlayerState(2, DEFAULT_NAMES[2], false),
      new PlayerState(3, DEFAULT_NAMES[3], false),
    ];

    this.phase = PHASE.IDLE;
    this.roundWind = WIND_EAST;
    this.roundNumber = 0;
    this.dealerIndex = 0;
    this.honba = 0;
    this.riichiSticks = 0;
    this.wall = [];
    this.wallPos = 0;
    this.deadWall = [];
    this.rinshanPos = 0;
    this.doraCount = 1;
    this.kanCountTotal = 0;
    this.turnPlayer = 0;
    this.firstTurnIntact = true;
    this.pendingCall = null;
    this.pendingDiscard = null;
    this.roundResult = null;
    this.matchResult = null;
    this.lastDrawnWasRinshan = false;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(eventType, detail = {}) {
    const snap = this.getSnapshot();
    for (const fn of this.listeners) fn(eventType, detail, snap);
  }

  wallRemaining() { return Math.max(0, this.wall.length - this.wallPos); }
  get doraIndicators() { return this.deadWall.slice(0, this.doraCount); }
  getDoraIndicators() { return this.deadWall.slice(0, this.doraCount); }
  getUraDoraIndicators() { return this.deadWall.slice(4, 4 + this.doraCount); }

  startMatch(matchType = this.matchType) {
    this.matchType = matchType;
    const isTwo = matchType === 'two_player';
    this.players = isTwo
      ? [
          new PlayerState(0, DEFAULT_NAMES[0], true),
          new PlayerState(1, DEFAULT_NAMES[3], false),
        ]
      : [
          new PlayerState(0, DEFAULT_NAMES[0], true),
          new PlayerState(1, DEFAULT_NAMES[1], false),
          new PlayerState(2, DEFAULT_NAMES[2], false),
          new PlayerState(3, DEFAULT_NAMES[3], false),
        ];

    for (const p of this.players) p.score = 25000;
    this.roundWind = WIND_EAST;
    this.roundNumber = 0;
    this.dealerIndex = 0;
    this.honba = 0;
    this.riichiSticks = 0;
    this.matchResult = null;
    this.startRound();
  }

  startRound() {
    const n = this.players.length;
    const deck = shuffleDeck(createDeck(this.useRedFives), this.rng);
    this.deadWall = deck.slice(deck.length - 14);
    const fullWall = deck.slice(0, deck.length - 14);
    // 二人打ちは配牌26枚＋ツモ山44枚（1人22巡）でテンポよく河も綺麗に収める
    this.wall = n === 2 ? fullWall.slice(0, 26 + 44) : fullWall;
    this.wallPos = 0;
    this.rinshanPos = 8;
    this.doraCount = 1;
    this.kanCountTotal = 0;
    this.firstTurnIntact = true;
    this.roundResult = null;
    this.pendingCall = null;
    this.pendingDiscard = null;
    this.lastDrawnWasRinshan = false;

    for (let i = 0; i < n; i++) {
      const windIdx = (i - this.dealerIndex + n) % n;
      this.players[i].resetRound(WIND_CYCLE[windIdx]);
    }

    for (let i = 0; i < n; i++) {
      const pIdx = (this.dealerIndex + i) % n;
      const cards = this.wall.slice(this.wallPos, this.wallPos + 13);
      this.wallPos += 13;
      this.players[pIdx].hand = sortTiles(cards);
    }

    this.turnPlayer = this.dealerIndex;
    this.emit('ROUND_START', { roundWind: this.roundWind, roundNumber: this.roundNumber, honba: this.honba, dealerIndex: this.dealerIndex });
    this.drawForCurrentPlayer(false);
  }

  drawForCurrentPlayer(isRinshan = false) {
    const p = this.players[this.turnPlayer];
    p.tempFuriten = false;

    if (!isRinshan && this.wallRemaining() <= 0) {
      this.finishExhaustiveDraw();
      return;
    }

    const tile = isRinshan ? this.deadWall[this.rinshanPos++] : this.wall[this.wallPos++];
    this.lastDrawnWasRinshan = isRinshan;
    p.drawnTile = tile;
    p.hand.push(tile);

    this.phase = p.isHuman ? PHASE.PLAYER_TURN : PHASE.AI_TURN;
    this.emit('DRAW', { playerIndex: p.index, tile, isRinshan });
  }

  getTurnActions(playerIndex = this.turnPlayer) {
    const p = this.players[playerIndex];
    const actions = {
      canTsumo: false, tsumoResult: null,
      canRiichi: false, riichiDiscards: [],
      ankanOptions: [], kakanOptions: [], canKyuushu: false,
    };

    if ((this.phase !== PHASE.PLAYER_TURN && this.phase !== PHASE.AI_TURN) || playerIndex !== this.turnPlayer) {
      return actions;
    }

    const winRes = evaluateWin({
      closedTiles: p.hand,
      melds: p.melds,
      winTile: p.drawnTile || p.hand[p.hand.length - 1],
      isTsumo: true,
      seatWind: p.seatWind,
      roundWind: this.roundWind,
      isRiichi: p.isRiichi && !p.isDoubleRiichi,
      isDoubleRiichi: p.isDoubleRiichi,
      isIppatsu: p.isIppatsu,
      isRinshan: this.lastDrawnWasRinshan,
      isHaitei: !this.lastDrawnWasRinshan && this.wallRemaining() === 0,
      isFirstTurnNoCall: this.firstTurnIntact && p.discards.length === 0,
      doraIndicators: this.getDoraIndicators(),
      uraDoraIndicators: this.getUraDoraIndicators(),
      honba: this.honba,
      riichiSticks: this.riichiSticks,
    });
    if (winRes) { actions.canTsumo = true; actions.tsumoResult = winRes; }

    if (!p.isRiichi && p.isMenzen() && p.score >= 1000 && this.wallRemaining() >= 4) {
      const seen = new Set();
      for (const tile of p.hand) {
        if (seen.has(tile.type)) continue;
        seen.add(tile.type);
        const remHand = p.hand.filter((t) => t.id !== tile.id);
        const counts = tilesToCounts(remHand);
        if (calcShanten(counts, p.melds.length).shanten === 0) {
          actions.riichiDiscards.push({ type: tile.type, waits: getWaits(counts, p.melds.length) });
        }
      }
      actions.canRiichi = actions.riichiDiscards.length > 0;
    }

    if (this.kanCountTotal < 4 && this.wallRemaining() >= 1) {
      const counts = tilesToCounts(p.hand);
      for (let t = 0; t < 34; t++) {
        if (counts[t] === 4) {
          if (p.isRiichi) {
            if (p.drawnTile && p.drawnTile.type === t) {
              const beforeWaits = getWaits(tilesToCounts(p.hand.filter((x) => x.id !== p.drawnTile.id)), p.melds.length);
              const afterWaits = getWaits(tilesToCounts(p.hand.filter((x) => x.type !== t)), p.melds.length + 1);
              if (beforeWaits.length === afterWaits.length && beforeWaits.every((w, idx) => w === afterWaits[idx])) {
                actions.ankanOptions.push(t);
              }
            }
          } else {
            actions.ankanOptions.push(t);
          }
        }
      }
      if (!p.isRiichi) {
        for (let mIdx = 0; mIdx < p.melds.length; mIdx++) {
          const m = p.melds[mIdx];
          if (m.type === 'pon') {
            const extra = p.hand.find((ht) => ht.type === m.tiles[0].type);
            if (extra) actions.kakanOptions.push({ meldIndex: mIdx, tile: extra });
          }
        }
      }
    }

    if (this.firstTurnIntact && p.discards.length === 0) {
      const counts = tilesToCounts(p.hand);
      let yaoKinds = 0;
      for (let t = 0; t < 34; t++) if (isYaochu(t) && counts[t] > 0) yaoKinds++;
      if (yaoKinds >= 9) actions.canKyuushu = true;
    }

    return actions;
  }

  discardTile(playerIndex, tileId, declareRiichi = false) {
    if (playerIndex !== this.turnPlayer) return false;
    if (this.phase !== PHASE.PLAYER_TURN && this.phase !== PHASE.AI_TURN) return false;

    const p = this.players[playerIndex];
    const idx = p.hand.findIndex((t) => t.id === tileId);
    if (idx === -1) return false;
    if (p.isRiichi && p.drawnTile && tileId !== p.drawnTile.id) return false;

    const tile = p.hand[idx];
    const isTsumogiri = p.drawnTile ? p.drawnTile.id === tile.id : false;

    if (declareRiichi) {
      const turnActions = this.getTurnActions(playerIndex);
      if (!turnActions.canRiichi || !turnActions.riichiDiscards.some((r) => r.type === tile.type)) return false;
      p.isRiichi = true;
      p.isDoubleRiichi = this.firstTurnIntact && p.discards.length === 0;
      p.isIppatsu = true;
      p.riichiTurnIndex = p.discards.length;
      p.score -= 1000;
      this.riichiSticks += 1;
    } else if (p.isIppatsu) {
      p.isIppatsu = false;
    }

    p.hand.splice(idx, 1);
    p.hand = sortTiles(p.hand);
    p.drawnTile = null;
    p.discards.push({ tile, isRiichiTile: declareRiichi, isTsumogiri, calledBy: -1 });
    this.lastDrawnWasRinshan = false;

    this.emit('DISCARD', { playerIndex, tile, isRiichi: declareRiichi, isTsumogiri });

    const callOffers = this.evaluateCallOffers(playerIndex, tile);
    if (callOffers.hasAny) {
      this.pendingDiscard = { fromIndex: playerIndex, tile };
      this.pendingCall = callOffers;
      this.phase = PHASE.CALL_WINDOW;
      this.emit('CALL_WINDOW', { fromIndex: playerIndex, tile, offers: callOffers });
      return true;
    }

    this.advanceTurn(playerIndex);
    return true;
  }

  evaluateCallOffers(fromIndex, tile) {
    const offersByPlayer = {};
    let hasAny = false;
    const isLastDiscard = this.wallRemaining() === 0;
    const n = this.players.length;

    for (let offset = 1; offset < n; offset++) {
      const pIdx = (fromIndex + offset) % n;
      const p = this.players[pIdx];
      const acts = { ron: null, pon: null, minkan: null, chi: [] };

      const counts13 = tilesToCounts(p.hand);
      const waits = getWaits(counts13, p.melds.length);
      if (waits.includes(tile.type)) {
        const isFuriten = p.tempFuriten || p.riichiFuriten || waits.some((w) => p.hasDiscardedType(w));
        if (!isFuriten) {
          const winRes = evaluateWin({
            closedTiles: [...p.hand, tile],
            melds: p.melds,
            winTile: tile,
            isTsumo: false,
            seatWind: p.seatWind,
            roundWind: this.roundWind,
            isRiichi: p.isRiichi && !p.isDoubleRiichi,
            isDoubleRiichi: p.isDoubleRiichi,
            isIppatsu: p.isIppatsu,
            isHoutei: isLastDiscard,
            doraIndicators: this.getDoraIndicators(),
            uraDoraIndicators: this.getUraDoraIndicators(),
            honba: this.honba,
            riichiSticks: this.riichiSticks,
          });
          if (winRes) acts.ron = winRes;
        }
      }

      if (!p.isRiichi && !isLastDiscard) {
        const sameTiles = p.hand.filter((ht) => ht.type === tile.type);
        if (sameTiles.length >= 2) acts.pon = { handTiles: sameTiles.slice(0, 2) };
        if (sameTiles.length >= 3 && this.kanCountTotal < 4) acts.minkan = { handTiles: sameTiles.slice(0, 3) };
        if (offset === 1 && tile.type < 27) {
          const s = getSuit(tile.type), n = getNumber(tile.type), base = s * 9;
          for (const [n1, n2] of [[n - 2, n - 1], [n - 1, n + 1], [n + 1, n + 2]]) {
            if (n1 >= 1 && n1 <= 9 && n2 >= 1 && n2 <= 9) {
              const t1 = p.hand.find((ht) => ht.type === base + (n1 - 1));
              const t2 = p.hand.find((ht) => ht.type === base + (n2 - 1));
              if (t1 && t2) acts.chi.push({ handTiles: [t1, t2] });
            }
          }
        }
      }

      if (acts.ron || acts.pon || acts.minkan || acts.chi.length > 0) {
        offersByPlayer[pIdx] = acts;
        hasAny = true;
      }
    }
    return { hasAny, offersByPlayer, responses: {} };
  }

  submitCallResponse(playerIndex, decision) {
    if (this.phase !== PHASE.CALL_WINDOW || !this.pendingCall) return false;
    if (!this.pendingCall.offersByPlayer[playerIndex]) return false;

    const offer = this.pendingCall.offersByPlayer[playerIndex];
    if (offer.ron && decision.type !== 'ron') {
      const p = this.players[playerIndex];
      p.tempFuriten = true;
      if (p.isRiichi) p.riichiFuriten = true;
    }

    this.pendingCall.responses[playerIndex] = decision;
    const pendingPlayers = Object.keys(this.pendingCall.offersByPlayer).map(Number);
    if (!pendingPlayers.every((idx) => this.pendingCall.responses[idx])) return true;

    this.resolveCallWindow();
    return true;
  }

  processAiCallResponses() {
    if (this.phase !== PHASE.CALL_WINDOW || !this.pendingCall) return;
    const { tile } = this.pendingDiscard;

    for (const key of Object.keys(this.pendingCall.offersByPlayer)) {
      const pIdx = Number(key);
      if (this.pendingCall.responses[pIdx]) continue;
      const p = this.players[pIdx];
      if (!p.isHuman) {
        const decision = chooseAiAction(p, this.pendingCall.offersByPlayer[pIdx], tile, this);
        this.submitCallResponse(pIdx, decision);
        if (this.phase !== PHASE.CALL_WINDOW) return;
      }
    }
  }

  resolveCallWindow() {
    if (!this.pendingCall || !this.pendingDiscard) return;
    const { fromIndex, tile } = this.pendingDiscard;
    const responses = this.pendingCall.responses;
    const n = this.players.length;

    for (let offset = 1; offset < n; offset++) {
      const idx = (fromIndex + offset) % n;
      if (responses[idx]?.type === 'ron') {
        const winResult = this.pendingCall.offersByPlayer[idx].ron;
        this.pendingCall = null;
        this.pendingDiscard = null;
        this.finishWin(idx, fromIndex, tile, winResult);
        return;
      }
    }

    for (let offset = 1; offset < n; offset++) {
      const idx = (fromIndex + offset) % n;
      const resp = responses[idx];
      if (resp?.type === 'pon' || resp?.type === 'minkan') {
        this.executeOpenMeld(idx, fromIndex, tile, resp.type, resp.option.handTiles);
        return;
      }
    }

    const shimoIdx = (fromIndex + 1) % n;
    if (responses[shimoIdx]?.type === 'chi') {
      this.executeOpenMeld(shimoIdx, fromIndex, tile, 'chi', responses[shimoIdx].option.handTiles);
      return;
    }

    this.pendingCall = null;
    this.pendingDiscard = null;
    this.advanceTurn(fromIndex);
  }

  executeOpenMeld(callerIdx, fromIndex, calledTile, meldType, handTilesToUse) {
    this.pendingCall = null;
    this.pendingDiscard = null;
    this.firstTurnIntact = false;
    for (const pl of this.players) pl.isIppatsu = false;

    const caller = this.players[callerIdx];
    const usedIds = new Set(handTilesToUse.map((t) => t.id));
    caller.hand = sortTiles(caller.hand.filter((t) => !usedIds.has(t.id)));

    const meldTiles = sortTiles([...handTilesToUse, calledTile]);
    caller.melds.push({ type: meldType, tiles: meldTiles, fromIdx: fromIndex, calledTileId: calledTile.id });

    const fromPlayer = this.players[fromIndex];
    const lastD = fromPlayer.discards[fromPlayer.discards.length - 1];
    if (lastD) lastD.calledBy = callerIdx;

    this.turnPlayer = callerIdx;
    this.emit('MELD', { playerIndex: callerIdx, fromIndex, meldType, tiles: meldTiles });

    if (meldType === 'minkan') {
      this.kanCountTotal++;
      if (this.doraCount < 4) this.doraCount++;
      this.drawForCurrentPlayer(true);
    } else {
      this.phase = caller.isHuman ? PHASE.PLAYER_TURN : PHASE.AI_TURN;
      this.emit('TURN_AFTER_MELD', { playerIndex: callerIdx });
    }
  }

  declareAnkan(playerIndex, tileType) {
    if (playerIndex !== this.turnPlayer) return false;
    const p = this.players[playerIndex];
    const tiles = p.hand.filter((t) => t.type === tileType);
    if (tiles.length !== 4 || this.kanCountTotal >= 4) return false;

    p.hand = sortTiles(p.hand.filter((t) => t.type !== tileType));
    p.drawnTile = null;
    p.melds.push({ type: 'ankan', tiles: sortTiles(tiles), fromIdx: playerIndex, calledTileId: -1 });
    this.firstTurnIntact = false;
    for (const pl of this.players) pl.isIppatsu = false;

    this.kanCountTotal++;
    if (this.doraCount < 4) this.doraCount++;
    this.emit('MELD', { playerIndex, fromIndex: playerIndex, meldType: 'ankan', tiles });
    this.drawForCurrentPlayer(true);
    return true;
  }

  declareKakan(playerIndex, meldIndex, tileId) {
    if (playerIndex !== this.turnPlayer) return false;
    const p = this.players[playerIndex];
    const meld = p.melds[meldIndex];
    const tileIdx = p.hand.findIndex((t) => t.id === tileId);
    if (!meld || meld.type !== 'pon' || tileIdx === -1 || this.kanCountTotal >= 4) return false;

    const tile = p.hand[tileIdx];
    p.hand.splice(tileIdx, 1);
    p.hand = sortTiles(p.hand);
    p.drawnTile = null;
    meld.type = 'kakan';
    meld.tiles = sortTiles([...meld.tiles, tile]);

    this.firstTurnIntact = false;
    for (const pl of this.players) pl.isIppatsu = false;

    const n = this.players.length;
    for (let offset = 1; offset < n; offset++) {
      const otherIdx = (playerIndex + offset) % n;
      const other = this.players[otherIdx];
      const waits = getWaits(tilesToCounts(other.hand), other.melds.length);
      if (waits.includes(tile.type)) {
        const isFuriten = other.tempFuriten || other.riichiFuriten || waits.some((w) => other.hasDiscardedType(w));
        if (!isFuriten) {
          const winRes = evaluateWin({
            closedTiles: [...other.hand, tile],
            melds: other.melds,
            winTile: tile,
            isTsumo: false,
            seatWind: other.seatWind,
            roundWind: this.roundWind,
            isRiichi: other.isRiichi && !other.isDoubleRiichi,
            isDoubleRiichi: other.isDoubleRiichi,
            isIppatsu: other.isIppatsu,
            isChankan: true,
            doraIndicators: this.getDoraIndicators(),
            uraDoraIndicators: this.getUraDoraIndicators(),
            honba: this.honba,
            riichiSticks: this.riichiSticks,
          });
          if (winRes && !other.isHuman) {
            this.finishWin(otherIdx, playerIndex, tile, winRes);
            return true;
          }
        }
      }
    }

    this.kanCountTotal++;
    if (this.doraCount < 4) this.doraCount++;
    this.emit('MELD', { playerIndex, fromIndex: playerIndex, meldType: 'kakan', tiles: meld.tiles });
    this.drawForCurrentPlayer(true);
    return true;
  }

  declareTsumo(playerIndex) {
    if (playerIndex !== this.turnPlayer) return false;
    const acts = this.getTurnActions(playerIndex);
    if (!acts.canTsumo) return false;
    const p = this.players[playerIndex];
    this.finishWin(playerIndex, -1, p.drawnTile || p.hand[p.hand.length - 1], acts.tsumoResult);
    return true;
  }

  declareKyuushu(playerIndex) {
    if (!this.getTurnActions(playerIndex).canKyuushu) return false;
    this.finishSpecialDraw('九種九牌（途中流局）', true);
    return true;
  }

  advanceTurn(lastPlayerIndex) {
    const n = this.players.length;
    if (lastPlayerIndex === (this.dealerIndex + n - 1) % n) this.firstTurnIntact = false;
    this.turnPlayer = (lastPlayerIndex + 1) % n;
    this.drawForCurrentPlayer(false);
  }

  finishWin(winnerIdx, loserIdx, winTile, winResult) {
    const n = this.players.length;
    const deltas = new Array(n).fill(0);
    const winner = this.players[winnerIdx];
    const sc = winResult.score;

    if (winResult.isTsumo) {
      if (n === 2) {
        const otherIdx = 1 - winnerIdx;
        const pay = sc.baseWin + this.honba * 300;
        deltas[otherIdx] -= pay;
        deltas[winnerIdx] += pay + this.riichiSticks * 1000;
      } else {
        for (let i = 0; i < n; i++) {
          if (i === winnerIdx) continue;
          const pay = (i === this.dealerIndex) ? sc.dealerPay : sc.nonDealerPay;
          deltas[i] -= pay;
          deltas[winnerIdx] += pay;
        }
        deltas[winnerIdx] += this.riichiSticks * 1000;
      }
    } else {
      deltas[loserIdx] -= sc.ronPay;
      deltas[winnerIdx] += sc.ronPay + this.riichiSticks * 1000;
    }

    for (let i = 0; i < n; i++) this.players[i].score += deltas[i];
    const usedKyotaku = this.riichiSticks;
    this.riichiSticks = 0;

    this.phase = PHASE.ROUND_END;
    this.roundResult = {
      type: 'win', winnerIdx, loserIdx, winTile, winResult, deltas,
      usedKyotaku, honbaUsed: this.honba,
      uraDoraIndicators: (winner.isRiichi || winner.isDoubleRiichi) ? this.getUraDoraIndicators() : [],
      renchan: winnerIdx === this.dealerIndex,
    };
    this.emit('ROUND_END', this.roundResult);
  }

  finishExhaustiveDraw() {
    const n = this.players.length;
    const tenpaiFlags = this.players.map((p) => calcShanten(tilesToCounts(p.hand), p.melds.length).shanten === 0);
    const tenpaiCount = tenpaiFlags.filter(Boolean).length;
    const deltas = new Array(n).fill(0);
    if (tenpaiCount > 0 && tenpaiCount < n) {
      const pot = n === 2 ? 1500 : 3000;
      const gain = pot / tenpaiCount;
      const loss = pot / (n - tenpaiCount);
      for (let i = 0; i < n; i++) {
        deltas[i] = tenpaiFlags[i] ? gain : -loss;
        this.players[i].score += deltas[i];
      }
    }
    this.phase = PHASE.ROUND_END;
    this.roundResult = { type: 'draw', reason: '荒牌流局（山牌がなくなりました）', tenpaiFlags, deltas, renchan: tenpaiFlags[this.dealerIndex] };
    this.emit('ROUND_END', this.roundResult);
  }

  finishSpecialDraw(reason, renchan = true) {
    const n = this.players.length;
    this.phase = PHASE.ROUND_END;
    this.roundResult = { type: 'draw', reason, tenpaiFlags: new Array(n).fill(false), deltas: new Array(n).fill(0), renchan };
    this.emit('ROUND_END', this.roundResult);
  }

  proceedNextRound() {
    if (this.phase !== PHASE.ROUND_END || !this.roundResult) return;
    if (this.enableTobi && this.players.some((p) => p.score < 0)) {
      this.finishMatch('誰かの点数が0点未満（トビ）になったため終局しました');
      return;
    }

    const n = this.players.length;
    const renchan = this.roundResult.renchan;
    const maxWinds = (this.matchType === 'hanchan' || this.matchType === 'two_player') ? 2 : 1;
    const roundsPerWind = n;
    const isFinalRound = this.roundWind === WIND_CYCLE[maxWinds - 1] && this.roundNumber === (roundsPerWind - 1);

    if (renchan) {
      this.honba++;
      const dealer = this.players[this.dealerIndex];
      const isDealerTop = this.players.every((p, i) => i === this.dealerIndex || dealer.score > p.score);
      if (isFinalRound && this.roundResult.type === 'win' && isDealerTop && dealer.score >= 30000) {
        this.finishMatch('オーラス親のトップ確定（上がり止め）で終局しました');
        return;
      }
      this.startRound();
      return;
    }

    this.honba = this.roundResult.type === 'draw' ? this.honba + 1 : 0;
    if (isFinalRound) { this.finishMatch('規定の最終局が終了しました'); return; }

    this.roundNumber++;
    if (this.roundNumber >= roundsPerWind) {
      this.roundNumber = 0;
      this.roundWind = WIND_CYCLE[WIND_CYCLE.indexOf(this.roundWind) + 1];
    }
    this.dealerIndex = (this.dealerIndex + 1) % n;
    this.startRound();
  }

  finishMatch(reason) {
    this.phase = PHASE.MATCH_END;
    const rankings = this.players.map((p) => ({ index: p.index, name: p.name, score: p.score, isHuman: p.isHuman })).sort((a, b) => b.score - a.score);
    this.matchResult = { reason, rankings };
    this.emit('MATCH_END', this.matchResult);
  }

  getPlayerAssist(playerIndex = 0) {
    const p = this.players[playerIndex];
    const hand = p.hand;
    const isMyTurn = (this.phase === PHASE.PLAYER_TURN) && this.turnPlayer === playerIndex;
    const counts = tilesToCounts(hand);
    const shantenInfo = calcShanten(counts, p.melds.length);
    const visible = buildVisibleCounts(this, playerIndex);

    let discardOptions = [];
    let bestDiscardType = null;
    if (isMyTurn && hand.length % 3 === 2) {
      discardOptions = analyzeDiscardOptions(hand, p.melds.length, visible);
      if (discardOptions.length > 0 && discardOptions[0].isBest) bestDiscardType = discardOptions[0].type;
    }

    let currentWaits = [];
    let isFuriten = false;
    if ((!isMyTurn || hand.length % 3 === 1) && shantenInfo.shanten === 0) {
      const waitTypes = getWaits(counts, p.melds.length);
      isFuriten = p.tempFuriten || p.riichiFuriten || waitTypes.some((w) => p.hasDiscardedType(w));
      currentWaits = waitTypes.map((wt) => {
        const remaining = Math.max(0, 4 - visible[wt]);
        const fakeTile = { id: -1, type: wt, isRed: false };
        const ronEval = evaluateWin({
          closedTiles: [...hand, fakeTile], melds: p.melds, winTile: fakeTile, isTsumo: false,
          seatWind: p.seatWind, roundWind: this.roundWind,
          isRiichi: p.isRiichi && !p.isDoubleRiichi, isDoubleRiichi: p.isDoubleRiichi,
          doraIndicators: this.getDoraIndicators(), honba: this.honba, riichiSticks: this.riichiSticks,
        });
        const tsumoEval = evaluateWin({
          closedTiles: [...hand, fakeTile], melds: p.melds, winTile: fakeTile, isTsumo: true,
          seatWind: p.seatWind, roundWind: this.roundWind,
          isRiichi: p.isRiichi && !p.isDoubleRiichi, isDoubleRiichi: p.isDoubleRiichi,
          doraIndicators: this.getDoraIndicators(), honba: this.honba, riichiSticks: this.riichiSticks,
        });
        return {
          type: wt, label: getTileBadge(wt), remaining,
          ronPoints: ronEval ? ronEval.score.ronPay : 0, ronHan: ronEval ? ronEval.han : 0,
          tsumoPoints: tsumoEval ? tsumoEval.score.baseWin : 0, tsumoHan: tsumoEval ? tsumoEval.han : 0,
          noYakuOnRon: !ronEval,
        };
      });
    }

    let callAdvice = null;
    if (this.phase === PHASE.CALL_WINDOW && this.pendingCall?.offersByPlayer[playerIndex]) {
      const offer = this.pendingCall.offersByPlayer[playerIndex];
      const tile = this.pendingDiscard.tile;
      callAdvice = {};
      if (offer.pon) {
        const t = tile.type;
        const isYakuhai = isDragon(t) || t === p.seatWind || t === this.roundWind;
        const allTanyao = hand.every((ht) => !isYaochu(ht.type)) && !isYaochu(t);
        if (isYakuhai) callAdvice.pon = `おすすめ！${getTileBadge(t)}は役牌なのでポンで「1翻」が確定します。`;
        else if (allTanyao) callAdvice.pon = `タンヤオが狙える状態なのでポンしても役がつきます。`;
        else if (p.isMenzen()) callAdvice.pon = `注意：鳴くとリーチやピンフができなくなります。他に役が見込める時だけポンしましょう。`;
        else callAdvice.pon = `シャンテンを進めるならポンが有効です。`;
      }
      if (offer.chi.length > 0) {
        const allTanyao = hand.every((ht) => !isYaochu(ht.type)) && !isYaochu(tile.type);
        const hasYakuhaiMeld = p.melds.some((m) => {
          const mt = m.tiles[0].type;
          return isDragon(mt) || mt === p.seatWind || mt === this.roundWind;
        });
        callAdvice.chi = (hasYakuhaiMeld || allTanyao)
          ? `すでに役の条件を満たしやすいため、チーでテンパイに近づけます！`
          : `注意：まだ役が確定していない時にチーすると「役なし」でアガれなくなることがあります。`;
      }
    }

    return {
      shanten: shantenInfo.shanten, shantenInfo, isMyTurn, discardOptions, bestDiscardType,
      currentWaits, isFuriten,
      potentialYakus: analyzePotentialYaku(hand, p.melds, p.seatWind, this.roundWind),
      turnActions: isMyTurn ? this.getTurnActions(playerIndex) : null,
      callOffer: this.phase === PHASE.CALL_WINDOW ? (this.pendingCall?.offersByPlayer[playerIndex] || null) : null,
      callAdvice,
      calledTile: this.phase === PHASE.CALL_WINDOW ? this.pendingDiscard?.tile : null,
    };
  }

  getSnapshot() {
    return {
      phase: this.phase, matchType: this.matchType, roundWind: this.roundWind,
      roundNumber: this.roundNumber, dealerIndex: this.dealerIndex,
      honba: this.honba, riichiSticks: this.riichiSticks,
      wallRemaining: this.wallRemaining(), doraIndicators: this.getDoraIndicators(),
      turnPlayer: this.turnPlayer,
      players: this.players.map((p) => ({
        index: p.index, name: p.name, isHuman: p.isHuman, score: p.score, seatWind: p.seatWind,
        hand: p.hand.slice(), melds: p.melds.slice(), discards: p.discards.slice(),
        isRiichi: p.isRiichi, isDoubleRiichi: p.isDoubleRiichi,
        drawnTileId: p.drawnTile ? p.drawnTile.id : -1,
      })),
      roundResult: this.roundResult, matchResult: this.matchResult,
    };
  }
}
