import * as THREE from '../../vendor/three.module.min.js?v=20261123174047';
import { FIGHTER_STATE, FIGHTER_STATS, GAME_CONFIG, MOVES } from '../config/constants.js?v=20261123174047';
import { AnimalRig } from './AnimalRig.js?v=20261123174047';

/**
 * 格闘キャラクターの物理・状態遷移・ヒットボックス・必殺技・ダメージ管理クラス
 */
export class Fighter {
  constructor(id, charSpec, scene) {
    this.id = id;
    this.scene = scene;
    this.charSpec = charSpec;
    this.rig = new AnimalRig(charSpec, id === 'P1');
    scene.add(this.rig.root);
    scene.add(this.rig.groundShadow);

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.knockbackVel = new THREE.Vector3();
    this.facingYaw = 0;

    this._applySpecStats(charSpec);
    this.hp = this.maxHp;
    this.state = FIGHTER_STATE.IDLE;
    this.stateFrame = 0;
    this.stunFrames = 0;
    this.currentMove = null;
    this.moveHasHit = false;
    this.hitFlashTimer = 0;
    this.isCrouching = false;
    this.forcedThrowId = null;
    this.comboCount = 0;

    // 必殺技状態・クールタイム管理
    this.currentSkill = null;
    this.skillProjectileFired = false;
    this.skillLastHitFrame = -999;
    this.sp1Cooldown = 0;
    this.sp2Cooldown = 0;
    this.headDetached = false;
    this.stealthTimer = 0;
    this.invincibleTimer = 0;
    this.frozenTimer = 0;
    this.sidestepDir = 0;
    this.sidestepVec = new THREE.Vector3();

    // 柔道投げシーケンス管理
    this.activeThrow = null;
    this.throwSlammed = false;
    this.throwOrigin = new THREE.Vector3();
    this.throwYaw = 0;

    // 一時計算用ベクトル
    this._limbPos = new THREE.Vector3();
    this._hurtPos = new THREE.Vector3();
  }

  _applySpecStats(charSpec) {
    this.charSpec = charSpec;
    this.maxHp = charSpec.stats.maxHp;
    this.weight = charSpec.stats.weight;
    this.speedScale = charSpec.stats.speedScale;
    this.damageScale = charSpec.stats.damageScale;
    this.reachScale = charSpec.stats.reachScale;
    this.superArmor = Boolean(charSpec.stats.superArmor);
    this.lowProfile = Boolean(charSpec.stats.lowProfile);
  }

  setCharacter(charSpec) {
    if (this.charSpec.id === charSpec.id) return;
    const pos = this.position.clone();
    const yaw = this.facingYaw;
    this.rig.dispose(this.scene);
    this._applySpecStats(charSpec);
    this.rig = new AnimalRig(charSpec, this.id === 'P1');
    this.scene.add(this.rig.root);
    this.scene.add(this.rig.groundShadow);
    this.position.copy(pos);
    this.facingYaw = yaw;
    this.hp = this.maxHp;
    this._syncMesh();
  }

  reset(x, z, facingYaw) {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.knockbackVel.set(0, 0, 0);
    this.facingYaw = facingYaw;
    this.hp = this.maxHp;
    this.state = FIGHTER_STATE.IDLE;
    this.stateFrame = 0;
    this.stunFrames = 0;
    this.currentMove = null;
    this.moveHasHit = false;
    this.hitFlashTimer = 0;
    this.isCrouching = false;
    this.forcedThrowId = null;
    this.comboCount = 0;

    this.currentSkill = null;
    this.skillProjectileFired = false;
    this.skillLastHitFrame = -999;
    this.sp1Cooldown = 0;
    this.sp2Cooldown = 0;
    this.headDetached = false;
    this.stealthTimer = 0;
    this.invincibleTimer = 0;
    this.frozenTimer = 0;
    this.sidestepDir = 0;
    this.sidestepVec = new THREE.Vector3();
    this.rig.setHeadVisible(true);
    this.rig.setStealth(false);

    this.activeThrow = null;
    this.throwSlammed = false;
    this._syncMesh();
  }

  isWithinRingBounds() {
    const limit = GAME_CONFIG.RING_HALF_SIZE + GAME_CONFIG.RING_OUT_MARGIN;
    return Math.abs(this.position.x) <= limit && Math.abs(this.position.z) <= limit;
  }

  isGrounded() {
    return this.position.y <= 0.001 && this.isWithinRingBounds();
  }

  canAct() {
    return (
      this.state === FIGHTER_STATE.IDLE ||
      this.state === FIGHTER_STATE.WALK ||
      this.state === FIGHTER_STATE.CROUCH ||
      this.state === FIGHTER_STATE.GUARD
    );
  }

