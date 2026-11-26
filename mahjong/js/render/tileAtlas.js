/**
 * Canvas2D によるプロシージャル高精細牌テクスチャアトラス & 卓マットテクスチャ生成
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

  ctx.fillStyle = '#f8f4e8';
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

  const grad = ctx.createLinearGradient(0, 0, CELL_W, CELL_H);
  grad.addColorStop(0, '#fcf9ef');
  grad.addColorStop(0.55, '#f6f1e2');
  grad.addColorStop(1, '#ebe3ce');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CELL_W, CELL_H);

  ctx.strokeStyle = 'rgba(170, 155, 125, 0.25)';
  ctx.lineWidth = 4;
  roundRect(ctx, 12, 12, CELL_W - 24, CELL_H - 24, 18);
  ctx.stroke();

  if (type < 9) drawManzu(ctx, type + 1, isRed);
  else if (type < 18) drawPinzu(ctx, type - 8, isRed);
  else if (type < 27) drawSouzu(ctx, type - 17, isRed);
  else drawHonor(ctx, type - 27);

  if (isRed) {
    ctx.fillStyle = '#e62e2d';
    ctx.beginPath();
    ctx.arc(CELL_W - 30, 32, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff5cc';
    ctx.beginPath();
    ctx.arc(CELL_W - 32, 30, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (showGuide) {
    let badge = '';
    if (type < 9) badge = `${type + 1}萬`;
    else if (type < 18) badge = `${type - 8}筒`;
    else if (type < 27) badge = `${type - 17}索`;
    else badge = HONOR_CHARS[type - 27];

    ctx.fillStyle = isRed ? '#d12020' : 'rgba(38, 46, 54, 0.72)';
    ctx.font = 'bold 26px "Yu Gothic UI", "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(badge, 20, 18);
  }
  ctx.restore();
}

function drawManzu(ctx, num, isRed) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isRed ? '#d92121' : '#1b2b4b';
  ctx.font = '900 108px "Yu Mincho", "Hiragino Mincho ProN", serif';
  ctx.fillText(KANJI_NUMS[num - 1], CELL_W * 0.5, CELL_H * 0.31);
  ctx.fillStyle = isRed ? '#e32b2b' : '#b81d24';
  ctx.font = '900 124px "Yu Mincho", "Hiragino Mincho ProN", serif';
  ctx.fillText('萬', CELL_W * 0.5, CELL_H * 0.69);
}

function drawCirclePip(ctx, x, y, r, color) {
  ctx.save();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fbf7ec'; ctx.beginPath(); ctx.arc(x, y, r * 0.66, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fbf7ec';
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPinzu(ctx, num, isRed) {
  const blue = '#164b8a', green = '#147a49', red = '#cb2027';
  if (num === 1) {
    const cx = CELL_W * 0.5, cy = CELL_H * 0.52;
    ctx.fillStyle = '#164b8a'; ctx.beginPath(); ctx.arc(cx, cy, 86, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fbf7ec'; ctx.beginPath(); ctx.arc(cx, cy, 72, 0, Math.PI * 2); ctx.fill();
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
    3: [[0.28, 0.26, blue], [0.5, 0.51, red], [0.72, 0.76, green]],
    4: [[0.32, 0.30, blue], [0.68, 0.30, green], [0.32, 0.72, green], [0.68, 0.72, blue]],
    5: [[0.28, 0.27, blue], [0.72, 0.27, green], [0.5, 0.51, red], [0.28, 0.75, green], [0.72, 0.75, blue]],
    6: [[0.32, 0.24, green], [0.68, 0.24, green], [0.32, 0.52, red], [0.68, 0.52, red], [0.32, 0.78, red], [0.68, 0.78, red]],
    7: [[0.27, 0.21, green], [0.50, 0.27, green], [0.73, 0.33, green], [0.32, 0.56, red], [0.68, 0.56, red], [0.32, 0.80, red], [0.68, 0.80, red]],
    8: [[0.33, 0.19, blue], [0.67, 0.19, blue], [0.33, 0.40, blue], [0.67, 0.40, blue], [0.33, 0.61, blue], [0.67, 0.61, blue], [0.33, 0.82, blue], [0.67, 0.82, blue]],
    9: [[0.24, 0.23, green], [0.5, 0.23, green], [0.76, 0.23, green], [0.24, 0.51, red], [0.5, 0.51, red], [0.76, 0.51, red], [0.24, 0.79, blue], [0.5, 0.79, blue], [0.76, 0.79, blue]],
  };
  const r = num <= 4 ? 34 : (num <= 7 ? 27 : 24);
  for (const [nx, ny, col] of layouts[num]) drawCirclePip(ctx, CELL_W * nx, CELL_H * ny, r, isRed ? red : col);
}

function drawBambooStick(ctx, x, y, w, h, color) {
  ctx.save();
  ctx.fillStyle = color; roundRect(ctx, x - w / 2, y - h / 2, w, h, w * 0.42); ctx.fill();
  ctx.fillStyle = '#f8f4e8'; ctx.fillRect(x - w * 0.12, y - h * 0.36, w * 0.24, h * 0.72);
  ctx.fillStyle = color;
  ctx.fillRect(x - w * 0.56, y - h * 0.06, w * 1.12, h * 0.12);
  ctx.fillRect(x - w * 0.52, y - h * 0.42, w * 1.04, h * 0.08);
  ctx.fillRect(x - w * 0.52, y + h * 0.34, w * 1.04, h * 0.08);
  ctx.restore();
}

function drawSouzu(ctx, num, isRed) {
  const green = '#147a49', red = '#cc2229', blue = '#164b8a';
  if (num === 1) {
    const cx = CELL_W * 0.5, cy = CELL_H * 0.54;
    ctx.save();
    const colors = [green, '#299e63', red, '#1c6d99', green];
    for (let i = -2; i <= 2; i++) {
      ctx.fillStyle = colors[i + 2];
      ctx.beginPath(); ctx.ellipse(cx + i * 22, cy + 44, 13, 38, i * 0.24, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = green; ctx.beginPath(); ctx.ellipse(cx, cy + 6, 30, 42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = red; ctx.beginPath(); ctx.ellipse(cx, cy + 6, 16, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = green; ctx.beginPath(); ctx.arc(cx - 8, cy - 52, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d99a1e';
    ctx.beginPath(); ctx.moveTo(cx - 26, cy - 54); ctx.lineTo(cx - 48, cy - 44); ctx.lineTo(cx - 24, cy - 40); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx - 14, cy - 54, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  const sticks = [], bw = 22;
  if (num === 2) sticks.push([0.5, 0.30, 108, green], [0.5, 0.72, 108, green]);
  else if (num === 3) sticks.push([0.5, 0.30, 100, green], [0.33, 0.72, 100, green], [0.67, 0.72, 100, green]);
  else if (num === 4) sticks.push([0.34, 0.30, 100, green], [0.66, 0.30, 100, green], [0.34, 0.72, 100, green], [0.66, 0.72, 100, green]);
  else if (num === 5) sticks.push([0.28, 0.28, 95, green], [0.72, 0.28, 95, green], [0.5, 0.51, 88, red], [0.28, 0.74, 95, green], [0.72, 0.74, 95, green]);
  else if (num === 6) for (const x of [0.29, 0.5, 0.71]) sticks.push([x, 0.30, 102, green], [x, 0.72, 102, green]);
  else if (num === 7) { sticks.push([0.5, 0.21, 74, red]); for (const x of [0.29, 0.5, 0.71]) sticks.push([x, 0.51, 74, green], [x, 0.80, 74, green]); }
  else if (num === 8) for (const x of [0.23, 0.41, 0.59, 0.77]) sticks.push([x, 0.30, 96, green], [x, 0.72, 96, green]);
  else if (num === 9) for (const x of [0.28, 0.5, 0.72]) sticks.push([x, 0.22, 74, green], [x, 0.51, 74, x === 0.5 ? red : blue], [x, 0.80, 74, green]);

  for (const [nx, ny, h, col] of sticks) drawBambooStick(ctx, CELL_W * nx, CELL_H * ny, bw, h, isRed ? red : col);
}

function drawHonor(ctx, idx) {
  if (idx === 4) {
    ctx.strokeStyle = '#2d4b7a'; ctx.lineWidth = 10; roundRect(ctx, 48, 62, CELL_W - 96, CELL_H - 124, 18); ctx.stroke();
    ctx.strokeStyle = 'rgba(45, 75, 122, 0.25)'; ctx.lineWidth = 4; roundRect(ctx, 64, 78, CELL_W - 128, CELL_H - 156, 10); ctx.stroke();
    return;
  }
  const colors = ['#1b222c', '#1b222c', '#1b222c', '#1b222c', '#1b222c', '#137c48', '#cb1f28'];
  ctx.fillStyle = colors[idx];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 162px "Yu Mincho", "Hiragino Mincho ProN", serif';
  ctx.fillText(HONOR_CHARS[idx], CELL_W * 0.5, CELL_H * 0.54);
}

function drawBackSlot(ctx, slotIdx) {
  const col = slotIdx % ATLAS_COLS, row = Math.floor(slotIdx / ATLAS_COLS);
  ctx.save(); ctx.translate(col * CELL_W, row * CELL_H);
  const grad = ctx.createLinearGradient(0, 0, CELL_W, CELL_H);
  grad.addColorStop(0, '#1e7f4e'); grad.addColorStop(1, '#105434');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, CELL_W, CELL_H);
  ctx.strokeStyle = 'rgba(218, 190, 100, 0.32)'; ctx.lineWidth = 5;
  roundRect(ctx, 20, 20, CELL_W - 40, CELL_H - 40, 18); ctx.stroke();
  ctx.restore();
}

export function createFeltTextureCanvas() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#145a3e'; ctx.fillRect(0, 0, size, size);
  const imgData = ctx.getImageData(0, 0, size, size);
  const d = imgData.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const weave = ((x + y) % 2 === 0 ? 4 : -4) + ((x % 4 === 0) ? 2 : 0);
      const grain = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      const n = Math.floor(grain * 10) - 5 + weave;
      d[idx] = Math.max(0, Math.min(255, 16 + n));
      d[idx+1] = Math.max(0, Math.min(255, 86 + n));
      d[idx+2] = Math.max(0, Math.min(255, 58 + n));
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
