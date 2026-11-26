/**
 * 高速・正確なシャンテン数計算および手牌受け入れ解析モジュール
 */
import { tilesToCounts } from './tiles.js';

const YAOCHU_LIST = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

export function calcStandardShanten(counts, meldCount = 0) {
  const c = new Int32Array(counts);
  const maxGroups = 4 - meldCount;
  let best = 8;

  function scanTiles(idx, mentsu, tatsu, hasPair) {
    const usableTatsu = Math.min(tatsu, maxGroups - mentsu);
    const current = 8 - 2 * (meldCount + mentsu) - usableTatsu - (hasPair ? 1 : 0);
    if (current < best) best = current;
    if (best <= -1) return;

    while (idx < 34 && c[idx] === 0) idx++;
    if (idx >= 34) return;

    const isSuit = idx < 27;
    const num = isSuit ? (idx % 9) : -1;

    if (c[idx] >= 3 && mentsu < maxGroups) {
      c[idx] -= 3;
      scanTiles(idx, mentsu + 1, tatsu, hasPair);
      c[idx] += 3;
    }

    if (isSuit && num <= 6 && c[idx + 1] > 0 && c[idx + 2] > 0 && mentsu < maxGroups) {
      c[idx]--; c[idx + 1]--; c[idx + 2]--;
      scanTiles(idx, mentsu + 1, tatsu, hasPair);
      c[idx]++; c[idx + 1]++; c[idx + 2]++;
    }

    if (!hasPair && c[idx] >= 2) {
      c[idx] -= 2;
      scanTiles(idx, mentsu, tatsu, true);
      c[idx] += 2;
    }

    if (c[idx] >= 2 && mentsu + tatsu < maxGroups) {
      c[idx] -= 2;
      scanTiles(idx, mentsu, tatsu + 1, hasPair);
      c[idx] += 2;
    }

    if (isSuit && num <= 7 && c[idx + 1] > 0 && mentsu + tatsu < maxGroups) {
      c[idx]--; c[idx + 1]--;
      scanTiles(idx, mentsu, tatsu + 1, hasPair);
      c[idx]++; c[idx + 1]++;
    }

    if (isSuit && num <= 6 && c[idx + 2] > 0 && mentsu + tatsu < maxGroups) {
      c[idx]--; c[idx + 2]--;
      scanTiles(idx, mentsu, tatsu + 1, hasPair);
      c[idx]++; c[idx + 2]++;
    }

    const saved = c[idx];
    c[idx] = 0;
    scanTiles(idx + 1, mentsu, tatsu, hasPair);
    c[idx] = saved;
  }

  scanTiles(0, 0, 0, false);
  return best;
}

export function calcChiitoitsuShanten(counts) {
  let pairs = 0;
  let kinds = 0;
  for (let i = 0; i < 34; i++) {
    if (counts[i] >= 1) kinds++;
    if (counts[i] >= 2) pairs++;
  }
  let shanten = 6 - pairs;
  if (kinds < 7) shanten += (7 - kinds);
  return shanten;
}

export function calcKokushiShanten(counts) {
  let unique = 0;
  let hasPair = false;
  for (const t of YAOCHU_LIST) {
    if (counts[t] >= 1) {
      unique++;
      if (counts[t] >= 2) hasPair = true;
    }
  }
  return 13 - unique - (hasPair ? 1 : 0);
}

export function calcShanten(counts, meldCount = 0) {
  const std = calcStandardShanten(counts, meldCount);
  if (meldCount > 0) {
    return { shanten: std, standard: std, chiitoitsu: 99, kokushi: 99 };
  }
  const chii = calcChiitoitsuShanten(counts);
  const koku = calcKokushiShanten(counts);
  return { shanten: Math.min(std, chii, koku), standard: std, chiitoitsu: chii, kokushi: koku };
}

export function getEffectiveTiles(counts, meldCount = 0) {
  const base = calcShanten(counts, meldCount).shanten;
  const effective = [];
  for (let t = 0; t < 34; t++) {
    if (counts[t] >= 4) continue;
    counts[t]++;
    const next = calcShanten(counts, meldCount).shanten;
    counts[t]--;
    if (next < base) effective.push(t);
  }
  return { baseShanten: base, effective };
}

export function getWaits(counts, meldCount = 0) {
  const waits = [];
  for (let t = 0; t < 34; t++) {
    if (counts[t] >= 4) continue;
    counts[t]++;
    const res = calcShanten(counts, meldCount);
    counts[t]--;
    if (res.shanten === -1) waits.push(t);
  }
  return waits;
}

export function analyzeDiscardOptions(handTiles, meldCount = 0, visibleCounts = null) {
  const counts = tilesToCounts(handTiles);
  const seenTypes = new Set();
  const results = [];

  for (let i = 0; i < handTiles.length; i++) {
    const tile = handTiles[i];
    if (seenTypes.has(tile.type)) continue;
    seenTypes.add(tile.type);

    counts[tile.type]--;
    const { baseShanten, effective } = getEffectiveTiles(counts, meldCount);
    let totalRemaining = 0;
    const waitsDetail = [];
    for (const effType of effective) {
      const used = visibleCounts ? Math.max(visibleCounts[effType], counts[effType]) : counts[effType];
      const rem = Math.max(0, 4 - used);
      totalRemaining += rem;
      waitsDetail.push({ type: effType, remaining: rem });
    }
    counts[tile.type]++;

    results.push({
      type: tile.type,
      sampleTileId: tile.id,
      nextShanten: baseShanten,
      effectiveTypes: effective,
      waitsDetail,
      ukeireTotal: totalRemaining,
    });
  }

  results.sort((a, b) => {
    if (a.nextShanten !== b.nextShanten) return a.nextShanten - b.nextShanten;
    return b.ukeireTotal - a.ukeireTotal;
  });

  const bestShanten = results.length ? results[0].nextShanten : 8;
  const bestUkeire = results.length ? results[0].ukeireTotal : 0;

  for (const r of results) {
    r.isBest = r.nextShanten === bestShanten && r.ukeireTotal === bestUkeire && bestUkeire > 0;
  }

  return results;
}