  canUseSpecial(slot) {
    const skill = this.charSpec.skills[slot];
    if (!skill) return false;
    const cd = slot === 'sp1' ? this.sp1Cooldown : this.sp2Cooldown;
    if (cd > 0.01) return false;
    if (skill.hidePart === 'head' && this.headDetached) return false;
    return this.canAct() && this.isGrounded();
  }

  faceTarget(target) {
    const dx = target.position.x - this.position.x;
    const dz = target.position.z - this.position.z;
    if (dx * dx + dz * dz > 0.0001) {
      this.facingYaw = Math.atan2(dx, dz);
    }
  }

  getHurtboxCenter(out = this._hurtPos) {
    const low = this.isCrouching || this.currentMove?.isCrouch || this.lowProfile;
    out.set(this.position.x, this.position.y + (low ? 0.65 : 1.05), this.position.z);
    return out;
  }

  /**
   * 1フレーム分の入力・状態更新
   */
  step(dt, input, camRight, camForward, opponent, callbacks) {
    this.stateFrame += 1;
    this.sp1Cooldown = Math.max(0, this.sp1Cooldown - dt);
    this.sp2Cooldown = Math.max(0, this.sp2Cooldown - dt);

    if (this.stealthTimer > 0) {
      this.stealthTimer = Math.max(0, this.stealthTimer - dt);
      if (this.stealthTimer <= 0) this.rig.setStealth(false);
    }
    if (this.invincibleTimer > 0) {
      this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
    }

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    }

    // 決着状態（DOWN / VICTORY）
    if (this.state === FIGHTER_STATE.DOWN || this.state === FIGHTER_STATE.VICTORY) {
      this._applyKnockbackAndGravity(dt);
      this._syncMesh();
      return;
    }

    // リングアウト落下中
    if (this.state === FIGHTER_STATE.FALL) {
      this.velocity.y -= GAME_CONFIG.FALL_GRAVITY * dt;
      this.position.x += (this.velocity.x + this.knockbackVel.x) * dt;
      this.position.z += (this.velocity.z + this.knockbackVel.z) * dt;
      this.position.y += this.velocity.y * dt;
      this.position.y = Math.max(GAME_CONFIG.FALL_END_Y, this.position.y);
      this._syncMesh();
      return;
    }

    // 投げ技実行中（取り手）
    if (this.state === FIGHTER_STATE.THROW_EXECUTE && this.activeThrow) {
      if (!this.throwSlammed && this.stateFrame >= this.activeThrow.slamFrame) {
        this.throwSlammed = true;
        if (callbacks.onThrowSlam) {
          callbacks.onThrowSlam(this, opponent, this.activeThrow);
        }
      }
      if (this.stateFrame >= this.activeThrow.durationFrames) {
        this.activeThrow = null;
        this.throwSlammed = false;
        this.state = FIGHTER_STATE.IDLE;
        this.stateFrame = 0;
      }
      this._syncMesh();
      return;
    }

    // 投げられ中（受け手）
    if (this.state === FIGHTER_STATE.THROWN) {
      if (this.activeThrow && this.stateFrame < this.activeThrow.slamFrame) {
        this._updateThrownPosition();
      } else {
        this._applyKnockbackAndGravity(dt);
        this._checkRingOut(callbacks);
      }
      if (this.state !== FIGHTER_STATE.FALL && this.stateFrame >= this.stunFrames) {
        this.activeThrow = null;
        this.state = this.isGrounded() ? FIGHTER_STATE.IDLE : FIGHTER_STATE.JUMP;
        this.stateFrame = 0;
      }
      this._syncMesh();
      return;
    }

    // 氷結状態異常（FROZEN：時間経過＋レバガチャ入力で短縮解除）
    if (this.state === FIGHTER_STATE.FROZEN) {
      const mash =
        Boolean(input.attackId || input.throwPressed || input.jump || input.specialSlot) ||
        Math.hypot(input.moveX, input.moveY) > 0.6;
      if (mash && this.stateFrame % 6 === 0) {
        this.frozenTimer -= 0.18;
      }
      this.frozenTimer = Math.max(0, this.frozenTimer - dt);
      this._applyKnockbackAndGravity(dt);
      this._checkRingOut(callbacks);
      if (this.state !== FIGHTER_STATE.FALL && this.frozenTimer <= 0) {
        this.state = this.isGrounded() ? FIGHTER_STATE.IDLE : FIGHTER_STATE.JUMP;
        this.stateFrame = 0;
      }
      this._syncMesh();
      return;
    }

