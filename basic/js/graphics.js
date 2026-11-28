/* Web BASIC 2.0 - N88-Style Graphics & Web Audio Engine */
(function (global) {
  'use strict';

  var WB = global.WebBasic = global.WebBasic || {};

  // N88-BASIC デジタル8色 + 拡張8色 (合計16色)
  var DEFAULT_PALETTE = [
    '#000000', // 0: 黒
    '#0000ff', // 1: 青
    '#ff0000', // 2: 赤
    '#ff00ff', // 3: マゼンタ
    '#00ff00', // 4: 緑
    '#00ffff', // 5: シアン
    '#ffff00', // 6: 黄
    '#ffffff', // 7: 白
    '#333333', // 8: 暗灰
    '#5555ff', // 9: 明青
    '#ff5555', // 10: 明赤
    '#ff55ff', // 11: 明マゼンタ
    '#55ff55', // 12: 明緑
    '#55ffff', // 13: 明シアン
    '#ffff55', // 14: 明黄
    '#aaaaaa'  // 15: 明灰
  ];

  var NAMED_COLORS = {
    'BLACK': '#000000', 'BLUE': '#0000ff', 'RED': '#ff0000',
    'MAGENTA': '#ff00ff', 'PURPLE': '#aa00ff', 'GREEN': '#00ff66',
    'CYAN': '#00ffff', 'YELLOW': '#ffff00', 'WHITE': '#ffffff',
    'ORANGE': '#ff8800', 'PINK': '#ff77aa', 'GRAY': '#888888', 'GREY': '#888888'
  };

  function GfxEngine(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d', { willReadFrequently: true });
    this.g.imageSmoothingEnabled = false;

    this.gw = 640;
    this.gh = 400;
    this.penColor = '#00ff66';
    this.bgColor = '#000000';
    this.penIndex = 4;
    this.bgIndex = 0;
    this.gfxOn = true;
    this.alpha = 1.0;

    this.palette = DEFAULT_PALETTE.slice();
    this.cursor = null;     // LOCATE 用 {x, y}
    this.lastX = 0;         // 直前のグラフィック描画位置 (論理座標)
    this.lastY = 0;

    this.worldWin = null;   // WINDOW (x1,y1)-(x2,y2)
    this.viewClip = null;   // VIEW (x1,y1)-(x2,y2)
    this.sprites = Object.create(null); // GSAVE / GET@ 用オフスクリーンバッファ

    this.cachedFontStr = '';
    this.textCols = 80;
    this.textRows = 25;
  }

  GfxEngine.prototype.reset = function () {
    this.palette = DEFAULT_PALETTE.slice();
    this.penColor = '#00ff66';
    this.bgColor = '#000000';
    this.alpha = 1.0;
    this.g.globalAlpha = 1.0;
    this.worldWin = null;
    this.clearView();
    this.lastX = 0;
    this.lastY = 0;
    this.cursor = null;
    this.sprites = Object.create(null);
  };

  GfxEngine.prototype.resize = function (w, h) {
    this.gw = Math.max(16, Math.min(2048, w | 0));
    this.gh = Math.max(16, Math.min(2048, h | 0));
    this.canvas.width = this.gw;
    this.canvas.height = this.gh;
    this.g.imageSmoothingEnabled = false;
    this.worldWin = null;
    this.clearView();
    this.cls();
  };

  GfxEngine.prototype.setVisible = function (on) {
    this.gfxOn = !!on;
    this.canvas.style.display = this.gfxOn ? 'block' : 'none';
  };

  GfxEngine.prototype.cls = function () {
    var g = this.g;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1.0;
    g.fillStyle = this.bgColor;
    if (this.viewClip) {
      var v = this.viewClip;
      g.fillRect(v.x1, v.y1, v.x2 - v.x1 + 1, v.y2 - v.y1 + 1);
    } else {
      g.fillRect(0, 0, this.gw, this.gh);
    }
    g.restore();
  };

  GfxEngine.prototype.resolveColor = function (arg) {
    if (arg === undefined || arg === null || arg === '') return this.penColor;
    if (typeof arg === 'number' && isFinite(arg)) {
      var idx = Math.floor(arg);
      if (idx >= 0 && idx < this.palette.length) return this.palette[idx];
      idx = ((idx % this.palette.length) + this.palette.length) % this.palette.length;
      return this.palette[idx];
    }
    var s = String(arg).trim();
    if (/^\d+$/.test(s)) {
      var n = parseInt(s, 10);
      if (n >= 0 && n < this.palette.length) return this.palette[n];
    }
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s;
    var up = s.toUpperCase();
    if (NAMED_COLORS[up]) return NAMED_COLORS[up];
    var m = s.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
    if (m) {
      var r = Math.max(0, Math.min(255, parseInt(m[1], 10)));
      var g0 = Math.max(0, Math.min(255, parseInt(m[2], 10)));
      var b = Math.max(0, Math.min(255, parseInt(m[3], 10)));
      return 'rgb(' + r + ',' + g0 + ',' + b + ')';
    }
    return s;
  };

  GfxEngine.prototype.colorToRgba = function (cssColor) {
    // 1x1 一時ピクセルかパースで正確にRGBA化
    if (!this._tmpCtx) {
      var c = document.createElement('canvas');
      c.width = 1; c.height = 1;
      this._tmpCtx = c.getContext('2d', { willReadFrequently: true });
    }
    var ctx = this._tmpCtx;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data;
  };

  GfxEngine.prototype.setPenColor = function (arg) {
    this.penColor = this.resolveColor(arg);
    return this.penColor;
  };

  GfxEngine.prototype.setBgColor = function (arg) {
    this.bgColor = this.resolveColor(arg);
    return this.bgColor;
  };

  GfxEngine.prototype.setPalette = function (idx, colorArg) {
    var i = idx | 0;
    if (i < 0 || i >= this.palette.length) throw new Error('PALETTE 番号が範囲外です: ' + i);
    this.palette[i] = this.resolveColor(colorArg);
  };

  GfxEngine.prototype.setAlpha = function (a) {
    this.alpha = Math.max(0, Math.min(1, +a));
    this.g.globalAlpha = this.alpha;
  };

  // WINDOW / VIEW 座標変換
  GfxEngine.prototype.setWindow = function (x1, y1, x2, y2) {
    this.worldWin = { x1: +x1, y1: +y1, x2: +x2, y2: +y2 };
  };

  GfxEngine.prototype.clearWindow = function () {
    this.worldWin = null;
  };

  GfxEngine.prototype.setView = function (x1, y1, x2, y2) {
    var vx1 = Math.max(0, Math.min(this.gw - 1, Math.round(Math.min(x1, x2))));
    var vy1 = Math.max(0, Math.min(this.gh - 1, Math.round(Math.min(y1, y2))));
    var vx2 = Math.max(0, Math.min(this.gw - 1, Math.round(Math.max(x1, x2))));
    var vy2 = Math.max(0, Math.min(this.gh - 1, Math.round(Math.max(y1, y2))));
    this.viewClip = { x1: vx1, y1: vy1, x2: vx2, y2: vy2 };
    this.g.restore();
    this.g.save();
    this.g.beginPath();
    this.g.rect(vx1, vy1, vx2 - vx1 + 1, vy2 - vy1 + 1);
    this.g.clip();
  };

  GfxEngine.prototype.clearView = function () {
    this.viewClip = null;
    try { this.g.restore(); } catch (e) {}
    this.g.save();
  };

  GfxEngine.prototype.mapX = function (wx) {
    if (!this.worldWin) return +wx;
    var w = this.worldWin;
    var vx1 = this.viewClip ? this.viewClip.x1 : 0;
    var vx2 = this.viewClip ? this.viewClip.x2 : (this.gw - 1);
    if (w.x2 === w.x1) return vx1;
    return vx1 + ((+wx - w.x1) / (w.x2 - w.x1)) * (vx2 - vx1);
  };

  GfxEngine.prototype.mapY = function (wy) {
    if (!this.worldWin) return +wy;
    var w = this.worldWin;
    var vy1 = this.viewClip ? this.viewClip.y1 : 0;
    var vy2 = this.viewClip ? this.viewClip.y2 : (this.gh - 1);
    if (w.y2 === w.y1) return vy1;
    return vy1 + ((+wy - w.y1) / (w.y2 - w.y1)) * (vy2 - vy1);
  };

  GfxEngine.prototype.mapScaleX = function (dx) {
    if (!this.worldWin) return +dx;
    var w = this.worldWin;
    var vw = this.viewClip ? (this.viewClip.x2 - this.viewClip.x1) : (this.gw - 1);
    return Math.abs((+dx / (w.x2 - w.x1)) * vw);
  };

  // 基本描画
  GfxEngine.prototype.plot = function (x, y, colorArg, isStep) {
    var lx = isStep ? (this.lastX + (+x)) : (+x);
    var ly = isStep ? (this.lastY + (+y)) : (+y);
    this.lastX = lx;
    this.lastY = ly;
    var px = Math.round(this.mapX(lx));
    var py = Math.round(this.mapY(ly));
    this.g.fillStyle = (colorArg !== undefined) ? this.resolveColor(colorArg) : this.penColor;
    this.g.fillRect(px, py, 1, 1);
  };

  GfxEngine.prototype.preset = function (x, y, colorArg, isStep) {
    var col = (colorArg !== undefined) ? colorArg : this.bgColor;
    this.plot(x, y, col, isStep);
  };

  GfxEngine.prototype._bresenhamLine = function (x0, y0, x1, y1, col) {
    var ix0 = Math.round(x0), iy0 = Math.round(y0);
    var ix1 = Math.round(x1), iy1 = Math.round(y1);
    var dx = Math.abs(ix1 - ix0);
    var dy = Math.abs(iy1 - iy0);
    var sx = ix0 < ix1 ? 1 : -1;
    var sy = iy0 < iy1 ? 1 : -1;
    var err = dx - dy;
    var g = this.g;
    g.fillStyle = col;
    while (true) {
      g.fillRect(ix0, iy0, 1, 1);
      if (ix0 === ix1 && iy0 === iy1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; ix0 += sx; }
      if (e2 < dx) { err += dx; iy0 += sy; }
    }
  };

  GfxEngine.prototype.line = function (x1, y1, x2, y2, colorArg, boxMode, dashStyle) {
    var col = (colorArg !== undefined) ? this.resolveColor(colorArg) : this.penColor;
    var px1 = this.mapX(x1), py1 = this.mapY(y1);
    var px2 = this.mapX(x2), py2 = this.mapY(y2);
    this.lastX = +x2;
    this.lastY = +y2;

    var g = this.g;
    if (boxMode === 'B' || boxMode === 'BF') {
      var rx1 = Math.round(Math.min(px1, px2));
      var ry1 = Math.round(Math.min(py1, py2));
      var rx2 = Math.round(Math.max(px1, px2));
      var ry2 = Math.round(Math.max(py1, py2));
      var rw = rx2 - rx1 + 1;
      var rh = ry2 - ry1 + 1;
      if (boxMode === 'BF') {
        g.fillStyle = col;
        g.fillRect(rx1, ry1, rw, rh);
      } else {
        g.fillStyle = col;
        g.fillRect(rx1, ry1, rw, 1);
        g.fillRect(rx1, ry2, rw, 1);
        g.fillRect(rx1, ry1, 1, rh);
        g.fillRect(rx2, ry1, 1, rh);
      }
      return;
    }

    if (!dashStyle) {
      this._bresenhamLine(px1, py1, px2, py2, col);
      return;
    }

    g.save();
    g.strokeStyle = col;
    g.lineWidth = 1;
    g.setLineDash([4, 3]);
    g.beginPath();
    g.moveTo(Math.floor(px1) + 0.5, Math.floor(py1) + 0.5);
    g.lineTo(Math.floor(px2) + 0.5, Math.floor(py2) + 0.5);
    g.stroke();
    g.restore();
  };

  GfxEngine.prototype.rect = function (x1, y1, x2, y2, fill, colorArg) {
    this.line(x1, y1, x2, y2, colorArg, fill ? 'BF' : 'B');
  };

  GfxEngine.prototype._pixelCircle = function (cx, cy, rx, ry, col) {
    var icx = Math.round(cx), icy = Math.round(cy);
    var irx = Math.round(rx), iry = Math.round(ry);
    var g = this.g;
    g.fillStyle = col;
    if (irx <= 0 && iry <= 0) { g.fillRect(icx, icy, 1, 1); return; }

    // 同じ縦横半径なら高速な中点円アルゴリズム (4近傍隙間なし)
    if (irx === iry) {
      var x = irx, y = 0, err = 1 - x;
      while (x >= y) {
        g.fillRect(icx + x, icy + y, 1, 1);
        g.fillRect(icx + y, icy + x, 1, 1);
        g.fillRect(icx - y, icy + x, 1, 1);
        g.fillRect(icx - x, icy + y, 1, 1);
        g.fillRect(icx - x, icy - y, 1, 1);
        g.fillRect(icx - y, icy - x, 1, 1);
        g.fillRect(icx + y, icy - x, 1, 1);
        g.fillRect(icx + x, icy - y, 1, 1);
        y++;
        if (err < 0) {
          err += 2 * y + 1;
        } else {
          x--;
          err += 2 * (y - x) + 1;
        }
      }
      return;
    }

    // 楕円は8近傍連結ステップで描画
    var steps = Math.max(16, Math.ceil(Math.PI * 2 * Math.max(irx, iry)));
    var prevX = Math.round(icx + irx), prevY = icy;
    for (var i = 0; i <= steps; i++) {
      var th = (i / steps) * Math.PI * 2;
      var nx = Math.round(icx + irx * Math.cos(th));
      var ny = Math.round(icy + iry * Math.sin(th));
      this._bresenhamLine(prevX, prevY, nx, ny, col);
      prevX = nx; prevY = ny;
    }
  };

  GfxEngine.prototype.circle = function (cx, cy, r, fill, colorArg, startAng, endAng, aspect) {
    var col = (colorArg !== undefined) ? this.resolveColor(colorArg) : this.penColor;
    var px = this.mapX(cx);
    var py = this.mapY(cy);
    var prx = Math.max(0, this.mapScaleX(r));
    var asp = (aspect !== undefined && aspect !== null) ? +aspect : 1;
    var pry = prx * asp;
    this.lastX = +cx;
    this.lastY = +cy;

    var g = this.g;
    if (!fill && startAng === undefined && endAng === undefined) {
      this._pixelCircle(px, py, prx, pry, col);
      return;
    }

    g.beginPath();
    if (startAng !== undefined && endAng !== undefined) {
      // N88-BASICの角度は反時計回り(ラジアン)、負値で中心と結ぶ扇形
      var s = -(+startAng);
      var e = -(+endAng);
      var wedge = (+startAng < 0 || +endAng < 0);
      if (wedge) {
        s = -Math.abs(+startAng);
        e = -Math.abs(+endAng);
        g.moveTo(px, py);
      }
      g.ellipse(px, py, prx, pry, 0, s, e, true);
      if (wedge) g.closePath();
    } else {
      g.ellipse(px, py, prx, pry, 0, 0, Math.PI * 2);
    }

    if (fill) {
      g.fillStyle = col;
      g.fill();
    } else {
      g.strokeStyle = col;
      g.lineWidth = 1;
      g.stroke();
    }
  };

  GfxEngine.prototype.triangle = function (x1, y1, x2, y2, x3, y3, fill, colorArg) {
    var col = (colorArg !== undefined) ? this.resolveColor(colorArg) : this.penColor;
    var g = this.g;
    g.beginPath();
    g.moveTo(this.mapX(x1), this.mapY(y1));
    g.lineTo(this.mapX(x2), this.mapY(y2));
    g.lineTo(this.mapX(x3), this.mapY(y3));
    g.closePath();
    if (fill) {
      g.fillStyle = col;
      g.fill();
    } else {
      g.strokeStyle = col;
      g.lineWidth = 1;
      g.stroke();
    }
  };

  GfxEngine.prototype.poly = function (points, fill, colorArg) {
    if (!points || points.length < 4) return;
    var col = (colorArg !== undefined) ? this.resolveColor(colorArg) : this.penColor;
    var g = this.g;
    g.beginPath();
    g.moveTo(this.mapX(points[0]), this.mapY(points[1]));
    for (var i = 2; i + 1 < points.length; i += 2) {
      g.lineTo(this.mapX(points[i]), this.mapY(points[i + 1]));
    }
    g.closePath();
    if (fill) {
      g.fillStyle = col;
      g.fill();
    } else {
      g.strokeStyle = col;
      g.lineWidth = 1;
      g.stroke();
    }
  };

  // 高速スキャンライン・シード塗りつぶし (PAINT)
  GfxEngine.prototype.paint = function (x, y, fillArg, borderArg) {
    var sx = Math.round(this.mapX(x));
    var sy = Math.round(this.mapY(y));
    var w = this.gw, h = this.gh;
    var minX = this.viewClip ? this.viewClip.x1 : 0;
    var minY = this.viewClip ? this.viewClip.y1 : 0;
    var maxX = this.viewClip ? this.viewClip.x2 : (w - 1);
    var maxY = this.viewClip ? this.viewClip.y2 : (h - 1);
    if (sx < minX || sx > maxX || sy < minY || sy > maxY) return;

    var fillCss = (fillArg !== undefined) ? this.resolveColor(fillArg) : this.penColor;
    var fillRgba = this.colorToRgba(fillCss);
    var fr = fillRgba[0], fg = fillRgba[1], fb = fillRgba[2], fa = 255;

    var hasBorder = (borderArg !== undefined && borderArg !== null && borderArg !== '');
    var br = 0, bg = 0, bb = 0;
    if (hasBorder) {
      var bRgba = this.colorToRgba(this.resolveColor(borderArg));
      br = bRgba[0]; bg = bRgba[1]; bb = bRgba[2];
    }

    var img = this.g.getImageData(0, 0, w, h);
    var data = img.data;
    var sIdx = (sy * w + sx) * 4;
    var sr = data[sIdx], sg = data[sIdx + 1], sb = data[sIdx + 2];

    if (sr === fr && sg === fg && sb === fb) return;
    if (hasBorder && Math.abs(sr - br) <= 4 && Math.abs(sg - bg) <= 4 && Math.abs(sb - bb) <= 4) return;

    function isMatch(idx) {
      var r = data[idx], g0 = data[idx + 1], b = data[idx + 2];
      if (hasBorder) {
        if (Math.abs(r - fr) <= 2 && Math.abs(g0 - fg) <= 2 && Math.abs(b - fb) <= 2) return false;
        return !(Math.abs(r - br) <= 12 && Math.abs(g0 - bg) <= 12 && Math.abs(b - bb) <= 12);
      }
      return Math.abs(r - sr) <= 12 && Math.abs(g0 - sg) <= 12 && Math.abs(b - sb) <= 12;
    }

    var stack = [sx, sy];
    var visited = new Uint8Array(w * h);

    while (stack.length > 0) {
      var cy = stack.pop();
      var cx = stack.pop();
      var lx = cx;
      while (lx > minX && !visited[cy * w + (lx - 1)] && isMatch((cy * w + (lx - 1)) * 4)) {
        lx--;
      }
      var rx = cx;
      while (rx < maxX && !visited[cy * w + (rx + 1)] && isMatch((cy * w + (rx + 1)) * 4)) {
        rx++;
      }

      var aboveAdded = false;
      var belowAdded = false;
      for (var px = lx; px <= rx; px++) {
        var cell = cy * w + px;
        visited[cell] = 1;
        var p4 = cell * 4;
        data[p4] = fr;
        data[p4 + 1] = fg;
        data[p4 + 2] = fb;
        data[p4 + 3] = fa;

        if (cy > minY) {
          var upCell = (cy - 1) * w + px;
          if (!visited[upCell] && isMatch(upCell * 4)) {
            if (!aboveAdded) { stack.push(px, cy - 1); aboveAdded = true; }
          } else {
            aboveAdded = false;
          }
        }
        if (cy < maxY) {
          var dnCell = (cy + 1) * w + px;
          if (!visited[dnCell] && isMatch(dnCell * 4)) {
            if (!belowAdded) { stack.push(px, cy + 1); belowAdded = true; }
          } else {
            belowAdded = false;
          }
        }
      }
    }

    this.g.putImageData(img, 0, 0);
  };

  // ピクセル色取得 (POINT関数: 一致パレット番号、なければ 0xRRGGBB)
  GfxEngine.prototype.point = function (x, y) {
    var px = Math.round(this.mapX(x));
    var py = Math.round(this.mapY(y));
    if (px < 0 || px >= this.gw || py < 0 || py >= this.gh) return -1;
    var d = this.g.getImageData(px, py, 1, 1).data;
    var r = d[0], g0 = d[1], b = d[2];
    if (!this._palRgba) {
      this._palRgba = this.palette.map(this.colorToRgba.bind(this));
    }
    for (var i = 0; i < this.palette.length; i++) {
      var pr = this.colorToRgba(this.palette[i]);
      if (Math.abs(pr[0] - r) <= 4 && Math.abs(pr[1] - g0) <= 4 && Math.abs(pr[2] - b) <= 4) {
        return i;
      }
    }
    return (r << 16) | (g0 << 8) | b;
  };

  // LOCATE + PRINT 用 (Web BASIC 1.4 完全互換)
  GfxEngine.prototype.gPrint = function (text) {
    if (!this.cursor) return;
    var cw = this.gw / (this.textCols === 80 ? 80 : 40);
    var ch = this.gh / (this.textRows || 25);
    // 1.4互換: 640x400時に見やすいよう40列幅(16px)相当をデフォルト調整
    if (this.textCols === 80 && this.gw === 640) {
      cw = this.gw / 40;
    }
    var fontSize = Math.max(8, Math.floor(ch * 0.9));
    if (!this.cachedFontStr) {
      var style = getComputedStyle(document.documentElement);
      this.cachedFontStr = style.getPropertyValue('--font-family') || 'monospace';
    }
    var g = this.g;
    g.font = fontSize + 'px ' + this.cachedFontStr;
    g.textBaseline = 'top';
    g.fillStyle = this.penColor;
    g.fillText(String(text), this.cursor.x * cw, this.cursor.y * ch);
    this.cursor = null;
  };

  // SYMBOL (x, y), "text", sx, sy, color, rot
  GfxEngine.prototype.symbol = function (x, y, text, sx, sy, colorArg, rotDeg) {
    var px = this.mapX(x);
    var py = this.mapY(y);
    var scaleX = (sx !== undefined && sx !== null) ? +sx : 1;
    var scaleY = (sy !== undefined && sy !== null) ? +sy : scaleX;
    var col = (colorArg !== undefined) ? this.resolveColor(colorArg) : this.penColor;
    var rot = (rotDeg !== undefined) ? (+rotDeg * Math.PI / 180) : 0;

    if (!this.cachedFontStr) {
      var style = getComputedStyle(document.documentElement);
      this.cachedFontStr = style.getPropertyValue('--font-family') || 'monospace';
    }

    var g = this.g;
    g.save();
    g.translate(px, py);
    if (rot) g.rotate(rot);
    if (scaleX !== 1 || scaleY !== 1) g.scale(scaleX, scaleY);
    g.font = '16px ' + this.cachedFontStr;
    g.textBaseline = 'top';
    g.fillStyle = col;
    g.fillText(String(text), 0, 0);
    g.restore();
  };

  // 画面スクロール (ROLL dx, dy)
  GfxEngine.prototype.roll = function (dx, dy) {
    var ix = dx | 0;
    var iy = dy | 0;
    if (ix === 0 && iy === 0) return;
    var w = this.gw, h = this.gh;
    if (!this._rollCanvas) {
      this._rollCanvas = document.createElement('canvas');
      this._rollCtx = this._rollCanvas.getContext('2d');
    }
    if (this._rollCanvas.width !== w || this._rollCanvas.height !== h) {
      this._rollCanvas.width = w;
      this._rollCanvas.height = h;
    }
    this._rollCtx.clearRect(0, 0, w, h);
    this._rollCtx.drawImage(this.canvas, 0, 0);
    this.g.save();
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.fillStyle = this.bgColor;
    this.g.fillRect(0, 0, w, h);
    this.g.drawImage(this._rollCanvas, ix, iy);
    this.g.restore();
  };

  // スプライト保存 (GSAVE / GET)
  GfxEngine.prototype.saveSprite = function (id, x1, y1, x2, y2) {
    var key = String(id).toUpperCase();
    var px1 = Math.max(0, Math.min(this.gw - 1, Math.round(this.mapX(Math.min(x1, x2)))));
    var py1 = Math.max(0, Math.min(this.gh - 1, Math.round(this.mapY(Math.min(y1, y2)))));
    var px2 = Math.max(0, Math.min(this.gw - 1, Math.round(this.mapX(Math.max(x1, x2)))));
    var py2 = Math.max(0, Math.min(this.gh - 1, Math.round(this.mapY(Math.max(y1, y2)))));
    var sw = Math.max(1, px2 - px1 + 1);
    var sh = Math.max(1, py2 - py1 + 1);
    var imgData = this.g.getImageData(px1, py1, sw, sh);

    var sc = document.createElement('canvas');
    sc.width = sw;
    sc.height = sh;
    sc.getContext('2d').putImageData(imgData, 0, 0);
    this.sprites[key] = { canvas: sc, imgData: imgData, w: sw, h: sh };
  };

  // スプライト描画 (GPUT / PUT)
  GfxEngine.prototype.putSprite = function (id, x, y, mode) {
    var key = String(id).toUpperCase();
    var sp = this.sprites[key];
    if (!sp) throw new Error('スプライトが見つかりません: ' + id);
    var px = Math.round(this.mapX(x));
    var py = Math.round(this.mapY(y));
    var m = (mode || 'PSET').toUpperCase();

    if (m === 'PSET') {
      this.g.drawImage(sp.canvas, px, py);
      return;
    }

    var dst = this.g.getImageData(px, py, sp.w, sp.h);
    var s = sp.imgData.data;
    var d = dst.data;
    var bgRgba = this.colorToRgba(this.bgColor);

    for (var i = 0; i < s.length; i += 4) {
      if (m === 'TRANS') {
        if (Math.abs(s[i] - bgRgba[0]) <= 4 && Math.abs(s[i + 1] - bgRgba[1]) <= 4 && Math.abs(s[i + 2] - bgRgba[2]) <= 4) {
          continue;
        }
        d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = 255;
      } else if (m === 'PRESET') {
        d[i] = 255 - s[i]; d[i + 1] = 255 - s[i + 1]; d[i + 2] = 255 - s[i + 2]; d[i + 3] = 255;
      } else if (m === 'XOR') {
        d[i] ^= s[i]; d[i + 1] ^= s[i + 1]; d[i + 2] ^= s[i + 2]; d[i + 3] = 255;
      } else if (m === 'OR') {
        d[i] |= s[i]; d[i + 1] |= s[i + 1]; d[i + 2] |= s[i + 2]; d[i + 3] = 255;
      } else if (m === 'AND') {
        d[i] &= s[i]; d[i + 1] &= s[i + 1]; d[i + 2] &= s[i + 2]; d[i + 3] = 255;
      }
    }
    this.g.putImageData(dst, px, py);
  };

  // ====== Web Audio サウンド & MML エンジン ======
  function AudioEngine() {
    this.ctx = null;
    this.activeNodes = [];
    this.mmlTimers = [];
  }

  AudioEngine.prototype.ensureCtx = function () {
    if (!this.ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      try { this.ctx.resume(); } catch (e) {}
    }
    return this.ctx;
  };

  AudioEngine.prototype.unlock = function () {
    this.ensureCtx();
  };

  AudioEngine.prototype.stopAll = function () {
    for (var i = 0; i < this.mmlTimers.length; i++) {
      clearTimeout(this.mmlTimers[i]);
    }
    this.mmlTimers = [];
    for (var j = 0; j < this.activeNodes.length; j++) {
      try { this.activeNodes[j].stop(); } catch (e) {}
    }
    this.activeNodes = [];
  };

  AudioEngine.prototype.tone = function (freq, durationMs, volume, waveType, delaySec) {
    var ctx = this.ensureCtx();
    if (!ctx) return;
    if (freq <= 0 || durationMs <= 0) return;
    var startAt = ctx.currentTime + (delaySec || 0);
    var durSec = durationMs / 1000;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = waveType || 'square';
    osc.frequency.setValueAtTime(freq, startAt);

    var vol = (volume !== undefined) ? volume : 0.06;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(vol, startAt + 0.005);
    gain.gain.setValueAtTime(vol, Math.max(startAt + 0.005, startAt + durSec - 0.01));
    gain.gain.linearRampToValueAtTime(0.0001, startAt + durSec);

    osc.connect(gain).connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + durSec + 0.01);

    var self = this;
    this.activeNodes.push(osc);
    osc.onended = function () {
      var idx = self.activeNodes.indexOf(osc);
      if (idx >= 0) self.activeNodes.splice(idx, 1);
    };
  };

  AudioEngine.prototype.beep = function (freq, ms) {
    this.tone(freq || 880, ms || 120, 0.06, 'square', 0);
  };

  // MML (Music Macro Language) 演奏
  var NOTE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  AudioEngine.prototype.playMML = function (mml) {
    var ctx = this.ensureCtx();
    if (!ctx) return 0;

    var s = String(mml).toUpperCase();
    var i = 0, n = s.length;
    var octave = 4;
    var defaultLen = 4;
    var tempo = 120;
    var volume = 8; // 0..15
    var wave = 'square';
    var timeOffset = 0;

    function readInt(def) {
      var start = i;
      while (i < n && s[i] >= '0' && s[i] <= '9') i++;
      return i > start ? parseInt(s.slice(start, i), 10) : def;
    }

    while (i < n) {
      var ch = s[i++];
      if (ch === ' ' || ch === '\t' || ch === ',') continue;

      if (ch === 'O') { octave = Math.max(1, Math.min(8, readInt(4))); continue; }
      if (ch === '<') { octave = Math.max(1, octave - 1); continue; }
      if (ch === '>') { octave = Math.min(8, octave + 1); continue; }
      if (ch === 'L') { defaultLen = Math.max(1, Math.min(64, readInt(4))); continue; }
      if (ch === 'T') { tempo = Math.max(32, Math.min(255, readInt(120))); continue; }
      if (ch === 'V') { volume = Math.max(0, Math.min(15, readInt(8))); continue; }
      if (ch === 'M') {
        var mtype = readInt(0);
        wave = (mtype === 1) ? 'triangle' : (mtype === 2 ? 'sawtooth' : (mtype === 3 ? 'sine' : 'square'));
        continue;
      }

      if (ch === 'R' || ch === 'P' || NOTE_SEMITONES.hasOwnProperty(ch) || ch === 'N') {
        var midi = -1;
        if (ch === 'N') {
          var noteNum = readInt(0);
          if (noteNum > 0) midi = noteNum + 11;
        } else if (ch !== 'R' && ch !== 'P') {
          var semi = NOTE_SEMITONES[ch];
          if (i < n && (s[i] === '#' || s[i] === '+')) { semi++; i++; }
          else if (i < n && s[i] === '-') { semi--; i++; }
          midi = (octave + 1) * 12 + semi;
        }

        var len = readInt(defaultLen);
        var beatSec = 60 / tempo;
        var durSec = (4 / len) * beatSec;
        while (i < n && s[i] === '.') {
          durSec *= 1.5;
          i++;
        }

        // タイ (&) チェック
        var tie = false;
        while (i < n && s[i] === '&') {
          tie = true;
          i++;
          if (i < n && (s[i] === ch || NOTE_SEMITONES.hasOwnProperty(s[i]))) {
            // 同音長加算の簡易サポート
            i++;
            if (i < n && (s[i] === '#' || s[i] === '+' || s[i] === '-')) i++;
            var extraLen = readInt(defaultLen);
            var extraDur = (4 / extraLen) * beatSec;
            while (i < n && s[i] === '.') { extraDur *= 1.5; i++; }
            durSec += extraDur;
          }
        }

        if (midi >= 0 && volume > 0) {
          var freq = 440 * Math.pow(2, (midi - 69) / 12);
          var playMs = Math.max(15, (tie ? durSec : durSec * 0.88) * 1000);
          this.tone(freq, playMs, (volume / 15) * 0.1, wave, timeOffset);
        }
        timeOffset += durSec;
      }
    }
    return Math.round(timeOffset * 1000);
  };

  WB.GfxEngine = GfxEngine;
  WB.AudioEngine = AudioEngine;
})(window);
