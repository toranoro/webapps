/**
 * Canvas2D による高コントラスト・鮮明な牌テクスチャアトラス & 卓マットテクスチャ生成
 */
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 5;
export const CELL_W = 256;
export const CELL_H = 352;

const KANJI_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONOR_CHARS = ['東', '南', '西', '北', '白', '發', '中'];

export function getAtlasSlotIndex(type, isRed = false) {
  if (isRed) {
    if (type === 4) return 34;
    if (type === 13) return 35;
    if (type === 22) return 36;
  }
  return type;
}

export function createTileAtlasCanvas(showBeginnerLabels = true) {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * CELL_W;
  canvas.height = ATLAS_ROWS * CELL_H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fcfbf7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let type = 0; type < 34; type++) drawSlot(ctx, type, type, false, showBeginnerLabels);
  drawSlot(ctx, 34, 4, true, showBeginnerLabels);
  drawSlot(ctx, 35, 13, true, showBeginnerLabels);
  drawSlot(ctx, 36, 22, true, showBeginnerLabels);
  drawBackSlot(ctx, 37);

  return canvas;
}

function drawSlot(ctx, slotIdx, type, isRed, showGuide) {
  const col = slotIdx % ATLAS_COLS;
  const row = Math.floor(slotIdx / ATLAS_COLS);
  ctx.save();
  ctx.translate(col * CELL_W, row * CELL_H);

  // くっきり文字が映える清潔な象牙ホワイト背景
  const grad = ctx.createLinearGradient(0, 0, 0, CELL_H);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.7, '#faf7ef');
  grad.addColorStop(1, '#eee9dc');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CELL_W, CELL_H);

  // 引き締め用の微細な内枠線
  ctx.strokeStyle = 'rgba(120, 110, 90, 0.28)';
  ctx.lineWidth = 4;
  roundRect(ctx, 10, 10, CELL_W - 20, CELL_H - 20, 16);
  ctx.stroke();

  if (type < 9) drawManzu(ctx, type + 1, isRed);
  else if (type < 18) drawPinzu(ctx, type - 8, isRed);
  else if (type < 27) drawSouzu(ctx, type - 17, isRed);
  else drawHonor(ctx, type - 27);

  if (isRed) {
    ctx.fillStyle = '#d9161c';
    ctx.beginPath();
    ctx.arc(CELL_W - 28, 30, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff9d6';
    ctx.beginPath();
    ctx.arc(CELL_W - 30, 28, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 初心者ガイド表記（小さく見やすく左上にピル風または濃い縁取り文字）
  if (showGuide) {
    let badge = '';
    if (type < 9) badge = `${type + 1}萬`;
    else if (type < 18) badge = `${type - 8}筒`;
    else if (type < 27) badge = `${type - 17}索`;
    else badge = HONOR_CHARS[type - 27];

    ctx.fillStyle = isRed ? '#c8141a' : '#1b2632';
    ctx.font = '800 24px "Yu Gothic UI", "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(badge, 16, 14);
  }
  ctx.restore();
}

function drawManzu(ctx, num, isRed) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 上段：太く濃い漢数字（漆黒＋微細アウトラインで滲みなし）
  const numColor = isRed ? '#cc1118' : '#0f1620';
  ctx.fillStyle = numColor;
  ctx.strokeStyle = numColor;
  ctx.lineWidth = 3.5;
  ctx.font = '900 124px "Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif';
  ctx.strokeText(KANJI_NUMS[num - 1], CELL_W * 0.5, CELL_H * 0.30);
  ctx.fillText(KANJI_NUMS[num - 1], CELL_W * 0.5, CELL_H * 0.30);

  // 下段：「萬」鮮やかな濃紅
  const manColor = isRed ? '#d41219' : '#b2121a';
  ctx.fillStyle = manColor;
  ctx.strokeStyle = manColor;
  ctx.lineWidth = 3.5;
  ctx.font = '900 132px "Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif';
  ctx.strokeText('萬', CELL_W * 0.5, CELL_H * 0.69);
  ctx.fillText('萬', CELL_W * 0.5, CELL_H * 0.69);
}

function drawCirclePip(ctx, x, y, r, color) {
  ctx.save();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#0c141d'; ctx.lineWidth = 2.5; ctx.stroke();

  ctx.fillStyle = '#fcfbf7'; ctx.beginPath(); ctx.arc(x, y, r * 0.66, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r * 0.46, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fcfbf7';
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25, r * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPinzu(ctx, num, isRed) {
  const blue = '#103f7a', green = '#0c6b3d', red = '#bf151c';
  if (num === 1) {
    const cx = CELL_W * 0.5, cy = CELL_H * 0.53;
    ctx.fillStyle = blue; ctx.beginPath(); ctx.arc(cx, cy, 88, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0c141d'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fcfbf7'; ctx.beginPath(); ctx.arc(cx, cy, 73, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.fillStyle = i % 2 === 0 ? green : red;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 46, cy + Math.sin(a) * 46, 15, 0, Math.PI * 2); ctx.fill();
    }
    drawCirclePip(ctx, cx, cy, 28, red);
    return;
  }

  const layouts = {
    2: [[0.5, 0.30, green], [0.5, 0.72, blue]],
    3: [[0.28, 0.26, blue], [0.5, 0.52, red], [0.72, 0.78, green]],
    4: [[0.32, 0.30, blue], [0.68, 0.30, green], [0.32, 0.72, green], [0.68, 0.72, blue]],
    5: [[0.28, 0.28, blue], [0.72, 0.28, green], [0.5, 0.52, red], [0.28, 0.76, green], [0.72, 0.76, blue]],
    6: [[0.32, 0.24, green], [0.68, 0.24, green], [0.32, 0.53, red], [0.68, 0.53, red], [0.32, 0.80, red], [0.68, 0.80, red]],
    7: [[0.27, 0.21, green], [0.50, 0.27, green], [0.73, 0.33, green], [0.32, 0.57, red], [0.68, 0.57, red], [0.32, 0.81, red], [0.68, 0.81, red]],
    8: [[0.33, 0.20, blue], [0.67, 0.20, blue], [0.33, 0.41, blue], [0.67, 0.41, blue], [0.33, 0.62, blue], [0.67, 0.62, blue], [0.33, 0.83, blue], [0.67, 0.83, blue]],
    9: [[0.24, 0.23, green], [0.5, 0.23, green], [0.76, 0.23, green], [0.24, 0.52, red], [0.5, 0.52, red], [0.76, 0.52, red], [0.24, 0.81, blue], [0.5, 0.81, blue], [0.76, 0.81, blue]],
  };
  const r = num <= 4 ? 35 : (num <= 7 ? 28 : 25);
  for (const [nx, ny, col] of layouts[num]) drawCirclePip(ctx, CELL_W * nx, CELL_H * ny, r, isRed ? red : col);
}

function drawBambooStick(ctx, x, y, w, h, color) {
  ctx.save();
  ctx.fillStyle = color;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, w * 0.42);
  ctx.fill();
  ctx.strokeStyle = '#092214';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#fcfbf7';
  ctx.fillRect(x - w * 0.14, y - h * 0.36, w * 0.28, h * 0.72);
  ctx.fillStyle = color;
  ctx.fillRect(x - w * 0.58, y - h * 0.06, w * 1.16, h * 0.13);
  ctx.fillRect(x - w * 0.54, y - h * 0.43, w * 1.08, h * 0.09);
  ctx.fillRect(x - w * 0.54, y + h * 0.34, w * 1.08, h * 0.09);
  ctx.restore();
}

function drawSouzu(ctx, num, isRed) {
  const green = '#0c6b3d', red = '#bf151c', blue = '#103f7a';
  if (num === 1) {
    const cx = CELL_W * 0.5, cy = CELL_H * 0.54;
    ctx.save();
    const colors = [green, '#1b854f', red, '#145880', green];
    for (let i = -2; i <= 2; i++) {
      ctx.fillStyle = colors[i + 2];
      ctx.beginPath(); ctx.ellipse(cx + i * 22, cy + 44, 13, 38, i * 0.24, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = green; ctx.beginPath(); ctx.ellipse(cx, cy + 6, 31, 43, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = red; ctx.beginPath(); ctx.ellipse(cx, cy + 6, 17, 25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = green; ctx.beginPath(); ctx.arc(cx - 8, cy - 52, 21, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d48d10';
    ctx.beginPath(); ctx.moveTo(cx - 26, cy - 54); ctx.lineTo(cx - 50, cy - 44); ctx.lineTo(cx - 24, cy - 40); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx - 14, cy - 54, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  const sticks = [], bw = 24;
  if (num === 2) sticks.push([0.5, 0.30, 110, green], [0.5, 0.72, 110, green]);
  else if (num === 3) sticks.push([0.5, 0.30, 102, green], [0.33, 0.72, 102, green], [0.67, 0.72, 102, green]);
  else if (num === 4) sticks.push([0.34, 0.30, 102, green], [0.66, 0.30, 102, green], [0.34, 0.72, 102, green], [0.66, 0.72, 102, green]);
  else if (num === 5) sticks.push([0.28, 0.28, 96, green], [0.72, 0.28, 96, green], [0.5, 0.52, 90, red], [0.28, 0.75, 96, green], [0.72, 0.75, 96, green]);
  else if (num === 6) for (const x of [0.29, 0.5, 0.71]) sticks.push([x, 0.30, 104, green], [x, 0.72, 104, green]);
  else if (num === 7) { sticks.push([0.5, 0.22, 76, red]); for (const x of [0.29, 0.5, 0.71]) sticks.push([x, 0.52, 76, green], [x, 0.81, 76, green]); }
  else if (num === 8) for (const x of [0.23, 0.41, 0.59, 0.77]) sticks.push([x, 0.30, 98, green], [x, 0.72, 98, green]);
  else if (num === 9) for (const x of [0.28, 0.5, 0.72]) sticks.push([x, 0.22, 76, green], [x, 0.52, 76, x === 0.5 ? red : blue], [x, 0.81, 76, green]);

  for (const [nx, ny, h, col] of sticks) drawBambooStick(ctx, CELL_W * nx, CELL_H * ny, bw, h, isRed ? red : col);
}

function drawHonor(ctx, idx) {
  if (idx === 4) {
    ctx.strokeStyle = '#1b3e72'; ctx.lineWidth = 12; roundRect(ctx, 48, 60, CELL_W - 96, CELL_H - 120, 18); ctx.stroke();
    ctx.strokeStyle = 'rgba(27, 62, 114, 0.35)'; ctx.lineWidth = 4; roundRect(ctx, 66, 78, CELL_W - 132, CELL_H - 156, 10); ctx.stroke();
    return;
  }
  const colors = ['#0f151d', '#0f151d', '#0f151d', '#0f151d', '#0f151d', '#0c6b3d', '#bf151c'];
  ctx.fillStyle = colors[idx];
  ctx.strokeStyle = colors[idx];
  ctx.lineWidth = 4;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 170px "Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif';
  ctx.strokeText(HONOR_CHARS[idx], CELL_W * 0.5, CELL_H * 0.54);
  ctx.fillText(HONOR_CHARS[idx], CELL_W * 0.5, CELL_H * 0.54);
}

function drawBackSlot(ctx, slotIdx) {
  const col = slotIdx % ATLAS_COLS, row = Math.floor(slotIdx / ATLAS_COLS);
  ctx.save(); ctx.translate(col * CELL_W, row * CELL_H);
  const grad = ctx.createLinearGradient(0, 0, CELL_W, CELL_H);
  grad.addColorStop(0, '#ec9035');
  grad.addColorStop(0.5, '#dd7a20');
  grad.addColorStop(1, '#c36210');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, CELL_W, CELL_H);
  ctx.strokeStyle = 'rgba(255, 224, 175, 0.32)'; ctx.lineWidth = 5;
  roundRect(ctx, 18, 18, CELL_W - 36, CELL_H - 36, 16); ctx.stroke();
  ctx.restore();
}

export function createFeltTextureCanvas() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1d6e35'; ctx.fillRect(0, 0, size, size);
  const imgData = ctx.getImageData(0, 0, size, size);
  const d = imgData.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const weave = ((x + y) % 2 === 0 ? 3 : -3) + ((x % 4 === 0) ? 2 : 0);
      const grain = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      const n = Math.floor(grain * 8) - 4 + weave;
      d[idx] = Math.max(0, Math.min(255, 24 + n));
      d[idx+1] = Math.max(0, Math.min(255, 108 + n));
      d[idx+2] = Math.max(0, Math.min(255, 48 + n));
      d[idx+3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