    // 被弾硬直
    if (this.state === FIGHTER_STATE.HIT) {
      this._applyKnockbackAndGravity(dt);
      this._checkRingOut(callbacks);
      if (this.state !== FIGHTER_STATE.FALL && this.stateFrame >= this.stunFrames) {
        this.state = this.isGrounded() ? FIGHTER_STATE.IDLE : FIGHTER_STATE.JUMP;
        this.stateFrame = 0;
      }
      this._syncMesh();
      return;
    }

    // 3Dサイドステップ（奥・手前への素早い回り込み）
    if (this.state === FIGHTER_STATE.SIDESTEP) {
      this.faceTarget(opponent);
      const t = this.stateFrame / FIGHTER_STATS.SIDESTEP_FRAMES;
      const taper = Math.max(0.35, 1.25 - t * 0.8);
      const spd = FIGHTER_STATS.SIDESTEP_BURST_SPEED * this.speedScale * taper;
      this.position.x += this.sidestepVec.x * spd * dt;
      this.position.z += this.sidestepVec.z * spd * dt;
      this._applyKnockbackAndGravity(dt);
      this._checkRingOut(callbacks);

      // ステップ終盤(10F以降)は攻撃・投げ・必殺技へ即キャンセル可能
      if (this.state !== FIGHTER_STATE.FALL && this.stateFrame >= 10) {
        if (input.specialSlot && this.canUseSpecial(input.specialSlot)) {
          this._startSpecial(input.specialSlot, callbacks);
          this._syncMesh();
          return;
        }
        if (input.throwPressed) {
          this.forcedThrowId = null;
          this._startMove(MOVES.THROW, FIGHTER_STATE.THROW_ATTEMPT, callbacks);
          this._syncMesh();
          return;
        }
        if (input.attackId && MOVES[input.attackId]) {
          this._startMove(MOVES[input.attackId], FIGHTER_STATE.ATTACK, callbacks);
          this._syncMesh();
          return;
        }
      }

      if (this.state !== FIGHTER_STATE.FALL && this.stateFrame >= FIGHTER_STATS.SIDESTEP_FRAMES) {
        this.state = this.isGrounded() ? FIGHTER_STATE.IDLE : FIGHTER_STATE.JUMP;
        this.stateFrame = 0;
      }
      this._syncMesh();
      return;
    }

    // 必殺技実行中（PROJECTILE / BUFF_AOE / STRETCH / RUSH_SPIN）
    if (this.state === FIGHTER_STATE.SPECIAL && this.currentSkill) {
      const sk = this.currentSkill;
      if (sk.gimmick === 'PROJECTILE' || sk.gimmick === 'BUFF_AOE') {
        if (!this.skillProjectileFired && this.stateFrame >= sk.startupFrames) {
          this.skillProjectileFired = true;
          if (sk.gimmick === 'PROJECTILE' && callbacks.onSpawnProjectile) {
            callbacks.onSpawnProjectile(this, opponent, sk);
          } else if (sk.gimmick === 'BUFF_AOE' && callbacks.onBuffAoe) {
            callbacks.onBuffAoe(this, opponent, sk);
          }
        }
        const total = sk.startupFrames + (sk.activeFrames || 0) + sk.recoveryFrames;
        this._applyKnockbackAndGravity(dt);
        this._checkRingOut(callbacks);
        if (this.state !== FIGHTER_STATE.FALL && this.stateFrame >= total) {
          this.currentSkill = null;
          this.state = FIGHTER_STATE.IDLE;
          this.stateFrame = 0;
        }
        this._syncMesh();
        return;
      }

      // STRETCH / RUSH_SPIN
      const activeEnd = sk.startupFrames + sk.activeFrames;
      const total = activeEnd + sk.recoveryFrames;
      const moveStart = sk.lungeStartFrame ?? sk.startupFrames;
      const moveEnd = sk.lungeEndFrame ?? activeEnd;
      const moveSpd = sk.rushSpeed || sk.lungeSpeed || 0;

      if (moveSpd > 0 && this.stateFrame >= moveStart && this.stateFrame < moveEnd) {
        const fwdX = Math.sin(this.facingYaw);
        const fwdZ = Math.cos(this.facingYaw);
        this.position.x += fwdX * moveSpd * dt;
        this.position.z += fwdZ * moveSpd * dt;
      }

      if (sk.airArcPeak && this.stateFrame <= activeEnd) {
        const progress = Math.min(1, this.stateFrame / Math.max(1, activeEnd));
        this.position.y = Math.sin(progress * Math.PI) * sk.airArcPeak;
        if (!this.skillProjectileFired && this.stateFrame >= activeEnd - 2) {
          this.skillProjectileFired = true;
          this.position.y = 0;
          if (sk.onLandAoeRadius && callbacks.onBuffAoe) {
            callbacks.onBuffAoe(this, opponent, {
              ...sk,
              aoeRadius: sk.onLandAoeRadius,
              applyFrozen: true,
              frozenDuration: 1.5,
            });
          } else if (callbacks.onLand) {
            callbacks.onLand(this);
          }
        }
      } else {
        this._applyKnockbackAndGravity(dt);
      }

      this._checkRingOut(callbacks);
      if (this.state !== FIGHTER_STATE.FALL && this.stateFrame >= total) {
        this.currentSkill = null;
        this.state = this.isGrounded() ? FIGHTER_STATE.IDLE : FIGHTER_STATE.JUMP;
        this.stateFrame = 0;
      }
      this._syncMesh();
      return;
    }

