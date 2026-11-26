/**
 * 軽量 3D数学・行列演算・レイキャスティングユーティリティ
 */
export function mat4Identity() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}

export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    const b0 = b[c*4], b1 = b[c*4+1], b2 = b[c*4+2], b3 = b[c*4+3];
    out[c*4]   = a[0]*b0 + a[4]*b1 + a[8]*b2  + a[12]*b3;
    out[c*4+1] = a[1]*b0 + a[5]*b1 + a[9]*b2  + a[13]*b3;
    out[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
    out[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
  }
  return out;
}

export function mat4Perspective(fovRad, aspect, near, far) {
  const f = 1.0 / Math.tan(fovRad * 0.5);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) * nf; out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function mat4LookAt(eye, target, up) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;
  let xx = up[1]*zz - up[2]*zy, xy = up[2]*zx - up[0]*zz, xz = up[0]*zy - up[1]*zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;
  const yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;

  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx*eye[0] + xy*eye[1] + xz*eye[2]),
    -(yx*eye[0] + yy*eye[1] + yz*eye[2]),
    -(zx*eye[0] + zy*eye[1] + zz*eye[2]),
    1,
  ]);
}

export function mat4Compose(pos, rotX, rotY, rotZ, scale = [1, 1, 1]) {
  const cx = Math.cos(rotX), sx = Math.sin(rotX);
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  const cz = Math.cos(rotZ), sz = Math.sin(rotZ);
  return new Float32Array([
    (cy * cz + sy * sx * sz) * scale[0], (cx * sz) * scale[0], (-sy * cz + cy * sx * sz) * scale[0], 0,
    (-cy * sz + sy * sx * cz) * scale[1], (cx * cz) * scale[1], (sy * sz + cy * sx * cz) * scale[1], 0,
    (sy * cx) * scale[2], (-sx) * scale[2], (cy * cx) * scale[2], 0,
    pos[0], pos[1], pos[2], 1,
  ]);
}

export function mat4Invert(m) {
  const inv = new Float32Array(16);
  inv[0] = m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
  inv[4] = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
  inv[8] = m[4]*m[9]*m[15] - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
  inv[12] = -m[4]*m[9]*m[14] + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
  inv[1] = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
  inv[5] = m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
  inv[9] = -m[0]*m[9]*m[15] + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
  inv[13] = m[0]*m[9]*m[14] - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
  inv[2] = m[1]*m[6]*m[15] - m[1]*m[7]*m[14] - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7] - m[13]*m[3]*m[6];
  inv[6] = -m[0]*m[6]*m[15] + m[0]*m[7]*m[14] + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7] + m[12]*m[3]*m[6];
  inv[10] = m[0]*m[5]*m[15] - m[0]*m[7]*m[13] - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7] - m[12]*m[3]*m[5];
  inv[14] = -m[0]*m[5]*m[14] + m[0]*m[6]*m[13] + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6] + m[12]*m[2]*m[5];
  inv[3] = -m[1]*m[6]*m[11] + m[1]*m[7]*m[10] + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7] + m[9]*m[3]*m[6];
  inv[7] = m[0]*m[6]*m[11] - m[0]*m[7]*m[10] - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7] - m[8]*m[3]*m[6];
  inv[11] = -m[0]*m[5]*m[11] + m[0]*m[7]*m[9] + m[4]*m[1]*m[11] - m[4]*m[3]*m[9] - m[8]*m[1]*m[7] + m[8]*m[3]*m[5];
  inv[15] = m[0]*m[5]*m[10] - m[0]*m[6]*m[9] - m[4]*m[1]*m[10] + m[4]*m[2]*m[9] + m[8]*m[1]*m[6] - m[8]*m[2]*m[5];
  let det = m[0]*inv[0] + m[1]*inv[4] + m[2]*inv[8] + m[3]*inv[12];
  if (Math.abs(det) < 1e-8) return null;
  det = 1.0 / det;
  for (let i = 0; i < 16; i++) inv[i] *= det;
  return inv;
}

function transformVec4(m, v) {
  return [
    m[0]*v[0] + m[4]*v[1] + m[8]*v[2]  + m[12]*v[3],
    m[1]*v[0] + m[5]*v[1] + m[9]*v[2]  + m[13]*v[3],
    m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14]*v[3],
    m[3]*v[0] + m[7]*v[1] + m[11]*v[2] + m[15]*v[3],
  ];
}

export function screenToWorldRay(ndcX, ndcY, invViewProj) {
  const nearP = transformVec4(invViewProj, [ndcX, ndcY, -1, 1]);
  const farP  = transformVec4(invViewProj, [ndcX, ndcY,  1, 1]);
  const n = [nearP[0]/nearP[3], nearP[1]/nearP[3], nearP[2]/nearP[3]];
  const f = [farP[0]/farP[3],   farP[1]/farP[3],   farP[2]/farP[3]];
  let dx = f[0] - n[0], dy = f[1] - n[1], dz = f[2] - n[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  return { origin: n, dir: [dx / len, dy / len, dz / len] };
}

export function intersectRayOBB(ray, modelMatrix, halfExtents) {
  const invM = mat4Invert(modelMatrix);
  if (!invM) return null;
  const o4 = transformVec4(invM, [ray.origin[0], ray.origin[1], ray.origin[2], 1]);
  const d4 = transformVec4(invM, [ray.dir[0], ray.dir[1], ray.dir[2], 0]);
  const orig = [o4[0], o4[1], o4[2]];
  const dir = [d4[0], d4[1], d4[2]];

  let tMin = -Infinity, tMax = Infinity;
  for (let i = 0; i < 3; i++) {
    const e = halfExtents[i];
    if (Math.abs(dir[i]) < 1e-6) {
      if (orig[i] < -e || orig[i] > e) return null;
    } else {
      let t1 = (-e - orig[i]) / dir[i];
      let t2 = (e - orig[i]) / dir[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }
  }
  return tMin > 0 ? tMin : (tMax > 0 ? tMax : null);
}
