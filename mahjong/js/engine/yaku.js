/**
 * 役判定・符計算・点数計算・初心者向け狙い役解析エンジン
 */
import {
  getSuit, getNumber, isHonor, isTerminal, isYaochu, isDragon, isWind,
  WIND_EAST, WIND_SOUTH, WIND_WEST, WIND_NORTH,
  DRAGON_HAKU, DRAGON_HATSU, DRAGON_CHUN,
  GREEN_TYPES, getTileBadge, tilesToCounts, getDoraFromIndicator,
} from './tiles.js';
import { calcChiitoitsuShanten, calcKokushiShanten, calcStandardShanten } from './shanten.js';

export const YAKU_INFO = {
  tenhou:     { name: '天和', han: 13, yakuman: true, desc: '親が配牌の時点で最初からアガっている奇跡の役' },
  chiihou:    { name: '地和', han: 13, yakuman: true, desc: '子が最初のツモでいきなりアガる奇跡の役' },
  kokushi:    { name: '国士無双', han: 13, yakuman: true, desc: '1・9・字牌を全13種＋どれか1枚揃える大役' },
  suuankou:   { name: '四暗刻', han: 13, yakuman: true, desc: '鳴かずに同じ牌3枚組を4つ揃える大役' },
  daisangen:  { name: '大三元', han: 13, yakuman: true, desc: '白・發・中のすべてを3枚ずつ揃える大役' },
  shousuushii:{ name: '小四喜', han: 13, yakuman: true, desc: '東南西北のうち3つを3枚組、1つを頭に揃える大役' },
  daisuushii: { name: '大四喜', han: 13, yakuman: true, desc: '東南西北のすべてを3枚ずつ揃える超絶大役' },
  tsuuiisou:  { name: '字一色', han: 13, yakuman: true, desc: '手牌をすべて字牌だけで揃える大役' },
  chinroutou: { name: '清老頭', han: 13, yakuman: true, desc: '手牌をすべて1と9の数牌だけで揃える大役' },
  ryuuiisou:  { name: '緑一色', han: 13, yakuman: true, desc: '2・3・4・6・8索と發の緑色の牌だけで揃える大役' },
  chuuren:    { name: '九蓮宝燈', han: 13, yakuman: true, desc: '同じ種類の1112345678999＋同種どれか1枚の芸術役' },

  riichi:     { name: '立直（リーチ）', han: 1, desc: '鳴かずにテンパイし1000点払ってアガリ宣言' },
  wriichi:    { name: 'ダブル立直', han: 2, desc: '最初の1巡目でいきなりリーチ宣言' },
  ippatsu:    { name: '一発', han: 1, desc: 'リーチ後1巡以内に誰も鳴かずアガると追加' },
  tsumo:      { name: '門前清自摸和（ツモ）', han: 1, desc: '鳴かずに自分で引いた牌でアガる' },
  pinfu:      { name: '平和（ピンフ）', han: 1, desc: '鳴かずに「連番4組＋役なし頭＋両面待ち」でアガる' },
  tanyao:     { name: '断么九（タンヤオ）', han: 1, desc: '1・9・字牌を使わず2〜8の牌だけで揃える基本役' },
  iipeikou:   { name: '一盃口（イーペーコー）', han: 1, desc: '鳴かずに同じ順子（例: 234・234）を2組揃える' },
  yakuhai_seat:{ name: '自風牌', han: 1, desc: '自分の座りの風牌（東/南/西/北）を3枚揃える' },
  yakuhai_round:{ name: '場風牌', han: 1, desc: '場と同じ風牌（東場なら東、南場なら南）を3枚揃える' },
  yakuhai_haku:{ name: '役牌・白', han: 1, desc: '「白」を3枚（または4枚）揃える' },
  yakuhai_hatsu:{ name: '役牌・發', han: 1, desc: '「發」を3枚（または4枚）揃える' },
  yakuhai_chun:{ name: '役牌・中', han: 1, desc: '「中」を3枚（または4枚）揃える' },
  rinshan:    { name: '嶺上開花', han: 1, desc: 'カンした直後の補充牌でそのままツモアガリ' },
  chankan:    { name: '槍槓', han: 1, desc: '他人が加槓した牌が自分のアガリ牌でロン' },
  haitei:     { name: '海底摸月', han: 1, desc: '山で最後の1枚のツモで劇的にアガる' },
  houtei:     { name: '河底撈魚', han: 1, desc: 'その局最後の捨て牌でロンアガリ' },

  sanshoku:   { name: '三色同順', han: 2, kuikui: 1, desc: '萬子・筒子・索子で同じ数字の連番を揃える' },
  ittsu:      { name: '一気通貫', han: 2, kuikui: 1, desc: '同じ種類で123・456・789の9枚を揃える' },
  chanta:     { name: '混全帯么九（チャンタ）', han: 2, kuikui: 1, desc: 'すべての組と頭に1・9・字牌が絡む' },
  chiitoitsu: { name: '七対子（チートイツ）', han: 2, desc: '鳴かずに同じ牌2枚組を7セット揃える' },
  toitoi:     { name: '対々和（トイトイ）', han: 2, desc: '連番を使わず、同じ牌3枚組を4つ揃える' },
  sanankou:   { name: '三暗刻', han: 2, desc: '鳴かずに自力で揃えた同じ牌3枚組が3つある' },
  sanshoku_doukou: { name: '三色同刻', han: 2, desc: '萬子・筒子・索子で同じ数字の3枚組を揃える' },
  sankantsu:  { name: '三槓子', han: 2, desc: '1局でカンを3回成立させる' },
  shousangen: { name: '小三元', han: 2, desc: '白・發・中のうち2つを3枚組、1つを頭にする' },
  honroutou:  { name: '混老頭', han: 2, desc: '1・9・字牌だけで揃える（トイトイか七対子と複合）' },

  ryanpeikou: { name: '二盃口（リャンペーコー）', han: 3, desc: '鳴かずに一盃口を2つ揃える豪華な役' },
  junchan:    { name: '純全帯么九（ジュンチャン）', han: 3, kuikui: 2, desc: '字牌を使わず、すべての組と頭に1か9が絡む' },
  honitsu:    { name: '混一色（ホンイツ）', han: 3, kuikui: 2, desc: '1種類の数牌＋字牌だけで揃える華やかな役' },
  chinitsu:   { name: '清一色（チンイツ）', han: 6, kuikui: 5, desc: '1種類の数牌だけで14枚すべて揃える大物手' },

  dora:       { name: 'ドラ', han: 1, desc: 'ドラ表示牌の次の牌を持っている枚数ぶん加点' },
  akadora:    { name: '赤ドラ', han: 1, desc: '赤い5の牌（1枚につき1翻プラス）' },
  uradora:    { name: '裏ドラ', han: 1, desc: 'リーチしてアガった時だけ増えるボーナスドラ' },
};