    // 通常攻撃中
    if (this.state === FIGHTER_STATE.ATTACK && this.currentMove) {
      const m = this.currentMove;
      const totalFrames = m.startupFrames + m.activeFrames + m.recoveryFrames;
      if (m.isAir) {
        const airX = camRight.x * input.moveX + camForward.x * input.moveY;
        const airZ = camRight.z * input.moveX + camForward.z * input.moveY;
        this.position.x += airX * FIGHTER_STATS.WALK_SPEED_FORWARD * 0.85 * this.speedScale * dt;
        this.position.z += airZ * FIGHTER_STATS.WALK_SPEED_FORWARD * 0.85 * this.speedScale * dt;
        this._applyKnockbackAndGravity(dt);
        this._checkRingOut(callbacks);
        if (this.state !== FIGHTER_STATE.FALL && this.isGrounded()) {
          this.velocity.y = 0;
          this.position.y = 0;
          this.currentMove = null;
          this.moveHasHit = false;
          this.isCrouching = Boolean(input.crouch);
          this.state = this.isCrouching ? FIGHTER_STATE.CROUCH : FIGHTER_STATE.IDLE;
          this.stateFrame = 0;
          if (callbacks.onLand) callbacks.onLand(this);
          this._syncMesh();
          return;
        }
      } else {
        if (this.stateFrame <= m.startupFrames && !m.isCrouch) {
          const fwdX = Math.sin(this.facingYaw);
          const fwdZ = Math.cos(this.facingYaw);
          const stepSpeed = m.id.startsWith('HEAVY') ? 1.8 : 1.0;
          this.position.x += fwdX * stepSpeed * dt;
          this.position.z += fwdZ * stepSpeed * dt;
        }
        this._applyKnockbackAndGravity(dt);
        this._checkRingOut(callbacks);
      }

      if (this.state !== FIGHTER_STATE.FALL && this.stateFrame >= totalFrames) {
        this.currentMove = null;
        this.moveHasHit = false;
        this.isCrouching = Boolean(input.crouch) && this.isGrounded();
        this.state = !this.isGrounded()
          ? FIGHTER_STATE.JUMP
          : this.isCrouching
          ? FIGHTER_STATE.CROUCH
          : FIGHTER_STATE.IDLE;
        this.stateFrame = 0;
      }
      this._syncMesh();
      return;
    }

    // 投げモーション中
    if (this.state === FIGHTER_STATE.THROW_ATTEMPT) {
      const m = MOVES.THROW;
      const totalFrames = m.startupFrames + m.activeFrames + m.recoveryFrames;
      this._applyKnockbackAndGravity(dt);
      this._checkRingOut(callbacks);
      if (this.state !== FIGHTER_STATE.FALL && this.stateFrame >= totalFrames) {
        this.currentMove = null;
        this.moveHasHit = false;
        this.forcedThrowId = null;
        this.state = FIGHTER_STATE.IDLE;
        this.stateFrame = 0;
      }
      this._syncMesh();
      return;
    }

    // 空中（ジャンプ中）
    if (this.state === FIGHTER_STATE.JUMP) {
      this.isCrouching = false;
      this.faceTarget(opponent);
      if (input.attackId) {
        const airMove =
          input.attackId === 'LIGHT_KICK' || input.attackId === 'HEAVY_KICK'
            ? MOVES.JUMP_KICK
            : MOVES.JUMP_PUNCH;
        this._startMove(airMove, FIGHTER_STATE.ATTACK, callbacks);
        this._applyKnockbackAndGravity(dt);
        this._syncMesh();
        return;
      }

      const airX = camRight.x * input.moveX + camForward.x * input.moveY;
      const airZ = camRight.z * input.moveX + camForward.z * input.moveY;
      this.position.x += airX * FIGHTER_STATS.WALK_SPEED_FORWARD * 0.85 * this.speedScale * dt;
      this.position.z += airZ * FIGHTER_STATS.WALK_SPEED_FORWARD * 0.85 * this.speedScale * dt;

      this._applyKnockbackAndGravity(dt);
      this._checkRingOut(callbacks);
      if (this.state !== FIGHTER_STATE.FALL && this.isGrounded()) {
        this.velocity.y = 0;
        this.position.y = 0;
        this.isCrouching = Boolean(input.crouch);
        this.state = this.isCrouching ? FIGHTER_STATE.CROUCH : FIGHTER_STATE.IDLE;
        this.stateFrame = 0;
        if (callbacks.onLand) callbacks.onLand(this);
      }
      this._syncMesh();
      return;
    }

