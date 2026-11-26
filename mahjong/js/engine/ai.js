/**
 * CPU対戦相手 AI ロジック
 */
import { isYaochu, isDragon, getNumber, tilesToCounts, getDoraFromIndicator } from './tiles.js';
import { analyzeDiscardOptions, calcShanten } from './shanten.js';

export function buildVisibleCounts(gameState, viewerIdx) {
  const counts = new Int32Array(34);
  for (const ind of gameState.doraIndicators) counts[ind.type]++;
  for (let p = 0; p < gameState.players.length; p++) {
    const pl = gameState.players[p];
    for (const d of pl.discards) counts[d.tile.type]++;
    for (const m of pl.melds) for (const t of m.tiles) counts[t.type]++;
  }
  if (viewerIdx >= 0 && viewerIdx < gameState.players.length) {
    for (const t of gameState.players[viewerIdx].hand) counts[t.type]++;
  }
  return counts;
}

function calcTileSafety(type, gameState, selfIdx) {
  let safety = 0;
  const riichiPlayers = gameState.players.filter((p, idx) => idx !== selfIdx && p.isRiichi);
  if (riichiPlayers.length === 0) return 0;

  for (const rp of riichiPlayers) {
    if (rp.discards.some((d) => d.tile.type === type)) {
      safety += 100;
    } else if (type >= 27) {
      safety += buildVisibleCounts(gameState, selfIdx)[type] * 18;
    } else {
      const n = getNumber(type);
      const base = type - (n - 1);
      const sujiLeft = n >= 4 && rp.discards.some((d) => d.tile.type === base + (n - 4));
      const sujiRight = n <= 6 && rp.discards.some((d) => d.tile.type === base + (n + 2));
      if (sujiLeft || sujiRight) safety += 25;
      if (n === 1 || n === 9) safety += 10;
    }
  }
  return safety / riichiPlayers.length;
}

export function chooseAiDiscard(player, gameState) {
  const hand = player.hand;
  if (hand.length === 0) return null;
  if (player.isRiichi) return hand[hand.length - 1];

  const visible = buildVisibleCounts(gameState, player.index);
  const options = analyzeDiscardOptions(hand, player.melds.length, visible);
  const currentShanten = calcShanten(tilesToCounts(hand), player.melds.length).shanten;

  const doraTypes = new Set(gameState.doraIndicators.map((ind) => getDoraFromIndicator(ind.type)));
  const anyRiichi = gameState.players.some((p, i) => i !== player.index && p.isRiichi);

  if (anyRiichi && currentShanten >= 2) {
    let safest = hand[hand.length - 1];
    let bestSafe = -1;
    for (const tile of hand) {
      const s = calcTileSafety(tile.type, gameState, player.index);
      if (s > bestSafe) { bestSafe = s; safest = tile; }
    }
    if (bestSafe >= 45) return safest;
  }

  let bestOption = options[0];
  let bestScore = -1e9;

  for (const opt of options) {
    let score = -opt.nextShanten * 1000 + opt.ukeireTotal * 12;
    if (doraTypes.has(opt.type)) score -= 45;
    const matchingTiles = hand.filter((t) => t.type === opt.type);
    if (!matchingTiles.some((t) => !t.isRed) && matchingTiles[0]?.isRed) score -= 50;

    const isYakuhai = isDragon(opt.type) || opt.type === player.seatWind || opt.type === gameState.roundWind;
    if (isYakuhai && matchingTiles.length >= 2) score -= 35;
    if (isYaochu(opt.type)) score += 6;
    if (anyRiichi) score += calcTileSafety(opt.type, gameState, player.index) * 0.8;

    if (score > bestScore) { bestScore = score; bestOption = opt; }
  }

  const candidates = hand.filter((t) => t.type === bestOption.type);
  return candidates.find((t) => !t.isRed) || candidates[0];
}

export function shouldAiRiichi(player, discardTile, gameState) {
  if (player.isRiichi || !player.isMenzen() || player.score < 1000 || gameState.wallRemaining() < 4) return false;
  const afterCounts = tilesToCounts(player.hand.filter((t) => t.id !== discardTile.id));
  return calcShanten(afterCounts, player.melds.length).shanten === 0;
}

export function chooseAiAction(player, actions, discardedTile, gameState) {
  if (actions.ron) return { type: 'ron' };

  const currentCounts = tilesToCounts(player.hand);
  const currentShanten = calcShanten(currentCounts, player.melds.length).shanten;
  const anyRiichi = gameState.players.some((p, i) => i !== player.index && p.isRiichi);
  if (anyRiichi && currentShanten >= 2) return { type: 'pass' };

  if (actions.pon) {
    const t = discardedTile.type;
    if (isDragon(t) || t === player.seatWind || t === gameState.roundWind) {
      return { type: 'pon', option: actions.pon };
    }
    const hasYakuhaiMeld = player.melds.some((m) => {
      const mt = m.tiles[0].type;
      return isDragon(mt) || mt === player.seatWind || mt === gameState.roundWind;
    });
    const allTanyao = player.hand.every((ht) => !isYaochu(ht.type)) && !isYaochu(t);
    if ((hasYakuhaiMeld || allTanyao) && currentShanten <= 2) {
      const after = currentCounts.slice();
      after[t] -= 2;
      if (calcShanten(after, player.melds.length + 1).shanten < currentShanten) {
        return { type: 'pon', option: actions.pon };
      }
    }
  }

  if (actions.chi && actions.chi.length > 0 && currentShanten <= 1) {
    const hasYakuhaiMeld = player.melds.some((m) => {
      const mt = m.tiles[0].type;
      return isDragon(mt) || mt === player.seatWind || mt === gameState.roundWind;
    });
    if (hasYakuhaiMeld) {
      for (const opt of actions.chi) {
        const after = currentCounts.slice();
        for (const used of opt.handTiles) after[used.type]--;
        if (calcShanten(after, player.melds.length + 1).shanten < currentShanten) {
          return { type: 'chi', option: opt };
        }
      }
    }
  }

  return { type: 'pass' };
}
