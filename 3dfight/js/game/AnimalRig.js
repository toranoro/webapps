import * as THREE from '../../vendor/three.module.min.js?v=20261122222828';
import { FIGHTER_STATE } from '../config/constants.js?v=20261122222828';

/**
 * 動物キャラクター共通ローポリ・スケルトン（Phase 2 基盤）
 * キャラクター定義データ（rig / palette）に基づき造形・関節階層を動的生成し、
 * 通常技・しゃがみ・空中技・柔道投げ5種・必殺技（パーツ非表示/伸縮/突進回転）を統括します。
 */
export class AnimalRig {
  constructor(charSpec, isPlayerOne = true) {
    this.spec = charSpec;
    this.isPlayerOne = isPlayerOne;
    this.root = new THREE.Group();
    this.joints = {};
    this.markers = {};
    this.claws = [];
    this.materials = [];
    this.chameleonEyes = [];
    this.headGroup = null;
    this.joeyGroup = null;
    this.tongueGroup = null;
    this.jawGroup = null;
    this.woolGroup = null;
    this.trunkGroup = null;
    this.rhinoHornGroup = null;
    this.iceBlock = null;

    const r = charSpec.rig;
    this.pelvisBaseY = r.legUpper[1] + r.legLower[1] + 0.14;
    this._buildRig();
  }

  _mat(color) {
    const m = new THREE.MeshLambertMaterial({
      color,
      flatShading: true,
    });
    this.materials.push(m);
    return m;
  }

