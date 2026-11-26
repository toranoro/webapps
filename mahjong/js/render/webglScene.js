/**
 * WebGL2 3D麻雀卓レンダラ
 * 外部ライブラリ不使用のPure WebGL2実装（PBR風スペキュラ、半球環境光、接地影、補間アニメ、レイキャスト）
 */
import {
  mat4Perspective, mat4LookAt, mat4Multiply, mat4Compose, mat4Invert,
  screenToWorldRay, intersectRayOBB,
} from './math3d.js';
import {
  ATLAS_COLS, ATLAS_ROWS, createTileAtlasCanvas, createFeltTextureCanvas, getAtlasSlotIndex,
} from './tileAtlas.js';
import {
  TILE_W, TILE_H, TILE_D, createTileGeometry, createBoxGeometry, createShadowQuadGeometry,
} from './geometry.js';

const TILE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in vec3 aColor;
layout(location = 4) in float aFaceType;

uniform mat4 uModel;
uniform mat4 uViewProj;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUv;
out vec3 vColor;
out float vFaceType;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vUv = aUv;
  vColor = aColor;
  vFaceType = aFaceType;
  gl_Position = uViewProj * wp;
}
`;

const TILE_FS = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUv;
in vec3 vColor;
in float vFaceType;

uniform sampler2D uAtlas;
uniform vec2 uAtlasGrid;
uniform float uSlotIndex;
uniform vec3 uEyePos;
uniform vec3 uHighlight;   // rgb tint / glow
uniform float uHighlightStrength;
uniform float uDim;        // 1.0 = normal, <1.0 = slightly dimmed

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uEyePos - vWorldPos);

  vec3 baseCol = vColor;
  if (vFaceType > 0.5) {
    float slot = (vFaceType > 1.5) ? 37.0 : uSlotIndex;
    float col = mod(slot, uAtlasGrid.x);
    float row = floor(slot / uAtlasGrid.x);
    vec2 cellSize = 1.0 / uAtlasGrid;
    vec2 pad = cellSize * 0.012;
    vec2 uv = vec2(col, row) * cellSize + pad + vUv * (cellSize - pad * 2.0);
    baseCol = texture(uAtlas, uv).rgb;
  }

  // 主光源（暖かみのある卓上ライト）
  vec3 L1 = normalize(vec3(2.4, 12.5, 5.2) - vWorldPos);
  // 補助リムライト
  vec3 L2 = normalize(vec3(-5.0, 8.0, -4.0) - vWorldPos);

  float diff1 = max(dot(N, L1), 0.0);
  float diff2 = max(dot(N, L2), 0.0);

  vec3 lit;
  if (vFaceType > 0.5 && vFaceType < 1.5) {
    // 絵柄面：白飛びを防ぎつつ文字・図柄の黒/赤/緑のコントラストをくっきり保ち、微光沢を乗せる
    vec3 H1 = normalize(L1 + V);
    float specFace = pow(max(dot(N, H1), 0.0), 64.0) * 0.09;
    float lightAmt = 0.72 + diff1 * 0.28 + diff2 * 0.08;
    lit = baseCol * lightAmt + vec3(specFace);
  } else {
    // 側面・背面・ベベル：立体感のある陰影＋光沢
    float hemi = N.y * 0.5 + 0.5;
    vec3 ambient = mix(vec3(0.32, 0.34, 0.28), vec3(0.58, 0.57, 0.54), hemi);
    vec3 H1 = normalize(L1 + V);
    float spec1 = pow(max(dot(N, H1), 0.0), 42.0) * 0.22;
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.09;
    lit = baseCol * (ambient + diff1 * vec3(0.52, 0.50, 0.47) + diff2 * vec3(0.14, 0.15, 0.16));
    lit += vec3(spec1 + fresnel);
  }

  // ハイライト / 選択 / おすすめ強調
  lit = mix(lit, lit * 0.76 + uHighlight * 0.52, uHighlightStrength);
  lit *= uDim;

  fragColor = vec4(clamp(lit, 0.0, 1.0), 1.0);
}
`;

const TABLE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in vec3 aColor;