function decomposeStandardWin(handCounts, melds, winType, isTsumo) {
  const results = [];
  const c = new Int32Array(handCounts);
  const needGroups = 4 - melds.length;

  const openGroups = melds.map((m) => ({
    kind: m.type === 'chi' ? 'seq' : (m.type === 'pon' ? 'tri' : 'kan'),
    tiles: m.tiles.map((t) => t.type).sort((a, b) => a - b),
    baseType: m.tiles[0].type,
    closed: m.type === 'ankan',
  }));

  function extractGroups(idx, currentGroups, pairType) {
    if (currentGroups.length === needGroups) {
      results.push({ pair: pairType, groups: [...currentGroups, ...openGroups] });
      return;
    }
    while (idx < 34 && c[idx] === 0) idx++;
    if (idx >= 34) return;

    if (c[idx] >= 3) {
      c[idx] -= 3;
      currentGroups.push({ kind: 'tri', tiles: [idx, idx, idx], baseType: idx, closed: true });
      extractGroups(idx, currentGroups, pairType);
      currentGroups.pop();
      c[idx] += 3;
    }

    if (idx < 27 && (idx % 9) <= 6 && c[idx + 1] > 0 && c[idx + 2] > 0) {
      c[idx]--; c[idx + 1]--; c[idx + 2]--;
      currentGroups.push({ kind: 'seq', tiles: [idx, idx + 1, idx + 2], baseType: idx, closed: true });
      extractGroups(idx, currentGroups, pairType);
      currentGroups.pop();
      c[idx]++; c[idx + 1]++; c[idx + 2]++;
    }
  }

  for (let p = 0; p < 34; p++) {
    if (c[p] >= 2) {
      c[p] -= 2;
      extractGroups(0, [], p);
      c[p] += 2;
    }
  }

  const detailed = [];
  for (const dec of results) {
    if (isTsumo) {
      let added = false;
      if (dec.pair === winType) {
        detailed.push({ ...dec, waitPart: 'pair', winGroupIndex: -1 });
        added = true;
      }
      for (let i = 0; i < needGroups; i++) {
        if (dec.groups[i].tiles.includes(winType)) {
          detailed.push({ ...dec, waitPart: dec.groups[i].kind, winGroupIndex: i });
          added = true;
        }
      }
      if (!added) detailed.push({ ...dec, waitPart: 'unknown', winGroupIndex: -1 });
    } else {
      if (dec.pair === winType) {
        detailed.push({ ...dec, waitPart: 'pair', winGroupIndex: -1 });
      }
      for (let i = 0; i < needGroups; i++) {
        if (dec.groups[i].tiles.includes(winType)) {
          const clonedGroups = dec.groups.map((grp, idx) =>
            idx === i && grp.kind === 'tri' ? { ...grp, closed: false } : grp
          );
          detailed.push({ pair: dec.pair, groups: clonedGroups, waitPart: dec.groups[i].kind, winGroupIndex: i });
        }
      }
    }
  }
  return detailed;
}

