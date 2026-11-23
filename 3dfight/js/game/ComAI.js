import { AI_PROFILES, FIGHTER_STATE } from '../config/constants.js?v=20261122222828';

/**
 * COM（CPU）のステートマシン思考ルーチン
 * 難易度プロファイルと動物キャラクター別の aiProfile（得意間合い・必殺技傾向・警戒度）を統合します。
 */
export class ComAI {
  constructor(difficulty = 'NORMAL') {
    this.stageScale = 1.0;
    this.setDifficulty(difficulty);
    this.timer = 0;
    this.guardHoldTimer = 0;
    this.strafeDir = 1;
    this.currentMoveX = 0;
    this.currentMoveY = 0;
  }

  setDifficulty(difficulty) {
    this.difficulty = AI_PROFILES[difficulty] ? difficulty : 'NORMAL';
    this.profile = AI_PROFILES[this.difficulty];
  }

  /**
   * トーナメント進行度に応じた AI 強さ倍率 (0.7 / 1.0 / 1.25 等)
   */
  setStageScale(scale = 1.0) {
    this.stageScale = Math.max(0.5, Math.min(1.5, scale));
  }

  reset() {
    this.timer = 0;
    this.guardHoldTimer = 0;
    this.currentMoveX = 0;
    this.currentMoveY = 0;
  }

