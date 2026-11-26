/**
 * 麻雀牌の定義・変換・デッキ生成ユーティリティ
 */
export const SUIT_MAN = 0;
export const SUIT_PIN = 1;
export const SUIT_SOU = 2;
export const SUIT_HONOR = 3;

export const WIND_EAST = 27;
export const WIND_SOUTH = 28;
export const WIND_WEST = 29;
export const WIND_NORTH = 30;
export const DRAGON_HAKU = 31;
export const DRAGON_HATSU = 32;
export const DRAGON_CHUN = 33;

export const TERMINAL_TYPES = new Set([0, 8, 9, 17, 18, 26]);
export const HONOR_TYPES = new Set([27, 28, 29, 30, 31, 32, 33]);
export const YAOCHU_TYPES = new Set([0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);
export const GREEN_TYPES = new Set([19, 20, 21, 23, 25, 32]);

const KANJI_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONOR_NAMES = ['東', '南', '西', '北', '白', '發', '中'];
const HONOR_READINGS = ['トン', 'ナン', 'シャー', 'ペー', 'ハク', 'ハツ', 'チュン'];

export function getSuit(type) {
  if (type < 9) return SUIT_MAN;
  if (type < 18) return SUIT_PIN;
  if (type < 27) return SUIT_SOU;
  return SUIT_HONOR;
}

export function getNumber(type) {
  if (type >= 27) return 0;
  return (type % 9) + 1;
}

export function isNumberTile(type) { return type >= 0 && type < 27; }
export function isHonor(type) { return type >= 27 && type <= 33; }
export function isTerminal(type) { return TERMINAL_TYPES.has(type); }
export function isYaochu(type) { return YAOCHU_TYPES.has(type); }
export function isTanyaoTile(type) { return !YAOCHU_TYPES.has(type); }
export function isDragon(type) { return type >= 31 && type <= 33; }
export function isWind(type) { return type >= 27 && type <= 30; }

export function getTileShortName(type, isRed = false) {
  const prefix = isRed ? 'r' : '';
  if (type < 9) return `${prefix}${type + 1}m`;
  if (type < 18) return `${prefix}${type - 8}p`;
  if (type < 27) return `${prefix}${type - 17}s`;
  return HONOR_NAMES[type - 27];
}

export function getTileLabel(type, isRed = false) {
  const redStr = isRed ? '赤' : '';
  if (type < 9) return `${redStr}${KANJI_NUMS[type]}萬`;
  if (type < 18) return `${redStr}${type - 8}筒`;
  if (type < 27) return `${redStr}${type - 17}索`;
  return `${HONOR_NAMES[type - 27]}（${HONOR_READINGS[type - 27]}）`;
}

export function getTileBadge(type, isRed = false) {
  if (type < 9) return `${isRed ? '赤' : ''}${type + 1}萬`;
  if (type < 18) return `${isRed ? '赤' : ''}${type - 8}筒`;
  if (type < 27) return `${isRed ? '赤' : ''}${type - 17}索`;
  return HONOR_NAMES[type - 27];
}

export function getDoraFromIndicator(indicatorType) {
  if (indicatorType < 9) return (indicatorType + 1) % 9;
  if (indicatorType < 18) return 9 + ((indicatorType - 9 + 1) % 9);
  if (indicatorType < 27) return 18 + ((indicatorType - 18 + 1) % 9);
  if (indicatorType <= 30) return 27 + ((indicatorType - 27 + 1) % 4);
  return 31 + ((indicatorType - 31 + 1) % 3);
}

export function createDeck(useRedFives = true) {
  const deck = [];
  let id = 0;
  for (let type = 0; type < 34; type++) {
    for (let copy = 0; copy < 4; copy++) {
      const isRed = useRedFives && copy === 0 && (type === 4 || type === 13 || type === 22);
      deck.push({ id: id++, type, isRed });
    }
  }
  return deck;
}

export function shuffleDeck(deck, rng = Math.random) {
  const arr = deck.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function sortTiles(tiles) {
  return tiles.slice().sort((a, b) => {
    if (a.type !== b.type) return a.type - b.type;
    if (a.isRed !== b.isRed) return a.isRed ? -1 : 1;
    return a.id - b.id;
  });
}

export function tilesToCounts(tiles) {
  const counts = new Int32Array(34);
  for (let i = 0; i < tiles.length; i++) counts[tiles[i].type]++;
  return counts;
}