    // 地上行動可能状態
    this.faceTarget(opponent);
    this.isCrouching = Boolean(input.crouch);

    if (this.state === FIGHTER_STATE.GUARD && this.stunFrames > 0) {
      this.stunFrames -= 1;
      this._applyKnockbackAndGravity(dt);
      this._checkRingOut(callbacks);
      this._syncMesh();
      return;
    }

    // 優先度: 必殺技(Q/W) > 投げ(A) > 打撃(Z/X/C/V) > ガード(S) > ジャンプ > しゃがみ > 移動
    if (input.specialSlot && this.canUseSpecial(input.specialSlot)) {
      this._startSpecial(input.specialSlot, callbacks);
      this._syncMesh();
      return;
    }

    if (input.throwPressed) {
      this.forcedThrowId = this.isCrouching ? 'TOMOE_NAGE' : null;
      this._startMove(MOVES.THROW, FIGHTER_STATE.THROW_ATTEMPT, callbacks);
      this._syncMesh();
      return;
    }

    if (input.attackId && MOVES[input.attackId]) {
      let chosenMove = MOVES[input.attackId];
      if (this.isCrouching) {
        chosenMove =
          input.attackId === 'LIGHT_KICK' || input.attackId === 'HEAVY_KICK'
            ? MOVES.CROUCH_KICK
            : MOVES.CROUCH_PUNCH;
      }
      this._startMove(chosenMove, FIGHTER_STATE.ATTACK, callbacks);
      this._syncMesh();
      return;
    }

    if (input.guard) {
      if (this.state !== FIGHTER_STATE.GUARD) {
        this.state = FIGHTER_STATE.GUARD;
        this.stateFrame = 0;
      }
      this._applyKnockbackAndGravity(dt);
      this._checkRingOut(callbacks);
      this._syncMesh();
      return;
    }

    if (input.jump && this.isGrounded()) {
      this.isCrouching = false;
      this.state = FIGHTER_STATE.JUMP;
      this.stateFrame = 0;
      this.velocity.y = FIGHTER_STATS.JUMP_VELOCITY;
      if (callbacks.onJump) callbacks.onJump(this);
      this._applyKnockbackAndGravity(dt);
      this._syncMesh();
      return;
    }

    if (input.sidestepDir && this.isGrounded()) {
      this.isCrouching = false;
      this.sidestepDir = input.sidestepDir;
      this.sidestepVec.copy(camForward).multiplyScalar(input.sidestepDir);
      this.state = FIGHTER_STATE.SIDESTEP;
      this.stateFrame = 0;
      if (callbacks.onSidestep) callbacks.onSidestep(this);
      this._applyKnockbackAndGravity(dt);
      this._checkRingOut(callbacks);
      this._syncMesh();
      return;
    }

    if (this.isCrouching) {
      if (this.state !== FIGHTER_STATE.CROUCH) {
        this.state = FIGHTER_STATE.CROUCH;
        this.stateFrame = 0;
      }
      this._applyKnockbackAndGravity(dt);
      this._checkRingOut(callbacks);
      this._syncMesh();
      return;
    }

    // 移動入力
    const moveWorldX = camRight.x * input.moveX + camForward.x * input.moveY;
    const moveWorldZ = camRight.z * input.moveX + camForward.z * input.moveY;
    const mag = Math.hypot(moveWorldX, moveWorldZ);

    if (mag > 0.05) {
      const dirX = moveWorldX / mag;
      const dirZ = moveWorldZ / mag;
      const clampedMag = Math.min(1, mag);

      const fwdX = Math.sin(this.facingYaw);
      const fwdZ = Math.cos(this.facingYaw);
      const dot = dirX * fwdX + dirZ * fwdZ;
      const baseSpeed =
        (dot > 0.25
          ? FIGHTER_STATS.WALK_SPEED_FORWARD
          : dot < -0.25
          ? FIGHTER_STATS.WALK_SPEED_BACKWARD
          : FIGHTER_STATS.SIDESTEP_SPEED) *
        this.speedScale *
        (this.stealthTimer > 0 ? 1.32 : 1.0);

      this.position.x += dirX * baseSpeed * clampedMag * dt;
      this.position.z += dirZ * baseSpeed * clampedMag * dt;

      if (this.state !== FIGHTER_STATE.WALK) {
        this.state = FIGHTER_STATE.WALK;
        this.stateFrame = 0;
      }
    } else if (this.state !== FIGHTER_STATE.IDLE) {
      this.state = FIGHTER_STATE.IDLE;
      this.stateFrame = 0;
    }