uniform mat4 uModel;
uniform mat4 uViewProj;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUv;
out vec3 vColor;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vUv = aUv;
  vColor = aColor;
  gl_Position = uViewProj * wp;
}
`;

const TABLE_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUv;
in vec3 vColor;

uniform sampler2D uFeltTex;
uniform float uUseTex;
uniform vec3 uEyePos;
uniform float uRiichiMood;

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 base = vColor;
  if (uUseTex > 0.5) {
    base = texture(uFeltTex, vUv).rgb;
    float dist = length(vWorldPos.xz) / 5.8;
    float vignette = clamp(1.0 - dist * dist * 0.36, 0.45, 1.08);
    base *= vignette;
    if (uRiichiMood > 0.01) {
      base = mix(base, base * vec3(0.92, 0.88, 1.08), uRiichiMood * 0.35);
    }
  }

  vec3 L1 = normalize(vec3(2.0, 11.0, 4.5) - vWorldPos);
  float diff = max(dot(N, L1), 0.0);
  vec3 V = normalize(uEyePos - vWorldPos);
  vec3 H = normalize(L1 + V);
  float spec = (uUseTex > 0.5) ? 0.03 : pow(max(dot(N, H), 0.0), 28.0) * 0.22;

  vec3 lit = base * (vec3(0.45) + diff * vec3(0.65)) + vec3(spec);
  fragColor = vec4(clamp(lit, 0.0, 1.0), 1.0);
}
`;

const SHADOW_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUv;

uniform mat4 uModel;
uniform mat4 uViewProj;
out vec2 vUv;

void main() {
  vUv = aUv;
  gl_Position = uViewProj * uModel * vec4(aPos, 1.0);
}
`;

const SHADOW_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uAlpha;
out vec4 fragColor;

void main() {
  vec2 d = abs(vUv - 0.5) * 2.0;
  float r = length(max(d - vec2(0.55), 0.0)) / 0.45;
  float a = smoothstep(1.0, 0.0, clamp(r, 0.0, 1.0));
  fragColor = vec4(0.01, 0.04, 0.02, a * uAlpha);
}
`;

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error('Shader compile error: ' + log);
  }
  return s;
}

function createProgram(gl, vsSrc, fsSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

function createMeshVAO(gl, geom, hasFaceType = true) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  function bindBuf(loc, data, size) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  bindBuf(0, geom.positions, 3);
  if (geom.normals) bindBuf(1, geom.normals, 3);
  if (geom.uvs) bindBuf(hasFaceType || geom.normals ? 2 : 1, geom.uvs, 2);
  if (geom.colors) bindBuf(3, geom.colors, 3);
  if (hasFaceType && geom.faceTypes) bindBuf(4, geom.faceTypes, 1);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geom.indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return { vao, count: geom.indices.length };
}

export class Mahjong3DScene {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    if (!this.gl) {
      throw new Error('WebGL2 がサポートされていません。最新版のChrome/Safariをご利用ください。');
    }

    this.showBeginnerLabels = true;
    this.cameraTiltX = 0; // ユーザーの見回しオフセット
    this.cameraTiltY = 0;
    this.viewMode = 'auto'; // 'auto' | 'wide' | 'hand'

    this.snapshot = null;
    this.assist = null;
    this.selectedTileId = -1;
    this.hoveredTileId = -1;
    this.lastDiscardedTileId = -1;

    // アニメーション用牌状態キャッシュ (key -> animated state)
    this.animTiles = new Map();
    this.playerHandHitBoxes = []; // レイキャスト対象: { tileId, tile, modelMatrix }

