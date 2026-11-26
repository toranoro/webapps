/**
 * 3D麻雀牌（ベベル面取り・2トーン・UV付）および卓・点棒・影のジオメトリ生成
 */

export const TILE_W = 0.64;
export const TILE_H = 0.88;
export const TILE_D = 0.42;

/**
 * 面取り付き3D麻雀牌ジオメトリ
 * 頂点フォーマット: pos(3), normal(3), uv(2), color(3), faceType(1) -> 12 floats/vertex
 * faceType: 1.0 = 前面絵柄(atlas slot), 2.0 = 背面エッチング(slot 37), 0.0 = 側面ソリッドカラー
 */
export function createTileGeometry(w = TILE_W, h = TILE_H, d = TILE_D) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const faceTypes = [];
  const indices = [];

  const hw = w * 0.5;
  const hh = h * 0.5;
  const hd = d * 0.5;
  const bv = 0.036; // 面取り幅
  const splitZ = -hd + d * 0.34; // 背面グリーンと前面アイボリーの境界

  const ivory = [0.97, 0.95, 0.90];
  const ivorySide = [0.93, 0.90, 0.83];
  const jade = [0.09, 0.43, 0.27];
  const jadeDark = [0.07, 0.36, 0.22];

  function addQuad(p0, p1, p2, p3, n, uv0, uv1, uv2, uv3, col, fType) {
    const base = positions.length / 3;
    const pts = [p0, p1, p2, p3];
    const uvsList = [uv0, uv1, uv2, uv3];
    for (let i = 0; i < 4; i++) {
      positions.push(pts[i][0], pts[i][1], pts[i][2]);
      normals.push(n[0], n[1], n[2]);
      uvs.push(uvsList[i][0], uvsList[i][1]);
      colors.push(col[0], col[1], col[2]);
      faceTypes.push(fType);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  function norm3(x, y, z) {
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  }

  const iw = hw - bv;
  const ih = hh - bv;
  const fz = hd;
  const fzb = hd - bv;
  const bz = -hd;
  const bzb = -hd + bv;

  // 1. 前面 (絵柄面 +Z)
  addQuad(
    [-iw, -ih, fz], [iw, -ih, fz], [iw, ih, fz], [-iw, ih, fz],
    [0, 0, 1],
    [0, 1], [1, 1], [1, 0], [0, 0],
    ivory, 1.0
  );

  // 前面ベベル4辺
  addQuad([-iw, ih, fz], [iw, ih, fz], [iw, hh, fzb], [-iw, hh, fzb], norm3(0, 1, 1), [0,0],[1,0],[1,0],[0,0], ivory, 0.0);
  addQuad([-iw, -hh, fzb], [iw, -hh, fzb], [iw, -ih, fz], [-iw, -ih, fz], norm3(0, -1, 1), [0,0],[1,0],[1,0],[0,0], ivory, 0.0);
  addQuad([iw, -ih, fz], [hw, -ih, fzb], [hw, ih, fzb], [iw, ih, fz], norm3(1, 0, 1), [0,0],[1,0],[1,0],[0,0], ivory, 0.0);
  addQuad([-hw, -ih, fzb], [-iw, -ih, fz], [-iw, ih, fz], [-hw, ih, fzb], norm3(-1, 0, 1), [0,0],[1,0],[1,0],[0,0], ivory, 0.0);

  // 前面コーナー4隅
  function addTri(p0, p1, p2, n, col) {
    const base = positions.length / 3;
    for (const p of [p0, p1, p2]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
      uvs.push(0, 0);
      colors.push(col[0], col[1], col[2]);
      faceTypes.push(0.0);
    }
    indices.push(base, base + 1, base + 2);
  }
  addTri([iw, ih, fz], [hw, ih, fzb], [iw, hh, fzb], norm3(1, 1, 1), ivory);
  addTri([-iw, ih, fz], [-iw, hh, fzb], [-hw, ih, fzb], norm3(-1, 1, 1), ivory);
  addTri([iw, -ih, fz], [iw, -hh, fzb], [hw, -ih, fzb], norm3(1, -1, 1), ivory);
  addTri([-iw, -ih, fz], [-hw, -ih, fzb], [-iw, -hh, fzb], norm3(-1, -1, 1), ivory);

  // 2. 背面 (-Z: 翡翠グリーン)
  addQuad(
    [iw, -ih, bz], [-iw, -ih, bz], [-iw, ih, bz], [iw, ih, bz],
    [0, 0, -1],
    [0, 1], [1, 1], [1, 0], [0, 0],
    jade, 2.0
  );
  // 背面ベベル
  addQuad([iw, ih, bz], [-iw, ih, bz], [-iw, hh, bzb], [iw, hh, bzb], norm3(0, 1, -1), [0,0],[1,0],[1,0],[0,0], jadeDark, 0.0);
  addQuad([iw, -hh, bzb], [-iw, -hh, bzb], [-iw, -ih, bz], [iw, -ih, bz], norm3(0, -1, -1), [0,0],[1,0],[1,0],[0,0], jadeDark, 0.0);
  addQuad([hw, -ih, bzb], [hw, ih, bzb], [iw, ih, bz], [iw, -ih, bz], norm3(1, 0, -1), [0,0],[1,0],[1,0],[0,0], jadeDark, 0.0);
  addQuad([-iw, -ih, bz], [-iw, ih, bz], [-hw, ih, bzb], [-hw, -ih, bzb], norm3(-1, 0, -1), [0,0],[1,0],[1,0],[0,0], jadeDark, 0.0);

  // 背面コーナー
  addTri([iw, ih, bz], [iw, hh, bzb], [hw, ih, bzb], norm3(1, 1, -1), jadeDark);
  addTri([-iw, ih, bz], [-hw, ih, bzb], [-iw, hh, bzb], norm3(-1, 1, -1), jadeDark);
  addTri([iw, -ih, bz], [hw, -ih, bzb], [iw, -hh, bzb], norm3(1, -1, -1), jadeDark);
  addTri([-iw, -ih, bz], [-iw, -hh, bzb], [-hw, -ih, bzb], norm3(-1, -1, -1), jadeDark);

  // 3. 側面（2トーン分割：アイボリー部 + グリーン部）
  // 上面 (+Y)
  addQuad([-iw, hh, splitZ], [iw, hh, splitZ], [iw, hh, fzb], [-iw, hh, fzb], [0, 1, 0], [0,0],[1,0],[1,0],[0,0], ivorySide, 0.0);
  addQuad([-iw, hh, bzb], [iw, hh, bzb], [iw, hh, splitZ], [-iw, hh, splitZ], [0, 1, 0], [0,0],[1,0],[1,0],[0,0], jade, 0.0);
  // 下面 (-Y)
  addQuad([-iw, -hh, fzb], [iw, -hh, fzb], [iw, -hh, splitZ], [-iw, -hh, splitZ], [0, -1, 0], [0,0],[1,0],[1,0],[0,0], ivorySide, 0.0);
  addQuad([-iw, -hh, splitZ], [iw, -hh, splitZ], [iw, -hh, bzb], [-iw, -hh, bzb], [0, -1, 0], [0,0],[1,0],[1,0],[0,0], jade, 0.0);
  // 右面 (+X)
  addQuad([hw, -ih, fzb], [hw, ih, fzb], [hw, ih, splitZ], [hw, -ih, splitZ], [1, 0, 0], [0,0],[1,0],[1,0],[0,0], ivorySide, 0.0);
  addQuad([hw, -ih, splitZ], [hw, ih, splitZ], [hw, ih, bzb], [hw, -ih, bzb], [1, 0, 0], [0,0],[1,0],[1,0],[0,0], jade, 0.0);
  // 左面 (-X)
  addQuad([-hw, -ih, splitZ], [-hw, ih, splitZ], [-hw, ih, fzb], [-hw, -ih, fzb], [-1, 0, 0], [0,0],[1,0],[1,0],[0,0], ivorySide, 0.0);
  addQuad([-hw, -ih, bzb], [-hw, ih, bzb], [-hw, ih, splitZ], [-hw, -ih, splitZ], [-1, 0, 0], [0,0],[1,0],[1,0],[0,0], jade, 0.0);

  // 4辺コーナー縦繋ぎ
  addQuad([iw, hh, fzb], [hw, ih, fzb], [hw, ih, splitZ], [iw, hh, splitZ], norm3(1, 1, 0), [0,0],[1,0],[1,0],[0,0], ivorySide, 0.0);
  addQuad([iw, hh, splitZ], [hw, ih, splitZ], [hw, ih, bzb], [iw, hh, bzb], norm3(1, 1, 0), [0,0],[1,0],[1,0],[0,0], jade, 0.0);

  addQuad([-hw, ih, fzb], [-iw, hh, fzb], [-iw, hh, splitZ], [-hw, ih, splitZ], norm3(-1, 1, 0), [0,0],[1,0],[1,0],[0,0], ivorySide, 0.0);
  addQuad([-hw, ih, splitZ], [-iw, hh, splitZ], [-iw, hh, bzb], [-hw, ih, bzb], norm3(-1, 1, 0), [0,0],[1,0],[1,0],[0,0], jade, 0.0);

  addQuad([hw, -ih, fzb], [iw, -hh, fzb], [iw, -hh, splitZ], [hw, -ih, splitZ], norm3(1, -1, 0), [0,0],[1,0],[1,0],[0,0], ivorySide, 0.0);
  addQuad([hw, -ih, splitZ], [iw, -hh, splitZ], [iw, -hh, bzb], [hw, -ih, bzb], norm3(1, -1, 0), [0,0],[1,0],[1,0],[0,0], jade, 0.0);

  addQuad([-iw, -hh, fzb], [-hw, -ih, fzb], [-hw, -ih, splitZ], [-iw, -hh, splitZ], norm3(-1, -1, 0), [0,0],[1,0],[1,0],[0,0], ivorySide, 0.0);
  addQuad([-iw, -hh, splitZ], [-hw, -ih, splitZ], [-hw, -ih, bzb], [-iw, -hh, bzb], norm3(-1, -1, 0), [0,0],[1,0],[1,0],[0,0], jade, 0.0);

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    colors: new Float32Array(colors),
    faceTypes: new Float32Array(faceTypes),
    indices: new Uint16Array(indices),
  };
}

