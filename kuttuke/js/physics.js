/**
 * くっつけ！ぷにスクイーズ - カスタム2D弾性ソフトボディ物理エンジン
 * 外部物理ライブラリを使わず、スクイーズ特有の「ぷにぷに・むにゅっ」という
 * 柔らかい弾力と安定した積み上がりをVanilla JSで実現します。
 */

import { WORLD, SQUEEZE_TYPES } from "./config.js";

const DEFORM_SEGMENTS = 16;

let nextBodyId = 1;

export class SqueezeBody {
  constructor(levelIndex, x, y, options = {}) {
    const def = SQUEEZE_TYPES[levelIndex];
    this.id = nextBodyId++;
    this.levelIndex = levelIndex;
    this.radius = def.radius;
    this.mass = def.radius * def.radius;
    this.x = x;
    this.y = y;
    this.vx = options.vx || 0;
    this.vy = options.vy || 0;
    this.angle = options.angle || 0;
    this.angularVel = options.angularVel || 0;
    this.age = 0;
    this.merged = false;

    // ぷにぷに変形用パラメータ
    this.scalePulse = options.scalePulse ?? 1.0;
    this.scaleVel = options.scaleVel ?? 0;
    this.deform = new Float32Array(DEFORM_SEGMENTS);
    this.deformVel = new Float32Array(DEFORM_SEGMENTS);

    // 表情・まばたき用
    this.blinkTimer = 1.5 + Math.random() * 4.0;
    this.happyTimer = options.happyTimer || 0;
    this.isDanger = false;
  }

  /** 指定方向からの押しつぶしインパルスを加える */
  applyDeform(worldAngle, amount) {
    const localAngle = worldAngle - this.angle;
    const step = (Math.PI * 2) / DEFORM_SEGMENTS;
    for (let i = 0; i < DEFORM_SEGMENTS; i++) {
      const a = i * step;
      const diff = Math.cos(a - localAngle);
      // 接触面は凹み（負）、垂直方向は少し膨らむ（正：体積保存風）
      if (diff > 0.35) {
        this.deformVel[i] -= amount * (diff - 0.35) * 1.4;
      } else {
        this.deformVel[i] += amount * 0.25 * (1 - Math.abs(diff));
      }
    }
  }

  updateVisualDeform(dt) {
    // 全体のぷるん弾性（合体直後など）
    const kScale = 180;
    const dScale = 10;
    const accelScale = -kScale * (this.scalePulse - 1.0) - dScale * this.scaleVel;
    this.scaleVel += accelScale * dt;
    this.scalePulse += this.scaleVel * dt;
    if (this.scalePulse < 0.65) this.scalePulse = 0.65;
    if (this.scalePulse > 1.45) this.scalePulse = 1.45;

    // 16方向輪郭のバネダンパー更新
    const k = 220;
    const damp = 13;
    for (let i = 0; i < DEFORM_SEGMENTS; i++) {
      const prev = this.deform[(i - 1 + DEFORM_SEGMENTS) % DEFORM_SEGMENTS];
      const next = this.deform[(i + 1) % DEFORM_SEGMENTS];
      const neighborForce = (prev + next - 2 * this.deform[i]) * 65;
      const springForce = -k * this.deform[i] - damp * this.deformVel[i] + neighborForce;
      this.deformVel[i] += springForce * dt;
      this.deform[i] += this.deformVel[i] * dt;
      // 変形しすぎないようクランプ
      const maxD = this.radius * 0.22;
      if (this.deform[i] > maxD) this.deform[i] = maxD;
      if (this.deform[i] < -maxD) this.deform[i] = -maxD;
    }

    // まばたき・笑顔タイマー
    this.blinkTimer -= dt;
    if (this.blinkTimer < -0.14) {
      this.blinkTimer = 2.0 + Math.random() * 4.5;
    }
    if (this.happyTimer > 0) {
      this.happyTimer = Math.max(0, this.happyTimer - dt);
    }
  }
}

