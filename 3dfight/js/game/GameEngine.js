import * as THREE from '../../vendor/three.module.min.js?v=20261123174047';
import {
  FIGHTER_STATE,
  FIGHTER_STATS,
  GAME_CONFIG,
  MOVES,
  THROW_VARIANTS,
} from '../config/constants.js?v=20261123174047';
import { CHARACTERS } from '../data/characters.js?v=20261123174047';
import { createStage } from './Stage.js?v=20261123174047';
import { Fighter } from './Fighter.js?v=20261123174047';
import { AnimalRig } from './AnimalRig.js?v=20261123174047';
import { ComAI } from './ComAI.js?v=20261123174047';
import { ParticleManager } from './Particles.js?v=20261123174047';
import { SkillSystem } from './SkillSystem.js?v=20261123174047';

/**
 * 3D格闘ゲームのメインエンジン
 * Three.js描画、固定タイムステップ物理・戦闘判定、必殺技ギミック、キャラ選択3Dプレビューを統括します。
 */
export class GameEngine {
  constructor(canvas, inputManager, soundEngine, hudManager, onMatchEnd) {
    this.canvas = canvas;
    this.input = inputManager;
    this.sound = soundEngine;
    this.hud = hudManager;
    this.onMatchEnd = onMatchEnd;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x69a7d6);
    this.scene.fog = new THREE.Fog(0x69a7d6, 36, 85);

    this.camera = new THREE.PerspectiveCamera(GAME_CONFIG.CAMERA_FOV, 16 / 9, 0.2, 140);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;

    this._setupLights();
    createStage(this.scene);

    this.particles = new ParticleManager(this.scene);
    this.skills = new SkillSystem(this.scene, this.particles, this.sound, this.hud);

    this.p1 = new Fighter('P1', CHARACTERS.GRIZZLY, this.scene);
    this.p2 = new Fighter('COM', CHARACTERS.GIRAFFE, this.scene);
    this.ai = new ComAI('NORMAL');
    this.bgm = null;
    this.endingPoseStyle = 'VICTORY_PROUD';

    this.phase = 'TITLE'; // TITLE | CHAR_SELECT | BRACKET | CHAMPION | EMERGENCY_EVENT | ENDING | ROUND_INTRO | FIGHTING | ROUND_END | MATCH_END | PAUSED
    this.phaseBeforePause = null;
    this.phaseTimer = 0;
    this.confettiTimer = 0;
    this.isTrueChampion = false;
    this.championIntrudeTimer = 0;
    this.onChampionIntrude = null;
    this.intruderRigs = [];
    this.intrudeAnimTime = 0;
    this.skipResultOverlay = false;
    this.roundNumber = 1;
    this.p1Wins = 0;
    this.p2Wins = 0;
    this.roundTimer = GAME_CONFIG.ROUND_TIME_SECONDS;
    this.hitstopFrames = 0;
    this.simTime = 0;
    this.accumulator = 0;
    this.lastTimestamp = 0;
    this.previewYaw = 0.25;

    this._camDir = new THREE.Vector3(0, 0.35, 1).normalize();
    this._camLook = new THREE.Vector3(0, 1.4, 0);
    this._camRight = new THREE.Vector3(1, 0, 0);
    this._camForward = new THREE.Vector3(0, 0, -1);
    this._shakePower = 0;

