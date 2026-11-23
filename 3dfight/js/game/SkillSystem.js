import * as THREE from '../../vendor/three.module.min.js?v=20261122222828';
import { FIGHTER_STATE, FIGHTER_STATS } from '../config/constants.js?v=20261122222828';

/**
 * 4種共通必殺技ギミック管理システム（PROJECTILE / STRETCH / RUSH_SPIN / BUFF_AOE）
 * 飛び道具の生成・移動・ブーメラン帰還・当たり判定および必殺技の共通ヒット処理を管理します。
 */
export class SkillSystem {
  constructor(scene, particles, sound, hud) {
    this.scene = scene;
    this.particles = particles;
    this.sound = sound;
    this.hud = hud;
    this.projectiles = [];
    this._tempPos = new THREE.Vector3();
  }

  clear(fighters = []) {
    for (const proj of this.projectiles) {
      this.scene.remove(proj.mesh);
    }
    this.projectiles.length = 0;

    for (const f of fighters) {
      if (f && f.rig) {
        f.rig.setHeadVisible(true);
        f.rig.setJoeyVisible(true);
        f.headDetached = false;
      }
    }
  }

  _buildProjectileMesh(owner, skill) {
    if (skill.hidePart === 'head') {
      return owner.rig.createDetachedHeadMesh();
    }
    if (skill.projectileShape === 'ironBall') {
      // 袋から子カンガルーが投げつける重厚なローポリ鉄球
      const g = new THREE.Group();
      const sphere = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.32, 0),
        new THREE.MeshLambertMaterial({ color: 0x334155, flatShading: true })
      );
      g.add(sphere);
      const bandA = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.1, 0.1),
        new THREE.MeshLambertMaterial({ color: 0x64748b, flatShading: true })
      );
      g.add(bandA);
      const bandB = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.68, 0.1),
        new THREE.MeshLambertMaterial({ color: 0x64748b, flatShading: true })
      );
      g.add(bandB);
      return g;
    }
    if (skill.projectileShape === 'miniPenguin') {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.44, 0.28),
        new THREE.MeshLambertMaterial({ color: 0x1e293b, flatShading: true })
      );
      g.add(body);
      const belly = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.3, 0.04),
        new THREE.MeshLambertMaterial({ color: 0xf8fafc, flatShading: true })
      );
      belly.position.set(0, -0.02, 0.15);
      g.add(belly);
      const beak = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.08, 0.14),
        new THREE.MeshLambertMaterial({ color: 0xf97316, flatShading: true })
      );
      beak.position.set(0, 0.12, 0.19);
      g.add(beak);
      return g;
    }
    if (skill.projectileShape === 'mud') {
      // カバの水・泥塊ショットガンキューブ
      const g = new THREE.Group();
      const drop = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.32, 0.38),
        new THREE.MeshLambertMaterial({ color: 0x38bdf8, flatShading: true })
      );
      g.add(drop);
      const splash = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.24, 0.24),
        new THREE.MeshLambertMaterial({ color: 0xbae6fd, flatShading: true })
      );
      splash.position.set(0.08, 0.1, -0.06);
      g.add(splash);
      return g;
    }
    if (skill.projectileShape === 'spit') {
      // アルパカの最速ソニック・スピット弾
      const g = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.2, 0),
        new THREE.MeshLambertMaterial({ color: 0xf8fafc, flatShading: true })
      );
      core.scale.set(0.85, 0.85, 1.55);
      g.add(core);
      return g;
    }
    if (skill.projectileShape === 'roarRing') {
      // ライオン・キングロアの黄金リング衝撃波
      return new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.14, 6, 12),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
    }
    if (skill.projectileShape === 'iceBlock') {
      // しろくま・アブソリュートゼロの半透明氷塊
      return new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.85, 0.85),
        new THREE.MeshLambertMaterial({
          color: 0x7dd3fc,
          transparent: true,
          opacity: 0.78,
          flatShading: true,
        })
      );
    }
    return new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.42, 0.42),
      new THREE.MeshLambertMaterial({ color: skill.sparkColor || 0xfacc15, flatShading: true })
    );
  }

  /**
   * 飛び道具を発射する（ヘッドスロー / アイロンボールアタック / マーチ・オブ・ペンギンズ / マッド・ショットガン / ソニック・スピット）
   */
  spawnProjectile(owner, target, skill) {
    if (skill.hidePart === 'head') {
      owner.rig.setHeadVisible(false);
      owner.headDetached = true;
    } else if (skill.hidePart === 'joey') {
      owner.rig.setJoeyVisible(false);
    }

    const fwdX = Math.sin(owner.facingYaw);
    const fwdZ = Math.cos(owner.facingYaw);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const offsets = skill.lateralOffsets || [0];
    const fanAngles = skill.fanAngles || [0];
    const startY =
      skill.projectileShape === 'miniPenguin'
        ? 0.28
        : owner.position.y + owner.rig.pelvisBaseY + 0.55;

    for (const angleOffset of fanAngles) {
      const yaw = owner.facingYaw + angleOffset;
      const dirX = Math.sin(yaw);
      const dirZ = Math.cos(yaw);
      for (const lat of offsets) {
        const mesh = this._buildProjectileMesh(owner, skill);
        mesh.position.set(
          owner.position.x + dirX * 0.55 + rightX * lat,
          startY,
          owner.position.z + dirZ * 0.55 + rightZ * lat
        );
        mesh.rotation.y = yaw;
        this.scene.add(mesh);

        this.projectiles.push({
          owner,
          target,
          skill,
          mesh,
          dirX,
          dirZ,
          traveled: 0,
          returning: false,
          hasHit: false,
          life: 0,
          spin:
            skill.hidePart === 'head' ||
            skill.projectileShape === 'ironBall' ||
            skill.projectileShape === 'mud',
        });
      }
    }
  }

  update(dt, activeFighting, onKO) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life += dt;
      const spd = p.skill.speed || 13;

      if (p.spin) {
        p.mesh.rotation.y += dt * 16;
        p.mesh.rotation.x += dt * 10;
      } else if (p.skill.projectileShape === 'miniPenguin') {
        p.mesh.rotation.z = Math.sin(p.life * 22) * 0.18;
      }

      if (!p.returning) {
        const step = spd * dt;
        p.mesh.position.x += p.dirX * step;
        p.mesh.position.z += p.dirZ * step;
        p.traveled += step;

        // 相手との当たり判定
        if (activeFighting && !p.hasHit && this._checkProjectileHit(p)) {
          p.hasHit = true;
          this._applyProjectileOutcome(p, onKO);
          if (p.skill.boomerang) {
            p.returning = true;
          } else {
            this._removeProjectile(i);
            continue;
          }
        }

        if (p.traveled >= (p.skill.maxDist || 8.5) || p.life > 1.4) {
          if (p.skill.boomerang) {
            p.returning = true;
          } else {
            this._removeProjectile(i);
            continue;
          }
        }
      } else {
        // ブーメラン帰還（オーナーの首位置へ戻る）
        const homeX = p.owner.position.x;
        const homeY = p.owner.position.y + p.owner.rig.pelvisBaseY + 0.55;
        const homeZ = p.owner.position.z;
        const dx = homeX - p.mesh.position.x;
        const dy = homeY - p.mesh.position.y;
        const dz = homeZ - p.mesh.position.z;
        const dist = Math.hypot(dx, dy, dz);

        if (dist < 0.65 || p.life > 3.0) {
          this._removeProjectile(i);
          continue;
        }

        const retSpd = spd * 1.35;
        p.mesh.position.x += (dx / dist) * retSpd * dt;
        p.mesh.position.y += (dy / dist) * retSpd * dt;
        p.mesh.position.z += (dz / dist) * retSpd * dt;
      }
    }
  }

  _removeProjectile(index) {
    const p = this.projectiles[index];
    this.scene.remove(p.mesh);
    if (p.skill.hidePart === 'head' && p.owner && p.owner.rig) {
      p.owner.rig.setHeadVisible(true);
      p.owner.headDetached = false;
    } else if (p.skill.hidePart === 'joey' && p.owner && p.owner.rig) {
      p.owner.rig.setJoeyVisible(true);
    }
    this.projectiles.splice(index, 1);
  }

  _checkProjectileHit(p) {
    const def = p.target;
    if (
      def.invincibleTimer > 0 ||
      def.state === FIGHTER_STATE.DOWN ||
      def.state === FIGHTER_STATE.FALL ||
      def.state === FIGHTER_STATE.THROWN ||
      def.state === FIGHTER_STATE.THROW_EXECUTE
    ) {
      return false;
    }
    const hurt = def.getHurtboxCenter(this._tempPos);
    const dx = p.mesh.position.x - hurt.x;
    const dz = p.mesh.position.z - hurt.z;
    const dy = Math.max(0, Math.abs(p.mesh.position.y - hurt.y) - 0.55);
    const sumR = (p.skill.radius || 0.55) + FIGHTER_STATS.HURTBOX_RADIUS;
    return dx * dx + dy * dy + dz * dz <= sumR * sumR;
  }

  _applyProjectileOutcome(p, onKO) {
    const def = p.target;
    const atk = p.owner;
    const skill = p.skill;
    const hitPos = p.mesh.position.clone();

    if (def.state === FIGHTER_STATE.GUARD) {
      const res = def.applyGuard(skill, atk);
      this.particles.spawnHitSparks(hitPos, 0x38bdf8, 8);
      this.sound.playGuard();
      this.hud.showCallout('GUARD', 'guard');
      if (res.ko && onKO) onKO(atk);
      return;
    }

    const res = def.applyHit(skill, atk, false);
    this.particles.spawnHitSparks(hitPos, skill.sparkColor || 0xf59e0b, 14);
    this.sound.playHit(true);
    if (skill.applyFrozen && !res.ko) {
      def.state = FIGHTER_STATE.FROZEN;
      def.frozenTimer = skill.frozenDuration || 2.5;
      this.sound.playFreeze();
      this.hud.showCallout('FROZEN!!', 'counter');
    } else {
      this.hud.showCallout(`${skill.name}!!`, 'counter');
    }
    if (res.ko && onKO) onKO(atk);
  }

  /**
   * BUFF_AOE ギミック共通発動基盤（光学迷彩・周囲吹き飛ばし・地震・氷結等）
   */
  activateBuffAoe(owner, target, skill, onKO) {
    if (skill.stealthDuration) {
      owner.stealthTimer = skill.stealthDuration;
      owner.invincibleTimer = skill.invincibleDuration || skill.stealthDuration;
      owner.rig.setStealth(true);
      this.hud.showCallout(`${skill.name}!!`, 'guard');
      return;
    }
    if (skill.aoeRadius) {
      const dist = Math.hypot(target.position.x - owner.position.x, target.position.z - owner.position.z);
      this.particles.spawnHitSparks(owner.position.clone().setY(1.0), skill.sparkColor || 0xf8fafc, 24);
      if (skill.groundOnly && target.position.y > 0.35) {
        return;
      }
      if (
        dist <= skill.aoeRadius &&
        target.invincibleTimer <= 0 &&
        target.state !== FIGHTER_STATE.DOWN &&
        target.state !== FIGHTER_STATE.FALL &&
        target.state !== FIGHTER_STATE.THROWN
      ) {
        if (target.state === FIGHTER_STATE.GUARD && !skill.unblockable) {
          const res = target.applyGuard(skill, owner);
          this.sound.playGuard();
          this.hud.showCallout('GUARD', 'guard');
          if (res.ko && onKO) onKO(owner);
          return;
        }
        const res = target.applyHit(skill, owner, false);
        this.sound.playHit(true);
        this.hud.showCallout(`${skill.name}!!`, 'counter');
        if (skill.applyFrozen && !res.ko) {
          target.state = FIGHTER_STATE.FROZEN;
          target.frozenTimer = skill.frozenDuration || 2.0;
          this.sound.playFreeze();
        }
        if (res.ko && onKO) onKO(owner);
      }
    }
  }
}
