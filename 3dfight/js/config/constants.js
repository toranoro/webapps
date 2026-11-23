/**
 * ゲーム全体の定数・バランス調整用パラメータ
 * ここから移動速度、技のフレーム・ダメージ・ノックバックなどを一括調整できます。
 */

export const GAME_CONFIG = {
  APP_VERSION: '0.2.0',
  FPS: 60,
  FIXED_DT: 1 / 60,
  ROUND_TIME_SECONDS: 60,
  WINS_REQUIRED: 2, // 2本先取
  MAX_HP: 100,

  // ステージ（天下一武道会風 正方形リング）
  RING_HALF_SIZE: 10.0, // -10 ～ +10
  RING_HEIGHT: 1.4,
  RING_OUT_MARGIN: 0.35, // 境界外判定の遊び（足元が完全に外れたらRO）
  FALL_GRAVITY: 32.0,
  FALL_END_Y: -12.0,

  // カメラ設定
  CAMERA_FOV: 45,
  CAMERA_MIN_DIST: 8.5,
  CAMERA_MAX_DIST: 17.5,
  CAMERA_HEIGHT_BASE: 4.4,
  CAMERA_LOOK_Y: 1.5,
  CAMERA_SMOOTHING: 8.5,
};

export const FIGHTER_STATS = {
  WALK_SPEED_FORWARD: 6.2,
  WALK_SPEED_BACKWARD: 4.6,
  SIDESTEP_SPEED: 5.4,
  SIDESTEP_BURST_SPEED: 11.8,
  SIDESTEP_FRAMES: 14,
  JUMP_VELOCITY: 10.8,
  GRAVITY: 28.0,
  HURTBOX_RADIUS: 0.58,
  BODY_PUSH_RADIUS: 0.62,
  GUARD_DAMAGE_MULTIPLIER: 0.1, // ガード時は10%軽減（最小1 or 0、下記参照）
  GUARD_CHIP_ENABLED: false, // プロトタイプでは通常ガードはダメージ0（投げで崩す）
  GUARD_PUSHBACK_MULTIPLIER: 0.55,
  THROW_RANGE: 1.75,
  COUNTER_HIT_MULTIPLIER: 1.25,
};

/**
 * 状態定数（将来的に DASH / SPECIAL 等を追加しやすい設計）
 */
export const FIGHTER_STATE = {
  IDLE: 'IDLE',
  WALK: 'WALK',
  CROUCH: 'CROUCH',
  SIDESTEP: 'SIDESTEP',
  JUMP: 'JUMP',
  ATTACK: 'ATTACK',
  SPECIAL: 'SPECIAL',
  GUARD: 'GUARD',
  THROW_ATTEMPT: 'THROW_ATTEMPT',
  THROW_EXECUTE: 'THROW_EXECUTE',
  THROWN: 'THROWN',
  HIT: 'HIT',
  FROZEN: 'FROZEN',
  DOWN: 'DOWN',
  FALL: 'FALL',
  VICTORY: 'VICTORY',
};

/**
 * 柔道投げ技バリエーション（投げ成立時にランダム選択）
 */
export const THROW_VARIANTS = [
  { id: 'TOMOE_NAGE', name: '巴投', durationFrames: 38, slamFrame: 27, throwDir: -1, knockback: 6.8 },
  { id: 'OSOTO_GARI', name: '大外刈', durationFrames: 34, slamFrame: 24, throwDir: 1, knockback: 6.2 },
  { id: 'SEOI_NAGE', name: '一本背負投', durationFrames: 36, slamFrame: 25, throwDir: 1, knockback: 7.0 },
  { id: 'KOSOTO_GARI', name: '小外刈', durationFrames: 32, slamFrame: 22, throwDir: 1, knockback: 5.4 },
  { id: 'KATA_GURUMA', name: '肩車', durationFrames: 40, slamFrame: 29, throwDir: 1, knockback: 7.4 },
];

/**
 * 技データ（フレームは60fps基準）
 */
