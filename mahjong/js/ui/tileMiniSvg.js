/**
 * UIパネル・結果画面・ドラ表示用の見やすいミニ牌チップ生成
 */
import { getTileBadge, SUIT_MAN, SUIT_PIN, SUIT_SOU, getSuit, DRAGON_HATSU, DRAGON_CHUN } from '../engine/tiles.js';

export function createMiniTileElement(type, isRed = false) {
  const span = document.createElement('span');
  span.className = 'mini-tile';
  const suit = getSuit(type);
  if (isRed || type === DRAGON_CHUN) span.classList.add('red');
  else if (suit === SUIT_SOU || type === DRAGON_HATSU) span.classList.add('green');
  else if (suit === SUIT_PIN) span.classList.add('blue');
  span.textContent = getTileBadge(type, isRed);
  return span;
}