export class SqueezeWorld {
  constructor(callbacks = {}) {
    this.bodies = [];
    this.score = 0;
    this.maxLevelReached = 0;
    this.mergeCount = 0;
    this.dangerTimer = 0;
    this.isDangerActive = false;
    this.gameOver = false;
    this.comboCount = 0;
    this.comboResetTimer = 0;

    this.onScoreChange = callbacks.onScoreChange || (() => {});
    this.onMerge = callbacks.onMerge || (() => {});
    this.onSuperMerge = callbacks.onSuperMerge || (() => {});
    this.onSquish = callbacks.onSquish || (() => {});
    this.onGameOver = callbacks.onGameOver || (() => {});

    this._squishSoundCooldown = 0;
  }

  reset() {
    this.bodies = [];
    this.score = 0;
    this.maxLevelReached = 0;
    this.mergeCount = 0;
    this.dangerTimer = 0;
    this.isDangerActive = false;
    this.gameOver = false;
    this.comboCount = 0;
    this.comboResetTimer = 0;
    this.onScoreChange(0);
  }

  spawnDrop(levelIndex, x) {
    const r = SQUEEZE_TYPES[levelIndex].radius;
    const minX = WORLD.WALL_THICKNESS + r + 2;
    const maxX = WORLD.WIDTH - WORLD.WALL_THICKNESS - r - 2;
    const clampedX = Math.max(minX, Math.min(maxX, x));
    const body = new SqueezeBody(levelIndex, clampedX, WORLD.DROP_Y, {
      vy: 45,
      scalePulse: 1.12,
      happyTimer: 0.45
    });
    this.bodies.push(body);
    return body;
  }