    this.hud.setFighterNames(this.p1.charSpec, this.p2.charSpec);
    this._resetPositions();
    this._rafId = 0;
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xfffbeb, 0x3b4252, 0.72);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xfff7ed, 1.15);
    dir.position.set(12, 22, 14);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    dir.shadow.camera.near = 2;
    dir.shadow.camera.far = 60;
    const d = 15;
    dir.shadow.camera.left = -d;
    dir.shadow.camera.right = d;
    dir.shadow.camera.top = d;
    dir.shadow.camera.bottom = -d;
    this.scene.add(dir);
  }

  resize(width, height) {
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setDifficulty(diff) {
    this.ai.setDifficulty(diff);
  }

  setStageScale(scale) {
    this.ai.setStageScale(scale);
  }

  setMatchEndHandler(fn) {
    this.onMatchEnd = fn;
  }

  setBgmManager(bgm) {
    this.bgm = bgm;
  }

  _setSkyHex(hex) {
    this.scene.background.setHex(hex);
    if (this.scene.fog) {
      this.scene.fog.color.setHex(hex);
    }
  }

  _syncBgm() {
    if (!this.bgm) return;
    const track = this.bgm.getTrackForState(
      this.phase,
      this.p1?.charSpec?.id,
      this.p2?.charSpec?.id,
      this.isTrueChampion
    );
    if (track) {
      this.bgm.playTrack(track, { loop: this.phase !== 'ENDING' });
    }
  }

  _clearIntruderRigs() {
    for (const item of this.intruderRigs) {
      item.rig.dispose(this.scene);
    }
    this.intruderRigs.length = 0;
  }

  setCharacters(p1Id, p2Id) {
    const p1Spec = CHARACTERS[p1Id] || CHARACTERS.GRIZZLY;
    const p2Spec = CHARACTERS[p2Id] || CHARACTERS.GIRAFFE;
    this.p1.setCharacter(p1Spec);
    this.p2.setCharacter(p2Spec);
    this.hud.setFighterNames(p1Spec, p2Spec);
    this.hud.updateBars(this.p1.hp, this.p2.hp, this.p1.maxHp, this.p2.maxHp);
    this.hud.updateSkillCooldowns(this.p1, this.p2);
    this.input.virtualPad.updateSkillButtons(0, 0, 'SP1', 'SP2');
  }

  openBracket() {
    this.phase = 'BRACKET';
    this._clearIntruderRigs();
    this._setSkyHex(0x69a7d6);
    if (this.bgm) this.bgm.setDucked(false);
    this.input.setGameplayActive(false);
    this.skills.clear([this.p1, this.p2]);
    this.particles.clear();
    this.hud.showBanner('');
    this.hud.showScreen('BRACKET');
    this.p1.rig.root.visible = true;
    this.p2.rig.root.visible = true;
    this._resetPositions();
    this._syncBgm();
  }

  /**
   * 優勝セレモニー／ヒーローインタビュー
   * オモテ全8戦制覇時 (isInterview = true): 上半身アップの公開インタビュー → Enterで「誰だ!!」→ 空から五獣降臨へ！
   * 裏制覇時 (isTrueChampion = true): 王冠＋紙吹雪の完全制覇セレモニー
   */
  openChampion({ isTrueChampion = false, isInterview = false } = {}) {
    this.phase = 'CHAMPION';
    this._clearIntruderRigs();
    this.isTrueChampion = Boolean(isTrueChampion);
    this.isInterview = Boolean(isInterview);
    this.interviewStep = 0;

    this._setSkyHex(isTrueChampion ? 0x1e3a8a : 0x69a7d6);
    if (this.bgm) this.bgm.setDucked(false);
    this.input.setGameplayActive(false);
    this.skills.clear([this.p1, this.p2]);
    this.particles.clear();
    this.hud.showBanner('');
    if (this.isInterview) {
      this.hud.setChampionInterview(this.p1.charSpec, 0);
    } else {
      this.hud.setChampion(this.p1.charSpec, this.isTrueChampion);
    }
    this.hud.showScreen('CHAMPION');
    this.previewYaw = 0.25;
    this.confettiTimer = 0.1;
    this.p1.reset(0, 0, this.previewYaw);
    this.p1.state = FIGHTER_STATE.VICTORY;
    this.p1.rig.root.visible = true;
    this.p2.rig.root.visible = false;
    this.p2.rig.groundShadow.visible = false;
    this.particles.spawnConfetti(this.p1.position, this.isTrueChampion ? 64 : 44);
    this.sound.playAnnounce('win');
    this._syncBgm();
  }

  /**
   * ヒーローインタビュー進行（Step 0 -> Step 1 不穏な沈黙 -> 「誰だ!!」EMERGENCY!へ）
   */
  advanceChampionInterview() {
    if (this.phase !== 'CHAMPION' || !this.isInterview) return;
    if (this.interviewStep === 0) {
      this.interviewStep = 1;
      this.hud.setChampionInterview(this.p1.charSpec, 1);
      this._setSkyHex(0x334155);
      if (this.bgm) this.bgm.stop();
      return;
    }
    this.openEmergencyIntrusion();
  }

  /**
   * Phase 4 絶望の緊急乱入 (EMERGENCY!!) — 誰だ!! → 空から五獣降臨 → 斜め上見下ろし2秒 → 後ろ姿へズームイン！
   */
  openEmergencyIntrusion() {
    this.phase = 'EMERGENCY_EVENT';
    this.isInterview = false;
    this._clearIntruderRigs();
    this._setSkyHex(0x060312);
    if (this.bgm) this.bgm.setDucked(false);
    this.input.setGameplayActive(false);
    this.skills.clear([this.p1, this.p2]);
    this.particles.clear();
    this.hud.showBanner('');
    this.hud.setEmergencyStage('SUBTITLE', this.p1.charSpec.name);
    this.hud.showScreen('EMERGENCY_EVENT');

    this.intrudeAnimTime = 0;
    this.emergencyAlertShown = false;
    this.p1.reset(0, 3.6, Math.PI);
    this.p1.state = FIGHTER_STATE.IDLE;
    this.p1.rig.root.visible = true;
    this.p2.rig.root.visible = false;
    this.p2.rig.groundShadow.visible = false;

    const lineup = [
      { id: 'TIGER', x: -4.2, z: -3.2, delay: 0.25 },
      { id: 'LION', x: -2.1, z: -3.8, delay: 0.45 },
      { id: 'POLAR_KING', x: 0, z: -4.6, delay: 0.1 },
      { id: 'ELEPHANT', x: 2.2, z: -3.8, delay: 0.65 },
      { id: 'RHINO', x: 4.3, z: -3.2, delay: 0.85 },
    ];
    for (const slot of lineup) {
      const spec = CHARACTERS[slot.id];
      if (!spec) continue;
      const rig = new AnimalRig(spec, false);
      rig.root.position.set(slot.x, 14.5, slot.z);
      rig.root.rotation.y = Math.atan2(-slot.x, 3.6 - slot.z);
      this.scene.add(rig.root);
      this.scene.add(rig.groundShadow);
      this.intruderRigs.push({
        rig,
        targetZ: slot.z,
        delay: slot.delay,
        landed: false,
        dummy: {
          position: rig.root.position,
          state: FIGHTER_STATE.JUMP,
          isCrouching: false,
          isWithinRingBounds: () => true,
        },
      });
    }

    this._shakePower = 0.25;
    this.sound.playAlert();
    this._syncBgm();
  }

  /**
   * 乱入カットシーンの早送り（直ちに全員着地 & EMERGENCY!! バナー出現状態へ進める）
   */
  skipEmergencyCutscene() {
    if (this.phase !== 'EMERGENCY_EVENT') return;
    if (this.intrudeAnimTime < 4.6) {
      this.intrudeAnimTime = 4.6;
      for (const item of this.intruderRigs) {
        item.rig.root.position.y = 0;
        item.dummy.state = FIGHTER_STATE.IDLE;
        if (!item.landed) {
          item.landed = true;
          this.particles.spawnDust(item.rig.root.position, 6);
        }
      }
      if (!this.emergencyAlertShown) {
        this.emergencyAlertShown = true;
        this.hud.setEmergencyStage('ALERT', this.p1.charSpec.name);
      }
    }
  }

  /**
   * 動物別シネマティックエンディング画面
   */
  openEnding(endingSpec) {
    this.phase = 'ENDING';
    this._clearIntruderRigs();
    this._setSkyHex(0x1e293b);
    if (this.bgm) this.bgm.setDucked(false);
    this.endingPoseStyle = endingSpec?.poseStyle || 'VICTORY_PROUD';
    this.input.setGameplayActive(false);
    this.skills.clear([this.p1, this.p2]);
    this.particles.clear();
    this.hud.showBanner('');
    this.hud.showScreen('ENDING');
    this.previewYaw = 0.35;
    this.p1.reset(0, 0, this.previewYaw);
    if (this.endingPoseStyle === 'STEALTH_FADE' && this.p1.charSpec.id === 'CHAMELEON') {
      this.p1.rig.setStealth(true);
    }
    this.p1.rig.root.visible = true;
    this.p2.rig.root.visible = false;
    this.p2.rig.groundShadow.visible = false;
    this._syncBgm();
  }

  /**
   * 検証・Phase 4テスト用：ボタン1回で相手HPを0にして1Pを即ラウンド勝利させる
   */
  debugInstantWinRound() {
    if (this.phase === 'ROUND_INTRO') {
      this.phase = 'FIGHTING';
      this.hud.showBanner('');
      this.input.setGameplayActive(true);
    }
    if (this.phase !== 'FIGHTING') return;
    this.p2.hp = 0;
    this.p2.state = FIGHTER_STATE.DOWN;
    this.p2.stateFrame = 0;
    this.hud.updateBars(this.p1.hp, 0, this.p1.maxHp, this.p2.maxHp);
    this.particles.spawnHitSparks(this.p2.position.clone().setY(1.0), 0xfacc15, 18);
    this._finishRound(this.p1, 'DEV WIN!');
  }

  openCharSelect() {
    this.phase = 'CHAR_SELECT';
    this._clearIntruderRigs();
    this.championIntrudeTimer = 0;
    this._setSkyHex(0x69a7d6);
    if (this.bgm) this.bgm.setDucked(false);
    this.input.setGameplayActive(false);
    this.skills.clear([this.p1, this.p2]);
    this.particles.clear();
    this.hud.showBanner('');
    this.hud.showScreen('CHAR_SELECT');
    this.previewYaw = 0.35;
    this.p1.reset(0, 1.8, this.previewYaw);
    this.p2.reset(3.2, 0, -Math.PI / 2);
    this.p1.rig.root.visible = true;
    this.p2.rig.root.visible = false;
    this.p2.rig.groundShadow.visible = false;
    this.hud.updateBars(this.p1.hp, this.p2.hp, this.p1.maxHp, this.p2.maxHp);
    this.hud.updateSkillCooldowns(this.p1, this.p2);
    this._syncBgm();
  }

  startLoop() {
    this.lastTimestamp = performance.now();
    const tick = (now) => {
      const rawDt = Math.min(0.05, Math.max(0, (now - this.lastTimestamp) / 1000));
      this.lastTimestamp = now;
      this._update(rawDt);
      this.renderer.render(this.scene, this.camera);
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  startMatch(difficulty) {
    if (difficulty) this.ai.setDifficulty(difficulty);
    this.roundNumber = 1;
    this.p1Wins = 0;
    this.p2Wins = 0;
    this.hud.updateRounds(0, 0);
    this.hud.showScreen('NONE');
    this._beginRound();
  }

  returnToTitle() {
    this.phase = 'TITLE';
    this._clearIntruderRigs();
    this.championIntrudeTimer = 0;
    this._setSkyHex(0x69a7d6);
    if (this.bgm) this.bgm.setDucked(false);
    this.input.setGameplayActive(false);
    this.skills.clear([this.p1, this.p2]);
    this.particles.clear();
    this.p1.rig.root.visible = true;
    this.p2.rig.root.visible = true;
    this.hud.showBanner('');
    this.hud.showScreen('TITLE');
    this.p1Wins = 0;
    this.p2Wins = 0;
    this.hud.updateRounds(0, 0);
    this._resetPositions();
    this.hud.updateBars(this.p1.hp, this.p2.hp, this.p1.maxHp, this.p2.maxHp);
    this.hud.updateSkillCooldowns(this.p1, this.p2);
    this.hud.updateTimer(GAME_CONFIG.ROUND_TIME_SECONDS);
    this._syncBgm();
  }

  togglePause() {
    if (this.phase === 'FIGHTING' || this.phase === 'ROUND_INTRO') {
      this.phaseBeforePause = this.phase;
      this.phase = 'PAUSED';
      if (this.bgm) this.bgm.setDucked(true);
      this.input.setGameplayActive(false);
      this.hud.showScreen('PAUSE');
    } else if (this.phase === 'PAUSED') {
      this.phase = this.phaseBeforePause || 'FIGHTING';
      this.phaseBeforePause = null;
      if (this.bgm) this.bgm.setDucked(false);
      this.input.setGameplayActive(this.phase === 'FIGHTING');
      this.hud.showScreen('NONE');
    }
  }

  forfeitMatch() {
    if (this.phase !== 'PAUSED' && this.phase !== 'FIGHTING' && this.phase !== 'ROUND_INTRO') {
      return;
    }
    this.phase = 'MATCH_END';
    this.phaseBeforePause = null;
    this.input.setGameplayActive(false);
    this.skills.clear([this.p1, this.p2]);
    this.hud.showBanner('');
    this.p1.state = FIGHTER_STATE.DOWN;
    this.p2.state = FIGHTER_STATE.VICTORY;
    this.p1.updateVisual(this.simTime);
    this.p2.updateVisual(this.simTime);
    this.hud.setResult(
      `${this.p2.charSpec.name} WINS!`,
      `棄権により試合終了（FORFEIT / ROUND ${this.p1Wins} - ${this.p2Wins}）`
    );
    this.hud.showScreen('RESULT');
    this.sound.playAnnounce('ko');
    if (this.onMatchEnd) this.onMatchEnd(false);
  }

  _beginRound() {
    this._clearIntruderRigs();
    this.championIntrudeTimer = 0;
    this._setSkyHex(0x69a7d6);
    if (this.bgm) this.bgm.setDucked(false);
    this.skills.clear([this.p1, this.p2]);
    this.particles.clear();
    this._resetPositions();
    this.ai.reset();
    this.roundTimer = GAME_CONFIG.ROUND_TIME_SECONDS;
    this.hitstopFrames = 0;
    this.phase = 'ROUND_INTRO';
    this.phaseTimer = 1.45;
    this.input.setGameplayActive(false);

    this.hud.updateBars(this.p1.hp, this.p2.hp, this.p1.maxHp, this.p2.maxHp);
    this.hud.updateSkillCooldowns(this.p1, this.p2);
    this.hud.updateTimer(this.roundTimer);
    this.hud.showBanner(`ROUND ${this.roundNumber}`, `${this.p1.charSpec.name} VS ${this.p2.charSpec.name}`);
    this.sound.playAnnounce('start');
    this._syncBgm();
  }

  _resetPositions() {
    this.p1.rig.root.visible = true;
    this.p2.rig.root.visible = true;
    this.p1.reset(-3.2, 0, Math.PI / 2);
    this.p2.reset(3.2, 0, -Math.PI / 2);
    this._camDir.set(0, 0.34, 1).normalize();
    this._camLook.set(0, 1.4, 0);
  }

  _update(rawDt) {
    if (this.phase === 'PAUSED') return;

    this.hud.tick(rawDt);

    if (this.phase === 'TITLE' || this.phase === 'BRACKET') {
      this.simTime += rawDt;
      this.p1.updateVisual(this.simTime);
      this.p2.updateVisual(this.simTime);
      this._updateTitleCamera(rawDt);
      return;
    }

    if (this.phase === 'CHAMPION') {
      this.simTime += rawDt;
      if (this.isInterview) {
        if (this.interviewStep === 0) {
          this.confettiTimer -= rawDt;
          if (this.confettiTimer <= 0) {
            this.confettiTimer = 0.85;
            this.particles.spawnConfetti(this.p1.position, 18);
          }
          this.p1.state = FIGHTER_STATE.VICTORY;
          this.p1.facingYaw = 0.25 + Math.sin(this.simTime * 0.7) * 0.08;
        } else {
          // Step 1: 不穏な空気を察してわずかに首を巡らせる
          this.p1.state = FIGHTER_STATE.IDLE;
          this.p1.facingYaw = 0.25 + Math.sin(this.simTime * 2.2) * 0.22;
        }
        this.p1.updateVisual(this.simTime);
        this.particles.update(rawDt);
        // ヒーローインタビュー用：背の高さに合わせて顔〜胸の上半身が丸ごと映る英雄画角
        const rigSpec = this.p1.charSpec.rig;
        const chestY = this.p1.rig.pelvisBaseY + rigSpec.torso[1] * 0.85 + rigSpec.neck[1] * 0.45;
        this.camera.position.set(0.4, chestY + 0.35, 3.35);
        this.camera.lookAt(0, chestY - 0.12, 0);
        return;
      }

      this.previewYaw += rawDt * 0.9;
      this.confettiTimer -= rawDt;
      if (this.confettiTimer <= 0) {
        this.confettiTimer = 0.85;
        this.particles.spawnConfetti(this.p1.position, 22);
      }
      this.p1.state = FIGHTER_STATE.VICTORY;
      this.p1.facingYaw = this.previewYaw;
      this.p1.updateVisual(this.simTime);
      this.particles.update(rawDt);
      const orbit = this.simTime * 0.35;
      this.camera.position.set(Math.sin(orbit) * 4.6, 2.3, Math.cos(orbit) * 4.6);
      this.camera.lookAt(0, 1.15, 0);
      return;
    }

    if (this.phase === 'EMERGENCY_EVENT') {
      this.simTime += rawDt;
      this.intrudeAnimTime += rawDt;
      const t = this.intrudeAnimTime;

      // 1) 空から覇者しろくま＆猛獣四天王が順番に降下着地！
      for (const item of this.intruderRigs) {
        const localT = Math.max(0, t - item.delay);
        const dropDuration = 0.75;
        if (localT < dropDuration) {
          const p = localT / dropDuration;
          item.rig.root.position.y = 14.5 * (1 - p * p);
          item.dummy.state = FIGHTER_STATE.JUMP;
        } else {
          item.rig.root.position.y = 0;
          item.dummy.state = FIGHTER_STATE.IDLE;
          if (!item.landed) {
            item.landed = true;
            this._shakePower = 0.36;
            this.particles.spawnDust(item.rig.root.position, 10);
            this.sound.playImpactLand();
          }
        }
        item.rig.updatePose(item.dummy, this.simTime);
      }

      this.p1.updateVisual(this.simTime);
      this.particles.update(rawDt);

      // 2) シネマティック・カメラ（0-2s: 後ろ姿が遠のき空を見上げる -> 2-4.6s: グルッと回り込み斜め上から2秒対峙 -> 4.6s~: EMERGENCY表示＋後ろ姿へグッと寄る）
      const lerp = (a, b, u) => a + (b - a) * Math.max(0, Math.min(1, u));
      let camX = 0;
      let camY = 1.6;
      let camZ = 5.4;
      let lookX = 0;
      let lookY = 1.4;
      let lookZ = -2.0;

      if (t < 2.0) {
        const u = 1 - Math.pow(1 - t / 2.0, 2);
        camX = lerp(0.55, -2.6, u);
        camY = lerp(1.55, 3.6, u);
        camZ = lerp(5.2, 8.8, u);
        lookX = 0;
        lookY = lerp(1.3, 2.2, u);
        lookZ = lerp(1.2, -3.0, u);
      } else if (t < 2.7) {
        const u = (t - 2.0) / 0.7;
        const smooth = u * u * (3 - 2 * u);
        const angle = lerp(-0.28, 0.56, smooth);
        const radius = lerp(9.2, 9.8, smooth);
        camX = Math.sin(angle) * radius;
        camZ = Math.cos(angle) * radius;
        camY = lerp(3.6, 5.8, smooth);
        lookY = lerp(2.0, 1.15, smooth);
        lookZ = lerp(-2.5, -0.8, smooth);
      } else if (t < 4.6) {
        const u = (t - 2.7) / 1.9;
        const angle = lerp(0.56, 0.5, u);
        camX = Math.sin(angle) * 9.8;
        camZ = Math.cos(angle) * 9.8;
        camY = lerp(5.8, 5.4, u);
        lookY = 1.15;
        lookZ = -0.8;
      } else {
        if (!this.emergencyAlertShown) {
          this.emergencyAlertShown = true;
          this.hud.setEmergencyStage('ALERT', this.p1.charSpec.name);
        }
        const u = Math.min(1, (t - 4.6) / 2.0);
        const ease = 1 - Math.pow(1 - u, 3);
        const startX = Math.sin(0.5) * 9.8;
        const startZ = Math.cos(0.5) * 9.8;
        camX = lerp(startX, 0.78, ease);
        camY = lerp(5.4, 1.56, ease);
        camZ = lerp(startZ, 5.45, ease);
        lookY = lerp(1.15, 1.48, ease);
        lookZ = lerp(-0.8, -3.5, ease);
      }

      const sx = this._shakePower > 0.005 ? (Math.random() - 0.5) * this._shakePower : 0;
      const sy = this._shakePower > 0.005 ? (Math.random() - 0.5) * this._shakePower * 0.6 : 0;
      this._shakePower *= Math.exp(-8 * rawDt);
      this.camera.position.set(camX + sx, camY + sy, camZ);
      this.camera.lookAt(lookX, lookY, lookZ);
      return;
    }

    if (this.phase === 'ENDING') {
      this.simTime += rawDt;
      const style = this.endingPoseStyle;
      if (style === 'SPIN_DANCE') {
        this.previewYaw += rawDt * 4.5;
        this.p1.state = FIGHTER_STATE.VICTORY;
      } else if (style === 'RUN_PROUD') {
        this.previewYaw += rawDt * 0.65;
        this.p1.state = FIGHTER_STATE.WALK;
      } else if (style === 'BOXING_TRAIN') {
        this.previewYaw = Math.sin(this.simTime * 1.4) * 0.55;
        this.p1.state = FIGHTER_STATE.WALK;
      } else if (style === 'CHILL_IDLE') {
        this.previewYaw = Math.sin(this.simTime * 0.7) * 0.35;
        this.p1.state = FIGHTER_STATE.IDLE;
      } else {
        this.previewYaw += rawDt * 0.45;
        this.p1.state = FIGHTER_STATE.VICTORY;
      }
      this.p1.position.set(0, 0, 1.2);
      this.p1.facingYaw = this.previewYaw;
      this.p1.updateVisual(this.simTime);
      this.particles.update(rawDt);
      this.camera.position.set(0, 1.75, 5.2);
      this.camera.lookAt(0, 0.85, 1.2);
      return;
    }

    if (this.phase === 'CHAR_SELECT') {
      this.simTime += rawDt;
      this.previewYaw += rawDt * 1.25;
      this.p1.position.set(0, 0, 1.8);
      this.p1.facingYaw = this.previewYaw;
      this.p1.state = FIGHTER_STATE.IDLE;
      this.p1.rig.root.visible = true;
      this.p2.rig.root.visible = false;
      this.p2.rig.groundShadow.visible = false;
      this.p1.updateVisual(this.simTime);
      this.camera.position.set(0, 2.05, 7.2);
      this.camera.lookAt(0, 1.05, 1.8);
      return;
    }

    if (this.phase === 'ROUND_INTRO') {
      this.phaseTimer -= rawDt;
      if (this.phaseTimer <= 0.45) {
        this.hud.showBanner('FIGHT!');
      }
      if (this.phaseTimer <= 0) {
        this.phase = 'FIGHTING';
        this.hud.showBanner('');
        this.input.setGameplayActive(true);
      }
    } else if (this.phase === 'ROUND_END') {
      this.phaseTimer -= rawDt;
      if (this.phaseTimer <= 0) {
        if (this.p1Wins >= GAME_CONFIG.WINS_REQUIRED || this.p2Wins >= GAME_CONFIG.WINS_REQUIRED) {
          this.phase = 'MATCH_END';
          this.input.setGameplayActive(false);
          this.skills.clear([this.p1, this.p2]);
          this.hud.showBanner('');
          const playerWon = this.p1Wins > this.p2Wins;
          const winnerName = playerWon ? this.p1.charSpec.name : this.p2.charSpec.name;
          const winnerFighter = playerWon ? this.p1 : this.p2;
          this.particles.spawnConfetti(winnerFighter.position, 32);
          if (this.onMatchEnd && this.onMatchEnd(playerWon)) {
            return;
          }
          this.hud.setResult(
            playerWon ? `${winnerName} WIN!` : `${winnerName} WINS!`,
            `ROUND ${this.p1Wins} - ${this.p2Wins} (${this.ai.difficulty})`
          );
          this.hud.showScreen('RESULT');
          this.sound.playAnnounce('win');
        } else {
          this.roundNumber += 1;
          this._beginRound();
        }
      }
    }

    this.accumulator += rawDt;
    const stepDt = GAME_CONFIG.FIXED_DT;
    while (this.accumulator >= stepDt) {
      this.accumulator -= stepDt;
      this._fixedStep(stepDt);
    }

    this.particles.update(rawDt);
    this._updateBattleCamera(rawDt);
  }

  _fixedStep(dt) {
    if (this.hitstopFrames > 0) {
      this.hitstopFrames -= 1;
      return;
    }

    this.simTime += dt;
    this._computeCameraMovementAxes();

    if (this.phase === 'FIGHTING') {
      this.roundTimer -= dt;
      this.hud.updateTimer(this.roundTimer);
      if (this.roundTimer <= 0) {
        this._resolveTimeOver();
      }
    }

    const activePlay = this.phase === 'FIGHTING';
    const emptyInput = {
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

    const p1Input = activePlay ? this.input.consumePlayerInput() : emptyInput;
    const p2Input = activePlay
      ? this.ai.decide(dt, this.p2, this.p1, this._camRight, this._camForward)
      : emptyInput;

    const callbacks = {
      onSwing: (_fighter, move) => {
        this.sound.playSwing(move.id.startsWith('HEAVY'));
      },
      onSpecialStart: (fighter, skill) => {
        this.sound.playRoar(fighter.charSpec.roarPitch || 130);
        this.sound.playSwing(true);
        this.hud.showCallout(`${skill.name}!`, 'throw');
      },
      onSpawnProjectile: (owner, target, skill) => {
        this.skills.spawnProjectile(owner, target, skill);
      },
      onBuffAoe: (owner, target, skill) => {
        this.skills.activateBuffAoe(owner, target, skill, (winner) => {
          if (this.phase === 'FIGHTING') {
            this._finishRound(winner, 'K.O.!');
          }
        });
      },
      onJump: (fighter) => {
        this.sound.playJump();
        this.particles.spawnDust(fighter.position, 4);
      },
      onSidestep: (fighter) => {
        this.sound.playSwing(false);
        this.particles.spawnDust(fighter.position, 5);
      },
      onLand: (fighter) => {
        this.particles.spawnDust(fighter.position, 5);
      },
      onRingOut: (loser) => {
        this.sound.playRingOut();
        this._shakePower = Math.max(this._shakePower, 0.35);
        if (this.phase === 'FIGHTING') {
          const winner = loser === this.p1 ? this.p2 : this.p1;
          this._finishRound(winner, 'RING OUT!');
        }
      },
      onThrowSlam: (attacker, defender, variant) => {
        const res = defender.applyThrowSlam(variant, MOVES.THROW.damage);
        this.hitstopFrames = MOVES.THROW.hitstopFrames;
        this._shakePower = Math.max(this._shakePower, 0.32);
        const slamPos = defender.position.clone();
        slamPos.y = Math.max(0.35, slamPos.y);
        this.particles.spawnHitSparks(slamPos, MOVES.THROW.sparkColor, 16);
        this.particles.spawnDust(defender.position, 8);
        this.sound.playHit(true);
        if (res.ko && this.phase === 'FIGHTING') {
          this._finishRound(attacker, 'K.O.!');
        }
      },
    };

    this.p1.step(dt, p1Input, this._camRight, this._camForward, this.p2, callbacks);
    this.p2.step(dt, p2Input, this._camRight, this._camForward, this.p1, callbacks);

    // 飛び道具（ヘッドスロー等）の更新
    this.skills.update(dt, this.phase === 'FIGHTING', (winner) => {
      if (this.phase === 'FIGHTING') {
        this._finishRound(winner, 'K.O.!');
      }
    });

    this._resolveBodyCollision();

    if (this.phase === 'FIGHTING') {
      this._resolveCombat();
    }

    this.hud.updateBars(this.p1.hp, this.p2.hp, this.p1.maxHp, this.p2.maxHp);
    this.hud.updateSkillCooldowns(this.p1, this.p2);
    this.input.virtualPad.updateSkillButtons(
      this.p1.sp1Cooldown,
      this.p1.sp2Cooldown,
      'SP1',
      'SP2'
    );

    this.p1.updateVisual(this.simTime);
    this.p2.updateVisual(this.simTime);
  }

  _computeCameraMovementAxes() {
    const viewDir = new THREE.Vector3()
      .subVectors(this._camLook, this.camera.position)
      .setY(0);
    if (viewDir.lengthSq() < 0.0001) {
      viewDir.set(0, 0, -1);
    } else {
      viewDir.normalize();
    }
    this._camForward.copy(viewDir);
    this._camRight.crossVectors(this._camForward, new THREE.Vector3(0, 1, 0)).normalize();
  }

  _resolveBodyCollision() {
    if (
      this.p1.state === FIGHTER_STATE.FALL ||
      this.p2.state === FIGHTER_STATE.FALL ||
      this.p1.state === FIGHTER_STATE.THROW_EXECUTE ||
      this.p2.state === FIGHTER_STATE.THROW_EXECUTE ||
      this.p1.state === FIGHTER_STATE.THROWN ||
      this.p2.state === FIGHTER_STATE.THROWN
    ) {
      return;
    }
    const dx = this.p2.position.x - this.p1.position.x;
    const dz = this.p2.position.z - this.p1.position.z;
    const dy = Math.abs(this.p2.position.y - this.p1.position.y);
    if (dy > 1.35) return;

    const minDist = FIGHTER_STATS.BODY_PUSH_RADIUS * 2;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.0001 && dist < minDist) {
      const overlap = (minDist - dist) * 0.5;
      const nx = dx / dist;
      const nz = dz / dist;
      this.p1.position.x -= nx * overlap;
      this.p1.position.z -= nz * overlap;
      this.p2.position.x += nx * overlap;
      this.p2.position.z += nz * overlap;
    }
  }

  _resolveCombat() {
    // 必殺技(STRETCH / RUSH_SPIN)判定
    if (this.p1.isSkillHitActive() && this._checkSkillHit(this.p1, this.p2)) {
      this._applySkillOutcome(this.p1, this.p2);
    }
    if (this.phase === 'FIGHTING' && this.p2.isSkillHitActive() && this._checkSkillHit(this.p2, this.p1)) {
      this._applySkillOutcome(this.p2, this.p1);
    }
    if (this.phase !== 'FIGHTING') return;

    const p1Active = this.p1.isAttackActive();
    const p2Active = this.p2.isAttackActive();

    const p1HitsP2 = p1Active ? this._checkHit(this.p1, this.p2) : false;
    const p2HitsP1 = p2Active ? this._checkHit(this.p2, this.p1) : false;

    if (p1HitsP2 && p2HitsP1) {
      const p1Throw = this.p1.currentMove?.id === 'THROW';
      const p2Throw = this.p2.currentMove?.id === 'THROW';
      if (p1Throw && !p2Throw) {
        this._applyAttackOutcome(this.p2, this.p1, true);
        return;
      }
      if (p2Throw && !p1Throw) {
        this._applyAttackOutcome(this.p1, this.p2, true);
        return;
      }
    }

    if (p1HitsP2) this._applyAttackOutcome(this.p1, this.p2, false);
    if (p2HitsP1 && this.phase === 'FIGHTING') this._applyAttackOutcome(this.p2, this.p1, false);
  }

  _checkSkillHit(attacker, defender) {
    if (
      defender.invincibleTimer > 0 ||
      defender.state === FIGHTER_STATE.DOWN ||
      defender.state === FIGHTER_STATE.FALL ||
      defender.state === FIGHTER_STATE.THROWN ||
      defender.state === FIGHTER_STATE.THROW_EXECUTE
    ) {
      return false;
    }
    const sphere = attacker.getActiveHitSphere();
    if (!sphere) return false;
    const hurtCenter = defender.getHurtboxCenter();
    const dx = sphere.center.x - hurtCenter.x;
    const dz = sphere.center.z - hurtCenter.z;
    const dy = Math.max(0, Math.abs(sphere.center.y - hurtCenter.y) - 0.55);
    const sumR = sphere.radius + FIGHTER_STATS.HURTBOX_RADIUS;
    return dx * dx + dy * dy + dz * dz <= sumR * sumR;
  }

  _applySkillOutcome(attacker, defender) {
    const sk = attacker.currentSkill;
    if (!sk) return;
    attacker.skillLastHitFrame = attacker.stateFrame;

    const hitPos = defender.getHurtboxCenter().clone();

    const canGuardSkill =
      !sk.unblockable &&
      defender.state === FIGHTER_STATE.GUARD &&
      (sk.hitType !== 'low' || defender.isCrouching);

    if (canGuardSkill) {
      attacker.comboCount = 0;
      const res = defender.applyGuard(sk, attacker);
      this.hitstopFrames = Math.max(2, Math.floor((sk.hitstopFrames || 4) * 0.6));
      this._shakePower = Math.max(this._shakePower, 0.14);
      this.particles.spawnHitSparks(hitPos, 0x38bdf8, 10);
      this.sound.playGuard();
      this.hud.showCallout('GUARD', 'guard');
      if (res.ko) this._finishRound(attacker, 'K.O.!');
      return;
    }

    const wasInHit = defender.state === FIGHTER_STATE.HIT;
    attacker.comboCount = wasInHit ? (attacker.comboCount || 1) + 1 : 1;

    // 多段ヒット技の終盤は強い吹き飛ばしを適用
    const activeEnd = sk.startupFrames + sk.activeFrames;
    const isFinalHit =
      !sk.multiHitInterval ||
      sk.multiHitInterval >= 90 ||
      attacker.stateFrame + sk.multiHitInterval >= activeEnd;
    const effectiveSkill =
      isFinalHit && sk.finalKnockback ? { ...sk, knockback: sk.finalKnockback } : sk;

    const res = defender.applyHit(effectiveSkill, attacker, false);
    this.hitstopFrames = sk.hitstopFrames || 4;
    this._shakePower = Math.max(this._shakePower, isFinalHit ? 0.28 : 0.14);
    this.particles.spawnHitSparks(hitPos, sk.sparkColor || 0xfacc15, isFinalHit ? 14 : 8);
    this.sound.playHit(isFinalHit);

    if (attacker.comboCount >= 2) {
      this.hud.showCallout(`${attacker.comboCount} HITS COMBO!`, 'counter');
    } else {
      this.hud.showCallout(`${sk.name}!!`, 'counter');
    }

    if (res.ko) {
      this._finishRound(attacker, 'K.O.!');
    }
  }

  _checkHit(attacker, defender) {
    if (
      defender.invincibleTimer > 0 ||
      defender.state === FIGHTER_STATE.DOWN ||
      defender.state === FIGHTER_STATE.FALL ||
      defender.state === FIGHTER_STATE.THROWN ||
      defender.state === FIGHTER_STATE.THROW_EXECUTE
    ) {
      return false;
    }

    const move = attacker.currentMove;
    if (!move) return false;

    if (move.id === 'THROW') {
      if (defender.position.y > 0.35) return false;
      if (defender.state === FIGHTER_STATE.ATTACK) return false;
      const dist = Math.hypot(
        defender.position.x - attacker.position.x,
        defender.position.z - attacker.position.z
      );
      return dist <= FIGHTER_STATS.THROW_RANGE;
    }

    const sphere = attacker.getActiveHitSphere();
    if (!sphere) return false;

    const defenderLow = defender.isCrouching || defender.state === FIGHTER_STATE.CROUCH || defender.lowProfile;
    if (move.hitType === 'high' && defenderLow && defender.position.y <= 0.1) {
      return false;
    }

    const hurtCenter = defender.getHurtboxCenter();
    const dx = sphere.center.x - hurtCenter.x;
    const dz = sphere.center.z - hurtCenter.z;
    const dy = Math.max(0, Math.abs(sphere.center.y - hurtCenter.y) - (defenderLow ? 0.35 : 0.55));
    const distSq = dx * dx + dy * dy + dz * dz;
    const sumR = sphere.radius + FIGHTER_STATS.HURTBOX_RADIUS;
    return distSq <= sumR * sumR;
  }

  _applyAttackOutcome(attacker, defender, forceCounter) {
    const move = attacker.currentMove;
    if (!move || attacker.moveHasHit) return;
    attacker.moveHasHit = true;

    const hitPos = defender.getHurtboxCenter().clone();

    if (move.id === 'THROW') {
      const wasGuarding = defender.state === FIGHTER_STATE.GUARD;
      const variant = attacker.forcedThrowId
        ? THROW_VARIANTS.find((v) => v.id === attacker.forcedThrowId) || THROW_VARIANTS[0]
        : THROW_VARIANTS[Math.floor(Math.random() * THROW_VARIANTS.length)];
      attacker.forcedThrowId = null;
      attacker.comboCount = 0;
      attacker.startThrowExecute(variant, defender);
      defender.startThrown(variant, attacker);
      this.sound.playThrow();
      this.hud.showCallout(
        wasGuarding ? `${variant.name}!! (ガード崩し)` : `${variant.name}!!`,
        'throw'
      );
      return;
    }

    const canGuardMove =
      defender.state === FIGHTER_STATE.GUARD &&
      (move.hitType !== 'low' || defender.isCrouching);

    if (canGuardMove) {
      attacker.comboCount = 0;
      const res = defender.applyGuard(move, attacker);
      this.hitstopFrames = Math.max(2, Math.floor(move.hitstopFrames * 0.6));
      this._shakePower = Math.max(this._shakePower, 0.08);
      this.particles.spawnHitSparks(hitPos, 0x38bdf8, 8);
      this.sound.playGuard();
      this.hud.showCallout('GUARD', 'guard');
      if (res.ko) {
        this._finishRound(attacker, 'K.O.!');
      }
      return;
    }

    const isLightMove =
      move.id === 'LIGHT_PUNCH' ||
      move.id === 'LIGHT_KICK' ||
      move.id === 'CROUCH_PUNCH' ||
      move.id === 'JUMP_PUNCH';

    if (
      defender.superArmor &&
      isLightMove &&
      defender.state !== FIGHTER_STATE.DOWN &&
      defender.state !== FIGHTER_STATE.FALL &&
      defender.state !== FIGHTER_STATE.HIT &&
      defender.state !== FIGHTER_STATE.FROZEN
    ) {
      attacker.comboCount = 0;
      const res = defender.applyArmoredHit(move, attacker);
      this.hitstopFrames = Math.max(2, Math.floor(move.hitstopFrames * 0.7));
      this._shakePower = Math.max(this._shakePower, 0.1);
      this.particles.spawnHitSparks(hitPos, 0xfacc15, 10);
      this.sound.playHit(false);
      this.hud.showCallout('ARMOR!', 'guard');
      if (res.ko) {
        this._finishRound(attacker, 'K.O.!');
      }
      return;
    }

    const wasInHit = defender.state === FIGHTER_STATE.HIT;
    attacker.comboCount = wasInHit ? (attacker.comboCount || 1) + 1 : 1;

    const isCounter =
      forceCounter ||
      defender.state === FIGHTER_STATE.ATTACK ||
      defender.state === FIGHTER_STATE.THROW_ATTEMPT ||
      defender.state === FIGHTER_STATE.SPECIAL;

    const res = defender.applyHit(move, attacker, isCounter);
    this.hitstopFrames = move.hitstopFrames;
    const isHeavy = move.id.startsWith('HEAVY') || move.id === 'CROUCH_KICK';
    this._shakePower = Math.max(this._shakePower, isHeavy ? 0.26 : 0.14);
    this.particles.spawnHitSparks(hitPos, move.sparkColor, isHeavy ? 14 : 9);
    this.sound.playHit(isHeavy);

    if (attacker.comboCount >= 2) {
      this.hud.showCallout(`${attacker.comboCount} HITS COMBO!`, 'counter');
    } else if (isCounter) {
      this.hud.showCallout('COUNTER!', 'counter');
    } else if (move.isAir) {
      this.hud.showCallout('AERIAL HIT!', 'hit');
    } else if (isHeavy) {
      this.hud.showCallout('HEAVY HIT!', 'hit');
    }

    if (res.ko) {
      this._finishRound(attacker, 'K.O.!');
    }
  }

  _resolveTimeOver() {
    if (this.phase !== 'FIGHTING') return;
    const p1Ratio = this.p1.hp / Math.max(1, this.p1.maxHp);
    const p2Ratio = this.p2.hp / Math.max(1, this.p2.maxHp);
    if (p1Ratio >= p2Ratio) {
      this._finishRound(this.p1, 'TIME OVER');
    } else {
      this._finishRound(this.p2, 'TIME OVER');
    }
  }

  _finishRound(winner, reasonText) {
    if (this.phase !== 'FIGHTING') return;
    this.phase = 'ROUND_END';
    this.phaseTimer = 2.0;
    this.input.setGameplayActive(false);

    if (winner === this.p1) {
      this.p1Wins += 1;
      if (this.p1.state !== FIGHTER_STATE.FALL) {
        this.p1.state = FIGHTER_STATE.VICTORY;
      }
    } else {
      this.p2Wins += 1;
      if (this.p2.state !== FIGHTER_STATE.FALL) {
        this.p2.state = FIGHTER_STATE.VICTORY;
      }
    }

    this.hud.updateRounds(this.p1Wins, this.p2Wins);
    this.hud.showBanner(reasonText, `${winner === this.p1 ? this.p1.charSpec.name : this.p2.charSpec.name} WINS THE ROUND`);
    this.sound.playAnnounce('ko');
  }

  _updateTitleCamera() {
    const angle = this.simTime * 0.28;
    const radius = 12.5;
    this.camera.position.set(Math.sin(angle) * radius, 5.2, Math.cos(angle) * radius);
    this.camera.lookAt(0, 1.3, 0);
  }

  _updateBattleCamera(dt) {
    const p1Pos = this.p1.position;
    const p2Pos = this.p2.position;

    const p1y = Math.max(-1.5, p1Pos.y);
    const p2y = Math.max(-1.5, p2Pos.y);
    const midX = (p1Pos.x + p2Pos.x) * 0.5;
    const midZ = (p1Pos.z + p2Pos.z) * 0.5;
    const midY = (p1y + p2y) * 0.5 + GAME_CONFIG.CAMERA_LOOK_Y;

    const dx = p2Pos.x - p1Pos.x;
    const dz = p2Pos.z - p1Pos.z;
    const sep = Math.hypot(dx, dz);

    if (sep > 0.6) {
      let perpX = -dz / sep;
      let perpZ = dx / sep;
      if (perpX * this._camDir.x + perpZ * this._camDir.z < 0) {
        perpX = -perpX;
        perpZ = -perpZ;
      }
      const blend = 1 - Math.exp(-3.5 * dt);
      this._camDir.x += (perpX - this._camDir.x) * blend;
      this._camDir.z += (perpZ - this._camDir.z) * blend;
      this._camDir.y = 0;
      this._camDir.normalize();
    }

    const desiredDist = Math.max(
      GAME_CONFIG.CAMERA_MIN_DIST,
      Math.min(GAME_CONFIG.CAMERA_MAX_DIST, sep * 1.15 + 5.8)
    );
    const desiredHeight = GAME_CONFIG.CAMERA_HEIGHT_BASE + sep * 0.14;

    const targetCamX = midX + this._camDir.x * desiredDist;
    const targetCamZ = midZ + this._camDir.z * desiredDist;
    const targetCamY = Math.max(2.6, midY + desiredHeight - 1.5);

    const smooth = 1 - Math.exp(-GAME_CONFIG.CAMERA_SMOOTHING * dt);
    this.camera.position.x += (targetCamX - this.camera.position.x) * smooth;
    this.camera.position.y += (targetCamY - this.camera.position.y) * smooth;
    this.camera.position.z += (targetCamZ - this.camera.position.z) * smooth;

    this._camLook.x += (midX - this._camLook.x) * smooth;
    this._camLook.y += (midY - this._camLook.y) * smooth;
    this._camLook.z += (midZ - this._camLook.z) * smooth;

    if (this._shakePower > 0.005) {
      const sx = (Math.random() - 0.5) * this._shakePower;
      const sy = (Math.random() - 0.5) * this._shakePower;
      this.camera.position.x += sx;
      this.camera.position.y += sy;
      this._shakePower *= Math.exp(-14 * dt);
    } else {
      this._shakePower = 0;
    }

    this.camera.lookAt(this._camLook);
  }
}
