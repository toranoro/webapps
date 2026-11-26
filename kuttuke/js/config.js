/**
 * くっつけ！ぷにスクイーズ - ゲーム設定＆キャラクター定義
 * 外部ライブラリ非依存のVanilla JS構成
 */

export const WORLD = {
  WIDTH: 360,
  HEIGHT: 520,
  WALL_THICKNESS: 14,
  FLOOR_Y: 504,
  DROP_Y: 54,
  DANGER_LINE_Y: 112,
  DANGER_LIMIT_SEC: 2.5,
  DROP_COOLDOWN_SEC: 0.42,
  GRAVITY: 980,
  SUBSTEPS: 8,
  DAMPING: 0.996,
  BOUNCE: 0.26,
  FRICTION: 0.92,
  SOFTNESS_DECAY: 0.86,
  MAX_SPAWN_LEVEL: 4 // Lv.1〜Lv.5 (index 0..4) が落下候補
};

/**
 * 11段階のスクイーズ定義
 * 同じレベル同士がくっつくと次のレベルへ進化！
 * 最後のLv.11同士がくっつくとビッグバン消滅ボーナス！
 */
export const SQUEEZE_TYPES = [
  {
    level: 1,
    name: "ぷち豆もち",
    radius: 15,
    score: 1,
    colorMain: "#ffe6ee",
    colorSub: "#ffb9cf",
    cheekColor: "#ff88ad",
    shape: "mochi",
    desc: "ひとくちサイズのやわらか豆もち"
  },
  {
    level: 2,
    name: "ほっぺマシュマロ",
    radius: 20,
    score: 3,
    colorMain: "#fff7dc",
    colorSub: "#ffe196",
    cheekColor: "#ff9b9b",
    shape: "marshmallow",
    desc: "ほっぺがとろけるふんわりマシュマロ"
  },
  {
    level: 3,
    name: "みるくプリン",
    radius: 26,
    score: 6,
    colorMain: "#fff0b3",
    colorSub: "#ffc75f",
    accentColor: "#9c5c38",
    cheekColor: "#ff8c94",
    shape: "pudding",
    desc: "ぷるぷる揺れるあま〜いプリン"
  },
  {
    level: 4,
    name: "いちご大福",
    radius: 32,
    score: 10,
    colorMain: "#ffc6d9",
    colorSub: "#ff7fa8",
    accentColor: "#63c17b",
    cheekColor: "#ff5c8a",
    shape: "strawberry",
    desc: "あまずっぱいもちもちいちご大福"
  },
  {
    level: 5,
    name: "ゆめいろパン",
    radius: 39,
    score: 15,
    colorMain: "#ffd9b3",
    colorSub: "#f4a261",
    accentColor: "#fff1d0",
    cheekColor: "#ff8577",
    shape: "melonpan",
    desc: "焼きたてみたいにふかふかなパン"
  },
  {
    level: 6,
    name: "もちもちアザラシ",
    radius: 47,
    score: 21,
    colorMain: "#e4f6ff",
    colorSub: "#9ed8f5",
    cheekColor: "#ff9ebb",
    shape: "seal",
    desc: "さわり心地No.1のしろたん風アザラシ"
  },
  {
    level: 7,
    name: "ふわくまパン",
    radius: 56,
    score: 28,
    colorMain: "#f5d7bd",
    colorSub: "#d39c72",
    accentColor: "#fff0e2",
    cheekColor: "#ff8d8d",
    shape: "bear",
    desc: "お耳もぷにぷにのくまさんパン"
  },
  {
    level: 8,
    name: "スフレチーズ",
    radius: 65,
    score: 36,
    colorMain: "#fff3a8",
    colorSub: "#f7c948",
    accentColor: "#fffbe6",
    cheekColor: "#ff9671",
    shape: "cheese",
    desc: "しゅわっと軽い低反発スフレ"
  },
  {
    level: 9,
    name: "ぴよクッション",
    radius: 75,
    score: 45,
    colorMain: "#ffe97f",
    colorSub: "#ffb703",
    accentColor: "#ff7b00",
    cheekColor: "#ff758f",
    shape: "chick",
    desc: "だきしめたい大きさのひよこちゃん"
  },
  {
    level: 10,
    name: "ゆめユニコーン",
    radius: 86,
    score: 55,
    colorMain: "#f3dcff",
    colorSub: "#c89bff",
    accentColor: "#7de2d1",
    cheekColor: "#ff8cc6",
    shape: "unicorn",
    desc: "パステル色のふわふわユニコーン"
  },
  {
    level: 11,
    name: "王様もちふわ",
    radius: 98,
    score: 100,
    colorMain: "#ffe3f1",
    colorSub: "#ff85b3",
    accentColor: "#ffd166",
    cheekColor: "#ff5c8a",
    shape: "king",
    desc: "伝説のジャンボスクイーズ！2つ合わさると…？"
  }
];