function getWaitFuAndPinfuCheck(dec, winType, seatWind, roundWind, isMenzen) {
  let waitFu = 0;
  let isRyanmen = false;

  if (dec.waitPart === 'pair') {
    waitFu = 2;
  } else if (dec.winGroupIndex >= 0) {
    const g = dec.groups[dec.winGroupIndex];
    if (g.kind === 'seq') {
      const a = g.tiles[0], b = g.tiles[1], c = g.tiles[2];
      const nA = getNumber(a), nC = getNumber(c);
      if (winType === b || (nA === 1 && winType === c) || (nC === 9 && winType === a)) waitFu = 2;
      else isRyanmen = true;
    }
  }

  const allClosedSeq = isMenzen && dec.groups.every((g) => g.kind === 'seq');
  const pairNoYaku = !isDragon(dec.pair) && dec.pair !== seatWind && dec.pair !== roundWind;
  return { waitFu, isPinfu: allClosedSeq && pairNoYaku && isRyanmen };
}

function calcFu(dec, winType, isTsumo, isMenzen, seatWind, roundWind, isChiitoitsu) {
  if (isChiitoitsu) return 25;
  const { waitFu, isPinfu } = getWaitFuAndPinfuCheck(dec, winType, seatWind, roundWind, isMenzen);
  if (isPinfu && isTsumo) return 20;
  if (isPinfu && !isTsumo) return 30;

  let fu = 20;
  if (!isTsumo && isMenzen) fu += 10;
  if (isTsumo) fu += 2;
  fu += waitFu;

  if (isDragon(dec.pair)) fu += 2;
  else {
    if (dec.pair === seatWind) fu += 2;
    if (dec.pair === roundWind) fu += 2;
  }

  for (const g of dec.groups) {
    if (g.kind === 'seq') continue;
    const yao = isYaochu(g.tiles[0]);
    if (g.kind === 'tri') fu += g.closed ? (yao ? 8 : 4) : (yao ? 4 : 2);
    else if (g.kind === 'kan') fu += g.closed ? (yao ? 32 : 16) : (yao ? 16 : 8);
  }
  if (!isMenzen && fu === 20) fu = 30;
  return Math.ceil(fu / 10) * 10;
}