  _box(w, h, d, color, castShadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this._mat(color));
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    return mesh;
  }

  _buildRig() {
    const r = this.spec.rig;
    const p = this.spec.palette;

    // 足元丸影＋1P/COM識別リング（同キャラ対戦でも見分けやすくする）
    const shadowGroup = new THREE.Group();
    const shadowMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.58, 16),
      new THREE.MeshBasicMaterial({
        color: 0x090d16,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      })
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowGroup.add(shadowMesh);

    const teamRing = new THREE.Mesh(
      new THREE.RingGeometry(0.56, 0.66, 16),
      new THREE.MeshBasicMaterial({
        color: this.isPlayerOne ? 0x38bdf8 : 0xf87171,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
    );
    teamRing.rotation.x = -Math.PI / 2;
    teamRing.position.y = 0.005;
    shadowGroup.add(teamRing);
    shadowGroup.position.y = 0.03;
    this.groundShadow = shadowGroup;

    // 骨盤
    const pelvis = new THREE.Group();
    pelvis.position.set(0, this.pelvisBaseY, 0);
    this.root.add(pelvis);
    this.joints.pelvis = pelvis;

    const pelvisMesh = this._box(r.pelvis[0], r.pelvis[1], r.pelvis[2], p.primary);
    pelvis.add(pelvisMesh);

    const beltMesh = this._box(
      r.pelvis[0] + 0.03,
      0.09,
      r.pelvis[2] + 0.03,
      this.isPlayerOne ? p.belt : 0xdc2626
    );
    beltMesh.position.y = r.pelvis[1] * 0.45;
    pelvis.add(beltMesh);

    // 尻尾
    if (r.tailStyle === 'pom') {
      const tail = this._box(0.16, 0.16, 0.16, p.secondary);
      tail.position.set(0, 0.02, -r.pelvis[2] * 0.65);
      pelvis.add(tail);
    } else if (r.tailStyle === 'thin') {
      const tail = this._box(0.06, 0.34, 0.06, p.primary);
      tail.position.set(0, -0.08, -r.pelvis[2] * 0.65);
      tail.rotation.x = 0.45;
      pelvis.add(tail);
      const tuft = this._box(0.09, 0.1, 0.09, p.secondary);
      tuft.position.set(0, -0.22, -r.pelvis[2] * 0.65 - 0.12);
      pelvis.add(tuft);
    } else if (r.tailStyle === 'kangaroo') {
      const tailBase = this._box(0.18, 0.2, 0.48, p.primary);
      tailBase.position.set(0, -0.1, -r.pelvis[2] * 0.9);
      tailBase.rotation.x = 0.35;
      pelvis.add(tailBase);
      const tailTip = this._box(0.12, 0.14, 0.42, p.secondary);
      tailTip.position.set(0, -0.24, -r.pelvis[2] * 0.9 - 0.34);
      tailTip.rotation.x = 0.15;
      pelvis.add(tailTip);
    } else if (r.tailStyle === 'curled') {
      const tailA = this._box(0.09, 0.16, 0.24, p.primary);
      tailA.position.set(0, 0.04, -r.pelvis[2] * 0.8);
      pelvis.add(tailA);
      const tailSpiral = this._box(0.1, 0.22, 0.22, p.secondary);
      tailSpiral.position.set(0, 0.2, -r.pelvis[2] * 0.8 - 0.14);
      pelvis.add(tailSpiral);
    }

    // 胴体
    const torso = new THREE.Group();
    torso.position.set(0, r.pelvis[1] * 0.55, 0);
    pelvis.add(torso);
    this.joints.torso = torso;

    const chestMesh = this._box(r.torso[0], r.torso[1], r.torso[2], p.primary);
    chestMesh.position.y = r.torso[1] * 0.5;
    torso.add(chestMesh);

    // お腹の模様
    const bellyMesh = this._box(
      r.torso[0] * 0.58,
      r.torso[1] * 0.72,
      0.04,
      p.belly,
      false
    );
    bellyMesh.position.set(0, r.torso[1] * 0.48, r.torso[2] * 0.5 + 0.01);
    torso.add(bellyMesh);

    // カンガルーのお腹ポケット＆子カンガルー（SP1発射時は非表示）
    if (r.hasPouchJoey) {
      const pouch = this._box(r.torso[0] * 0.54, 0.18, 0.09, p.secondary);
      pouch.position.set(0, 0.14, r.torso[2] * 0.5 + 0.04);
      torso.add(pouch);

      const joey = new THREE.Group();
      joey.position.set(0, 0.25, r.torso[2] * 0.5 + 0.06);
      const jHead = this._box(0.14, 0.14, 0.14, p.primary);
      joey.add(jHead);
      [-1, 1].forEach((side) => {
        const jEar = this._box(0.04, 0.1, 0.04, p.primary);
        jEar.position.set(side * 0.05, 0.1, -0.02);
        joey.add(jEar);
        const jEye = this._box(0.03, 0.03, 0.02, p.eye, false);
        jEye.position.set(side * 0.035, 0.02, 0.075);
        joey.add(jEye);
      });
      torso.add(joey);
      this.joeyGroup = joey;
    }

    // キリン等の四角い斑点模様
    if (r.hasSpots) {
      const spotOffsets = [
        [-0.14, 0.38, r.torso[2] * 0.51],
        [0.14, 0.22, r.torso[2] * 0.51],
        [0.0, 0.42, -r.torso[2] * 0.51],
        [-0.16, 0.18, -r.torso[2] * 0.51],
      ];
      spotOffsets.forEach(([sx, sy, sz]) => {
        const spot = this._box(0.11, 0.11, 0.03, p.secondary, false);
        spot.position.set(sx, sy, sz);
        torso.add(spot);
      });
    }

    // タイガーの黒縞ストライプ模様
    if (r.hasStripes) {
      [0.2, 0.36, 0.48].forEach((sy) => {
        const bar = this._box(r.torso[0] + 0.03, 0.055, r.torso[2] + 0.03, p.secondary, false);
        bar.position.set(0, sy, 0);
        torso.add(bar);
      });
    }

    // サイの重装甲肩＆背中プレート
    if (r.hasRhinoHorn) {
      const armor = this._box(r.torso[0] * 1.06, 0.22, r.torso[2] * 1.06, p.secondary);
      armor.position.set(0, r.torso[1] * 0.78, 0);
      torso.add(armor);
    }

    // モコモコ羊毛クラスター（アルパカのウール・エクスプロージョンで3倍膨張）
    if (r.hasWool) {
      const woolGroup = new THREE.Group();
      woolGroup.position.set(0, r.torso[1] * 0.5, 0);
      const puffOffsets = [
        [0, 0.14, 0, r.torso[0] * 1.18, 0.42, r.torso[2] * 1.18],
        [0, -0.1, 0, r.torso[0] * 1.24, 0.36, r.torso[2] * 1.22],
        [r.torso[0] * 0.42, 0.08, 0, 0.24, 0.34, 0.34],
        [-r.torso[0] * 0.42, 0.08, 0, 0.24, 0.34, 0.34],
        [0, 0.04, r.torso[2] * 0.42, 0.36, 0.36, 0.24],
        [0, 0.04, -r.torso[2] * 0.42, 0.36, 0.36, 0.24],
      ];
      puffOffsets.forEach(([wx, wy, wz, ww, wh, wd], idx) => {
        const puff = this._box(ww, wh, wd, idx % 2 === 0 ? p.primary : p.secondary);
        puff.position.set(wx, wy, wz);
        woolGroup.add(puff);
      });
      torso.add(woolGroup);
      this.woolGroup = woolGroup;
    }

    // 首グループ（キリン・ランス／フラミンゴ・ネック・ウィップ等で伸縮）
    const neck = new THREE.Group();
    neck.position.set(0, r.torso[1], 0);
    torso.add(neck);
    this.joints.neck = neck;

    if (r.sNeck) {
      const lowerNeck = this._box(r.neck[0], r.neck[1] * 0.56, r.neck[2], p.primary);
      lowerNeck.position.set(0, r.neck[1] * 0.26, -0.05);
      lowerNeck.rotation.x = -0.26;
      neck.add(lowerNeck);

      const upperNeck = this._box(r.neck[0] * 0.92, r.neck[1] * 0.56, r.neck[2] * 0.92, p.secondary);
      upperNeck.position.set(0, r.neck[1] * 0.74, -0.02);
      upperNeck.rotation.x = 0.24;
      neck.add(upperNeck);
    } else {
      const neckMesh = this._box(r.neck[0], r.neck[1], r.neck[2], p.primary);
      neckMesh.position.y = r.neck[1] * 0.5;
      neck.add(neckMesh);
    }

    if (r.hasSpots && r.neck[1] > 0.3) {
      for (let i = 0; i < 3; i++) {
        const nSpot = this._box(0.08, 0.1, r.neck[2] + 0.02, p.secondary, false);
        nSpot.position.set(i % 2 === 0 ? 0.03 : -0.03, 0.16 + i * 0.22, 0);
        neck.add(nSpot);
      }
    }

    // 頭部グループ（グリズリーのヘッドスローで一時非表示化）
    const head = new THREE.Group();
    head.position.set(0, r.neck[1], 0);
    neck.add(head);
    this.joints.head = head;
    this.headGroup = head;

    this._populateHeadParts(head, r, p, true);

    const headTip = new THREE.Object3D();
    headTip.position.set(0, r.head[1] * 0.45, r.head[2] * 0.68);
    head.add(headTip);
    this.markers.headTip = headTip;

    // 腕部構築
    const shoulderX = r.torso[0] * 0.5 + r.armUpper[0] * 0.45;
    const shoulderY = r.torso[1] * 0.86;
    const buildArm = (side, prefix) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * shoulderX, shoulderY, 0);
      torso.add(shoulder);
      this.joints[`${prefix}Shoulder`] = shoulder;

      const upper = this._box(r.armUpper[0], r.armUpper[1], r.armUpper[2], p.primary);
      upper.position.y = -r.armUpper[1] * 0.5;
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.set(0, -r.armUpper[1], 0);
      shoulder.add(elbow);
      this.joints[`${prefix}Elbow`] = elbow;

      const lower = this._box(r.armLower[0], r.armLower[1], r.armLower[2], p.primary);
      lower.position.y = -r.armLower[1] * 0.5;
      elbow.add(lower);

      const fist = this._box(
        r.armLower[0] * (r.hasBoxingGloves ? 1.55 : 1.08),
        r.armLower[0] * (r.hasBoxingGloves ? 1.45 : 1.08),
        r.armLower[2] * (r.hasBoxingGloves ? 1.65 : 1.08),
        r.hasBoxingGloves ? p.glove || 0xdc2626 : p.secondary
      );
      fist.position.y = -r.armLower[1] - r.armLower[0] * 0.4;
      elbow.add(fist);

      // コアラ等の鋭い爪パーツ
      if (r.hasClaws) {
        const clawGroup = new THREE.Group();
        clawGroup.position.set(0, -r.armLower[1] - r.armLower[0] * 0.75, 0.02);
        for (let cIdx = -1; cIdx <= 1; cIdx++) {
          const claw = this._box(0.032, 0.2, 0.04, p.claw);
          claw.position.set(cIdx * 0.045, -0.09, 0);
          clawGroup.add(claw);
        }
        elbow.add(clawGroup);
        this.claws.push(clawGroup);
      }

      const marker = new THREE.Object3D();
      marker.position.set(0, -r.armLower[1] - (r.hasClaws ? 0.25 : 0.12), 0.04);
      elbow.add(marker);
      this.markers[`${prefix}Hand`] = marker;
    };

    buildArm(-1, 'right');
    buildArm(1, 'left');

    // 脚部構築
    const hipX = r.pelvis[0] * 0.32;
    const buildLeg = (side, prefix) => {
      const hip = new THREE.Group();
      hip.position.set(side * hipX, -r.pelvis[1] * 0.3, 0);
      pelvis.add(hip);
      this.joints[`${prefix}Hip`] = hip;

      const thigh = this._box(r.legUpper[0], r.legUpper[1], r.legUpper[2], p.primary);
      thigh.position.y = -r.legUpper[1] * 0.5;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.set(0, -r.legUpper[1], 0);
      hip.add(knee);
      this.joints[`${prefix}Knee`] = knee;

      const shin = this._box(r.legLower[0], r.legLower[1], r.legLower[2], p.primary);
      shin.position.y = -r.legLower[1] * 0.5;
      knee.add(shin);

      const foot = this._box(r.legLower[0] * 1.05, 0.12, r.legLower[2] + 0.12, p.secondary);
      foot.position.set(0, -r.legLower[1] - 0.04, 0.06);
      knee.add(foot);

      const marker = new THREE.Object3D();
      marker.position.set(0, -r.legLower[1] - 0.05, 0.18);
      knee.add(marker);
      this.markers[`${prefix}Foot`] = marker;
    };

    buildLeg(-1, 'right');
    buildLeg(1, 'left');

    // Phase 4 FROZEN 状態異常用の半透明氷漬けキューブ
    this.iceBlock = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 1.95, 1.05),
      new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.45,
        wireframe: false,
      })
    );
    this.iceBlock.position.set(0, 1.0, 0);
    this.iceBlock.visible = false;
    this.root.add(this.iceBlock);
  }

  setStealth(enabled) {
    for (const m of this.materials) {
      m.transparent = Boolean(enabled);
      m.opacity = enabled ? 0.32 : 1.0;
      m.wireframe = Boolean(enabled);
    }
  }

  _populateHeadParts(head, r, p, isMainHead = false) {
    const [hw, hh, hd] = r.head;
    const headMesh = this._box(hw, hh, hd, p.primary);
    headMesh.position.y = hh * 0.5;
    head.add(headMesh);

    if (r.hasWool) {
      const tuft = this._box(hw * 0.84, 0.14, hd * 0.84, p.primary);
      tuft.position.set(0, hh + 0.05, 0);
      head.add(tuft);
    }

    // 口元・鼻
    if (r.noseStyle === 'koala') {
      const nose = this._box(0.14, 0.18, 0.08, p.nose, false);
      nose.position.set(0, hh * 0.44, hd * 0.5 + 0.03);
      head.add(nose);
    } else if (r.noseStyle === 'beak') {
      const beak = this._box(hw * 0.42, hh * 0.26, 0.18, p.nose, false);
      beak.position.set(0, hh * 0.38, hd * 0.5 + 0.08);
      head.add(beak);
    } else if (r.noseStyle === 'flamingo') {
      const upperBeak = this._box(hw * 0.44, hh * 0.28, 0.18, p.muzzle, false);
      upperBeak.position.set(0, hh * 0.44, hd * 0.5 + 0.08);
      head.add(upperBeak);
      const hookTip = this._box(hw * 0.38, hh * 0.42, 0.12, p.nose, false);
      hookTip.position.set(0, hh * 0.22, hd * 0.5 + 0.16);
      hookTip.rotation.x = 0.25;
      head.add(hookTip);
    } else if (r.noseStyle === 'hippo') {
      const upperSnout = this._box(hw * 0.96, hh * 0.46, hd * 0.58, p.muzzle, false);
      upperSnout.position.set(0, hh * 0.48, hd * 0.5 + 0.18);
      head.add(upperSnout);
      [-1, 1].forEach((side) => {
        const nostril = this._box(0.08, 0.07, 0.05, p.nose, false);
        nostril.position.set(side * hw * 0.24, hh * 0.62, hd * 0.5 + 0.46);
        head.add(nostril);
      });
      const mouthInner = this._box(hw * 0.72, 0.12, hd * 0.46, p.mouthInner || 0xf43f5e, false);
      mouthInner.position.set(0, hh * 0.26, hd * 0.5 + 0.14);
      head.add(mouthInner);

      const jaw = new THREE.Group();
      jaw.position.set(0, hh * 0.22, hd * 0.22);
      const lowerJaw = this._box(hw * 0.9, hh * 0.24, hd * 0.62, p.secondary, false);
      lowerJaw.position.set(0, -0.04, hd * 0.34);
      jaw.add(lowerJaw);
      [-1, 1].forEach((side) => {
        const fang = this._box(0.07, 0.14, 0.07, p.fang || 0xf8fafc, false);
        fang.position.set(side * hw * 0.3, 0.1, hd * 0.56);
        jaw.add(fang);
      });
      head.add(jaw);
      if (isMainHead) {
        this.jawGroup = jaw;
      }
    } else {
      const muzzle = this._box(hw * 0.56, hh * 0.44, 0.12, p.muzzle, false);
      muzzle.position.set(0, hh * 0.34, hd * 0.5 + 0.04);
      head.add(muzzle);
      const noseTip = this._box(0.09, 0.07, 0.05, p.nose, false);
      noseTip.position.set(0, hh * 0.44, hd * 0.5 + 0.1);
      head.add(noseTip);
    }

    // 目
    if (r.eyeStyle === 'chameleon') {
      [-1, 1].forEach((side) => {
        const turret = new THREE.Group();
        turret.position.set(side * (hw * 0.45), hh * 0.68, hd * 0.25);
        const bulge = this._box(0.12, 0.12, 0.12, p.eye, false);
        turret.add(bulge);
        const pupil = this._box(0.05, 0.05, 0.03, 0x0f172a, false);
        pupil.position.set(0, 0, 0.065);
        turret.add(pupil);
        head.add(turret);
        if (isMainHead) {
          this.chameleonEyes.push(turret);
        }
      });
    } else {
      [-1, 1].forEach((side) => {
        const eye = this._box(0.06, 0.06, 0.04, p.eye, false);
        eye.position.set(side * hw * 0.25, hh * 0.64, hd * 0.5 + 0.01);
        head.add(eye);
      });
    }

    // 伸縮するピンク色の舌（カメレオン用）
    if (r.hasTongue && !this.tongueGroup) {
      const tongue = new THREE.Group();
      tongue.position.set(0, hh * 0.3, hd * 0.5);
      const tMesh = this._box(0.08, 0.06, 0.5, p.tongue || 0xf472b6, false);
      tMesh.position.set(0, 0, 0.25);
      tongue.add(tMesh);
      const tTip = this._box(0.14, 0.1, 0.14, p.tongue || 0xf472b6, false);
      tTip.position.set(0, 0, 0.52);
      tongue.add(tTip);
      const tMarker = new THREE.Object3D();
      tMarker.position.set(0, 0, 0.55);
      tongue.add(tMarker);
      tongue.visible = false;
      head.add(tongue);
      this.tongueGroup = tongue;
      this.markers.tongue = tMarker;
    }

    // 耳
    if (r.earStyle === 'bear') {
      [-1, 1].forEach((side) => {
        const ear = this._box(0.13, 0.13, 0.08, p.secondary);
        ear.position.set(side * hw * 0.42, hh * 0.98, 0);
        head.add(ear);
      });
    } else if (r.earStyle === 'koala') {
      [-1, 1].forEach((side) => {
        const ear = this._box(0.2, 0.22, 0.1, p.primary);
        ear.position.set(side * (hw * 0.56), hh * 0.62, -0.02);
        head.add(ear);
        const inner = this._box(0.12, 0.14, 0.05, p.muzzle, false);
        inner.position.set(side * (hw * 0.56), hh * 0.62, 0.03);
        head.add(inner);
      });
    } else if (r.earStyle === 'kangaroo') {
      [-1, 1].forEach((side) => {
        const ear = this._box(0.09, 0.24, 0.06, p.primary);
        ear.position.set(side * (hw * 0.32), hh + 0.1, -0.05);
        ear.rotation.z = -side * 0.18;
        head.add(ear);
      });
    } else if (r.earStyle === 'giraffe') {
      [-1, 1].forEach((side) => {
        const ear = this._box(0.12, 0.08, 0.06, p.primary);
        ear.position.set(side * (hw * 0.58), hh * 0.78, -0.04);
        head.add(ear);
      });
    } else if (r.earStyle === 'elephant') {
      [-1, 1].forEach((side) => {
        const fanEar = this._box(0.08, hh * 0.92, hd * 0.68, p.secondary);
        fanEar.position.set(side * (hw * 0.58 + 0.1), hh * 0.56, -0.04);
        fanEar.rotation.y = side * 0.35;
        head.add(fanEar);
      });
    }

    // ツノ（キリン）
    if (r.hasHorns) {
      [-1, 1].forEach((side) => {
        const horn = this._box(0.05, 0.16, 0.05, p.secondary);
        horn.position.set(side * hw * 0.22, hh + 0.08, -0.04);
        head.add(horn);
      });
    }

    // たてがみ（ライオン）
    if (r.hasMane) {
      const maneColors = [p.secondary, p.accent];
      for (let m = 0; m < 8; m++) {
        const angle = (m / 8) * Math.PI * 2;
        const spike = this._box(0.2, 0.2, 0.22, maneColors[m % 2]);
        spike.position.set(
          Math.cos(angle) * (hw * 0.62),
          hh * 0.52 + Math.sin(angle) * (hh * 0.58),
          -0.03
        );
        spike.rotation.z = angle;
        head.add(spike);
      }
    }

    // 頭部縞模様（タイガー）
    if (r.hasStripes) {
      [-1, 1].forEach((side) => {
        const stripe = this._box(0.06, 0.1, 0.18, p.secondary, false);
        stripe.position.set(side * (hw * 0.48), hh * 0.68, 0.04);
        head.add(stripe);
      });
      const brow = this._box(0.18, 0.05, 0.05, p.secondary, false);
      brow.position.set(0, hh * 0.85, hd * 0.5 + 0.01);
      head.add(brow);
    }

    // 長い鼻＋白い牙（ゾウ）
    if (r.hasTusks) {
      [-1, 1].forEach((side) => {
        const tusk = this._box(0.07, 0.08, 0.42, p.fang || 0xf8fafc);
        tusk.position.set(side * hw * 0.26, hh * 0.2, hd * 0.5 + 0.22);
        tusk.rotation.x = -0.22;
        head.add(tusk);
      });
    }
    if (r.hasTrunk) {
      const trunkGroup = new THREE.Group();
      trunkGroup.position.set(0, hh * 0.42, hd * 0.5 + 0.04);
      const tUpper = this._box(0.18, 0.18, 0.48, p.primary);
      tUpper.position.set(0, -0.06, 0.24);
      trunkGroup.add(tUpper);
      const tTip = this._box(0.15, 0.22, 0.2, p.secondary);
      tTip.position.set(0, -0.14, 0.5);
      trunkGroup.add(tTip);
      const tMarker = new THREE.Object3D();
      tMarker.position.set(0, -0.1, 0.62);
      trunkGroup.add(tMarker);
      head.add(trunkGroup);
      if (isMainHead) {
        this.trunkGroup = trunkGroup;
        this.markers.trunkTip = tMarker;
      }
    }

    // 巨大円錐ツノ（サイ）
    if (r.hasRhinoHorn) {
      const hornGroup = new THREE.Group();
      hornGroup.position.set(0, hh * 0.52, hd * 0.5 + 0.1);
      const mainHorn = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.44, 6),
        this._mat(p.horn || 0xf8fafc)
      );
      mainHorn.castShadow = true;
      mainHorn.rotation.x = Math.PI * 0.28;
      mainHorn.position.set(0, 0.14, 0.14);
      hornGroup.add(mainHorn);

      const subHorn = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.22, 6),
        this._mat(p.horn || 0xf8fafc)
      );
      subHorn.rotation.x = Math.PI * 0.18;
      subHorn.position.set(0, 0.1, -0.06);
      hornGroup.add(subHorn);

      head.add(hornGroup);
      if (isMainHead) {
        this.rhinoHornGroup = hornGroup;
      }
    }
  }

  /**
   * 飛び道具（ヘッドスロー等）用に頭部のクローン3Dメッシュを生成
   */
  createDetachedHeadMesh() {
    const group = new THREE.Group();
    this._populateHeadParts(group, this.spec.rig, this.spec.palette);
    return group;
  }

  setHeadVisible(visible) {
    if (this.headGroup) {
      this.headGroup.visible = Boolean(visible);
    }
  }

  setJoeyVisible(visible) {
    if (this.joeyGroup) {
      this.joeyGroup.visible = Boolean(visible);
    }
  }

  getLimbWorldPosition(limbKey, outVec) {
    const marker = this.markers[limbKey] || this.joints.torso;
    this.root.updateMatrixWorld(true);
    return marker.getWorldPosition(outVec);
  }

  _resetPose() {
    this.joints.pelvis.position.set(0, this.pelvisBaseY, 0);
    this.joints.pelvis.rotation.set(0, 0, 0);
    this.joints.torso.rotation.set(0, 0, 0);
    this.joints.torso.scale.set(1, 1, 1);
    this.joints.neck.rotation.set(0, 0, 0);
    this.joints.neck.scale.set(1, 1, 1);
    this.joints.head.rotation.set(0, 0, 0);

    for (const side of ['right', 'left']) {
      this.joints[`${side}Shoulder`].rotation.set(0, 0, 0);
      this.joints[`${side}Elbow`].rotation.set(0, 0, 0);
      this.joints[`${side}Hip`].rotation.set(0, 0, 0);
      this.joints[`${side}Hip`].scale.set(1, 1, 1);
      this.joints[`${side}Knee`].rotation.set(0, 0, 0);
    }

    this.claws.forEach((c) => c.scale.set(1, 1, 1));
    if (this.tongueGroup) {
      this.tongueGroup.visible = false;
      this.tongueGroup.scale.set(1, 1, 1);
    }
    if (this.jawGroup) {
      this.jawGroup.rotation.set(0, 0, 0);
    }
    if (this.woolGroup) {
      this.woolGroup.scale.set(1, 1, 1);
    }
    if (this.trunkGroup) {
      this.trunkGroup.rotation.set(0, 0, 0);
      this.trunkGroup.scale.set(1, 1, 1);
    }
    if (this.rhinoHornGroup) {
      this.rhinoHornGroup.scale.set(1, 1, 1);
    }
    if (this.joeyGroup) {
      this.joeyGroup.position.y = 0.25;
      this.joeyGroup.rotation.set(0, 0, 0);
    }
  }

  dispose(scene) {
    scene.remove(this.root);
    scene.remove(this.groundShadow);
  }

  /**
   * 状態・経過時間・技・必殺技パラメータに応じて関節ポーズを更新
   */
  updatePose(fighter, timeSec) {
    this._resetPose();
    const j = this.joints;
    const state = fighter.state;
    const baseY = this.pelvisBaseY;
    if (this.iceBlock) {
      this.iceBlock.visible = state === FIGHTER_STATE.FROZEN;
      if (state === FIGHTER_STATE.FROZEN) {
        this.iceBlock.scale.set(
          Math.max(1.0, (this.spec.rig?.torso?.[0] || 0.6) * 2.1),
          1.05,
          Math.max(1.0, (this.spec.rig?.torso?.[2] || 0.45) * 2.4)
        );
      }
    }
    if (state === FIGHTER_STATE.FROZEN) {
      j.pelvis.position.x = Math.sin(timeSec * 52) * 0.035;
    }
    if (this.chameleonEyes.length === 2) {
      this.chameleonEyes[0].rotation.set(Math.sin(timeSec * 3.1) * 0.25, Math.cos(timeSec * 2.3) * 0.45, 0);
      this.chameleonEyes[1].rotation.set(Math.cos(timeSec * 2.7) * 0.25, Math.sin(timeSec * 3.6) * 0.45, 0);
    }

    // 足元シャドウ更新
    this.groundShadow.position.set(fighter.position.x, 0.03, fighter.position.z);
    const inBounds = fighter.isWithinRingBounds();
    this.groundShadow.visible = inBounds && fighter.position.y >= -0.5;
    if (this.groundShadow.visible) {
      const heightFactor = Math.max(0.45, 1 - fighter.position.y * 0.18);
      this.groundShadow.scale.setScalar(heightFactor);
    }

    if (state === FIGHTER_STATE.IDLE || state === FIGHTER_STATE.WALK) {
      const isWalk = state === FIGHTER_STATE.WALK;
      const speed = isWalk ? 11.5 * this.spec.stats.speedScale : 5.2;
      const bob = Math.sin(timeSec * speed) * (isWalk ? 0.05 : 0.03);
      j.pelvis.position.y = baseY - 0.02 + bob;
      j.pelvis.rotation.y = isWalk ? Math.sin(timeSec * speed) * 0.12 : -0.2;
      j.torso.rotation.x = 0.1;
      j.torso.rotation.y = isWalk ? -Math.sin(timeSec * speed) * 0.1 : 0.12;

      j.rightShoulder.rotation.set(-0.95, 0, -0.25);
      j.rightElbow.rotation.set(-1.35, 0, 0);
      j.leftShoulder.rotation.set(-1.15, 0, 0.25);
      j.leftElbow.rotation.set(-1.25, 0, 0);

      if (isWalk) {
        const stride = Math.sin(timeSec * speed) * 0.55;
        j.rightHip.rotation.x = stride;
        j.leftHip.rotation.x = -stride;
        j.rightKnee.rotation.x = Math.max(0, -stride * 0.7);
        j.leftKnee.rotation.x = Math.max(0, stride * 0.7);
      } else {
        j.rightHip.rotation.set(0.18, 0, -0.1);
        j.rightKnee.rotation.set(0.22, 0, 0);
        j.leftHip.rotation.set(-0.24, 0, 0.1);
        j.leftKnee.rotation.set(0.26, 0, 0);
      }
      return;
    }

    if (state === FIGHTER_STATE.CROUCH) {
      j.pelvis.position.y = baseY * 0.6;
      j.torso.rotation.x = 0.28;
      j.head.rotation.x = -0.15;
      j.rightShoulder.rotation.set(-1.1, 0, -0.2);
      j.rightElbow.rotation.set(-1.4, 0, 0);
      j.leftShoulder.rotation.set(-1.25, 0, 0.2);
      j.leftElbow.rotation.set(-1.35, 0, 0);
      j.rightHip.rotation.set(-1.15, 0, -0.15);
      j.rightKnee.rotation.set(1.65, 0, 0);
      j.leftHip.rotation.set(-1.05, 0, 0.15);
      j.leftKnee.rotation.set(1.55, 0, 0);
      return;
    }

    if (state === FIGHTER_STATE.SIDESTEP) {
      j.pelvis.position.y = baseY - 0.14;
      j.pelvis.rotation.z = (fighter.sidestepDir || 1) * 0.24;
      j.torso.rotation.x = 0.22;
      j.rightShoulder.rotation.set(-1.1, 0, -0.3);
      j.rightElbow.rotation.set(-1.45, 0, 0);
      j.leftShoulder.rotation.set(-1.1, 0, 0.3);
      j.leftElbow.rotation.set(-1.45, 0, 0);
      j.rightHip.rotation.set(-0.45, 0, -0.22);
      j.rightKnee.rotation.set(0.75, 0, 0);
      j.leftHip.rotation.set(0.25, 0, 0.22);
      j.leftKnee.rotation.set(0.55, 0, 0);
      return;
    }

    if (state === FIGHTER_STATE.JUMP) {
      j.pelvis.position.y = baseY + 0.04;
      j.torso.rotation.x = 0.18;
      j.rightShoulder.rotation.set(-1.1, 0, -0.45);
      j.rightElbow.rotation.set(-1.2, 0, 0);
      j.leftShoulder.rotation.set(-1.1, 0, 0.45);
      j.leftElbow.rotation.set(-1.2, 0, 0);
      j.rightHip.rotation.set(-0.75, 0, -0.1);
      j.rightKnee.rotation.set(1.05, 0, 0);
      j.leftHip.rotation.set(-0.55, 0, 0.1);
      j.leftKnee.rotation.set(0.85, 0, 0);
      return;
    }

    if (state === FIGHTER_STATE.GUARD) {
      const crouch = fighter.isCrouching;
      j.pelvis.position.y = crouch ? baseY * 0.58 : baseY - 0.08;
      j.torso.rotation.x = crouch ? 0.3 : 0.16;
      j.head.rotation.x = crouch ? -0.1 : 0.12;
      j.rightShoulder.rotation.set(-1.45, 0.35, -0.1);
      j.rightElbow.rotation.set(-1.55, 0, 0);
      j.leftShoulder.rotation.set(-1.45, -0.35, 0.1);
      j.leftElbow.rotation.set(-1.55, 0, 0);
      if (crouch) {
        j.rightHip.rotation.set(-1.15, 0, -0.15);
        j.rightKnee.rotation.set(1.65, 0, 0);
        j.leftHip.rotation.set(-1.05, 0, 0.15);
        j.leftKnee.rotation.set(1.55, 0, 0);
      } else {
        j.rightHip.rotation.set(0.25, 0, -0.15);
        j.rightKnee.rotation.set(0.35, 0, 0);
        j.leftHip.rotation.set(-0.3, 0, 0.15);
        j.leftKnee.rotation.set(0.35, 0, 0);
      }
      return;
    }

    if (state === FIGHTER_STATE.SPECIAL && fighter.currentSkill) {
      this._poseSpecialSkill(j, fighter.currentSkill, fighter.stateFrame, timeSec);
      return;
    }

    if (state === FIGHTER_STATE.ATTACK && fighter.currentMove) {
      const m = fighter.currentMove;
      const f = fighter.stateFrame;
      let ext = 0;
      if (f < m.startupFrames) {
        ext = (f / Math.max(1, m.startupFrames)) * 0.7;
      } else if (f < m.startupFrames + m.activeFrames) {
        ext = 1.0;
      } else {
        const rec = f - (m.startupFrames + m.activeFrames);
        ext = Math.max(0, 1 - rec / Math.max(1, m.recoveryFrames));
      }

      if (m.id === 'LIGHT_PUNCH' || m.id === 'HEAVY_PUNCH') {
        const heavy = m.id === 'HEAVY_PUNCH';
        j.pelvis.position.y = baseY - 0.04;
        j.torso.rotation.y = ext * (heavy ? 0.65 : 0.4);
        j.torso.rotation.x = ext * (heavy ? 0.25 : 0.12);
        j.rightShoulder.rotation.set(-0.9 - ext * 0.75, 0, -0.15);
        j.rightElbow.rotation.set(-1.35 + ext * 1.25, 0, 0);
        j.leftShoulder.rotation.set(-0.8 + ext * 0.4, 0, 0.25);
        j.leftElbow.rotation.set(-1.5, 0, 0);
        j.rightHip.rotation.set(0.25, 0, -0.1);
        j.leftHip.rotation.set(-0.35, 0, 0.1);
      } else if (m.id === 'LIGHT_KICK' || m.id === 'HEAVY_KICK') {
        const heavy = m.id === 'HEAVY_KICK';
        j.pelvis.position.y = baseY - 0.02;
        j.torso.rotation.x = -ext * (heavy ? 0.35 : 0.15);
        j.torso.rotation.y = ext * (heavy ? 0.55 : 0.25);
        j.rightHip.rotation.set(-ext * (heavy ? 1.65 : 1.25), 0, -ext * 0.2);
        j.rightKnee.rotation.set((1 - ext) * 0.8, 0, 0);
        j.leftHip.rotation.set(0.12, 0, 0.08);
        j.leftKnee.rotation.set(0.15, 0, 0);
        j.rightShoulder.rotation.set(-0.7, 0, -0.5);
        j.leftShoulder.rotation.set(-1.0, 0, 0.5);
      } else if (m.id === 'JUMP_KICK') {
        j.pelvis.position.y = baseY + 0.02;
        j.torso.rotation.x = -0.28 * ext;
        j.torso.rotation.y = 0.35 * ext;
        j.rightHip.rotation.set(-1.05 * ext, 0, -0.1);
        j.rightKnee.rotation.set(0.12, 0, 0);
        j.leftHip.rotation.set(-0.85, 0, 0.1);
        j.leftKnee.rotation.set(1.25, 0, 0);
        j.rightShoulder.rotation.set(-0.8, 0, -0.55);
        j.leftShoulder.rotation.set(-0.8, 0, 0.55);
      } else if (m.id === 'JUMP_PUNCH') {
        j.pelvis.position.y = baseY + 0.02;
        j.torso.rotation.x = 0.22 * ext;
        j.torso.rotation.y = 0.38 * ext;
        j.rightShoulder.rotation.set(-1.05 - ext * 0.55, 0, -0.15);
        j.rightElbow.rotation.set(-1.2 + ext * 1.1, 0, 0);
        j.leftShoulder.rotation.set(-0.9, 0, 0.35);
        j.rightHip.rotation.set(-0.75, 0, -0.1);
        j.rightKnee.rotation.set(1.05, 0, 0);
        j.leftHip.rotation.set(-0.55, 0, 0.1);
        j.leftKnee.rotation.set(0.85, 0, 0);
      } else if (m.id === 'CROUCH_PUNCH') {
        j.pelvis.position.y = baseY * 0.6;
        j.torso.rotation.x = 0.25;
        j.torso.rotation.y = ext * 0.45;
        j.rightShoulder.rotation.set(-1.0 - ext * 0.55, 0, -0.1);
        j.rightElbow.rotation.set(-1.35 + ext * 1.25, 0, 0);
        j.leftShoulder.rotation.set(-1.1, 0, 0.25);
        j.leftElbow.rotation.set(-1.4, 0, 0);
        j.rightHip.rotation.set(-1.15, 0, -0.15);
        j.rightKnee.rotation.set(1.65, 0, 0);
        j.leftHip.rotation.set(-1.05, 0, 0.15);
        j.leftKnee.rotation.set(1.55, 0, 0);
      } else if (m.id === 'CROUCH_KICK') {
        j.pelvis.position.y = baseY * 0.52;
        j.torso.rotation.x = -0.2 * ext;
        j.torso.rotation.y = ext * 0.55;
        j.rightHip.rotation.set(-1.35 * ext, 0, -0.25 * ext);
        j.rightKnee.rotation.set((1 - ext) * 0.6, 0, 0);
        j.leftHip.rotation.set(-1.15, 0, 0.15);
        j.leftKnee.rotation.set(1.65, 0, 0);
        j.rightShoulder.rotation.set(-0.8, 0, -0.5);
        j.leftShoulder.rotation.set(-0.9, 0, 0.5);
      }
      return;
    }

    if (state === FIGHTER_STATE.THROW_ATTEMPT) {
      const ext = Math.min(1, fighter.stateFrame / 6);
      j.pelvis.position.y = baseY - 0.04;
      j.torso.rotation.x = 0.25 * ext;
      j.rightShoulder.rotation.set(-1.55 * ext, 0.15, -0.2);
      j.rightElbow.rotation.set(-0.25, 0, 0);
      j.leftShoulder.rotation.set(-1.55 * ext, -0.15, 0.2);
      j.leftElbow.rotation.set(-0.25, 0, 0);
      j.rightHip.rotation.set(0.2, 0, -0.1);
      j.leftHip.rotation.set(-0.35, 0, 0.1);
      return;
    }

    if (state === FIGHTER_STATE.THROW_EXECUTE && fighter.activeThrow) {
      this._poseThrowTori(j, fighter.activeThrow, fighter.stateFrame, baseY);
      return;
    }

    if (state === FIGHTER_STATE.THROWN && fighter.activeThrow) {
      this._poseThrowUke(j, fighter.activeThrow, fighter.stateFrame, baseY);
      return;
    }

    if (state === FIGHTER_STATE.HIT || state === FIGHTER_STATE.THROWN) {
      j.pelvis.position.y = baseY - 0.06;
      j.torso.rotation.x = -0.45;
      j.head.rotation.x = -0.35;
      j.rightShoulder.rotation.set(-0.6, 0, -0.8);
      j.leftShoulder.rotation.set(-0.6, 0, 0.8);
      j.rightHip.rotation.set(-0.2, 0, -0.15);
      j.leftHip.rotation.set(0.2, 0, 0.15);
      return;
    }

    if (state === FIGHTER_STATE.FROZEN) {
      j.pelvis.position.y = baseY;
      j.rightShoulder.rotation.set(-0.9, 0, -0.45);
      j.leftShoulder.rotation.set(-0.9, 0, 0.45);
      return;
    }

    if (state === FIGHTER_STATE.DOWN) {
      j.pelvis.position.set(0, 0.25, 0);
      j.pelvis.rotation.x = -Math.PI / 2;
      j.rightShoulder.rotation.set(0, 0, -0.5);
      j.leftShoulder.rotation.set(0, 0, 0.5);
      return;
    }

    if (state === FIGHTER_STATE.FALL) {
      j.pelvis.position.y = baseY;
      j.pelvis.rotation.x = timeSec * 7.5;
      j.pelvis.rotation.z = timeSec * 4.5;
      j.rightShoulder.rotation.set(-2.4, 0, -0.7);
      j.leftShoulder.rotation.set(-2.4, 0, 0.7);
      j.rightHip.rotation.set(-0.5, 0, -0.25);
      j.leftHip.rotation.set(0.4, 0, 0.25);
      return;
    }

    if (state === FIGHTER_STATE.VICTORY) {
      j.pelvis.position.y = baseY + Math.abs(Math.sin(timeSec * 3)) * 0.04;
      j.rightShoulder.rotation.set(-2.85, 0, -0.2);
      j.rightElbow.rotation.set(-0.25, 0, 0);
      j.leftShoulder.rotation.set(-0.4, 0, 0.35);
      j.leftElbow.rotation.set(-0.7, 0, 0);
    }
  }

  _poseSpecialSkill(j, skill, frame, timeSec) {
    const baseY = this.pelvisBaseY;
    const pose = skill.pose;

    if (pose === 'HEAD_THROW') {
      const ext = Math.min(1, frame / Math.max(1, skill.startupFrames));
      j.pelvis.position.y = baseY - 0.05;
      j.torso.rotation.y = this._lerp(-0.4, 0.55, ext);
      j.rightShoulder.rotation.set(this._lerp(-2.6, -1.4, ext), 0, -0.25);
      j.rightElbow.rotation.x = this._lerp(-1.1, -0.1, ext);
      j.leftShoulder.rotation.set(-1.1, 0, 0.35);
      return;
    }

    if (pose === 'JOEY_IRON_BALL') {
      // アイロンボールアタック: 袋から子カンガルーが身を乗り出して鉄球を放り投げる！
      const ext = Math.min(1, frame / Math.max(1, skill.startupFrames));
      j.pelvis.position.y = baseY - 0.06;
      j.torso.rotation.x = this._lerp(-0.15, 0.25, ext);
      j.rightShoulder.rotation.set(-0.9, 0, -0.55);
      j.leftShoulder.rotation.set(-0.9, 0, 0.55);
      if (this.joeyGroup) {
        this.joeyGroup.position.y = 0.25 + Math.sin(ext * Math.PI) * 0.22;
        this.joeyGroup.rotation.x = this._lerp(-0.35, 0.65, ext);
      }
      return;
    }

    if (pose === 'STARFISH_MISSILE') {
      // ベア・ミサイル: 大の字で水平砲弾突進！
      const activeEnd = skill.startupFrames + skill.activeFrames;
      const fly = frame >= skill.startupFrames && frame < activeEnd ? 1 : 0.4;
      j.pelvis.position.y = baseY + 0.15 * fly;
      j.pelvis.rotation.x = Math.PI * 0.46 * fly;
      j.rightShoulder.rotation.set(-0.2, 0, -1.35 * fly);
      j.leftShoulder.rotation.set(-0.2, 0, 1.35 * fly);
      j.rightHip.rotation.set(0, 0, -0.45 * fly);
      j.leftHip.rotation.set(0, 0, 0.45 * fly);
      return;
    }

    if (pose === 'GIRAFFE_LANCE') {
      // キリン・ランス: 長い首を真横に水平に突き出して超高速突進！
      const ext =
        frame < skill.startupFrames
          ? frame / skill.startupFrames
          : frame < skill.startupFrames + skill.activeFrames
          ? 1
          : 0.35;
      j.pelvis.position.y = baseY - 0.12;
      j.torso.rotation.x = 0.72 * ext;
      j.neck.rotation.x = 0.72 * ext;
      j.neck.scale.y = this._lerp(1, skill.stretchFactor || 1.5, ext);
      j.rightShoulder.rotation.set(0.6, 0, -0.25);
      j.leftShoulder.rotation.set(0.6, 0, 0.25);
      j.rightHip.rotation.x = Math.sin(timeSec * 22) * 0.45;
      j.leftHip.rotation.x = -Math.sin(timeSec * 22) * 0.45;
      return;
    }

    if (pose === 'EXTEND_KICK') {
      // エクステンド・キック: 右脚が3倍にビヨーンと伸びる！
      const activeEnd = skill.startupFrames + skill.activeFrames;
      let ext = 0;
      if (frame < skill.startupFrames) {
        ext = (frame / skill.startupFrames) * 0.5;
      } else if (frame < activeEnd) {
        ext = 1;
      } else {
        const rec = frame - activeEnd;
        ext = Math.max(0, 1 - rec / Math.max(1, skill.recoveryFrames));
      }
      j.pelvis.position.y = baseY;
      j.torso.rotation.x = -0.35 * ext;
      j.rightHip.rotation.set(-1.55 * ext, 0, -0.1);
      j.rightHip.scale.y = this._lerp(1, skill.stretchFactor || 3.0, ext);
      j.rightKnee.rotation.x = 0.05;
      j.rightShoulder.rotation.set(-0.6, 0, -0.7);
      j.leftShoulder.rotation.set(-0.6, 0, 0.7);
      return;
    }

    if (pose === 'CLAW_RUSH') {
      // クロー・ラッシュ: 白い爪を2.6倍に巨大化して交互に引っかく
      const slash = Math.sin(frame * 0.9);
      this.claws.forEach((c) => c.scale.set(1.5, skill.stretchFactor || 2.6, 1.5));
      j.pelvis.position.y = baseY - 0.08;
      j.torso.rotation.x = 0.28;
      j.torso.rotation.y = slash * 0.55;
      j.rightShoulder.rotation.set(-1.5 + slash * 0.8, 0, -0.35);
      j.rightElbow.rotation.x = -0.35;
      j.leftShoulder.rotation.set(-1.5 - slash * 0.8, 0, 0.35);
      j.leftElbow.rotation.x = -0.35;
      j.rightHip.rotation.x = Math.sin(timeSec * 20) * 0.5;
      j.leftHip.rotation.x = -Math.sin(timeSec * 20) * 0.5;
      return;
    }

    if (pose === 'T_SPIN') {
      // コアラ・トルネード: T字ポーズ＋爪拡大＋コマのようにY軸高速回転！
      this.claws.forEach((c) => c.scale.set(1.4, skill.stretchFactor || 2.0, 1.4));
      j.pelvis.position.y = baseY;
      j.pelvis.rotation.y = timeSec * (skill.spinYSpeed || 28);
      j.rightShoulder.rotation.set(0, 0, -1.48);
      j.leftShoulder.rotation.set(0, 0, 1.48);
      j.rightHip.rotation.x = -0.25;
      j.leftHip.rotation.x = 0.25;
      return;
    }

    if (pose === 'TAIL_SPRING') {
      // テール・スプリング: 尻尾をバネにして飛び出し水平ロケット突進！
      const activeEnd = skill.startupFrames + skill.activeFrames;
      const fly = frame >= skill.startupFrames && frame < activeEnd ? 1 : 0.35;
      j.pelvis.position.y = baseY + 0.12 * fly;
      j.pelvis.rotation.x = 0.55 * fly;
      j.rightShoulder.rotation.set(-1.6 * fly, 0, -0.15);
      j.leftShoulder.rotation.set(-1.6 * fly, 0, 0.15);
      j.rightHip.rotation.x = 0.45 * fly;
      j.leftHip.rotation.x = 0.45 * fly;
      return;
    }

    if (pose === 'BELLY_SLIDE') {
      // トピード・スライド: うつ伏せで氷上を滑るように高速スライディング！
      j.pelvis.position.y = 0.26;
      j.pelvis.rotation.x = Math.PI * 0.48;
      j.rightShoulder.rotation.set(-0.4, 0, -1.1);
      j.leftShoulder.rotation.set(-0.4, 0, 1.1);
      j.rightHip.rotation.x = 0.15;
      j.leftHip.rotation.x = 0.15;
      return;
    }

    if (pose === 'TONGUE_SNIPE') {
      // タング・スナイプ: ピンクの長い舌を画面端近くまで発射！
      const activeEnd = skill.startupFrames + skill.activeFrames;
      let ext = 0;
      if (frame < skill.startupFrames) {
        ext = (frame / Math.max(1, skill.startupFrames)) * 0.35;
      } else if (frame < activeEnd) {
        ext = 1;
      } else {
        const rec = frame - activeEnd;
        ext = Math.max(0, 1 - rec / Math.max(1, skill.recoveryFrames));
      }
      j.pelvis.position.y = baseY - 0.05;
      j.torso.rotation.x = 0.25 * ext;
      if (this.tongueGroup) {
        this.tongueGroup.visible = ext > 0.05;
        this.tongueGroup.scale.set(1, 1, this._lerp(1, skill.stretchFactor || 7.5, ext));
      }
      j.rightShoulder.rotation.set(-0.8, 0, -0.4);
      j.leftShoulder.rotation.set(-0.8, 0, 0.4);
      return;
    }

    if (pose === 'STEALTH_POSE') {
      j.pelvis.position.y = baseY * 0.72;
      j.torso.rotation.x = 0.32;
      j.rightShoulder.rotation.set(-1.35, 0.4, -0.2);
      j.leftShoulder.rotation.set(-1.35, -0.4, 0.2);
      return;
    }

    if (pose === 'HIPPO_MUD') {
      // マッド・ショットガン: 大口をカッと開けて水塊を扇状にぶっ放す！
      const activeEnd = skill.startupFrames + skill.activeFrames;
      const open = frame < activeEnd ? 1 : Math.max(0, 1 - (frame - activeEnd) / Math.max(1, skill.recoveryFrames));
      j.pelvis.position.y = baseY - 0.08;
      j.torso.rotation.x = -0.26 * open;
      if (this.jawGroup) {
        this.jawGroup.rotation.x = 1.05 * open;
      }
      j.rightShoulder.rotation.set(-0.6, 0, -0.6);
      j.leftShoulder.rotation.set(-0.6, 0, 0.6);
      return;
    }

    if (pose === 'HIPPO_GIGA_BITE') {
      // ギガ・バイト: 上半身をほぼ90度後ろへ反らして巨大な顎を開き、踏み込んで噛みつく！
      const activeEnd = skill.startupFrames + skill.activeFrames;
      if (frame < skill.startupFrames) {
        const wind = frame / Math.max(1, skill.startupFrames);
        j.pelvis.position.y = baseY - 0.1 * wind;
        j.torso.rotation.x = -1.25 * wind;
        if (this.jawGroup) {
          this.jawGroup.rotation.x = 1.18 * wind;
        }
        j.rightShoulder.rotation.set(0.6 * wind, 0, -0.5);
        j.leftShoulder.rotation.set(0.6 * wind, 0, 0.5);
      } else if (frame < activeEnd) {
        const chomp = (frame - skill.startupFrames) / Math.max(1, skill.activeFrames);
        j.pelvis.position.y = baseY - 0.06;
        j.torso.rotation.x = this._lerp(-0.45, 0.48, chomp);
        if (this.jawGroup) {
          this.jawGroup.rotation.x = this._lerp(1.1, 0.05, Math.min(1, chomp * 2.2));
        }
        j.rightShoulder.rotation.set(-1.3, 0, -0.35);
        j.leftShoulder.rotation.set(-1.3, 0, 0.35);
      } else {
        const rec = (frame - activeEnd) / Math.max(1, skill.recoveryFrames);
        j.pelvis.position.y = baseY;
        j.torso.rotation.x = this._lerp(0.35, 0, rec);
        if (this.jawGroup) {
          this.jawGroup.rotation.x = this._lerp(0.05, 0, rec);
        }
      }
      return;
    }

    if (pose === 'NECK_WHIP') {
      // ネック・ウィップ: 細長い首を前方へムチのようにしならせて連続頭突き！
      const activeEnd = skill.startupFrames + skill.activeFrames;
      let ext = 0;
      if (frame < skill.startupFrames) {
        ext = (frame / Math.max(1, skill.startupFrames)) * 0.4;
      } else if (frame < activeEnd) {
        ext = 1;
      } else {
        const rec = frame - activeEnd;
        ext = Math.max(0, 1 - rec / Math.max(1, skill.recoveryFrames));
      }
      const whipOsc = frame >= skill.startupFrames && frame < activeEnd ? Math.sin(frame * 1.45) * 0.24 : 0;
      j.pelvis.position.y = baseY - 0.08 * ext;
      j.torso.rotation.x = 0.55 * ext;
      j.neck.rotation.x = 0.78 * ext + whipOsc;
      j.neck.scale.y = this._lerp(1, skill.stretchFactor || 2.8, ext);
      j.rightShoulder.rotation.set(0.45 * ext, 0, -0.65);
      j.leftShoulder.rotation.set(0.45 * ext, 0, 0.65);
      return;
    }

    if (pose === 'BALLERINA_SPIN') {
      // バレリーナ・トルネード: 片脚立ちで高速スピン！
      j.pelvis.position.y = baseY + 0.08;
      j.pelvis.rotation.y = timeSec * (skill.spinYSpeed || 34);
      j.rightShoulder.rotation.set(-2.35, 0, -0.45);
      j.rightElbow.rotation.x = -0.35;
      j.leftShoulder.rotation.set(-2.35, 0, 0.45);
      j.leftElbow.rotation.x = -0.35;
      j.rightHip.rotation.set(0, 0, 0);
      j.rightKnee.rotation.set(0, 0, 0);
      j.leftHip.rotation.set(-0.95, 0, 0.92);
      j.leftKnee.rotation.x = 1.65;
      return;
    }

    if (pose === 'WOOL_PUFF') {
      // ウール・エクスプロージョン: 全身の白い毛皮が3倍に大膨張して弾け飛ぶ！
      const activeEnd = skill.startupFrames + skill.activeFrames;
      let puffScale = 1;
      if (frame < skill.startupFrames) {
        puffScale = this._lerp(1, 0.78, frame / Math.max(1, skill.startupFrames));
      } else if (frame < activeEnd) {
        const boom = Math.min(1, (frame - skill.startupFrames) / 3);
        puffScale = this._lerp(1.2, 3.0, boom);
      } else {
        const rec = (frame - activeEnd) / Math.max(1, skill.recoveryFrames);
        puffScale = this._lerp(3.0, 1.0, rec);
      }
      j.pelvis.position.y = baseY;
      j.torso.scale.setScalar(Math.min(1.65, 0.85 + puffScale * 0.25));
      if (this.woolGroup) {
        this.woolGroup.scale.setScalar(puffScale);
      }
      j.rightShoulder.rotation.set(-0.4, 0, -1.2);
      j.leftShoulder.rotation.set(-0.4, 0, 1.2);
      return;
    }

    if (pose === 'KING_ROAR') {
      // キング・ロア: 胸を張り両腕を開いて王者の咆哮！
      j.pelvis.position.y = baseY - 0.06;
      j.torso.rotation.x = -0.32;
      j.head.rotation.x = -0.25;
      j.rightShoulder.rotation.set(-0.5, 0, -1.15);
      j.leftShoulder.rotation.set(-0.5, 0, 1.15);
      return;
    }

    if (pose === 'LEON_FANG') {
      // レオン・ファング: 黄金の爪を大きくして3連斬撃！
      const slash = Math.sin(frame * 0.95);
      this.claws.forEach((c) => c.scale.set(1.6, skill.stretchFactor || 2.5, 1.6));
      j.pelvis.position.y = baseY - 0.08;
      j.torso.rotation.x = 0.34;
      j.torso.rotation.y = slash * 0.65;
      j.rightShoulder.rotation.set(-1.55 + slash * 0.85, 0, -0.35);
      j.leftShoulder.rotation.set(-1.55 - slash * 0.85, 0, 0.35);
      j.rightHip.rotation.x = Math.sin(timeSec * 22) * 0.55;
      j.leftHip.rotation.x = -Math.sin(timeSec * 22) * 0.55;
      return;
    }

    if (pose === 'TIGER_DIVE') {
      // タイガー・ダイブ: 空中から両爪を構えて急降下！
      this.claws.forEach((c) => c.scale.set(1.5, 1.8, 1.5));
      j.pelvis.position.y = baseY;
      j.torso.rotation.x = 0.72;
      j.rightShoulder.rotation.set(-1.85, 0, -0.32);
      j.leftShoulder.rotation.set(-1.85, 0, 0.32);
      j.rightHip.rotation.x = 0.5;
      j.leftHip.rotation.x = 0.5;
      return;
    }

    if (pose === 'SHADOW_STRIPE') {
      // シャドウ・ストライプ: 残像疾走からの強烈アッパー！
      this.claws.forEach((c) => c.scale.set(1.5, 1.7, 1.5));
      const activeEnd = skill.startupFrames + skill.activeFrames;
      const upper = frame >= skill.startupFrames + 4 && frame < activeEnd;
      j.pelvis.position.y = baseY - 0.14;
      j.torso.rotation.x = upper ? -0.25 : 0.45;
      j.rightShoulder.rotation.set(upper ? -2.4 : -0.8, 0, -0.2);
      j.leftShoulder.rotation.set(-0.6, 0, 0.35);
      return;
    }

    if (pose === 'TRUNK_WHIP') {
      // トランク・ウィップ: 長い鼻が3倍に伸びて横一閃なぎ払い！
      const activeEnd = skill.startupFrames + skill.activeFrames;
      let ext = 0;
      if (frame < skill.startupFrames) {
        ext = (frame / Math.max(1, skill.startupFrames)) * 0.4;
      } else if (frame < activeEnd) {
        ext = 1;
      } else {
        ext = Math.max(0, 1 - (frame - activeEnd) / Math.max(1, skill.recoveryFrames));
      }
      const sweep = frame >= skill.startupFrames && frame < activeEnd
        ? Math.sin(((frame - skill.startupFrames) / Math.max(1, skill.activeFrames)) * Math.PI * 2)
        : 0;
      j.pelvis.position.y = baseY - 0.06;
      j.torso.rotation.y = sweep * 0.85;
      j.head.rotation.y = sweep * 0.45;
      if (this.trunkGroup) {
        this.trunkGroup.rotation.x = -0.5 * ext;
        this.trunkGroup.scale.set(1.2, 1.2, this._lerp(1, skill.stretchFactor || 3.2, ext));
      }
      j.rightShoulder.rotation.set(-0.4, 0, -0.75);
      j.leftShoulder.rotation.set(-0.4, 0, 0.75);
      return;
    }

    if (pose === 'EARTH_QUAKE') {
      // アース・クエイク: ジャンプ溜め→巨体を叩きつけて地震！
      const slam = frame >= skill.startupFrames;
      j.pelvis.position.y = slam ? baseY * 0.56 : baseY + 0.55;
      j.torso.rotation.x = slam ? 0.52 : -0.22;
      j.rightShoulder.rotation.set(slam ? -0.9 : -2.6, 0, -0.4);
      j.leftShoulder.rotation.set(slam ? -0.9 : -2.6, 0, 0.4);
      j.rightHip.rotation.x = slam ? -0.75 : -0.3;
      j.leftHip.rotation.x = slam ? -0.75 : -0.3;
      return;
    }

    if (pose === 'HORN_CATAPULT') {
      // ホーン・カタパルト: 頭を下げて巨大角で天高くかち上げ！
      const activeEnd = skill.startupFrames + skill.activeFrames;
      let ext = 1;
      if (frame < skill.startupFrames) {
        ext = frame / Math.max(1, skill.startupFrames);
        j.torso.rotation.x = 0.55 * ext;
        j.head.rotation.x = 0.5 * ext;
      } else if (frame < activeEnd) {
        j.torso.rotation.x = -0.38;
        j.head.rotation.x = -0.78;
      } else {
        const rec = (frame - activeEnd) / Math.max(1, skill.recoveryFrames);
        j.torso.rotation.x = this._lerp(-0.38, 0, rec);
        j.head.rotation.x = this._lerp(-0.78, 0, rec);
      }
      if (this.rhinoHornGroup) {
        const hs = frame >= skill.startupFrames && frame < activeEnd ? skill.stretchFactor || 2.4 : 1.4;
        this.rhinoHornGroup.scale.setScalar(hs);
      }
      return;
    }

    if (pose === 'RHINO_JUGGERNAUT') {
      // ライノ・ジャガーノート: 頭を低く構えて無敵ブルドーザー突進！
      if (this.rhinoHornGroup) {
        this.rhinoHornGroup.scale.setScalar(1.65);
      }
      j.pelvis.position.y = baseY - 0.14;
      j.torso.rotation.x = 0.62;
      j.head.rotation.x = 0.25;
      j.rightShoulder.rotation.set(0.45, 0, -0.4);
      j.leftShoulder.rotation.set(0.45, 0, 0.4);
      j.rightHip.rotation.x = Math.sin(timeSec * 24) * 0.65;
      j.leftHip.rotation.x = -Math.sin(timeSec * 24) * 0.65;
      return;
    }

    if (pose === 'POLAR_METEOR') {
      // ポーラー・メテオ: 大ジャンプ急降下インパクト！
      const slam = frame >= skill.startupFrames + skill.activeFrames - 4;
      this.claws.forEach((c) => c.scale.set(1.6, 2.0, 1.6));
      j.pelvis.position.y = baseY;
      j.torso.rotation.x = slam ? 0.65 : 1.05;
      j.rightShoulder.rotation.set(slam ? -1.1 : -2.3, 0, -0.45);
      j.leftShoulder.rotation.set(slam ? -1.1 : -2.3, 0, 0.45);
    }
  }

  _lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  _poseThrowTori(j, throwVar, frame, baseY) {
    const t = Math.min(1, frame / Math.max(1, throwVar.durationFrames));
    const id = throwVar.id;

    if (id === 'TOMOE_NAGE') {
      const drop = t < 0.35 ? t / 0.35 : t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1;
      const kick = t < 0.35 ? 0 : t < 0.72 ? (t - 0.35) / 0.37 : 1 - (t - 0.72) / 0.28;
      j.pelvis.position.y = this._lerp(baseY, 0.28, drop);
      j.pelvis.rotation.x = this._lerp(0, -1.48, drop);
      j.rightShoulder.rotation.set(this._lerp(-1.2, -1.75, drop), 0, -0.2);
      j.leftShoulder.rotation.set(this._lerp(-1.2, -1.75, drop), 0, 0.2);
      j.rightElbow.rotation.x = -0.35;
      j.leftElbow.rotation.x = -0.35;
      j.rightHip.rotation.x = this._lerp(-0.4, -1.45, kick);
      j.rightKnee.rotation.x = this._lerp(1.1, 0.05, kick);
      j.leftHip.rotation.x = 0.2;
      j.leftKnee.rotation.x = 0.75 * drop;
      return;
    }

    if (id === 'OSOTO_GARI') {
      const raise = t < 0.36 ? t / 0.36 : 1;
      const reap = t < 0.36 ? 0 : t < 0.72 ? (t - 0.36) / 0.36 : 1 - (t - 0.72) / 0.28;
      j.pelvis.position.y = baseY - 0.04;
      j.pelvis.position.x = -0.22 * (1 - Math.abs(t - 0.5) * 1.4);
      j.torso.rotation.x = this._lerp(0.1, 0.55, reap);
      j.torso.rotation.y = this._lerp(0, 0.35, reap);
      j.rightShoulder.rotation.set(-1.35, 0.2, -0.25);
      j.leftShoulder.rotation.set(-1.35, -0.2, 0.25);
      j.rightElbow.rotation.x = -0.5;
      j.leftElbow.rotation.x = -0.5;
      j.rightHip.rotation.x = t < 0.36 ? this._lerp(0, -1.25, raise) : this._lerp(-1.25, 0.9, reap);
      j.rightKnee.rotation.x = 0.15;
      j.leftHip.rotation.x = 0.15;
      j.leftKnee.rotation.x = 0.25;
      return;
    }

    if (id === 'SEOI_NAGE') {
      const turn = t < 0.32 ? t / 0.32 : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      const throwPull = t < 0.32 ? 0 : t < 0.72 ? (t - 0.32) / 0.4 : 1 - (t - 0.72) / 0.28;
      j.pelvis.rotation.y = Math.PI * turn;
      j.pelvis.position.y = this._lerp(baseY, baseY * 0.62, turn);
      j.torso.rotation.x = this._lerp(0.1, 0.95, throwPull);
      j.rightShoulder.rotation.set(this._lerp(-1.3, -2.35, turn), 0.3, -0.15);
      j.rightElbow.rotation.x = -1.3;
      j.leftShoulder.rotation.set(-1.4, -0.25, 0.15);
      j.leftElbow.rotation.x = -1.2;
      j.rightHip.rotation.x = -0.65 * turn;
      j.rightKnee.rotation.x = 1.05 * turn;
      j.leftHip.rotation.x = -0.65 * turn;
      j.leftKnee.rotation.x = 1.05 * turn;
      return;
    }

    if (id === 'KOSOTO_GARI') {
      const hook = t < 0.35 ? t / 0.35 : 1;
      const sweep = t < 0.35 ? 0 : t < 0.72 ? (t - 0.35) / 0.37 : 1 - (t - 0.72) / 0.28;
      j.pelvis.position.y = baseY - 0.04;
      j.pelvis.rotation.z = 0.16 * (1 - Math.abs(t - 0.5));
      j.torso.rotation.x = this._lerp(0.1, 0.44, sweep);
      j.rightShoulder.rotation.set(-1.4, 0.1, -0.2);
      j.leftShoulder.rotation.set(-1.4, -0.1, 0.2);
      j.rightElbow.rotation.x = -0.6;
      j.leftElbow.rotation.x = -0.6;
      if (t < 0.35) {
        j.rightHip.rotation.set(-0.35 * hook, 0, -0.48 * hook);
      } else {
        j.rightHip.rotation.set(this._lerp(-0.35, 0.38, sweep), 0, this._lerp(-0.48, 0.28, sweep));
      }
      j.rightKnee.rotation.x = 0.25;
      j.leftHip.rotation.x = 0.1;
      j.leftKnee.rotation.x = 0.2;
      return;
    }

    const duck = t < 0.3 ? t / 0.3 : t < 0.55 ? 1 - (t - 0.3) / 0.25 : 0;
    const hoist = t < 0.25 ? 0 : t < 0.6 ? Math.min(1, (t - 0.25) / 0.3) : 1 - (t - 0.6) / 0.4;
    const dump = t < 0.58 ? 0 : t < 0.78 ? (t - 0.58) / 0.2 : 1 - (t - 0.78) / 0.22;
    j.pelvis.position.y = this._lerp(baseY, baseY * 0.56, duck);
    j.torso.rotation.y = this._lerp(0, 0.65, dump);
    j.torso.rotation.x = this._lerp(0.15, 0.45, dump);
    j.rightShoulder.rotation.set(this._lerp(-1.4, -2.5, hoist), 0, -0.35);
    j.leftShoulder.rotation.set(this._lerp(-1.4, -2.1, hoist), 0, 0.35);
    j.rightElbow.rotation.x = -0.9;
    j.leftElbow.rotation.x = -0.9;
    j.rightHip.rotation.x = -0.75 * duck;
    j.rightKnee.rotation.x = 1.2 * duck;
    j.leftHip.rotation.x = -0.75 * duck;
    j.leftKnee.rotation.x = 1.2 * duck;
  }

  _poseThrowUke(j, throwVar, frame) {
    const t = Math.min(1, frame / Math.max(1, throwVar.durationFrames));
    const id = throwVar.id;

    j.rightShoulder.rotation.set(-0.9, 0, -0.75);
    j.leftShoulder.rotation.set(-0.9, 0, 0.75);
    j.rightHip.rotation.x = -0.35;
    j.leftHip.rotation.x = 0.25;
    j.rightKnee.rotation.x = 0.55;
    j.leftKnee.rotation.x = 0.45;

    if (id === 'TOMOE_NAGE' || id === 'SEOI_NAGE') {
      if (t < 0.35) {
        j.pelvis.rotation.x = this._lerp(0, 1.0, t / 0.35);
      } else if (t < 0.72) {
        j.pelvis.rotation.x = this._lerp(1.0, 4.7, (t - 0.35) / 0.37);
      } else {
        j.pelvis.rotation.x = -Math.PI / 2;
        j.pelvis.position.y = 0.25;
      }
      return;
    }

    if (id === 'OSOTO_GARI' || id === 'KOSOTO_GARI') {
      const flip = Math.min(1, t / 0.7);
      j.pelvis.rotation.x = this._lerp(0, -Math.PI / 2, flip);
      if (id === 'KOSOTO_GARI') {
        j.pelvis.rotation.z = this._lerp(0, 0.45, Math.sin(flip * Math.PI));
      }
      if (t >= 0.7) {
        j.pelvis.position.y = 0.25;
      } else {
        j.rightHip.rotation.x = -0.8 * Math.sin(flip * Math.PI);
      }
      return;
    }

    if (t < 0.58) {
      const lift = Math.min(1, t / 0.3);
      j.pelvis.rotation.z = this._lerp(0, Math.PI / 2, lift);
    } else if (t < 0.76) {
      const p = (t - 0.58) / 0.18;
      j.pelvis.rotation.z = this._lerp(Math.PI / 2, 0.15, p);
      j.pelvis.rotation.x = this._lerp(0, -Math.PI / 2, p);
    } else {
      j.pelvis.rotation.x = -Math.PI / 2;
      j.pelvis.position.y = 0.25;
    }
  }
}