    this._applyKnockbackAndGravity(dt);
    this._checkRingOut(callbacks);
    this._syncMesh();
  }

  _startMove(move, nextState, callbacks) {
    this.state = nextState;
    this.stateFrame = 0;
    this.currentMove = move;
    this.moveHasHit = false;
    if (callbacks.onSwing) {
      callbacks.onSwing(this, move);
    }
  }

  _startSpecial(slot, callbacks) {
    const skill = this.charSpec.skills[slot];
    if (!skill) return;
    this.isCrouching = false;
    this.state = FIGHTER_STATE.SPECIAL;
    this.stateFrame = 0;
    this.currentSkill = skill;
    this.skillProjectileFired = false;
    this.skillLastHitFrame = -999;
    if (slot === 'sp1') {
      this.sp1Cooldown = skill.cooldown;
    } else {
      this.sp2Cooldown = skill.cooldown;
    }
    const totalSec = (skill.startupFrames + (skill.activeFrames || 0) + skill.recoveryFrames) / 60;
    if (skill.invincibleDuringSkill) {
      this.invincibleTimer = Math.max(this.invincibleTimer, totalSec);
    }
    if (skill.stealthDuringSkill) {
      this.stealthTimer = Math.max(this.stealthTimer, totalSec * 0.85);
      this.rig.setStealth(true);
    }
    if (callbacks.onSpecialStart) {
      callbacks.onSpecialStart(this, skill);
    }
  }

  _applyKnockbackAndGravity(dt) {
    this.position.x += this.knockbackVel.x * dt;
    this.position.z += this.knockbackVel.z * dt;

    const decay = Math.exp(-8.5 * dt);
    this.knockbackVel.x *= decay;
    this.knockbackVel.z *= decay;
    if (Math.abs(this.knockbackVel.x) < 0.02) this.knockbackVel.x = 0;
    if (Math.abs(this.knockbackVel.z) < 0.02) this.knockbackVel.z = 0;

    if (!this.isGrounded() || this.velocity.y > 0) {
      this.velocity.y -= FIGHTER_STATS.GRAVITY * dt;
      this.position.y += this.velocity.y * dt;
      if (this.isWithinRingBounds() && this.position.y <= 0) {
        this.position.y = 0;
        this.velocity.y = 0;
      }
    }
  }

  _checkRingOut(callbacks) {
    if (!this.isWithinRingBounds() && this.position.y <= 0.15 && this.state !== FIGHTER_STATE.FALL) {
      this.state = FIGHTER_STATE.FALL;
      this.stateFrame = 0;
      this.currentMove = null;
      this.currentSkill = null;
      this.velocity.y = 1.8;
      if (callbacks.onRingOut) {
        callbacks.onRingOut(this);
      }
    }
  }

  isAttackActive() {
    if (!this.currentMove || this.moveHasHit) return false;
    if (this.state !== FIGHTER_STATE.ATTACK && this.state !== FIGHTER_STATE.THROW_ATTEMPT) {
      return false;
    }
    const m = this.currentMove;
    return this.stateFrame >= m.startupFrames && this.stateFrame < m.startupFrames + m.activeFrames;
  }

  isSkillHitActive() {
    if (this.state !== FIGHTER_STATE.SPECIAL || !this.currentSkill) return false;
    const sk = this.currentSkill;
    if (sk.gimmick === 'PROJECTILE' || sk.gimmick === 'BUFF_AOE') return false;
    const activeEnd = sk.startupFrames + sk.activeFrames;
    if (this.stateFrame < sk.startupFrames || this.stateFrame >= activeEnd) return false;
    const interval = sk.multiHitInterval || 99;
    return this.stateFrame - this.skillLastHitFrame >= interval;
  }

  getActiveHitSphere() {
    if (this.state === FIGHTER_STATE.SPECIAL && this.currentSkill) {
      const sk = this.currentSkill;
      if (sk.gimmick === 'STRETCH' && sk.limb) {
        this.rig.getLimbWorldPosition(sk.limb, this._limbPos);
        const fwdX = Math.sin(this.facingYaw);
        const fwdZ = Math.cos(this.facingYaw);
        this._limbPos.x += fwdX * (sk.reachOffset || 0.35);
        this._limbPos.z += fwdZ * (sk.reachOffset || 0.35);
        return { center: this._limbPos, radius: sk.hitboxRadius || 0.72 };
      }
      const fwdX = Math.sin(this.facingYaw);
      const fwdZ = Math.cos(this.facingYaw);
      this._limbPos.set(
        this.position.x + fwdX * 0.65,
        this.position.y + 1.0,
        this.position.z + fwdZ * 0.65
      );
      return { center: this._limbPos, radius: sk.hitboxRadius || 0.72 };
    }

    if (!this.currentMove) return null;
    this.rig.getLimbWorldPosition(this.currentMove.limb, this._limbPos);
    const fwdX = Math.sin(this.facingYaw);
    const fwdZ = Math.cos(this.facingYaw);
    this._limbPos.x += fwdX * this.currentMove.reachOffset * this.reachScale;
    this._limbPos.z += fwdZ * this.currentMove.reachOffset * this.reachScale;
    return {
      center: this._limbPos,
      radius: this.currentMove.hitboxRadius * this.reachScale,
    };
  }

  applyHit(moveOrSkill, attacker, isCounter = false) {
    const scale = attacker?.damageScale || 1;
    const rawDmg = (moveOrSkill.damage || 10) * scale;
    const dmg = Math.max(1, Math.round(rawDmg * (isCounter ? FIGHTER_STATS.COUNTER_HIT_MULTIPLIER : 1)));
    this.hp = Math.max(0, this.hp - dmg);
    this.currentMove = null;
    this.currentSkill = null;
    this.moveHasHit = false;
    this.hitFlashTimer = 0.14;

    const dirX = this.position.x - attacker.position.x;
    const dirZ = this.position.z - attacker.position.z;
    const len = Math.hypot(dirX, dirZ) || 1;
    if (moveOrSkill.pullTowardOwner) {
      // タング・スナイプ等: 相手を引き寄せる（近づきすぎないよう距離で制限）
      const pullForce = Math.min(len - 1.15, moveOrSkill.knockback || 4.0);
      const safePull = Math.max(0.5, pullForce) * 2.2;
      this.knockbackVel.set((-dirX / len) * safePull, 0, (-dirZ / len) * safePull);
    } else if (moveOrSkill.sideThrow) {
      // ギガ・バイト等: 噛みついて横方向（リング外側面寄り）へ放り投げる！
      const nx = dirX / len;
      const nz = dirZ / len;
      const sideSign = attacker.position.x >= 0 ? -1 : 1;
      const latX = -nz * sideSign;
      const latZ = nx * sideSign;
      const tx = latX * 0.88 + nx * 0.45;
      const tz = latZ * 0.88 + nz * 0.45;
      const tLen = Math.hypot(tx, tz) || 1;
      const kb = (moveOrSkill.knockback || 7.2) / this.weight;
      this.knockbackVel.set((tx / tLen) * kb, 0, (tz / tLen) * kb);
    } else {
      const kb = (moveOrSkill.knockback || 2.5) / this.weight;
      this.knockbackVel.set((dirX / len) * kb, 0, (dirZ / len) * kb);
    }

    if (this.hp <= 0) {
      this.state = FIGHTER_STATE.DOWN;
      this.stateFrame = 0;
      this.stunFrames = 999;
      return { dmg, ko: true, guarded: false };
    }

    this.state = FIGHTER_STATE.HIT;
    this.stateFrame = 0;
    this.stunFrames = moveOrSkill.hitstunFrames || 16;
    return { dmg, ko: false, guarded: false };
  }

  /**
   * スーパーアーマー中の被弾処理（HPダメージと白フラッシュのみ適用し、ひるみ・行動中断を起こさない）
   */
  applyArmoredHit(moveOrSkill, attacker) {
    const scale = attacker?.damageScale || 1;
    const dmg = Math.max(1, Math.round((moveOrSkill.damage || 6) * scale));
    this.hp = Math.max(0, this.hp - dmg);
    this.hitFlashTimer = 0.1;

    if (this.hp <= 0) {
      this.currentMove = null;
      this.currentSkill = null;
      this.moveHasHit = false;
      this.state = FIGHTER_STATE.DOWN;
      this.stateFrame = 0;
      this.stunFrames = 999;
      return { dmg, ko: true, armored: true };
    }
    return { dmg, ko: false, armored: true };
  }

  applyGuard(moveOrSkill, attacker) {
    const chip = FIGHTER_STATS.GUARD_CHIP_ENABLED
      ? Math.max(1, Math.round(moveOrSkill.damage * FIGHTER_STATS.GUARD_DAMAGE_MULTIPLIER))
      : 0;
    this.hp = Math.max(0, this.hp - chip);
    this.stunFrames = moveOrSkill.blockstunFrames || 10;

    const dirX = this.position.x - attacker.position.x;
    const dirZ = this.position.z - attacker.position.z;
    const len = Math.hypot(dirX, dirZ) || 1;
    const basePush = moveOrSkill.guardPushback ?? moveOrSkill.knockback * FIGHTER_STATS.GUARD_PUSHBACK_MULTIPLIER;
    const push = basePush / this.weight;
    this.knockbackVel.set((dirX / len) * push, 0, (dirZ / len) * push);

    return { dmg: chip, ko: this.hp <= 0, guarded: true };
  }

  startThrowExecute(variant, target) {
    this.faceTarget(target);
    this.state = FIGHTER_STATE.THROW_EXECUTE;
    this.stateFrame = 0;
    this.activeThrow = variant;
    this.throwSlammed = false;
    this.currentMove = null;
    this.currentSkill = null;
    this.moveHasHit = false;
    this.knockbackVel.set(0, 0, 0);
  }

  startThrown(variant, attacker) {
    this.state = FIGHTER_STATE.THROWN;
    this.stateFrame = 0;
    this.activeThrow = variant;
    this.throwOrigin.copy(attacker.position);
    this.throwYaw = attacker.facingYaw;
    this.facingYaw = attacker.facingYaw + Math.PI;
    this.currentMove = null;
    this.currentSkill = null;
    this.moveHasHit = false;
    this.knockbackVel.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.stunFrames = variant.durationFrames + 10;
  }

  applyThrowSlam(variant, damage) {
    const scaledDamage = Math.round(damage * 1.0);
    this.hp = Math.max(0, this.hp - scaledDamage);
    this.hitFlashTimer = 0.16;

    const fwdX = Math.sin(this.throwYaw) * variant.throwDir;
    const fwdZ = Math.cos(this.throwYaw) * variant.throwDir;
    const kb = variant.knockback / this.weight;
    this.knockbackVel.set(fwdX * kb, 0, fwdZ * kb);

    if (this.hp <= 0) {
      this.activeThrow = null;
      this.state = FIGHTER_STATE.DOWN;
      this.stateFrame = 0;
      this.stunFrames = 999;
      return { dmg: scaledDamage, ko: true };
    }
    return { dmg: scaledDamage, ko: false };
  }

  _updateThrownPosition() {
    if (!this.activeThrow) return;
    const t = Math.min(1, this.stateFrame / Math.max(1, this.activeThrow.slamFrame));
    const id = this.activeThrow.id;

    let fwd = 1.1;
    let right = 0;
    let up = 0;

    if (id === 'TOMOE_NAGE') {
      if (t < 0.45) {
        const p = t / 0.45;
        fwd = 1.15 - p * 0.85;
        up = p * 1.15;
      } else {
        const p = (t - 0.45) / 0.55;
        fwd = 0.3 - p * 2.05;
        up = 1.15 + Math.sin(p * Math.PI) * 1.05 - p * 1.05;
      }
    } else if (id === 'OSOTO_GARI') {
      fwd = 1.1 + t * 0.75;
      up = Math.sin(t * Math.PI) * 0.95;
    } else if (id === 'SEOI_NAGE') {
      if (t < 0.4) {
        const p = t / 0.4;
        fwd = 1.1 - p * 0.85;
        up = p * 1.25;
      } else {
        const p = (t - 0.4) / 0.6;
        fwd = 0.25 + p * 1.55;
        up = 1.25 + Math.sin(p * Math.PI) * 0.75 - p * 1.2;
      }
    } else if (id === 'KOSOTO_GARI') {
      fwd = 1.05 + t * 0.65;
      right = Math.sin(t * Math.PI) * 0.38;
      up = Math.sin(t * Math.PI) * 0.55;
    } else {
      if (t < 0.45) {
        const p = t / 0.45;
        fwd = 1.1 - p * 0.9;
        up = p * 1.65;
      } else if (t < 0.75) {
        const p = (t - 0.45) / 0.3;
        fwd = 0.2 + p * 0.25;
        up = 1.65 + p * 0.15;
      } else {
        const p = (t - 0.75) / 0.25;
        fwd = 0.45 + p * 1.4;
        up = 1.8 * (1 - p);
      }
    }

    const sinY = Math.sin(this.throwYaw);
    const cosY = Math.cos(this.throwYaw);
    const rightX = -cosY;
    const rightZ = sinY;

    this.position.x = this.throwOrigin.x + sinY * fwd + rightX * right;
    this.position.z = this.throwOrigin.z + cosY * fwd + rightZ * right;
    this.position.y = Math.max(0, up);
  }

  updateVisual(timeSec) {
    this._syncMesh();
    this.rig.updatePose(this, timeSec);
  }

  _syncMesh() {
    this.rig.root.position.copy(this.position);
    this.rig.root.rotation.y = this.facingYaw;
  }
}