  step(dt) {
    if (this.gameOver) return;

    const clampedDt = Math.min(dt, 0.033);
    if (this._squishSoundCooldown > 0) this._squishSoundCooldown -= clampedDt;
    if (this.comboResetTimer > 0) {
      this.comboResetTimer -= clampedDt;
      if (this.comboResetTimer <= 0) this.comboCount = 0;
    }

    const subDt = clampedDt / WORLD.SUBSTEPS;
    const leftWall = WORLD.WALL_THICKNESS;
    const rightWall = WORLD.WIDTH - WORLD.WALL_THICKNESS;
    const floorY = WORLD.FLOOR_Y;

    const pendingMerges = [];

    for (let s = 0; s < WORLD.SUBSTEPS; s++) {
      // 1. 積分（重力・位置・回転）
      for (let i = 0; i < this.bodies.length; i++) {
        const b = this.bodies[i];
        if (b.merged) continue;
        if (s === 0) b.age += clampedDt;

        b.vy += WORLD.GRAVITY * subDt;
        b.vx *= Math.pow(WORLD.DAMPING, 1);
        b.vy *= Math.pow(WORLD.DAMPING, 1);

        b.x += b.vx * subDt;
        b.y += b.vy * subDt;

        // 転がり＆起き上がり復元トルク（可愛い顔が逆さまになりすぎないように）
        b.angularVel *= 0.985;
        b.angularVel -= Math.sin(b.angle) * 2.2 * subDt;
        b.angle += b.angularVel * subDt;

        // 壁・床衝突
        if (b.x - b.radius < leftWall) {
          const impact = Math.abs(b.vx);
          b.x = leftWall + b.radius;
          b.vx = Math.abs(b.vx) * WORLD.BOUNCE;
          b.vy *= WORLD.FRICTION;
          if (s === 0 && impact > 55) b.applyDeform(Math.PI, Math.min(impact * 0.25, 38));
        } else if (b.x + b.radius > rightWall) {
          const impact = Math.abs(b.vx);
          b.x = rightWall - b.radius;
          b.vx = -Math.abs(b.vx) * WORLD.BOUNCE;
          b.vy *= WORLD.FRICTION;
          if (s === 0 && impact > 55) b.applyDeform(0, Math.min(impact * 0.25, 38));
        }

        if (b.y + b.radius > floorY) {
          const impact = Math.abs(b.vy);
          b.y = floorY - b.radius;
          b.vy = -Math.abs(b.vy) * WORLD.BOUNCE;
          if (Math.abs(b.vy) < 12) b.vy = 0;
          b.vx *= 0.965;
          b.angularVel += (b.vx / b.radius - b.angularVel) * 0.14;
          if (s === 0 && impact > 70) {
            b.applyDeform(Math.PI / 2, Math.min(impact * 0.22, 42));
            this._triggerSquishSound(impact / 420);
          }
        }
      }

      // 2. スクイーズ同士の衝突解決 & 合体検出
      const count = this.bodies.length;
      for (let i = 0; i < count; i++) {
        const a = this.bodies[i];
        if (a.merged) continue;

        for (let j = i + 1; j < count; j++) {
          const b = this.bodies[j];
          if (b.merged) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minDist = a.radius + b.radius;
          const distSq = dx * dx + dy * dy;

          if (distSq < minDist * minDist) {
            const dist = Math.sqrt(distSq) || 0.001;
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;

            // 同じ種類同士なら合体候補へ
            if (a.levelIndex === b.levelIndex) {
              a.merged = true;
              b.merged = true;
              pendingMerges.push([a, b]);
              break;
            }

            // 位置補正（重なり解消：少し柔らかめに押し戻す）
            const totalMass = a.mass + b.mass;
            const ratioA = b.mass / totalMass;
            const ratioB = a.mass / totalMass;
            const correction = overlap * 0.88;

            a.x -= nx * correction * ratioA;
            a.y -= ny * correction * ratioA;
            b.x += nx * correction * ratioB;
            b.y += ny * correction * ratioB;

            // 相対速度に基づく反発・摩擦
            const rvx = b.vx - a.vx;
            const rvy = b.vy - a.vy;
            const velAlongNormal = rvx * nx + rvy * ny;

            if (velAlongNormal < 0) {
              const e = WORLD.BOUNCE;
              const jImpulse = -(1 + e) * velAlongNormal;
              const invMassSum = 1 / a.mass + 1 / b.mass;
              const impulse = jImpulse / invMassSum;

              a.vx -= (impulse / a.mass) * nx;
              a.vy -= (impulse / a.mass) * ny;
              b.vx += (impulse / b.mass) * nx;
              b.vy += (impulse / b.mass) * ny;

              // 接線方向の摩擦と回転
              const tx = -ny;
              const ty = nx;
              const velTangent = rvx * tx + rvy * ty;
              const frictionImpulse = -velTangent * 0.12 / invMassSum;
              a.vx -= (frictionImpulse / a.mass) * tx;
              a.vy -= (frictionImpulse / a.mass) * ty;
              b.vx += (frictionImpulse / b.mass) * tx;
              b.vy += (frictionImpulse / b.mass) * ty;

              a.angularVel += (velTangent / a.radius) * 0.06;
              b.angularVel -= (velTangent / b.radius) * 0.06;

              const impact = Math.abs(velAlongNormal);
              if (s === 0 && impact > 55) {
                const angleAB = Math.atan2(ny, nx);
                const amount = Math.min(impact * 0.2, 36);
                a.applyDeform(angleAB, amount);
                b.applyDeform(angleAB + Math.PI, amount);
                if (impact > 95) this._triggerSquishSound(impact / 450);
              }
            } else if (overlap > 1.8 && s === 0) {
              // じわっと押し合っているときも微細な凹みを表現
              const angleAB = Math.atan2(ny, nx);
              const press = Math.min(overlap * 2.2, 10);
              a.applyDeform(angleAB, press);
              b.applyDeform(angleAB + Math.PI, press);
            }
          }
        }
      }
    }

    // 3. 合体処理の実行
    if (pendingMerges.length > 0) {
      this._processMerges(pendingMerges);
    }

    // 合体消費済みボディを除去
    if (pendingMerges.length > 0) {
      this.bodies = this.bodies.filter((b) => !b.merged);
    }

    // 4. ビジュアル変形と危険ライン判定
    let anyOverLine = false;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      b.updateVisualDeform(clampedDt);

      // 落下から0.95秒以上経過したスクイーズが危険ラインを超えているか判定
      const topY = b.y - b.radius;
      const over = b.age > 0.95 && topY < WORLD.DANGER_LINE_Y;
      b.isDanger = over;
      if (over) {
        anyOverLine = true;
      }
    }