export function calculateScorePoints(han, fu, isDealer, isTsumo, honba = 0, riichiSticks = 0) {
  let basePoints;
  let limitName = '';

  if (han >= 13) {
    basePoints = 8000 * Math.floor(han / 13);
    limitName = han >= 26 ? `${Math.floor(han / 13)}倍役満` : '役満';
  } else if (han >= 11) { basePoints = 6000; limitName = '三倍満'; }
  else if (han >= 8) { basePoints = 4000; limitName = '倍満'; }
  else if (han >= 6) { basePoints = 3000; limitName = '跳満'; }
  else if (han >= 5 || (han === 4 && fu >= 40) || (han === 3 && fu >= 70)) {
    basePoints = 2000; limitName = '満貫';
  } else {
    basePoints = fu * Math.pow(2, 2 + han);
    if (basePoints > 2000) { basePoints = 2000; limitName = '満貫'; }
  }

  const ceil100 = (n) => Math.ceil(n / 100) * 100;
  const honbaBonus = honba * 300;
  const kyotakuBonus = riichiSticks * 1000;

  if (isTsumo) {
    if (isDealer) {
      const eachPay = ceil100(basePoints * 2) + honba * 100;
      return { total: eachPay * 3 + kyotakuBonus, baseWin: ceil100(basePoints * 2) * 3, dealerPay: 0, nonDealerPay: eachPay, ronPay: 0, limitName };
    }
    const dealerPay = ceil100(basePoints * 2) + honba * 100;
    const nonDealerPay = ceil100(basePoints) + honba * 100;
    return {
      total: dealerPay + nonDealerPay * 2 + kyotakuBonus,
      baseWin: ceil100(basePoints * 2) + ceil100(basePoints) * 2,
      dealerPay, nonDealerPay, ronPay: 0, limitName,
    };
  }
  const rawRon = ceil100(basePoints * (isDealer ? 6 : 4));
  const ronPay = rawRon + honbaBonus;
  return { total: ronPay + kyotakuBonus, baseWin: rawRon, dealerPay: 0, nonDealerPay: 0, ronPay, limitName };
}