  decide(dt, self, opponent, camRight, camForward) {
    const out = {
      moveX: 0,
      moveY: 0,
      crouch: false,
      jump: false,
      guard: false,
      attackId: null,
      throwPressed: false,
      specialSlot: null,
      sidestepDir: 0,
    };

    const p = this.profile;
    const scale = this.stageScale || 1.0;
    const reactionInterval = p.reactionInterval / scale;
    const effAttackProb = Math.min(0.96, p.attackProb * scale);
    const ai = self.charSpec?.aiProfile || {
      preferredRange: 'MID',
      aggression: 0.6,
      guardRate: 0.35,
      sideStepRate: 0.25,
      sp1Weight: 0.35,
      sp2Weight: 0.35,
      ringEdgeAwareness: 0.7,
    };

    this.timer -= dt;
    if (this.guardHoldTimer > 0) {
      this.guardHoldTimer -= dt;
      out.guard = true;
    }

    const dx = opponent.position.x - self.position.x;
    const dz = opponent.position.z - self.position.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const toOppX = dx / dist;
    const toOppZ = dz / dist;
    const selfHpRatio = self.hp / Math.max(1, self.maxHp);

    // キャラ固有の警戒度に応じたリング際チェック
    const panicThreshold = p.ringEdgePanicDist + (1 - ai.ringEdgeAwareness) * 1.4;
    const nearEdge =
      Math.abs(self.position.x) > panicThreshold ||
      Math.abs(self.position.z) > panicThreshold;

    let desiredWorldX = 0;
    let desiredWorldZ = 0;

    if (nearEdge) {
      const centerLen = Math.hypot(self.position.x, self.position.z) || 1;
      desiredWorldX = -self.position.x / centerLen;
      desiredWorldZ = -self.position.z / centerLen;

      // 追い詰められた時のアルパカ毛玉爆発やSP2逆転優先
      if (dist < 2.6 && this.timer <= 0 && Math.random() < effAttackProb) {
        if (self.canUseSpecial('sp2') && Math.random() < ai.sp2Weight * 1.25) {
          out.specialSlot = 'sp2';
        } else {
          out.attackId = Math.random() < 0.5 ? 'HEAVY_KICK' : 'LIGHT_PUNCH';
        }
        this.timer = reactionInterval;
      }
    } else if (this.timer <= 0) {
      this.timer = reactionInterval * (0.75 + Math.random() * 0.5);

      const oppAttacking =
        opponent.state === FIGHTER_STATE.ATTACK ||
        opponent.state === FIGHTER_STATE.THROW_ATTEMPT ||
        opponent.state === FIGHTER_STATE.SPECIAL;

      // 相手攻撃時: 高サイドステップ率キャラ（フラミンゴ/カンガルー等）は3Dステップ回避も狙う
      if (oppAttacking && dist < 3.2) {
        const stepChance = ai.sideStepRate * 0.35 * scale;
        if (ai.sideStepRate >= 0.45 && Math.random() < stepChance && self.isGrounded()) {
          out.sidestepDir = Math.random() < 0.5 ? 1 : -1;
        } else {
          const effGuard = Math.min(0.88, ((p.guardProb + ai.guardRate) * 0.52) * scale);
          if (Math.random() < effGuard) {
            this.guardHoldTimer = 0.25 + Math.random() * 0.2;
            out.guard = true;
          }
        }
      }

      if (!out.guard && out.sidestepDir === 0) {
        const reachBonus = (self.reachScale || 1) - 1;
        // ピンチ時のコアラ等はSP2大暴れ、決勝AIは連携精度アップ
        const pinchSp2Boost = selfHpRatio < 0.45 && ai.preferredRange === 'CLOSE' ? 1.35 : 1.0;

        if (dist > 4.4) {
          // 遠距離: 遠くからプレッシャー、遠距離向けSP1（頭投げ・スピット・舌）
          desiredWorldX = ai.preferredRange === 'FAR' ? toOppX * 0.45 : toOppX;
          desiredWorldZ = ai.preferredRange === 'FAR' ? toOppZ * 0.45 : toOppZ;
          if (self.canUseSpecial('sp1') && Math.random() < ai.sp1Weight * effAttackProb) {
            out.specialSlot = 'sp1';
          } else if (self.canUseSpecial('sp2') && Math.random() < ai.sp2Weight * 0.45 * scale) {
            out.specialSlot = 'sp2';
          }
        } else if (dist > 1.95 + reachBonus) {
          // 中距離
          if (ai.preferredRange === 'FAR' && dist < 3.4) {
            desiredWorldX = -toOppX * 0.72;
            desiredWorldZ = -toOppZ * 0.72;
            if (self.canUseSpecial('sp1') && Math.random() < ai.sp1Weight * effAttackProb) {
              out.specialSlot = 'sp1';
            }
          } else if (
            ai.sideStepRate >= 0.55 &&
            Math.random() < ai.sideStepRate * 0.32 &&
            self.isGrounded()
          ) {
            out.sidestepDir = Math.random() < 0.5 ? 1 : -1;
          } else if (Math.random() < ai.sideStepRate * 0.65) {
            this.strafeDir = Math.random() < 0.5 ? 1 : -1;
            const perpX = -toOppZ * this.strafeDir;
            const perpZ = toOppX * this.strafeDir;
            desiredWorldX = toOppX * 0.55 + perpX * 0.85;
            desiredWorldZ = toOppZ * 0.55 + perpZ * 0.85;
          } else {
            desiredWorldX = toOppX;
            desiredWorldZ = toOppZ;
          }

          if (!out.specialSlot) {
            if (self.canUseSpecial('sp2') && Math.random() < ai.sp2Weight * effAttackProb * pinchSp2Boost) {
              out.specialSlot = 'sp2';
            } else if (self.canUseSpecial('sp1') && Math.random() < ai.sp1Weight * effAttackProb) {
              out.specialSlot = 'sp1';
            } else if (dist < 2.55 + reachBonus && Math.random() < effAttackProb * 0.65) {
              out.attackId = Math.random() < 0.6 ? 'HEAVY_KICK' : 'HEAVY_PUNCH';
            }
          }
        } else {
          // 近距離: 三すくみ＋キャラ固有主力必殺技
          if (opponent.state === FIGHTER_STATE.GUARD && Math.random() < p.throwProb * 1.65 * scale) {
            out.throwPressed = true;
          } else if (self.superArmor && self.canUseSpecial('sp2') && Math.random() < ai.sp2Weight * 0.95) {
            // カバは至近距離でガード不能ギガ・バイトを最優先！
            out.specialSlot = 'sp2';
          } else if (Math.random() < p.throwProb * 0.48 * scale && dist < 1.6) {
            out.throwPressed = true;
          } else if (self.canUseSpecial('sp1') && Math.random() < ai.sp1Weight * 0.58 * scale) {
            out.specialSlot = 'sp1';
          } else if (self.canUseSpecial('sp2') && Math.random() < ai.sp2Weight * 0.55 * pinchSp2Boost * scale) {
            out.specialSlot = 'sp2';
          } else if (Math.random() < effAttackProb * ai.aggression + 0.15) {
            const r = Math.random();
            if (r < 0.28) out.attackId = 'LIGHT_PUNCH';
            else if (r < 0.52) out.attackId = 'LIGHT_KICK';
            else if (r < 0.68) out.attackId = 'CROUCH_KICK';
            else if (r < 0.84) out.attackId = 'HEAVY_PUNCH';
            else out.attackId = 'HEAVY_KICK';
            if (out.attackId === 'CROUCH_KICK') out.crouch = true;
          } else {
            desiredWorldX = -toOppX * 0.4;
            desiredWorldZ = -toOppZ * 0.4;
          }
        }
      }

      this.currentMoveX = desiredWorldX * camRight.x + desiredWorldZ * camRight.z;
      this.currentMoveY = desiredWorldX * camForward.x + desiredWorldZ * camForward.z;
    } else if (nearEdge) {
      this.currentMoveX = desiredWorldX * camRight.x + desiredWorldZ * camRight.z;
      this.currentMoveY = desiredWorldX * camForward.x + desiredWorldZ * camForward.z;
    }

    out.moveX = this.currentMoveX;
    out.moveY = this.currentMoveY;
    return out;
  }
}