    this.initGL();
    this.bindEvents();
    this.resize();
    this.startLoop();
  }

  initGL() {
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    this.tileProg = createProgram(gl, TILE_VS, TILE_FS);
    this.tableProg = createProgram(gl, TABLE_VS, TABLE_FS);
    this.shadowProg = createProgram(gl, SHADOW_VS, SHADOW_FS);

    this.tileMesh = createMeshVAO(gl, createTileGeometry(), true);
    this.tableFeltMesh = createMeshVAO(gl, createBoxGeometry(9.4, 0.24, 9.4, [0.1, 0.36, 0.24], 5.0), false);
    this.rimTopMesh = createMeshVAO(gl, createBoxGeometry(10.0, 0.38, 0.34, [0.24, 0.14, 0.08], 1.0), false);
    this.rimSideMesh = createMeshVAO(gl, createBoxGeometry(0.34, 0.38, 10.0, [0.24, 0.14, 0.08], 1.0), false);
    this.centerWellMesh = createMeshVAO(gl, createBoxGeometry(1.92, 0.03, 0.92, [0.06, 0.16, 0.12], 1.0), false);
    this.riichiStickMesh = createMeshVAO(gl, createBoxGeometry(1.15, 0.055, 0.11, [0.96, 0.96, 0.94], 1.0), false);
    this.riichiDotMesh = createMeshVAO(gl, createBoxGeometry(0.08, 0.065, 0.08, [0.88, 0.14, 0.16], 1.0), false);
    this.shadowMesh = createMeshVAO(gl, createShadowQuadGeometry(), false);

    // テクスチャ生成
    this.atlasTex = this.uploadTexture(createTileAtlasCanvas(this.showBeginnerLabels), true);
    this.feltTex = this.uploadTexture(createFeltTextureCanvas(), false);
  }

  uploadTexture(sourceCanvas, clamp = true) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    return tex;
  }

  setBeginnerLabels(enabled) {
    if (this.showBeginnerLabels === enabled) return;
    this.showBeginnerLabels = enabled;
    const gl = this.gl;
    gl.deleteTexture(this.atlasTex);
    this.atlasTex = this.uploadTexture(createTileAtlasCanvas(enabled), true);
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.cameraTiltX = 0;
    this.cameraTiltY = 0;
  }

  resetCameraTilt() {
    this.cameraTiltX = 0;
    this.cameraTiltY = 0;
  }

  updateGameState(snapshot, assist, lastDiscardedTileId = -1) {
    this.snapshot = snapshot;
    this.assist = assist;
    if (lastDiscardedTileId !== undefined) {
      this.lastDiscardedTileId = lastDiscardedTileId;
    }
    if (this.selectedTileId !== -1 && snapshot) {
      const p0 = snapshot.players[0];
      if (!p0.hand.some((t) => t.id === this.selectedTileId)) {
        this.selectedTileId = -1;
      }
    }
    this.rebuildTargetTransforms();
  }

  setSelectedTile(tileId) {
    this.selectedTileId = tileId;
    this.rebuildTargetTransforms();
  }

  bindEvents() {
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);

    let pointerDown = false;
    let startX = 0;
    let startY = 0;
    let moved = false;
    let hitTileOnDown = null;

    this.canvas.addEventListener('pointerdown', (e) => {
      pointerDown = true;
      startX = e.clientX;
      startY = e.clientY;
      moved = false;
      hitTileOnDown = this.pickHandTile(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (pointerDown) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.hypot(dx, dy) > 8) {
          moved = true;
        }
        // 牌以外をドラッグした時のみ軽くカメラをチルト
        if (moved && !hitTileOnDown) {
          this.cameraTiltX = Math.max(-0.45, Math.min(0.45, this.cameraTiltX - dx * 0.002));
          this.cameraTiltY = Math.max(-0.28, Math.min(0.28, this.cameraTiltY + dy * 0.002));
          startX = e.clientX;
          startY = e.clientY;
        }
      } else {
        const hit = this.pickHandTile(e.clientX, e.clientY);
        const newHover = hit ? hit.tileId : -1;
        if (newHover !== this.hoveredTileId) {
          this.hoveredTileId = newHover;
          this.canvas.style.cursor = newHover !== -1 ? 'pointer' : 'grab';
          this.rebuildTargetTransforms();
          if (this.callbacks.onTileHover) {
            this.callbacks.onTileHover(hit ? hit.tile : null);
          }
        }
      }
    });

    const handlePointerUp = (e) => {
      if (!pointerDown) return;
      pointerDown = false;
      if (!moved) {
        const hit = this.pickHandTile(e.clientX, e.clientY);
        if (hit && this.callbacks.onTileTap) {
          this.callbacks.onTileTap(hit.tile);
        } else if (!hit && this.selectedTileId !== -1 && this.callbacks.onEmptyTap) {
          this.callbacks.onEmptyTap();
        }
      }
    };

    this.canvas.addEventListener('pointerup', handlePointerUp);
    this.canvas.addEventListener('pointercancel', () => { pointerDown = false; });
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.aspect = w / Math.max(1, h);
    this.rebuildTargetTransforms();
  }

  getCameraMatrices() {
    const aspect = this.aspect || 1;
    const isPortrait = aspect < 1.0;

    let fovDeg = isPortrait ? 46 : 38;
    let eyeY = isPortrait ? 11.4 : 8.2;
    let eyeZ = isPortrait ? 13.0 : 8.9;
    let targetZ = isPortrait ? 1.45 : 1.05;

    if (this.viewMode === 'wide') {
      eyeY += 2.2;
      eyeZ += 1.6;
      targetZ -= 0.4;
    } else if (this.viewMode === 'hand') {
      eyeY -= 1.1;
      eyeZ -= 1.0;
      targetZ += 0.6;
    }

    const fovRad = (fovDeg * Math.PI) / 180;
    // 横向き・正方形付近では手牌位置で余裕を確保
    if (!isPortrait) {
      const hFovHalf = Math.atan(Math.tan(fovRad * 0.5) * aspect);
      const minDist = 5.1 / Math.max(0.35, Math.tan(hFovHalf));
      const curDist = Math.hypot(eyeY, eyeZ - targetZ);
      if (curDist < minDist) {
        const scale = minDist / curDist;
        eyeY *= scale;
        eyeZ = targetZ + (eyeZ - targetZ) * scale;
      }
    }

    const eye = [
      Math.sin(this.cameraTiltX) * 2.8,
      eyeY + this.cameraTiltY * 2.2,
      eyeZ,
    ];
    const target = [0, 0.0, targetZ];

    const proj = mat4Perspective(fovRad, aspect, 0.5, 60.0);
    const view = mat4LookAt(eye, target, [0, 1, 0]);
    const viewProj = mat4Multiply(proj, view);
    return { eye, viewProj, fovRad, targetZ };
  }

  getPlayerHandScale(camInfo, baseY, baseZ) {
    const aspect = this.aspect || 1;
    const dist = Math.hypot(camInfo.eye[1] - baseY, camInfo.eye[2] - baseZ);
    const visibleW = 2.0 * dist * Math.tan(camInfo.fovRad * 0.5) * aspect;
    const maxRawWidth = 13 * (TILE_W * 1.03) + 0.24 + TILE_W;
    return Math.max(0.42, Math.min(1.0, (visibleW * 0.90) / maxRawWidth));
  }

  pickHandTile(clientX, clientY) {
    if (!this.playerHandHitBoxes.length) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

    const { viewProj } = this.getCameraMatrices();
    const invVP = mat4Invert(viewProj);
    if (!invVP) return null;

    const ray = screenToWorldRay(ndcX, ndcY, invVP);
    const half = [TILE_W * 0.52, TILE_H * 0.54, TILE_D * 0.65];

    let bestDist = Infinity;
    let bestHit = null;
    for (const box of this.playerHandHitBoxes) {
      const d = intersectRayOBB(ray, box.modelMatrix, half);
      if (d !== null && d < bestDist) {
        bestDist = d;
        bestHit = box;
      }
    }
    return bestHit;
  }

  upsertTileTarget(key, tile, target) {
    let entry = this.animTiles.get(key);
    if (!entry) {
      entry = {
        key,
        tile,
        curPos: [...target.pos],
        curRot: [...target.rot],
        targetPos: [...target.pos],
        targetRot: [...target.rot],
        arcPeak: 0,
        arcProgress: 1,
        highlight: target.highlight || [0, 0, 0],
        highlightStrength: target.highlightStrength || 0,
        dim: target.dim ?? 1.0,
        faceUp: target.faceUp !== false,
        shadowScale: target.shadowScale || [1, 1],
        shadowAlpha: target.shadowAlpha ?? 0.36,
        scale: target.scale ?? 1.0,
        active: true,
        isPlayerHand: !!target.isPlayerHand,
      };
      // 新規捨て牌は少し上から降る演出
      if (target.spawnDrop) {
        entry.curPos[1] += 0.9;
        entry.arcPeak = 0.65;
        entry.arcProgress = 0;
      }
      this.animTiles.set(key, entry);
    } else {
      const dist = Math.hypot(
        entry.targetPos[0] - target.pos[0],
        entry.targetPos[1] - target.pos[1],
        entry.targetPos[2] - target.pos[2]
      );
      if (dist > 0.8 && target.allowArc) {
        entry.arcPeak = 0.7;
        entry.arcProgress = 0;
      }
      entry.tile = tile;
      entry.targetPos = [...target.pos];
      entry.targetRot = [...target.rot];
      entry.highlight = target.highlight || [0, 0, 0];
      entry.highlightStrength = target.highlightStrength || 0;
      entry.dim = target.dim ?? 1.0;
      entry.faceUp = target.faceUp !== false;
      entry.shadowScale = target.shadowScale || [1, 1];
      entry.shadowAlpha = target.shadowAlpha ?? 0.36;
      entry.scale = target.scale ?? 1.0;
      entry.isPlayerHand = !!target.isPlayerHand;
      entry.active = true;
    }
    return entry;
  }

  rebuildTargetTransforms() {
    if (!this.snapshot) return;

    for (const entry of this.animTiles.values()) {
      entry.active = false;
    }

    const snap = this.snapshot;
    const isPortrait = (this.aspect || 1) < 1.0;

    // 1) 中央ドラ表示牌（最大4枚）＋小さな山飾り（中央コンソール上辺へコンパクト配置）
    const doraInds = snap.doraIndicators || [];
    const doraScale = 0.68;
    for (let i = 0; i < 4; i++) {
      const x = -0.68 + i * (TILE_W * 1.02 * doraScale);
      if (i < doraInds.length) {
        const t = doraInds[i];
        this.upsertTileTarget(`dora_${t.id}`, t, {
          pos: [x, TILE_D * 0.5 * doraScale + 0.02, -0.58],
          rot: [-Math.PI * 0.5, 0, 0],
          scale: doraScale,
          shadowScale: [0.85 * doraScale, 1.05 * doraScale],
          shadowAlpha: 0.34,
          highlight: [1.0, 0.84, 0.25],
          highlightStrength: 0.12,
        });
      } else {
        this.upsertTileTarget(`dora_back_${i}`, { id: 900 + i, type: 0, isRed: false }, {
          pos: [x, TILE_D * 0.5 * doraScale + 0.02, -0.58],
          rot: [Math.PI * 0.5, 0, 0], // 裏向き（オレンジ）
          scale: doraScale,
          shadowScale: [0.85 * doraScale, 1.05 * doraScale],
          shadowAlpha: 0.30,
        });
      }
    }

    // 2) 各プレイヤーの河（捨て牌）・手牌・副露
    const nPlayers = snap.players.length;
    const seatAngles = nPlayers === 2 ? [0, Math.PI] : [0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5];
    const riverScale = 0.78;
    const meldScale = 0.72;
    const aiHandScale = 0.62;

    for (let pIdx = 0; pIdx < nPlayers; pIdx++) {
      const p = snap.players[pIdx];
      const angle = seatAngles[pIdx];
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const toWorld = (lx, ly, lz) => [
        lx * cosA + lz * sinA,
        ly,
        -lx * sinA + lz * cosA,
      ];

      // 捨て牌（河）：6枚×3段、少し小ぶりにして中央周りに余裕を確保
      let col = 0;
      let row = 0;
      for (let dIdx = 0; dIdx < p.discards.length; dIdx++) {
        const d = p.discards[dIdx];
        if (d.calledBy >= 0) continue;

        const stepX = TILE_W * 0.98 * riverScale;
        const stepZ = TILE_H * 0.98 * riverScale;
        const extraRotY = d.isRiichiTile ? Math.PI * 0.5 : 0;
        const lx = -stepX * 2.5 + col * stepX + (d.isRiichiTile ? 0.08 : 0);
        const lz = 1.42 + row * stepZ;

        const isLatestDiscard = d.tile.id === this.lastDiscardedTileId;
        this.upsertTileTarget(`tile_${d.tile.id}`, d.tile, {
          pos: toWorld(lx, TILE_D * 0.5 * riverScale, lz),
          rot: [-Math.PI * 0.5, angle + extraRotY, 0],
          scale: riverScale,
          highlight: isLatestDiscard ? [0.25, 0.92, 1.0] : [0, 0, 0],
          highlightStrength: isLatestDiscard ? 0.25 : 0.0,
          shadowScale: d.isRiichiTile ? [1.25 * riverScale, 0.8 * riverScale] : [0.95 * riverScale, 1.15 * riverScale],
          shadowAlpha: 0.36,
          allowArc: true,
          spawnDrop: true,
        });

        col++;
        if (col >= 6 && row < 3) {
          col = 0;
          row++;
        }
      }

      // 副露（鳴き）：各家右手前角
      let meldCursorX = 3.85;
      for (let mIdx = 0; mIdx < p.melds.length; mIdx++) {
        const m = p.melds[mIdx];
        for (let tIdx = 0; tIdx < m.tiles.length; tIdx++) {
          const mt = m.tiles[tIdx];
          const isCalled = mt.id === m.calledTileId;
          const isAnkanHidden = m.type === 'ankan' && (tIdx === 0 || tIdx === 3);
          const lx = meldCursorX - tIdx * (TILE_W * 0.96 * meldScale);
          const lz = 3.65;
          this.upsertTileTarget(`tile_${mt.id}`, mt, {
            pos: toWorld(lx, TILE_D * 0.5 * meldScale, lz),
            rot: [isAnkanHidden ? Math.PI * 0.5 : -Math.PI * 0.5, angle + (isCalled ? Math.PI * 0.5 : 0), 0],
            scale: meldScale,
            shadowScale: [0.9 * meldScale, 1.1 * meldScale],
            shadowAlpha: 0.34,
          });
        }
        meldCursorX -= (m.tiles.length * TILE_W * 0.98 * meldScale + 0.16);
      }

      // 手牌
      if (pIdx === 0) {
        // あなたの手牌：カメラに対して正面を向くようにし、アスペクト比に応じて自動スケール
        const hand = p.hand;
        const count = hand.length;
        const hasDrawnGap = snap.turnPlayer === 0 && p.drawnTileId !== -1 && hand.some((t) => t.id === p.drawnTileId);
        const baseZ = isPortrait ? 4.65 : 4.45;
        const camInfo = this.getCameraMatrices();
        const baseY = 0.58 * TILE_H * this.getPlayerHandScale(camInfo, 0.55, baseZ) + 0.18;
        const handScale = this.getPlayerHandScale(camInfo, baseY, baseZ);
        const pitch = TILE_W * 1.03 * handScale;
        const gap = 0.24 * handScale;
        const totalWidth = (count - 1) * pitch + (hasDrawnGap ? gap : 0);
        const startX = -totalWidth * 0.5;
        // カメラ視線角に正対させて正面からくっきり見えるようにする
        const camPitch = Math.atan2(camInfo.eye[1] - baseY, camInfo.eye[2] - baseZ);
        const tilt = -camPitch;

        const ordered = [];
        let drawnEntry = null;
        for (const t of hand) {
          if (hasDrawnGap && t.id === p.drawnTileId) drawnEntry = t;
          else ordered.push(t);
        }
        if (drawnEntry) ordered.push(drawnEntry);

        const bestType = this.assist?.isMyTurn ? this.assist.bestDiscardType : null;
        const isRiichiLocked = p.isRiichi;

        for (let i = 0; i < ordered.length; i++) {
          const t = ordered[i];
          const isDrawn = hasDrawnGap && t.id === p.drawnTileId;
          const x = startX + i * pitch + (isDrawn ? gap : 0);
          const isSel = t.id === this.selectedTileId;
          const isHov = t.id === this.hoveredTileId;
          const isBest = bestType !== null && t.type === bestType;

          let liftY = 0;
          let liftZ = 0;
          if (isSel) {
            liftY = 0.34 * handScale;
            liftZ = -0.14 * handScale;
          } else if (isHov) {
            liftY = 0.16 * handScale;
            liftZ = -0.06 * handScale;
          }

          let highlight = [0, 0, 0];
          let hStr = 0;
          if (isSel) {
            highlight = [1.0, 0.85, 0.25];
            hStr = 0.34;
          } else if (isBest && this.callbacks.shouldHighlightBest?.()) {
            highlight = [0.28, 0.95, 0.62];
            hStr = 0.18;
          }

          const dim = (isRiichiLocked && !isDrawn && snap.turnPlayer === 0) ? 0.72 : 1.0;

          this.upsertTileTarget(`tile_${t.id}`, t, {
            pos: [x, baseY + liftY, baseZ + liftZ],
            rot: [tilt, 0, 0],
            highlight,
            highlightStrength: hStr,
            dim,
            scale: handScale,
            shadowScale: [1.05 * handScale, 0.85 * handScale],
            shadowAlpha: isSel ? 0.22 : 0.42,
            isPlayerHand: true,
          });
        }
      } else {
        // AIの手牌：通常時は小ぶりサイズで自分の側（外側）を向き、プレイヤーからは背面オレンジ＋天面の白だけが見える！
        // 和了・流局時は手牌を倒してオープン表示
        const hand = p.hand;
        const pitch = TILE_W * 1.01 * aiHandScale;
        const totalWidth = (hand.length - 1) * pitch;
        const startX = -totalWidth * 0.5;
        const reveal = snap.phase === 'ROUND_END' || snap.phase === 'MATCH_END';

        for (let i = 0; i < hand.length; i++) {
          const t = hand[i];
          const lx = startX + i * pitch;
          const lz = 4.35;
          this.upsertTileTarget(`tile_${t.id}`, t, {
            pos: toWorld(lx, (reveal ? TILE_D : TILE_H) * 0.5 * aiHandScale, lz),
            rot: reveal ? [-Math.PI * 0.5, angle, 0] : [0, angle, 0],
            scale: aiHandScale,
            shadowScale: [0.95 * aiHandScale, 0.8 * aiHandScale],
            shadowAlpha: 0.34,
          });
        }
      }
    }

    // 非アクティブな牌を掃除
    for (const [k, entry] of this.animTiles.entries()) {
      if (!entry.active) this.animTiles.delete(k);
    }
  }

  startLoop() {
    let lastTime = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      this.stepAnimations(dt);
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stepAnimations(dt) {
    const smooth = 1.0 - Math.exp(-dt * 18.0);
    for (const entry of this.animTiles.values()) {
      for (let i = 0; i < 3; i++) {
        entry.curPos[i] += (entry.targetPos[i] - entry.curPos[i]) * smooth;
        // 角度の最短補間
        let diff = entry.targetRot[i] - entry.curRot[i];
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        entry.curRot[i] += diff * smooth;
      }
      if (entry.arcProgress < 1.0) {
        entry.arcProgress = Math.min(1.0, entry.arcProgress + dt * 3.8);
      }
    }
  }

  render() {
    const gl = this.gl;
    gl.clearColor(0.035, 0.095, 0.072, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const { eye, viewProj } = this.getCameraMatrices();
    const anyRiichi = this.snapshot?.players.some((p) => p.isRiichi) ? 1.0 : 0.0;

    // 1) 麻雀卓・枠・リーチ棒の描画
    gl.useProgram(this.tableProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.tableProg, 'uViewProj'), false, viewProj);
    gl.uniform3fv(gl.getUniformLocation(this.tableProg, 'uEyePos'), eye);
    gl.uniform1f(gl.getUniformLocation(this.tableProg, 'uRiichiMood'), anyRiichi);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.feltTex);
    gl.uniform1i(gl.getUniformLocation(this.tableProg, 'uFeltTex'), 0);

    const drawTablePart = (mesh, pos, rotY, useTex) => {
      const model = mat4Compose(pos, 0, rotY, 0);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.tableProg, 'uModel'), false, model);
      gl.uniform1f(gl.getUniformLocation(this.tableProg, 'uUseTex'), useTex ? 1.0 : 0.0);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    };

    drawTablePart(this.tableFeltMesh, [0, -0.12, 0], 0, true);
    drawTablePart(this.centerWellMesh, [0, 0.0, -0.58], 0, false);
    drawTablePart(this.rimTopMesh, [0, 0.06, -4.85], 0, false);
    drawTablePart(this.rimTopMesh, [0, 0.06,  4.85], 0, false);
    drawTablePart(this.rimSideMesh, [-4.85, 0.06, 0], 0, false);
    drawTablePart(this.rimSideMesh, [ 4.85, 0.06, 0], 0, false);

    // リーチ棒の描画
    if (this.snapshot) {
      const nPlayers = this.snapshot.players.length;
      const stickOffsets = nPlayers === 2
        ? [
            { pos: [0, 0.03, 1.18], rotY: 0 },
            { pos: [0, 0.03, -1.18], rotY: 0 },
          ]
        : [
            { pos: [0, 0.03, 1.18], rotY: 0 },
            { pos: [1.18, 0.03, 0], rotY: Math.PI * 0.5 },
            { pos: [0, 0.03, -1.18], rotY: 0 },
            { pos: [-1.18, 0.03, 0], rotY: Math.PI * 0.5 },
          ];
      for (let i = 0; i < nPlayers; i++) {
        if (this.snapshot.players[i].isRiichi) {
          const st = stickOffsets[i];
          drawTablePart(this.riichiStickMesh, st.pos, st.rotY, false);
          drawTablePart(this.riichiDotMesh, [st.pos[0], st.pos[1] + 0.005, st.pos[2]], st.rotY, false);
        }
      }
    }

    // 2) ソフトシャドウの描画
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(this.shadowProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowProg, 'uViewProj'), false, viewProj);
    gl.bindVertexArray(this.shadowMesh.vao);

    for (const entry of this.animTiles.values()) {
      const sModel = mat4Compose(
        [entry.curPos[0] + 0.04, 0.008, entry.curPos[2] + 0.05],
        0, entry.curRot[1], 0,
        [TILE_W * 1.15 * entry.shadowScale[0], 1, TILE_H * 0.95 * entry.shadowScale[1]]
      );
      gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowProg, 'uModel'), false, sModel);
      gl.uniform1f(gl.getUniformLocation(this.shadowProg, 'uAlpha'), entry.shadowAlpha);
      gl.drawElements(gl.TRIANGLES, this.shadowMesh.count, gl.UNSIGNED_SHORT, 0);
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // 3) すべての3D牌の描画 & ヒットボックス更新
    gl.useProgram(this.tileProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.tileProg, 'uViewProj'), false, viewProj);
    gl.uniform3fv(gl.getUniformLocation(this.tileProg, 'uEyePos'), eye);
    gl.uniform2f(gl.getUniformLocation(this.tileProg, 'uAtlasGrid'), ATLAS_COLS, ATLAS_ROWS);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(gl.getUniformLocation(this.tileProg, 'uAtlas'), 0);

    const uModelLoc = gl.getUniformLocation(this.tileProg, 'uModel');
    const uSlotLoc = gl.getUniformLocation(this.tileProg, 'uSlotIndex');
    const uHighLoc = gl.getUniformLocation(this.tileProg, 'uHighlight');
    const uHighStrLoc = gl.getUniformLocation(this.tileProg, 'uHighlightStrength');
    const uDimLoc = gl.getUniformLocation(this.tileProg, 'uDim');

    gl.bindVertexArray(this.tileMesh.vao);

    const hitBoxes = [];
    for (const entry of this.animTiles.values()) {
      const arcY = entry.arcProgress < 1.0 ? Math.sin(entry.arcProgress * Math.PI) * entry.arcPeak : 0;
      const pos = [entry.curPos[0], entry.curPos[1] + arcY, entry.curPos[2]];
      const s = entry.scale || 1.0;
      const model = mat4Compose(pos, entry.curRot[0], entry.curRot[1], entry.curRot[2], [s, s, s]);

      if (entry.isPlayerHand) {
        hitBoxes.push({ tileId: entry.tile.id, tile: entry.tile, modelMatrix: model });
      }

      const slot = getAtlasSlotIndex(entry.tile.type, entry.tile.isRed);
      gl.uniformMatrix4fv(uModelLoc, false, model);
      gl.uniform1f(uSlotLoc, slot);
      gl.uniform3fv(uHighLoc, entry.highlight);
      gl.uniform1f(uHighStrLoc, entry.highlightStrength);
      gl.uniform1f(uDimLoc, entry.dim);
      gl.drawElements(gl.TRIANGLES, this.tileMesh.count, gl.UNSIGNED_SHORT, 0);
    }
    this.playerHandHitBoxes = hitBoxes;
    gl.bindVertexArray(null);
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
  }
}
