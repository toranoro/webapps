/**
 * くっつけ！ぷにスクイーズ - Canvas 2D レンダラー
 * ソフトボディ変形輪郭・スクイーズ質感・11種類のキャラクター描画・パーティクル表現
 */

import { WORLD, SQUEEZE_TYPES } from "./config.js";

/**
 * 1体のスクイーズキャラクターを描画（盤面・プレビュー・図鑑共用）
 */
export function drawSqueezeCharacter(ctx, levelIndex, cx, cy, radius, angle = 0, opts = {}) {
  const def = SQUEEZE_TYPES[levelIndex];
  if (!def) return;

  const scale = opts.scale || 1;
  const deform = opts.deform || null;
  const isBlinking = opts.isBlinking || false;
  const isHappy = opts.isHappy || false;
  const isDanger = opts.isDanger || false;
  const alpha = opts.alpha ?? 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  // 外側のふんわりドロップシャドウ（軽量）
  if (!opts.simple) {
    ctx.beginPath();
    ctx.arc(0, radius * 0.08, radius * 0.98, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(130, 86, 108, 0.12)";
    ctx.fill();
  }

  // キャラクター固有の後ろパーツ（耳・角・トサカなど）
  drawBackAccessories(ctx, def, radius);

  // ソフトボディ変形輪郭パスの構築
  buildSoftContourPath(ctx, radius, deform);

  // ふんわか低反発グラデーション塗り
  const grad = ctx.createRadialGradient(
    -radius * 0.3,
    -radius * 0.35,
    radius * 0.12,
    0,
    radius * 0.1,
    radius * 1.05
  );
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.22, def.colorMain);
  grad.addColorStop(1, def.colorSub);
  ctx.fillStyle = grad;
  ctx.fill();

  // 輪郭線（やさしいパステルブラウン）
  ctx.lineWidth = Math.max(1.4, radius * 0.055);
  ctx.strokeStyle = "rgba(122, 85, 98, 0.42)";
  ctx.stroke();

  // キャラクター固有の模様（プリンのカラメル・メロンパン格子・チーズ穴など）
  ctx.save();
  buildSoftContourPath(ctx, radius * 0.97, deform);
  ctx.clip();
  drawBodyPattern(ctx, def, radius);
  ctx.restore();

  // つやつやスクイーズハイライト
  if (!opts.simple) {
    ctx.save();
    ctx.translate(-radius * 0.32, -radius * 0.36);
    ctx.rotate(-0.55);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.25, radius * 0.11, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.68)";
    ctx.fill();
    ctx.restore();
  }

  // 前面の飾り（いちごのヘタ・王冠など）
  drawFrontAccessories(ctx, def, radius);

  // お顔（ほっぺ・目・口）
  drawFace(ctx, def, radius, { isBlinking, isHappy, isDanger });

  ctx.restore();
}

function buildSoftContourPath(ctx, radius, deform) {
  if (!deform) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    return;
  }

  const n = deform.length;
  const pts = new Array(n);
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a = i * step;
    const r = radius + deform[i];
    pts[i] = { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  ctx.beginPath();
  const firstMidX = (pts[n - 1].x + pts[0].x) * 0.5;
  const firstMidY = (pts[n - 1].y + pts[0].y) * 0.5;
  ctx.moveTo(firstMidX, firstMidY);
  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const midX = (curr.x + next.x) * 0.5;
    const midY = (curr.y + next.y) * 0.5;
    ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
  }
  ctx.closePath();
}

function drawBackAccessories(ctx, def, r) {
  const strokeCol = "rgba(122, 85, 98, 0.42)";
  ctx.lineWidth = Math.max(1.3, r * 0.05);
  ctx.strokeStyle = strokeCol;

  if (def.shape === "bear") {
    // くま耳
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * r * 0.68, -r * 0.68, r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = def.colorSub;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(side * r * 0.68, -r * 0.68, r * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = def.accentColor;
      ctx.fill();
    }
  } else if (def.shape === "seal") {
    // 小さなヒレ
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * r * 0.88, r * 0.22, r * 0.24, r * 0.13, side * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = def.colorMain;
      ctx.fill();
      ctx.stroke();
    }
  } else if (def.shape === "chick") {
    // ちょこんとトサカ＆翼
    ctx.beginPath();
    ctx.ellipse(0, -r * 1.0, r * 0.12, r * 0.2, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = def.accentColor;
    ctx.fill();
    ctx.stroke();
  } else if (def.shape === "unicorn") {
    // パステル耳とユニコーンの角
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.35, -r * 0.78);
      ctx.lineTo(side * r * 0.65, -r * 1.15);
      ctx.lineTo(side * r * 0.74, -r * 0.62);
      ctx.closePath();
      ctx.fillStyle = def.colorMain;
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-r * 0.14, -r * 0.88);
    ctx.lineTo(0, -r * 1.32);
    ctx.lineTo(r * 0.14, -r * 0.88);
    ctx.closePath();
    ctx.fillStyle = "#ffe066";
    ctx.fill();
    ctx.stroke();
  }
}

