(function (global) {
  'use strict';
  const B3B = (global.Beauty3Block = global.Beauty3Block || {});

  const JEWEL_DEFS = [
    {
      id: 0,
      name: 'Ruby',
      jp: 'ルビー',
      cut: 'octagon',
      light: '#ff96b8',
      mid: '#e61c5d',
      dark: '#6e0727',
      core: '#ff477e',
      glow: 'rgba(255, 56, 118, 0.55)',
      shard: '#ff5c8d'
    },
    {
      id: 1,
      name: 'Sapphire',
      jp: 'サファイア',
      cut: 'brilliant',
      light: '#94dcff',
      mid: '#1f7aff',
      dark: '#0c2378',
      core: '#4fa8ff',
      glow: 'rgba(56, 152, 255, 0.55)',
      shard: '#5eb6ff'
    },
    {
      id: 2,
      name: 'Emerald',
      jp: 'エメラルド',
      cut: 'emerald',
      light: '#8effcf',
      mid: '#0fc776',
      dark: '#044d2d',
      core: '#3be898',
      glow: 'rgba(26, 222, 138, 0.55)',
      shard: '#46f0a5'
    },
    {
      id: 3,
      name: 'Topaz',
      jp: 'トパーズ',
      cut: 'diamond',
      light: '#fff099',
      mid: '#f5a614',
      dark: '#854503',
      core: '#ffc947',
      glow: 'rgba(255, 196, 52, 0.55)',
      shard: '#ffd35c'
    },
    {
      id: 4,
      name: 'Amethyst',
      jp: 'アメジスト',
      cut: 'hexagon',
      light: '#e8b3ff',
      mid: '#9b3df5',
      dark: '#3d0b7a',
      core: '#bd70ff',
      glow: 'rgba(176, 92, 255, 0.55)',
      shard: '#c884ff'
    },
    {
      id: 5,
      name: 'Aquamarine',
      jp: 'アクアマリン',
      cut: 'teardrop',
      light: '#d6ffff',
      mid: '#22d3ee',
      dark: '#0a5e78',
      core: '#6ff2ff',
      glow: 'rgba(64, 232, 255, 0.55)',
      shard: '#80f4ff'
    }
  ];

  const MAGIC_ID = 6;

  function makePolygonPoints(cx, cy, r, cut, scale = 1) {
    const s = r * scale;
    if (cut === 'octagon') {
      const k = s * 0.43;
      return [
        [cx - k, cy - s], [cx + k, cy - s],
        [cx + s, cy - k], [cx + s, cy + k],
        [cx + k, cy + s], [cx - k, cy + s],
        [cx - s, cy + k], [cx - s, cy - k]
      ];
    }
    if (cut === 'emerald') {
      const w = s * 0.88;
      const h = s * 1.02;
      const c = s * 0.28;
      return [
        [cx - w + c, cy - h], [cx + w - c, cy - h],
        [cx + w, cy - h + c], [cx + w, cy + h - c],
        [cx + w - c, cy + h], [cx - w + c, cy + h],
        [cx - w, cy + h - c], [cx - w, cy - h + c]
      ];
    }
    if (cut === 'diamond') {
      const w = s * 1.04;
      const h = s * 1.04;
      return [
        [cx, cy - h],
        [cx + w, cy],
        [cx, cy + h],
        [cx - w, cy]
      ];
    }
    if (cut === 'hexagon') {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        pts.push([cx + Math.cos(a) * s * 1.02, cy + Math.sin(a) * s * 1.02]);
      }
      return pts;
    }
    if (cut === 'teardrop') {
      // Shield / marquise-star cut for crisp distinction
      return [
        [cx, cy - s * 1.04],
        [cx + s * 0.82, cy - s * 0.36],
        [cx + s * 0.66, cy + s * 0.72],
        [cx, cy + s * 1.04],
        [cx - s * 0.66, cy + s * 0.72],
        [cx - s * 0.82, cy - s * 0.36]
      ];
    }
    // brilliant (10-gon)
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push([cx + Math.cos(a) * s, cy + Math.sin(a) * s]);
    }
    return pts;
  }

  function tracePoly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.closePath();
  }

  class JewelRenderer {
    constructor() {
      this.cache = new Map();
      this.cachedKey = '';
    }

    _ensureCache(cellPx) {
      const rounded = Math.max(16, Math.round(cellPx));
      const key = String(rounded);
      if (this.cachedKey === key && this.cache.size === JEWEL_DEFS.length) return;
      this.cache.clear();
      this.cachedKey = key;

      for (const def of JEWEL_DEFS) {
        const canvas = document.createElement('canvas');
        canvas.width = rounded;
        canvas.height = rounded;
        const ctx = canvas.getContext('2d');
        this._paintJewelToContext(ctx, rounded, def);
        this.cache.set(def.id, canvas);
      }
    }

    _paintJewelToContext(ctx, size, def) {
      const cx = size / 2;
      const cy = size / 2;
      const r = size * 0.41;

      ctx.clearRect(0, 0, size, size);

      // Soft ambient drop shadow & colored bloom
      ctx.save();
      ctx.shadowColor = def.glow;
      ctx.shadowBlur = Math.max(4, size * 0.14);
      const outerPts = makePolygonPoints(cx, cy, r, def.cut, 1);
      tracePoly(ctx, outerPts);
      const baseGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      baseGrad.addColorStop(0, def.light);
      baseGrad.addColorStop(0.45, def.mid);
      baseGrad.addColorStop(1, def.dark);
      ctx.fillStyle = baseGrad;
      ctx.fill();
      ctx.restore();

      // Facet spokes from outer vertices to inner table vertices
      const innerPts = makePolygonPoints(cx, cy, r, def.cut, 0.56);
      const n = outerPts.length;
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        ctx.beginPath();
        ctx.moveTo(outerPts[i][0], outerPts[i][1]);
        ctx.lineTo(outerPts[next][0], outerPts[next][1]);
        ctx.lineTo(innerPts[next][0], innerPts[next][1]);
        ctx.lineTo(innerPts[i][0], innerPts[i][1]);
        ctx.closePath();

        // Simulate directional crystal light from top-left
        const mx = (outerPts[i][0] + outerPts[next][0]) * 0.5 - cx;
        const my = (outerPts[i][1] + outerPts[next][1]) * 0.5 - cy;
        const lightDot = (-mx - my) / (r * 1.42);
        if (lightDot > 0.25) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.36)';
        } else if (lightDot > -0.15) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        } else {
          ctx.fillStyle = 'rgba(0, 0, 20, 0.26)';
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = Math.max(0.75, size * 0.018);
        ctx.stroke();
      }

      // Inner jewel table with rich radial depth
      tracePoly(ctx, innerPts);
      const innerGrad = ctx.createRadialGradient(
        cx - r * 0.16,
        cy - r * 0.16,
        r * 0.05,
        cx,
        cy,
        r * 0.65
      );
      innerGrad.addColorStop(0, def.light);
      innerGrad.addColorStop(0.55, def.core);
      innerGrad.addColorStop(1, def.dark);
      ctx.fillStyle = innerGrad;
      ctx.fill();

      // Specular crown highlight
      ctx.save();
      tracePoly(ctx, innerPts);
      ctx.clip();
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.18, cy - r * 0.24, r * 0.36, r * 0.18, -0.45, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.fill();
      ctx.restore();

      // Crisp outer crystal rim
      tracePoly(ctx, outerPts);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.68)';
      ctx.lineWidth = Math.max(1, size * 0.026);
      ctx.stroke();

      // Sharp star glint on top-left corner
      const gx = cx - r * 0.34;
      const gy = cy - r * 0.36;
      const gl = size * 0.075;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = Math.max(1, size * 0.022);
      ctx.beginPath();
      ctx.moveTo(gx - gl, gy);
      ctx.lineTo(gx + gl, gy);
      ctx.moveTo(gx, gy - gl);
      ctx.lineTo(gx, gy + gl);
      ctx.stroke();
    }

    drawJewel(ctx, jewelId, x, y, cellSize, timeSec = 0, options = {}) {
      const { alpha = 1, scale = 1, flash = 0, ghost = false } = options;
      if (jewelId === null || jewelId === undefined) return;

      ctx.save();
      ctx.globalAlpha = alpha * (ghost ? 0.26 : 1);

      const cx = x + cellSize * 0.5;
      const cy = y + cellSize * 0.5;
      if (scale !== 1) {
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
      }

      if (jewelId === MAGIC_ID) {
        this._drawMagicJewel(ctx, x, y, cellSize, timeSec, ghost);
      } else {
        this._ensureCache(cellSize);
        const sprite = this.cache.get(jewelId);
        if (sprite) {
          ctx.drawImage(sprite, x, y, cellSize, cellSize);
        }
      }

      if (flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.9, flash)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, cellSize * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    _drawMagicJewel(ctx, x, y, size, timeSec, ghost) {
      const cx = x + size * 0.5;
      const cy = y + size * 0.5;
      const r = size * 0.42;
      const hue = (timeSec * 160) % 360;

      ctx.save();
      if (!ghost) {
        ctx.shadowColor = `hsla(${hue}, 95%, 68%, 0.85)`;
        ctx.shadowBlur = Math.max(6, size * 0.18);
      }

      // 8-point prism star
      const pts = [];
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8 + timeSec * 1.4;
        const rad = i % 2 === 0 ? r * 1.06 : r * 0.68;
        pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
      }
      tracePoly(ctx, pts);
      const grad = ctx.createLinearGradient(x, y, x + size, y + size);
      grad.addColorStop(0, `hsl(${hue}, 95%, 76%)`);
      grad.addColorStop(0.5, `hsl(${(hue + 110) % 360}, 95%, 64%)`);
      grad.addColorStop(1, `hsl(${(hue + 220) % 360}, 95%, 62%)`);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.2, size * 0.03);
      ctx.stroke();

      // White prism core
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.fill();
      ctx.restore();
    }
  }

  B3B.JEWEL_DEFS = JEWEL_DEFS;
  B3B.MAGIC_ID = MAGIC_ID;
  B3B.JewelRenderer = JewelRenderer;
})(window);