export function evaluateWin(params) {
  const {
    closedTiles, melds = [], winTile, isTsumo = false,
    seatWind = WIND_EAST, roundWind = WIND_EAST,
    isRiichi = false, isDoubleRiichi = false, isIppatsu = false,
    isRinshan = false, isChankan = false, isHaitei = false, isHoutei = false,
    isFirstTurnNoCall = false, doraIndicators = [], uraDoraIndicators = [],
    honba = 0, riichiSticks = 0,
  } = params;

  const allTiles = [...closedTiles];
  for (const m of melds) allTiles.push(...m.tiles);
  const allCounts = tilesToCounts(allTiles);
  const closedCounts = tilesToCounts(closedTiles);
  const isMenzen = melds.every((m) => m.type === 'ankan');
  const isDealer = seatWind === WIND_EAST;

  let doraCount = 0;
  for (const ind of doraIndicators) doraCount += allCounts[getDoraFromIndicator(ind.type)];
  let redCount = 0;
  for (const t of allTiles) if (t.isRed) redCount++;
  let uraCount = 0;
  if (isRiichi || isDoubleRiichi) {
    for (const ind of uraDoraIndicators) uraCount += allCounts[getDoraFromIndicator(ind.type)];
  }

  const candidates = [];

  if (melds.length === 0 && calcKokushiShanten(closedCounts) === -1) {
    const yakus = [];
    if (isFirstTurnNoCall && isTsumo) yakus.push(isDealer ? 'tenhou' : 'chiihou');
    yakus.push('kokushi');
    candidates.push(buildResult(yakus, 13 * yakus.length, 0, true));
  }

  if (melds.length === 0 && calcChiitoitsuShanten(closedCounts) === -1) {
    const yakus = [];
    if (isFirstTurnNoCall && isTsumo) yakus.push(isDealer ? 'tenhou' : 'chiihou');
    if (checkAllHonors(allCounts)) yakus.push('tsuuiisou');

    if (yakus.length === 0) {
      if (isDoubleRiichi) yakus.push('wriichi');
      else if (isRiichi) yakus.push('riichi');
      if (isIppatsu) yakus.push('ippatsu');
      if (isTsumo) yakus.push('tsumo');
      if (isHaitei) yakus.push('haitei');
      if (isHoutei) yakus.push('houtei');
      yakus.push('chiitoitsu');
      if (checkTanyao(allCounts)) yakus.push('tanyao');
      if (checkHonroutou(allCounts)) yakus.push('honroutou');
      const flush = checkFlush(allCounts);
      if (flush === 'chinitsu') yakus.push('chinitsu');
      else if (flush === 'honitsu') yakus.push('honitsu');
      candidates.push(buildResult(yakus, sumHan(yakus, isMenzen), 25, false));
    } else {
      candidates.push(buildResult(yakus, 13 * yakus.length, 0, true));
    }
  }

  if (calcStandardShanten(closedCounts, melds.length) === -1) {
    const decomps = decomposeStandardWin(closedCounts, melds, winTile.type, isTsumo);
    for (const dec of decomps) {
      const yakumanList = [];
      if (isFirstTurnNoCall && isTsumo) yakumanList.push(isDealer ? 'tenhou' : 'chiihou');
      const closedTris = dec.groups.filter((g) => (g.kind === 'tri' || g.kind === 'kan') && g.closed).length;
      if (closedTris === 4 && isMenzen) yakumanList.push('suuankou');

      const dragonTris = [DRAGON_HAKU, DRAGON_HATSU, DRAGON_CHUN].filter((d) =>
        dec.groups.some((g) => (g.kind === 'tri' || g.kind === 'kan') && g.tiles[0] === d)
      ).length;
      if (dragonTris === 3) yakumanList.push('daisangen');

      const windTris = [WIND_EAST, WIND_SOUTH, WIND_WEST, WIND_NORTH].filter((w) =>
        dec.groups.some((g) => (g.kind === 'tri' || g.kind === 'kan') && g.tiles[0] === w)
      ).length;
      if (windTris === 4) yakumanList.push('daisuushii');
      else if (windTris === 3 && isWind(dec.pair)) yakumanList.push('shousuushii');

      if (checkAllHonors(allCounts)) yakumanList.push('tsuuiisou');
      if (checkAllTerminals(allCounts)) yakumanList.push('chinroutou');
      if (checkRyuuiisou(allCounts)) yakumanList.push('ryuuiisou');
      if (isMenzen && checkChuuren(allCounts)) yakumanList.push('chuuren');

      if (yakumanList.length > 0) {
        candidates.push(buildResult(yakumanList, 13 * yakumanList.length, 0, true));
        continue;
      }

      const yakus = [];
      if (isDoubleRiichi) yakus.push('wriichi');
      else if (isRiichi) yakus.push('riichi');
      if (isIppatsu) yakus.push('ippatsu');
      if (isMenzen && isTsumo) yakus.push('tsumo');
      if (isRinshan) yakus.push('rinshan');
      if (isChankan) yakus.push('chankan');
      if (isHaitei) yakus.push('haitei');
      if (isHoutei) yakus.push('houtei');

      const { isPinfu } = getWaitFuAndPinfuCheck(dec, winTile.type, seatWind, roundWind, isMenzen);
      if (isPinfu) yakus.push('pinfu');
      if (checkTanyao(allCounts)) yakus.push('tanyao');

      if (isMenzen) {
        const seqMap = new Map();
        for (const g of dec.groups) if (g.kind === 'seq') seqMap.set(g.baseType, (seqMap.get(g.baseType) || 0) + 1);
        let pairSeqCount = 0;
        for (const cnt of seqMap.values()) pairSeqCount += Math.floor(cnt / 2);
        if (pairSeqCount === 2) yakus.push('ryanpeikou');
        else if (pairSeqCount === 1) yakus.push('iipeikou');
      }

      for (const g of dec.groups) {
        if (g.kind === 'tri' || g.kind === 'kan') {
          const t = g.tiles[0];
          if (t === seatWind) yakus.push('yakuhai_seat');
          if (t === roundWind) yakus.push('yakuhai_round');
          if (t === DRAGON_HAKU) yakus.push('yakuhai_haku');
          if (t === DRAGON_HATSU) yakus.push('yakuhai_hatsu');
          if (t === DRAGON_CHUN) yakus.push('yakuhai_chun');
        }
      }

      if (dec.groups.every((g) => g.kind === 'tri' || g.kind === 'kan')) yakus.push('toitoi');
      if (closedTris === 3) yakus.push('sanankou');
      if (melds.filter((m) => m.type === 'minkan' || m.type === 'ankan' || m.type === 'kakan').length === 3) yakus.push('sankantsu');

      const seqByNum = Array.from({ length: 7 }, () => new Set());
      for (const g of dec.groups) if (g.kind === 'seq') seqByNum[g.baseType % 9].add(getSuit(g.baseType));
      if (seqByNum.some((s) => s.size === 3)) yakus.push('sanshoku');

      const triByNum = Array.from({ length: 9 }, () => new Set());
      for (const g of dec.groups) if ((g.kind === 'tri' || g.kind === 'kan') && g.tiles[0] < 27) triByNum[g.tiles[0] % 9].add(getSuit(g.tiles[0]));
      if (triByNum.some((s) => s.size === 3)) yakus.push('sanshoku_doukou');

      for (const suit of [0, 1, 2]) {
        const base = suit * 9;
        if (dec.groups.some((g) => g.kind === 'seq' && g.baseType === base) &&
            dec.groups.some((g) => g.kind === 'seq' && g.baseType === base + 3) &&
            dec.groups.some((g) => g.kind === 'seq' && g.baseType === base + 6)) {
          yakus.push('ittsu');
          break;
        }
      }

      if (dragonTris === 2 && isDragon(dec.pair)) yakus.push('shousangen');

      if (checkHonroutou(allCounts)) yakus.push('honroutou');
      else {
        const allY = dec.groups.every((g) => g.tiles.some(isYaochu)) && isYaochu(dec.pair);
        const allT = dec.groups.every((g) => g.tiles.some(isTerminal)) && isTerminal(dec.pair);
        if (allT) yakus.push('junchan');
        else if (allY) yakus.push('chanta');
      }

      const flush = checkFlush(allCounts);
      if (flush === 'chinitsu') yakus.push('chinitsu');
      else if (flush === 'honitsu') yakus.push('honitsu');

      if (yakus.length === 0) continue;
      const fu = calcFu(dec, winTile.type, isTsumo, isMenzen, seatWind, roundWind, false);
      candidates.push(buildResult(yakus, sumHan(yakus, isMenzen), fu, false));
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.score.total !== b.score.total ? b.score.total - a.score.total : b.han - a.han));
  return candidates[0];

  function buildResult(yakuKeys, baseHan, fu, isYakuman) {
    const items = yakuKeys.map((k) => {
      const info = YAKU_INFO[k];
      const h = isYakuman ? 13 : (!isMenzen && info.kuikui ? info.kuikui : info.han);
      return { key: k, name: info.name, han: h, desc: info.desc, yakuman: !!info.yakuman };
    });

    let totalHan = baseHan;
    if (!isYakuman) {
      if (doraCount > 0) { items.push({ key: 'dora', name: 'ドラ', han: doraCount, desc: YAKU_INFO.dora.desc }); totalHan += doraCount; }
      if (redCount > 0) { items.push({ key: 'akadora', name: '赤ドラ', han: redCount, desc: YAKU_INFO.akadora.desc }); totalHan += redCount; }
      if (uraCount > 0) { items.push({ key: 'uradora', name: '裏ドラ', han: uraCount, desc: YAKU_INFO.uradora.desc }); totalHan += uraCount; }
    }
    return { isYakuman, han: totalHan, fu, yakus: items, score: calculateScorePoints(totalHan, fu, isDealer, isTsumo, honba, riichiSticks), isTsumo, isDealer };
  }
}