function drawBodyPattern(ctx, def, r) {
  if (def.shape === "pudding") {
    // カラメルソース
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.66, r * 0.92, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fillStyle = def.accentColor;
    ctx.fill();
  } else if (def.shape === "melonpan") {
    // 焼きたて格子模様
    ctx.strokeStyle = "rgba(214, 130, 62, 0.32)";
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    for (let i = -2; i <= 2; i++) {
      const offset = i * r * 0.36;
      ctx.beginPath();
      ctx.moveTo(-r, offset - r * 0.4);
      ctx.lineTo(r, offset + r * 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(offset - r * 0.4, -r);
      ctx.lineTo(offset + r * 0.4, r);
      ctx.stroke();
    }
  } else if (def.shape === "cheese") {
    // スフレのふわ焼き色
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.78, r * 0.95, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(230, 148, 42, 0.42)";
    ctx.fill();
  } else if (def.shape === "mochi") {
    // 豆もちの小さな黒豆ドット
    ctx.fillStyle = "rgba(110, 74, 88, 0.5)";
    const spots = [
      [-0.48, -0.35, 0.11],
      [0.52, -0.25, 0.09],
      [-0.36, 0.48, 0.1],
      [0.44, 0.45, 0.11]
    ];
    for (const [sx, sy, sr] of spots) {
      ctx.beginPath();
      ctx.arc(sx * r, sy * r, sr * r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (def.shape === "king") {
    // レインボーパステルグラデ帯
    const band = ctx.createLinearGradient(-r, -r, r, r);
    band.addColorStop(0, "rgba(255, 224, 130, 0.28)");
    band.addColorStop(0.5, "rgba(162, 236, 255, 0.22)");
    band.addColorStop(1, "rgba(255, 165, 216, 0.26)");
    ctx.fillStyle = band;
    ctx.fillRect(-r, -r, r * 2, r * 2);
  }
}

function drawFrontAccessories(ctx, def, r) {
  if (def.shape === "strawberry") {
    // いちごのヘタ
    ctx.fillStyle = def.accentColor;
    ctx.strokeStyle = "rgba(68, 122, 82, 0.55)";
    ctx.lineWidth = Math.max(1.2, r * 0.045);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.76);
    ctx.lineTo(-r * 0.32, -r * 1.02);
    ctx.lineTo(-r * 0.08, -r * 0.9);
    ctx.lineTo(0, -r * 1.08);
    ctx.lineTo(r * 0.08, -r * 0.9);
    ctx.lineTo(r * 0.32, -r * 1.02);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (def.shape === "king") {
    // 王冠
    ctx.save();
    ctx.translate(0, -r * 0.95);
    ctx.beginPath();
    ctx.moveTo(-r * 0.36, r * 0.12);
    ctx.lineTo(-r * 0.42, -r * 0.24);
    ctx.lineTo(-r * 0.15, -r * 0.03);
    ctx.lineTo(0, -r * 0.32);
    ctx.lineTo(r * 0.15, -r * 0.03);
    ctx.lineTo(r * 0.42, -r * 0.24);
    ctx.lineTo(r * 0.36, r * 0.12);
    ctx.closePath();
    ctx.fillStyle = def.accentColor;
    ctx.fill();
    ctx.lineWidth = Math.max(1.4, r * 0.045);
    ctx.strokeStyle = "rgba(150, 102, 32, 0.6)";
    ctx.stroke();
    ctx.restore();
  }
}

function drawFace(ctx, def, r, state) {
  const eyeY = -r * 0.03;
  const eyeX = r * 0.3;
  const cheekY = r * 0.15;
  const cheekX = r * 0.46;

  // ほっぺ
  ctx.fillStyle = def.cheekColor;
  ctx.globalAlpha *= 0.65;
  ctx.beginPath();
  ctx.ellipse(-cheekX, cheekY, r * 0.15, r * 0.095, 0, 0, Math.PI * 2);
  ctx.ellipse(cheekX, cheekY, r * 0.15, r * 0.095, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha /= 0.65;

  // 目
  ctx.strokeStyle = "#523b46";
  ctx.fillStyle = "#523b46";
  ctx.lineWidth = Math.max(1.5, r * 0.065);
  ctx.lineCap = "round";

  if (state.isDanger) {
    // ピンチ時の「＞ ＜」あわわ顔
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * (eyeX - r * 0.08), eyeY - r * 0.07);
      ctx.lineTo(side * (eyeX + r * 0.05), eyeY);
      ctx.lineTo(side * (eyeX - r * 0.08), eyeY + r * 0.07);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, r * 0.22, r * 0.09, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  if (state.isHappy) {
    // 合体時のにっこり「＾ ＾」
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * eyeX, eyeY + r * 0.03, r * 0.1, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  } else if (state.isBlinking) {
    // まばたき「ー ー」
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * eyeX - r * 0.08, eyeY);
      ctx.lineTo(side * eyeX + r * 0.08, eyeY);
      ctx.stroke();
    }
  } else {
    // きゅるん目
    const eyeR = Math.max(1.8, r * 0.1);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * eyeX, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
      if (r >= 20) {
        ctx.beginPath();
        ctx.arc(side * eyeX - eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.36, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.fillStyle = "#523b46";
      }
    }
  }

  // くち（ひよこはくちばし、それ以外はかわいい「ω」または笑顔）
  if (def.shape === "chick") {
    ctx.beginPath();
    ctx.moveTo(-r * 0.11, r * 0.1);
    ctx.lineTo(r * 0.11, r * 0.1);
    ctx.lineTo(0, r * 0.24);
    ctx.closePath();
    ctx.fillStyle = "#ff8c24";
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(-r * 0.055, r * 0.15, r * 0.055, 0, Math.PI);
    ctx.arc(r * 0.055, r * 0.15, r * 0.055, 0, Math.PI);
    ctx.stroke();
  }
}

/**
 * パーティクル＆フローティングテキスト演出管理
 */
export class EffectManager {
  constructor() {
    this.particles = [];
    this.popups = [];
    this.rings = [];
  }

  clear() {
    this.particles = [];
    this.popups = [];
    this.rings = [];
  }

  spawnMergeBurst(x, y, levelIndex, text) {
    const def = SQUEEZE_TYPES[levelIndex] || SQUEEZE_TYPES[10];
    this.rings.push({
      x,
      y,
      r: def.radius * 0.4,
      maxR: def.radius * 1.9,
      life: 0,
      maxLife: 0.42,
      color: def.colorSub
    });

    const count = 12 + levelIndex * 2;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
      const spd = 65 + Math.random() * 140;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 35,
        size: 3.5 + Math.random() * 4.5,
        color: i % 2 === 0 ? def.colorSub : "#ffd86b",
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
        kind: i % 3 === 0 ? "star" : "circle"
      });
    }

    if (text) {
      this.popups.push({
        x,
        y: y - 10,
        text,
        life: 0,
        maxLife: 0.85,
        color: "#e94f82"
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 240 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.life += dt;
      if (ring.life >= ring.maxLife) {
        this.rings.splice(i, 1);
      }
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.life += dt;
      if (pop.life >= pop.maxLife) {
        this.popups.splice(i, 1);
        continue;
      }
      pop.y -= 38 * dt;
    }
  }

  draw(ctx) {
    for (const ring of this.rings) {
      const t = ring.life / ring.maxLife;
      const r = ring.r + (ring.maxR - ring.r) * t;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.65;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const p of this.particles) {
      const alpha = 1 - p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.kind === "star") {
        drawTinyStar(ctx, p.x, p.y, p.size * 1.2);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const pop of this.popups) {
      const t = pop.life / pop.maxLife;
      ctx.save();
      ctx.globalAlpha = t < 0.7 ? 1 : (1 - t) / 0.3;
      ctx.font = '900 16px "Hiragino Maru Gothic ProN", sans-serif';
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeText(pop.text, pop.x, pop.y);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }
  }
}

function drawTinyStar(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * i) / 4;
    const rad = i % 2 === 0 ? r : r * 0.42;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * ゲーム盤面全体の描画クラス
 */
export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  }

  resizeDisplay(cssWidth, cssHeight) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.canvas.width = Math.round(cssWidth * this.dpr);
    this.canvas.height = Math.round(cssHeight * this.dpr);
    this.scaleX = this.canvas.width / WORLD.WIDTH;
    this.scaleY = this.canvas.height / WORLD.HEIGHT;
  }

  render(world, effects, aimState, timeSec) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.scaleX, this.scaleY);

    // 1. 盤面背景（パステルソフトグラデーション）
    const bg = ctx.createLinearGradient(0, 0, 0, WORLD.HEIGHT);
    bg.addColorStop(0, "#fff8fb");
    bg.addColorStop(0.55, "#fffef8");
    bg.addColorStop(1, "#f4faff");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    // 上部ドロップゾーンのうすい雲模様
    ctx.fillStyle = "rgba(255, 224, 236, 0.25)";
    ctx.fillRect(0, 0, WORLD.WIDTH, WORLD.DANGER_LINE_Y);

    // 2. あふれライン（危険ライン）
    this._drawDangerLine(ctx, world, timeSec);

    // 3. 照準ガイド線 & 待機スクイーズ（雲キャッチャー）
    if (!world.gameOver && aimState.canDrop && aimState.currentLevel !== null) {
      this._drawAimAndPending(ctx, aimState, timeSec);
    }

    // 4. 盤面内のスクイーズ群を描画
    for (const b of world.bodies) {
      drawSqueezeCharacter(ctx, b.levelIndex, b.x, b.y, b.radius, b.angle, {
        scale: b.scalePulse,
        deform: b.deform,
        isBlinking: b.blinkTimer < 0,
        isHappy: b.happyTimer > 0,
        isDanger: b.isDanger
      });
    }

    // 5. アクリルケース風の壁・床フレーム
    this._drawBoxWalls(ctx);

    // 6. パーティクル・ポップアップ
    effects.draw(ctx);

    ctx.restore();
  }

  _drawDangerLine(ctx, world, timeSec) {
    const y = WORLD.DANGER_LINE_Y;
    const ratio = Math.min(1, world.dangerTimer / WORLD.DANGER_LIMIT_SEC);
    const pulse = world.isDangerActive ? 0.55 + Math.sin(timeSec * 12) * 0.35 : 0.45;

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([7, 6]);
    ctx.moveTo(WORLD.WALL_THICKNESS + 4, y);
    ctx.lineTo(WORLD.WIDTH - WORLD.WALL_THICKNESS - 4, y);
    ctx.lineWidth = world.isDangerActive ? 2.6 : 1.6;
    ctx.strokeStyle = world.isDangerActive
      ? `rgba(255, 72, 108, ${pulse})`
      : "rgba(255, 143, 174, 0.55)";
    ctx.stroke();
    ctx.setLineDash([]);

    // 危険ゲージ表示
    if (ratio > 0.04) {
      const barW = 120;
      const barX = (WORLD.WIDTH - barW) * 0.5;
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fillRect(barX, y - 16, barW, 10);
      ctx.fillStyle = ratio > 0.65 ? "#ff476f" : "#ff8fa3";
      ctx.fillRect(barX + 1, y - 15, (barW - 2) * ratio, 8);
      ctx.font = '800 10px "Hiragino Maru Gothic ProN", sans-serif';
      ctx.fillStyle = "#d9385a";
      ctx.textAlign = "center";
      ctx.fillText("あふれちゅうい！", WORLD.WIDTH * 0.5, y - 20);
    }
    ctx.restore();
  }

  _drawAimAndPending(ctx, aimState, timeSec) {
    const def = SQUEEZE_TYPES[aimState.currentLevel];
    const x = aimState.x;
    const bob = Math.sin(timeSec * 4.2) * 2.2;

    // 垂直落下ガイド点線
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 6]);
    ctx.moveTo(x, WORLD.DROP_Y + def.radius);
    ctx.lineTo(x, WORLD.FLOOR_Y);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(255, 133, 175, 0.45)";
    ctx.stroke();
    ctx.setLineDash([]);

    // 雲のガイド
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.beginPath();
    ctx.arc(x - 12, 22, 10, 0, Math.PI * 2);
    ctx.arc(x + 12, 22, 10, 0, Math.PI * 2);
    ctx.arc(x, 18, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 待機中のスクイーズ
    drawSqueezeCharacter(ctx, aimState.currentLevel, x, WORLD.DROP_Y + bob, def.radius, 0, {
      scale: 1 + Math.sin(timeSec * 5) * 0.025
    });
  }

  _drawBoxWalls(ctx) {
    const w = WORLD.WALL_THICKNESS;
    const h = WORLD.HEIGHT;
    const floorH = h - WORLD.FLOOR_Y;

    const wallGrad = ctx.createLinearGradient(0, 0, WORLD.WIDTH, 0);
    wallGrad.addColorStop(0, "#ffc7dc");
    wallGrad.addColorStop(0.5, "#ffe4ef");
    wallGrad.addColorStop(1, "#ffc7dc");

    ctx.fillStyle = wallGrad;
    // 左壁
    ctx.fillRect(0, WORLD.DANGER_LINE_Y - 12, w, h - (WORLD.DANGER_LINE_Y - 12));
    // 右壁
    ctx.fillRect(WORLD.WIDTH - w, WORLD.DANGER_LINE_Y - 12, w, h - (WORLD.DANGER_LINE_Y - 12));
    // 底床
    ctx.fillRect(0, WORLD.FLOOR_Y, WORLD.WIDTH, floorH);

    // 内側ハイライト線
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w, WORLD.DANGER_LINE_Y - 10);
    ctx.lineTo(w, WORLD.FLOOR_Y);
    ctx.lineTo(WORLD.WIDTH - w, WORLD.FLOOR_Y);
    ctx.lineTo(WORLD.WIDTH - w, WORLD.DANGER_LINE_Y - 10);
    ctx.stroke();
  }
}