/**
 * 汎用ボックスジオメトリ（卓面・木枠・点棒用）
 */
export function createBoxGeometry(w, h, d, color = [1, 1, 1], uvRepeat = 1) {
  const hw = w * 0.5, hh = h * 0.5, hd = d * 0.5;
  const faces = [
    { n: [0, 0, 1],  pts: [[-hw,-hh,hd],[hw,-hh,hd],[hw,hh,hd],[-hw,hh,hd]] },
    { n: [0, 0, -1], pts: [[hw,-hh,-hd],[-hw,-hh,-hd],[-hw,hh,-hd],[hw,hh,-hd]] },
    { n: [0, 1, 0],  pts: [[-hw,hh,hd],[hw,hh,hd],[hw,hh,-hd],[-hw,hh,-hd]] },
    { n: [0, -1, 0], pts: [[-hw,-hh,-hd],[hw,-hh,-hd],[hw,-hh,hd],[-hw,-hh,hd]] },
    { n: [1, 0, 0],  pts: [[hw,-hh,hd],[hw,-hh,-hd],[hw,hh,-hd],[hw,hh,hd]] },
    { n: [-1, 0, 0], pts: [[-hw,-hh,-hd],[-hw,-hh,hd],[-hw,hh,hd],[-hw,hh,-hd]] },
  ];

  const positions = [], normals = [], uvs = [], colors = [], faceTypes = [], indices = [];
  for (const f of faces) {
    const base = positions.length / 3;
    const faceUvs = [[0,0],[uvRepeat,0],[uvRepeat,uvRepeat],[0,uvRepeat]];
    for (let i = 0; i < 4; i++) {
      positions.push(...f.pts[i]);
      normals.push(...f.n);
      uvs.push(...faceUvs[i]);
      colors.push(...color);
      faceTypes.push(0.0);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    colors: new Float32Array(colors),
    faceTypes: new Float32Array(faceTypes),
    indices: new Uint16Array(indices),
  };
}

/**
 * 接地ソフトシャドウ用XZ平面クワッド
 */
export function createShadowQuadGeometry() {
  return {
    positions: new Float32Array([
      -0.5, 0,  0.5,
       0.5, 0,  0.5,
       0.5, 0, -0.5,
      -0.5, 0, -0.5,
    ]),
    uvs: new Float32Array([
      0, 1,
      1, 1,
      1, 0,
      0, 0,
    ]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  };
}