function sumHan(yakuKeys, isMenzen) {
  let total = 0;
  for (const k of yakuKeys) {
    const info = YAKU_INFO[k];
    total += (!isMenzen && info.kuikui) ? info.kuikui : info.han;
  }
  return total;
}

function checkTanyao(counts) {
  for (let i = 0; i < 34; i++) if (counts[i] > 0 && isYaochu(i)) return false;
  return true;
}
function checkHonroutou(counts) {
  let t = false, h = false;
  for (let i = 0; i < 34; i++) if (counts[i] > 0) { if (!isYaochu(i)) return false; if (isHonor(i)) h = true; else t = true; }
  return t && h;
}
function checkAllHonors(counts) {
  for (let i = 0; i < 27; i++) if (counts[i] > 0) return false;
  return true;
}
function checkAllTerminals(counts) {
  for (let i = 0; i < 34; i++) if (counts[i] > 0 && !isTerminal(i)) return false;
  return true;
}
function checkRyuuiisou(counts) {
  for (let i = 0; i < 34; i++) if (counts[i] > 0 && !GREEN_TYPES.has(i)) return false;
  return true;
}
function checkFlush(counts) {
  let suits = 0, hasHonor = false;
  for (let s = 0; s < 3; s++) {
    for (let n = 0; n < 9; n++) if (counts[s * 9 + n] > 0) { suits++; break; }
  }
  for (let i = 27; i < 34; i++) if (counts[i] > 0) { hasHonor = true; break; }
  if (suits === 1 && !hasHonor) return 'chinitsu';
  if (suits === 1 && hasHonor) return 'honitsu';
  return null;
}
function checkChuuren(counts) {
  for (let s = 0; s < 3; s++) {
    const base = s * 9;
    let total = 0;
    for (let i = 0; i < 9; i++) total += counts[base + i];
    if (total === 14 && counts[base] >= 3 && counts[base + 8] >= 3) {
      let ok = true;
      for (let i = 1; i <= 7; i++) if (counts[base + i] < 1) { ok = false; break; }
      if (ok) return true;
    }
  }
  return false;
}

