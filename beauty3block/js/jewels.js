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
  const SUPPORT_WEIGHT = 10;
  const SUPPORT_MIRROR = 11;
  const SUPPORT_ROD = 12;
  const SUPPORT_BOMB = 13;

  function isSupportId(id) {
    return id >= SUPPORT_WEIGHT && id <= SUPPORT_BOMB;
  }

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
      this.timerCache = new Map();
      this.timerCacheKey = '';
    }

    _ensureTimerCache(cellPx) {
      const rounded = Math.max(16, Math.min(128, Math.round(cellPx) || 32));
      const key = String(rounded);
      if (this.timerCacheKey === key && this.timerCache.size === 5) return;
      this.timerCache.clear();
      this.timerCacheKey = key;

      for (let t = 1; t <= 5; t++) {
        const cv = document.createElement('canvas');
        cv.width = rounded;
        cv.height = rounded;
        const g = cv.getContext('2d');
        const cx = rounded * 0.5;
        const cy = rounded * 0.5;
        const urgent = t <= 1;
        const r = rounded * 0.27;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fillStyle = urgent ? 'rgba(220, 24, 65, 0.92)' : 'rgba(8, 12, 32, 0.88)';
        g.fill();
        g.lineWidth = Math.max(1.2, rounded * 0.04);
        g.strokeStyle = urgent ? '#ffe066' : '#ffd166';
        g.stroke();

        g.fillStyle = '#ffffff';
        g.font = `bold ${Math.max(10, Math.round(rounded * 0.42))}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(t), cx, cy + 0.5);
        this.timerCache.set(t, cv);
      }
    }

    prewarm(cellPx) {
      this._ensureCache(cellPx);
      this._ensureTimerCache(cellPx);
    }

    _ensureCache(cellPx) {
      const rounded = Math.max(16, Math.min(128, Math.round(cellPx) || 32));
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
      const { alpha = 1, scale = 1, flash = 0, ghost = false, timer = 0, mirrorColor = 0 } = options;
      if (jewelId === null || jewelId === undefined) return;

      ctx.save();
      const sealed = timer > 0 && !ghost;
      ctx.globalAlpha = alpha * (ghost ? 0.26 : sealed ? 0.78 : 1);

      const cx = x + cellSize * 0.5;
      const cy = y + cellSize * 0.5;
      if (scale !== 1) {
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
      }

      if (jewelId === MAGIC_ID) {
        this._drawMagicJewel(ctx, x, y, cellSize, timeSec, ghost);
      } else if (jewelId === SUPPORT_WEIGHT) {
        this._drawWeightBlock(ctx, x, y, cellSize, timeSec);
      } else if (jewelId === SUPPORT_MIRROR) {
        this._drawMirrorBlock(ctx, x, y, cellSize, timeSec, mirrorColor);
      } else if (jewelId === SUPPORT_ROD) {
        this._drawRodBlock(ctx, x, y, cellSize, timeSec);
      } else if (jewelId === SUPPORT_BOMB) {
        this._drawBombBlock(ctx, x, y, cellSize, timeSec);
      } else {
        this._ensureCache(cellSize);
        const sprite = this.cache.get(jewelId);
        if (sprite) {
          ctx.drawImage(sprite, x, y, cellSize, cellSize);
        }
      }

      if (sealed) {
        // Armored seal rim so players know it won't match until countdown reaches 0
        ctx.strokeStyle = 'rgba(255, 209, 102, 0.75)';
        ctx.lineWidth = Math.max(1.2, cellSize * 0.04);
        ctx.strokeRect(x + cellSize * 0.1, y + cellSize * 0.1, cellSize * 0.8, cellSize * 0.8);
        ctx.globalAlpha = alpha;
        this._drawTimerBadge(ctx, cx, cy, cellSize, timer, timeSec);
      }

      if (flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.9, flash)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, cellSize * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    _drawTimerBadge(ctx, cx, cy, size, timer, timeSec) {
      this._ensureTimerCache(size);
      const sprite = this.timerCache.get(timer);
      if (!sprite) return;
      const urgent = timer <= 1;
      const pulse = urgent ? 1 + 0.09 * Math.sin(timeSec * 12) : 1;
      const drawSize = size * pulse;
      ctx.drawImage(sprite, cx - drawSize * 0.5, cy - drawSize * 0.5, drawSize, drawSize);
    }

    _drawWeightBlock(ctx, x, y, size) {
      const cx = x + size * 0.5;
      const cy = y + size * 0.5;
      const r = size * 0.42;

      ctx.save();
      // Heavy obsidian-gold trapezoid weight silhouette
      const pts = [
        [cx - r * 0.62, cy - r * 0.78],
        [cx + r * 0.62, cy - r * 0.78],
        [cx + r * 0.96, cy + r * 0.85],
        [cx - r * 0.96, cy + r * 0.85]
      ];
      tracePoly(ctx, pts);
      const grad = ctx.createLinearGradient(x, y, x + size, y + size);
      grad.addColorStop(0, '#ffd875');
      grad.addColorStop(0.35, '#4b5563');
      grad.addColorStop(1, '#111827');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = Math.max(1.4, size * 0.045);
      ctx.stroke();

      // Top ring handle
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.82, r * 0.22, Math.PI, 0);
      ctx.strokeStyle = '#ffd166';
      ctx.stroke();

      // Down arrow emblem
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(cx, cy + r * 0.52);
      ctx.lineTo(cx - r * 0.36, cy + r * 0.04);
      ctx.lineTo(cx - r * 0.14, cy + r * 0.04);
      ctx.lineTo(cx - r * 0.14, cy - r * 0.42);
      ctx.lineTo(cx + r * 0.14, cy - r * 0.42);
      ctx.lineTo(cx + r * 0.14, cy + r * 0.04);
      ctx.lineTo(cx + r * 0.36, cy + r * 0.04);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    _drawMirrorBlock(ctx, x, y, size, timeSec, colorId = 0) {
      const def = JEWEL_DEFS[colorId] || JEWEL_DEFS[0];
      const cx = x + size * 0.5;
      const cy = y + size * 0.5;
      const r = size * 0.42;

      ctx.save();
      // Silver mirror bezel
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const bezelGrad = ctx.createLinearGradient(x, y, x + size, y + size);
      bezelGrad.addColorStop(0, '#ffffff');
      bezelGrad.addColorStop(0.5, '#cbd5e1');
      bezelGrad.addColorStop(1, '#475569');
      ctx.fillStyle = bezelGrad;
      ctx.fill();

      // Colored jewel mirror surface
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
      const orbGrad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.05, cx, cy, r * 0.85);
      orbGrad.addColorStop(0, '#ffffff');
      orbGrad.addColorStop(0.32, def.light);
      orbGrad.addColorStop(0.75, def.mid);
      orbGrad.addColorStop(1, def.dark);
      ctx.fillStyle = orbGrad;
      ctx.fill();

      // Shimmering diagonal reflection streak
      const sweep = Math.sin(timeSec * 3.5) * r * 0.1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.lineWidth = Math.max(1.5, size * 0.04);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.52, -2.4 + sweep * 0.05, -1.2 + sweep * 0.05);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = Math.max(1.2, size * 0.03);
      ctx.stroke();
      ctx.restore();
    }

    _drawRodBlock(ctx, x, y, size, timeSec) {
      const cx = x + size * 0.5;
      const cy = y + size * 0.5;
      const r = size * 0.42;

      ctx.save();
      // Royal violet crystal backing
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const bg = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      bg.addColorStop(0, '#f0abfc');
      bg.addColorStop(0.55, '#7e22ce');
      bg.addColorStop(1, '#2e1065');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = Math.max(1.3, size * 0.035);
      ctx.stroke();

      // Diagonal golden wand + glowing 4-point star tip
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = Math.max(2, size * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.48, cy + r * 0.48);
      ctx.lineTo(cx + r * 0.22, cy - r * 0.22);
      ctx.stroke();

      const sx = cx + r * 0.28;
      const sy = cy - r * 0.28;
      const sr = r * (0.36 + 0.05 * Math.sin(timeSec * 6));
      ctx.fillStyle = '#fffbeb';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const rad = i % 2 === 0 ? sr : sr * 0.36;
        const px = sx + Math.cos(a) * rad;
        const py = sy + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    _drawBombBlock(ctx, x, y, size, timeSec) {
      const cx = x + size * 0.5;
      const cy = y + size * 0.54;
      const r = size * 0.38;

      ctx.save();
      // Crimson-obsidian bomb orb
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.28, r * 0.06, cx, cy, r);
      grad.addColorStop(0, '#ff8fa3');
      grad.addColorStop(0.45, '#dc2626');
      grad.addColorStop(1, '#2a0812');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = Math.max(1.2, size * 0.032);
      ctx.stroke();

      // Fuse & pulsing spark
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = Math.max(1.6, size * 0.045);
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.2, cy - r * 0.85);
      ctx.quadraticCurveTo(cx + r * 0.55, cy - r * 1.22, cx + r * 0.72, cy - r * 1.0);
      ctx.stroke();

      const sparkR = r * (0.24 + 0.08 * Math.sin(timeSec * 14));
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(cx + r * 0.72, cy - r * 1.0, sparkR, 0, Math.PI * 2);
      ctx.fill();

      // Crosshair / explosion crest
      ctx.strokeStyle = 'rgba(255, 235, 160, 0.85)';
      ctx.lineWidth = Math.max(1.2, size * 0.03);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.35, cy);
      ctx.lineTo(cx + r * 0.35, cy);
      ctx.moveTo(cx, cy - r * 0.35);
      ctx.lineTo(cx, cy + r * 0.35);
      ctx.stroke();
      ctx.restore();
    }

    _drawMagicJewel(ctx, x, y, size, timeSec, ghost) {
      const cx = x + size * 0.5;
      const cy = y + size * 0.5;
      const r = size * 0.42;
      const hue = (timeSec * 160) % 360;

      ctx.save();
      if (!ghost) {
        // Lightweight radial halo instead of expensive GPU shadowBlur
        const halo = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.18);
        halo.addColorStop(0, `hsla(${hue}, 95%, 70%, 0.55)`);
        halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2);
        ctx.fill();
      }

      // 8-point prism star
      const pts = [];
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8 + timeSec * 1.4;
        const rad = i % 2 === 0 ? r * 1.04 : r * 0.66;
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
  B3B.SUPPORT_WEIGHT = SUPPORT_WEIGHT;
  B3B.SUPPORT_MIRROR = SUPPORT_MIRROR;
  B3B.SUPPORT_ROD = SUPPORT_ROD;
  B3B.SUPPORT_BOMB = SUPPORT_BOMB;
  B3B.isSupportId = isSupportId;
  B3B.JewelRenderer = JewelRenderer;
})(window);