/**
 * キャラ選択画面の正方形アイコン向けに、各動物の実際のローポリ3D頭部ポートレートを生成します。
 * メインの WebGLRenderer と一時 RenderTarget を共用するため、追加のWebGLコンテキストを一切消費しません。
 */
export function generateHeadPortraits(renderer, charactersMap, order) {
  const result = {};
  if (!renderer) return result;
  const size = 120;
  let rt = null;
  const prevTarget = renderer.getRenderTarget();
  const prevClearAlpha = renderer.getClearAlpha();
  const prevClearColor = new THREE.Color();
  renderer.getClearColor(prevClearColor);

  try {
    rt = new THREE.WebGLRenderTarget(size, size, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xffffff, 0x334155, 0.95);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xfffbeb, 1.15);
    dir.position.set(2.2, 3.0, 3.2);
    scene.add(dir);

    const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 20);
    const pixels = new Uint8Array(size * size * 4);
    const canvas2d = document.createElement('canvas');
    canvas2d.width = size;
    canvas2d.height = size;
    const ctx = canvas2d.getContext('2d');

    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);

    for (const id of order) {
      const spec = charactersMap[id];
      if (!spec) continue;
      const rig = new AnimalRig(spec, true);
      const headMesh = rig.createDetachedHeadMesh();
      headMesh.rotation.y = -0.26;
      const hh = spec.rig.head[1];
      cam.position.set(0.3, hh * 0.68, Math.max(0.92, hh * 2.8));
      cam.lookAt(0, hh * 0.54, 0.04);

      scene.add(headMesh);
      renderer.clear(true, true, true);
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
      scene.remove(headMesh);

      if (ctx) {
        const imgData = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
          const srcRow = (size - 1 - y) * size * 4;
          const dstRow = y * size * 4;
          for (let x = 0; x < size * 4; x++) {
            imgData.data[dstRow + x] = pixels[srcRow + x];
          }
        }
        ctx.putImageData(imgData, 0, 0);
        result[id] = canvas2d.toDataURL('image/png');
      }
    }
  } catch (_) {
    // フォールバック
  } finally {
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClearColor, prevClearAlpha);
    if (rt) rt.dispose();
  }
  return result;
}
