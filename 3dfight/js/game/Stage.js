import * as THREE from '../../vendor/three.module.min.js?v=20261123174047';
import { GAME_CONFIG } from '../config/constants.js?v=20261123174047';

/**
 * 天下一武道会風の正方形武道場ステージを構築します。
 * 90年代ローポリ感を演出するため flatShading: true と単色ポリゴンを採用。
 */
export function createStage(scene) {
  const group = new THREE.Group();
  const half = GAME_CONFIG.RING_HALF_SIZE; // 10
  const ringHeight = GAME_CONFIG.RING_HEIGHT; // 1.4
  const fullSize = half * 2; // 20

  // 1. 下層地面（リングアウト時に落下する場外タイル床）
  const outerFloorGeo = new THREE.BoxGeometry(90, 1, 90);
  const outerFloorMat = new THREE.MeshLambertMaterial({
    color: 0x3a4e3c,
    flatShading: true,
  });
  const outerFloor = new THREE.Mesh(outerFloorGeo, outerFloorMat);
  outerFloor.position.set(0, -1.8, 0);
  outerFloor.receiveShadow = true;
  group.add(outerFloor);

  // 場外ライン（武道場の外周ブロック）
  const courtGeo = new THREE.BoxGeometry(fullSize + 8, 0.25, fullSize + 8);
  const courtMat = new THREE.MeshLambertMaterial({
    color: 0x627264,
    flatShading: true,
  });
  const court = new THREE.Mesh(courtGeo, courtMat);
  court.position.set(0, -1.2, 0);
  court.receiveShadow = true;
  group.add(court);

  // 2. メイン武道場ステージ台座（上面が y = 0 になるように配置）
  const baseGeo = new THREE.BoxGeometry(fullSize, ringHeight, fullSize);
  const baseMat = new THREE.MeshLambertMaterial({
    color: 0xd6d1c4,
    flatShading: true,
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.set(0, -ringHeight / 2, 0);
  baseMesh.receiveShadow = true;
  baseMesh.castShadow = false;
  group.add(baseMesh);

  // ステージ側面の石組みライン
  const trimGeo = new THREE.BoxGeometry(fullSize + 0.2, 0.28, fullSize + 0.2);
  const trimMat = new THREE.MeshLambertMaterial({
    color: 0x948d7e,
    flatShading: true,
  });
  const trimTop = new THREE.Mesh(trimGeo, trimMat);
  trimTop.position.set(0, -0.15, 0);
  group.add(trimTop);

  // 3. 土俵・タイル模様（正方形グリッドと境界の赤い警告ライン）
  const innerMat = new THREE.MeshLambertMaterial({
    color: 0xe8e2d5,
    flatShading: true,
  });
  const tileGeo = new THREE.BoxGeometry(4.6, 0.04, 4.6);
  for (let gx = -2; gx <= 1; gx++) {
    for (let gz = -2; gz <= 1; gz++) {
      const tile = new THREE.Mesh(tileGeo, innerMat);
      tile.position.set(gx * 4.8 + 2.4, 0.01, gz * 4.8 + 2.4);
      tile.receiveShadow = true;
      group.add(tile);
    }
  }

  // 中央シンボル（正方形とひし形）
  const centerMat = new THREE.MeshLambertMaterial({
    color: 0xc8bfa8,
    flatShading: true,
  });
  const centerDiamond = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.05, 4.2), centerMat);
  centerDiamond.position.set(0, 0.02, 0);
  centerDiamond.rotation.y = Math.PI / 4;
  centerDiamond.receiveShadow = true;
  group.add(centerDiamond);

  // 境界警告ライン（リングアウトの目安）
  const borderMat = new THREE.MeshLambertMaterial({
    color: 0xd9483b,
    flatShading: true,
  });
  const borderThickness = 0.22;
  const edgeOffset = half - borderThickness / 2;

  const northBorder = new THREE.Mesh(new THREE.BoxGeometry(fullSize, 0.05, borderThickness), borderMat);
  northBorder.position.set(0, 0.025, -edgeOffset);
  group.add(northBorder);

  const southBorder = northBorder.clone();
  southBorder.position.set(0, 0.025, edgeOffset);
  group.add(southBorder);

  const westBorder = new THREE.Mesh(new THREE.BoxGeometry(borderThickness, 0.05, fullSize), borderMat);
  westBorder.position.set(-edgeOffset, 0.025, 0);
  group.add(westBorder);

  const eastBorder = westBorder.clone();
  eastBorder.position.set(edgeOffset, 0.025, 0);
  group.add(eastBorder);

  // 4. 場外コーナーの武道場灯籠・旗柱（視界を遮らない外周位置）
  const pillarGeo = new THREE.BoxGeometry(0.9, 5.2, 0.9);
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x8b2e2e, flatShading: true });
  const capGeo = new THREE.BoxGeometry(1.5, 0.5, 1.5);
  const capMat = new THREE.MeshLambertMaterial({ color: 0xf4c430, flatShading: true });
  const lanternGeo = new THREE.BoxGeometry(0.7, 0.8, 0.7);
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });

  const corners = [
    [-half - 2.6, -half - 2.6],
    [half + 2.6, -half - 2.6],
    [-half - 2.6, half + 2.6],
    [half + 2.6, half + 2.6],
  ];

  corners.forEach(([cx, cz]) => {
    const pillarGroup = new THREE.Group();
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 1.3;
    pillar.castShadow = true;
    pillarGroup.add(pillar);

    const lantern = new THREE.Mesh(lanternGeo, lanternMat);
    lantern.position.y = 4.2;
    pillarGroup.add(lantern);

    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 4.8;
    cap.castShadow = true;
    pillarGroup.add(cap);

    pillarGroup.position.set(cx, 0, cz);
    group.add(pillarGroup);
  });

  // 5. 遠景の低ポリゴン観客席／山並みシルエット（レトロ感向上）
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x4b5563, flatShading: true });
  const standNorth = new THREE.Mesh(new THREE.BoxGeometry(44, 3.2, 4), wallMat);
  standNorth.position.set(0, 0.2, -23);
  group.add(standNorth);

  const standWest = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 36), wallMat);
  standWest.position.set(-24, -0.1, 0);
  group.add(standWest);

  const standEast = standWest.clone();
  standEast.position.set(24, -0.1, 0);
  group.add(standEast);

  scene.add(group);
  return group;
}