    this.isDangerActive = anyOverLine;
    if (anyOverLine) {
      this.dangerTimer += clampedDt;
      if (this.dangerTimer >= WORLD.DANGER_LIMIT_SEC) {
        this.gameOver = true;
        this.onGameOver(this.score, this.maxLevelReached);
      }
    } else {
      this.dangerTimer = Math.max(0, this.dangerTimer - clampedDt * 2.5);
    }
  }

  _triggerSquishSound(intensity) {
    if (this._squishSoundCooldown <= 0) {
      this.onSquish(intensity);
      this._squishSoundCooldown = 0.08;
    }
  }

  _processMerges(pairs) {
    for (const [a, b] of pairs) {
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;
      const level = a.levelIndex;

      this.comboCount += 1;
      this.comboResetTimer = 1.1;
      this.mergeCount += 1;

      if (level >= SQUEEZE_TYPES.length - 1) {
        // 最大ランク（王様もちふわ）同士の合体：ビッグバン消滅！
        const bonus = 300 + (this.comboCount - 1) * 30;
        this.score += bonus;
        this.onScoreChange(this.score);
        this.onSuperMerge({ x: mx, y: my, bonus, combo: this.comboCount });
        this._applyRadialPush(mx, my, 170, 260);
      } else {
        const nextLevel = level + 1;
        const nextDef = SQUEEZE_TYPES[nextLevel];
        const minX = WORLD.WALL_THICKNESS + nextDef.radius + 1;
        const maxX = WORLD.WIDTH - WORLD.WALL_THICKNESS - nextDef.radius - 1;
        const clampedX = Math.max(minX, Math.min(maxX, mx));
        const clampedY = Math.min(WORLD.FLOOR_Y - nextDef.radius - 1, my);

        const newBody = new SqueezeBody(nextLevel, clampedX, clampedY, {
          vx: (a.vx + b.vx) * 0.35,
          vy: Math.min((a.vy + b.vy) * 0.35, -45),
          scalePulse: 1.28,
          scaleVel: 1.8,
          happyTimer: 1.1
        });
        newBody.age = 0.7; // 合体直後の危険ライン判定猶予
        this.bodies.push(newBody);

        if (nextLevel > this.maxLevelReached) {
          this.maxLevelReached = nextLevel;
        }

        const gained = nextDef.score + Math.max(0, this.comboCount - 1) * 2;
        this.score += gained;
        this.onScoreChange(this.score);
        this.onMerge({
          x: clampedX,
          y: clampedY,
          levelIndex: nextLevel,
          gained,
          combo: this.comboCount
        });

        // 周囲のスクイーズを少し「ぽよん」と押し退ける
        this._applyRadialPush(clampedX, clampedY, nextDef.radius + 55, 165, newBody.id);
      }
    }
  }

  _applyRadialPush(cx, cy, range, force, excludeId = -1) {
    for (const b of this.bodies) {
      if (b.merged || b.id === excludeId) continue;
      const dx = b.x - cx;
      const dy = b.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.01 && dist < range + b.radius) {
        const factor = 1 - dist / (range + b.radius);
        const nx = dx / dist;
        const ny = dy / dist;
        b.vx += nx * force * factor;
        b.vy += ny * force * factor - 25 * factor;
        b.applyDeform(Math.atan2(-ny, -nx), 22 * factor);
      }
    }
  }
}