export function analyzePotentialYaku(closedTiles, melds, seatWind, roundWind) {
  const allTiles = [...closedTiles];
  for (const m of melds) allTiles.push(...m.tiles);
  const counts = tilesToCounts(allTiles);
  const isMenzen = melds.every((m) => m.type === 'ankan');
  const suggestions = [];

  const yakuhaiTargets = [
    { t: DRAGON_HAKU, name: '役牌・白' },
    { t: DRAGON_HATSU, name: '役牌・發' },
    { t: DRAGON_CHUN, name: '役牌・中' },
    { t: seatWind, name: '自風牌' },
  ];
  if (roundWind !== seatWind) yakuhaiTargets.push({ t: roundWind, name: '場風牌' });

  for (const yt of yakuhaiTargets) {
    const c = counts[yt.t];
    if (c >= 3) {
      suggestions.push({ name: yt.name, hanText: '1翻', status: '確定済み', progress: 100, callOk: true, tip: `${getTileBadge(yt.t)}が3枚揃っています！他のパーツを揃えればアガれます。` });
    } else if (c === 2) {
      suggestions.push({ name: yt.name, hanText: '1翻', status: 'あと1枚（ポン可）', progress: 75, callOk: true, tip: `${getTileBadge(yt.t)}をあと1枚引くか「ポン」すれば役が確定！` });
    }
  }

  let yaochuCount = 0;
  for (let i = 0; i < 34; i++) if (isYaochu(i)) yaochuCount += counts[i];
  if (yaochuCount === 0) {
    suggestions.push({ name: '断么九（タンヤオ）', hanText: '1翻', status: '条件クリア中', progress: 95, callOk: true, tip: '1・9・字牌がゼロ！鳴いてもアガれる一番使いやすい役です。' });
  } else if (yaochuCount <= 2) {
    suggestions.push({ name: '断么九（タンヤオ）', hanText: '1翻', status: `1・9・字牌あと${yaochuCount}枚捨てる`, progress: 70 - yaochuCount * 10, callOk: true, tip: '1・9・字牌を先に捨てて2〜8だけにすると成立します。' });
  }

  if (isMenzen) {
    suggestions.push({ name: '立直（リーチ）', hanText: '1翻〜', status: '鳴かなければ狙える', progress: 65, callOk: false, tip: '1枚も鳴かずにテンパイすればリーチ宣言！一発や裏ドラも狙えます。' });
    let honorCount = 0;
    for (let i = 27; i < 34; i++) honorCount += counts[i];
    if (honorCount <= 2) {
      suggestions.push({ name: '平和（ピンフ）', hanText: '1翻', status: '門前連番向け', progress: 60 - honorCount * 10, callOk: false, tip: '鳴かずに階段（123など）を4つ作ると狙えます。リーチと好相性！' });
    }
    let pairs = 0;
    for (let i = 0; i < 34; i++) if (counts[i] >= 2) pairs++;
    if (pairs >= 4) {
      suggestions.push({ name: '七対子（チートイツ）', hanText: '2翻', status: `2枚組が${pairs}/7組`, progress: Math.min(95, pairs * 14), callOk: false, tip: '同じ牌の2枚ペアを7組集める特殊役。鳴くと成立しないので注意！' });
    }
  }

  let pairOrTri = 0;
  for (let i = 0; i < 34; i++) if (counts[i] >= 2) pairOrTri++;
  if (pairOrTri >= 4) {
    suggestions.push({ name: '対々和（トイトイ）', hanText: '2翻', status: `ペア/3枚組 ${pairOrTri}組`, progress: Math.min(85, pairOrTri * 15), callOk: true, tip: '2枚ペアをポンして3枚組を4つ揃える豪快な役です！' });
  }

  const suitNames = ['萬子', '筒子', '索子'];
  let honorTotal = 0;
  for (let i = 27; i < 34; i++) honorTotal += counts[i];
  for (let s = 0; s < 3; s++) {
    let sCount = 0;
    for (let n = 0; n < 9; n++) sCount += counts[s * 9 + n];
    if (sCount >= 9 && honorTotal === 0) {
      suggestions.push({ name: `清一色（${suitNames[s]}）`, hanText: isMenzen ? '6翻' : '5翻', status: `${suitNames[s]} ${sCount}枚`, progress: Math.min(95, Math.round((sCount / 14) * 100)), callOk: true, tip: `${suitNames[s]}だけで揃えれば跳満〜倍満級の超大型手！` });
    } else if (sCount + honorTotal >= 10) {
      suggestions.push({ name: `混一色（${suitNames[s]}＋字牌）`, hanText: isMenzen ? '3翻' : '2翻', status: `${suitNames[s]}+字牌 ${sCount + honorTotal}枚`, progress: Math.min(92, Math.round(((sCount + honorTotal) / 14) * 100)), callOk: true, tip: `${suitNames[s]}と字牌だけを残して他を捨てると高得点！` });
    }
  }

  suggestions.sort((a, b) => b.progress - a.progress);
  return suggestions.slice(0, 4);
}