export const MOVES = {
  LIGHT_PUNCH: {
    id: 'LIGHT_PUNCH',
    name: '弱パンチ',
    keyHint: 'C',
    limb: 'rightHand',
    startupFrames: 4,
    activeFrames: 4,
    recoveryFrames: 7,
    damage: 6,
    knockback: 1.8,
    hitstopFrames: 3,
    hitstunFrames: 12,
    blockstunFrames: 8,
    hitboxRadius: 0.45,
    reachOffset: 0.25,
    hitType: 'high',
    sparkColor: 0xffe066,
  },
  HEAVY_PUNCH: {
    id: 'HEAVY_PUNCH',
    name: '強パンチ',
    keyHint: 'V',
    limb: 'rightHand',
    startupFrames: 9,
    activeFrames: 5,
    recoveryFrames: 14,
    damage: 14,
    knockback: 4.2,
    hitstopFrames: 6,
    hitstunFrames: 18,
    blockstunFrames: 12,
    hitboxRadius: 0.55,
    reachOffset: 0.35,
    hitType: 'mid',
    sparkColor: 0xff8c24,
  },
  LIGHT_KICK: {
    id: 'LIGHT_KICK',
    name: '弱キック',
    keyHint: 'Z',
    limb: 'rightFoot',
    startupFrames: 6,
    activeFrames: 4,
    recoveryFrames: 10,
    damage: 8,
    knockback: 2.5,
    hitstopFrames: 4,
    hitstunFrames: 14,
    blockstunFrames: 9,
    hitboxRadius: 0.5,
    reachOffset: 0.3,
    hitType: 'mid',
    sparkColor: 0xffd166,
  },
  HEAVY_KICK: {
    id: 'HEAVY_KICK',
    name: '強キック',
    keyHint: 'X',
    limb: 'rightFoot',
    startupFrames: 12,
    activeFrames: 5,
    recoveryFrames: 18,
    damage: 18,
    knockback: 7.4, // リングアウトを狙いやすい強い吹き飛ばし
    hitstopFrames: 8,
    hitstunFrames: 22,
    blockstunFrames: 14,
    hitboxRadius: 0.62,
    reachOffset: 0.4,
    hitType: 'high',
    sparkColor: 0xff3b30,
  },
  THROW: {
    id: 'THROW',
    name: '投げ',
    keyHint: 'A',
    limb: 'rightHand',
    startupFrames: 5,
    activeFrames: 4,
    recoveryFrames: 20,
    damage: 16,
    knockback: 6.2,
    hitstopFrames: 7,
    hitstunFrames: 28,
    blockstunFrames: 0, // ガード不能
    hitboxRadius: 0.75,
    reachOffset: 0.4,
    hitType: 'throw',
    sparkColor: 0xd946ef,
  },
  JUMP_KICK: {
    id: 'JUMP_KICK',
    name: 'ジャンプキック',
    keyHint: 'Z/X',
    limb: 'rightFoot',
    startupFrames: 4,
    activeFrames: 16,
    recoveryFrames: 6,
    damage: 11,
    knockback: 2.0,
    hitstopFrames: 5,
    hitstunFrames: 26, // 着地コンボが繋がる長めの仰け反り
    blockstunFrames: 11,
    hitboxRadius: 0.62,
    reachOffset: 0.38,
    hitType: 'mid',
    sparkColor: 0xfacc15,
    isAir: true,
  },
  JUMP_PUNCH: {
    id: 'JUMP_PUNCH',
    name: 'ジャンプパンチ',
    keyHint: 'C/V',
    limb: 'rightHand',
    startupFrames: 3,
    activeFrames: 14,
    recoveryFrames: 5,
    damage: 8,
    knockback: 1.5,
    hitstopFrames: 4,
    hitstunFrames: 24,
    blockstunFrames: 9,
    hitboxRadius: 0.54,
    reachOffset: 0.3,
    hitType: 'mid',
    sparkColor: 0xfde047,
    isAir: true,
  },
  CROUCH_PUNCH: {
    id: 'CROUCH_PUNCH',
    name: 'しゃがみパンチ',
    keyHint: 'K+C/V',
    limb: 'rightHand',
    startupFrames: 4,
    activeFrames: 4,
    recoveryFrames: 7,
    damage: 7,
    knockback: 1.5,
    hitstopFrames: 3,
    hitstunFrames: 15,
    blockstunFrames: 8,
    hitboxRadius: 0.5,
    reachOffset: 0.3,
    hitType: 'mid',
    sparkColor: 0xffe066,
    isCrouch: true,
  },
  CROUCH_KICK: {
    id: 'CROUCH_KICK',
    name: 'しゃがみキック（足払い）',
    keyHint: 'K+Z/X',
    limb: 'rightFoot',
    startupFrames: 6,
    activeFrames: 5,
    recoveryFrames: 12,
    damage: 10,
    knockback: 3.1,
    hitstopFrames: 5,
    hitstunFrames: 19,
    blockstunFrames: 10,
    hitboxRadius: 0.58,
    reachOffset: 0.38,
    hitType: 'low', // 立ちガード不可（しゃがみガードで防ぐ）
    sparkColor: 0xf97316,
    isCrouch: true,
  },
};

export const AI_PROFILES = {
  EASY: {
    label: 'EASY',
    reactionInterval: 0.35,
    attackProb: 0.32,
    guardProb: 0.18,
    throwProb: 0.08,
    sidestepProb: 0.15,
    ringEdgePanicDist: 7.8,
  },
  NORMAL: {
    label: 'NORMAL',
    reactionInterval: 0.2,
    attackProb: 0.52,
    guardProb: 0.36,
    throwProb: 0.22,
    sidestepProb: 0.28,
    ringEdgePanicDist: 7.2,
  },
  HARD: {
    label: 'HARD',
    reactionInterval: 0.11,
    attackProb: 0.72,
    guardProb: 0.56,
    throwProb: 0.36,
    sidestepProb: 0.42,
    ringEdgePanicDist: 6.6,
  },
};

export const PLAYER_COLORS = {
  P1: {
    name: '1P FIGHTER',
    giPrimary: 0xf4f4f6,
    giSecondary: 0xdbe2ef,
    belt: 0x1e293b,
    skin: 0xf2c6a0,
    hair: 0x1b1f2a,
    accent: 0x2563eb, // 青ハチマキ・リストバンド
  },
  COM: {
    name: 'COM RIVAL',
    giPrimary: 0x262936,
    giSecondary: 0xb91c1c,
    belt: 0xeab308,
    skin: 0xe6b48c,
    hair: 0x3b1d14,
    accent: 0xdc2626, // 赤アクセント
  },
};
