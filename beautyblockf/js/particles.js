/**
 * particles.js - クリスタル破片スパーク、ショックウェーブ、画面振動、フローティングテキスト
 */
class EffectEngine {
    constructor() {
        this.particles = [];
        this.shockwaves = [];
        this.floatingTexts = [];
        this.lineFlashes = [];
        this.shakeAmount = 0;
        this.shakeDecay = 0.9;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
    }

    // 画面振動（スクリーンシェイク）を追加
    triggerShake(magnitude = 6) {
        this.shakeAmount = Math.max(this.shakeAmount, magnitude);
    }

    // ライン消去時のクリスタル粉砕スパーク
    createLineClearParticles(yCoord, blockHeight, boardWidth, color = '#60a5fa') {
        const count = 45; // 粒子の数
        for (let i = 0; i < count; i++) {
            const px = Math.random() * boardWidth;
            const py = yCoord + Math.random() * blockHeight;
            const angle = Math.random() * Math.PI * 2;
            const speed = 2.5 + Math.random() * 7;
            const size = 3 + Math.random() * 5;
            const life = 1.0;
            const decay = 0.015 + Math.random() * 0.02;

            this.particles.push({
                x: px,
                y: py,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.5, // 上向きバイアス
                gravity: 0.18,
                size: size,
                color: color,
                alpha: life,
                decay: decay,
                rotation: Math.random() * Math.PI * 2,
                vRot: (Math.random() - 0.5) * 0.3,
                shape: Math.random() > 0.5 ? 'spark' : 'diamond'
            });
        }

        // ライン全体の発光フラッシュ
        this.lineFlashes.push({
            y: yCoord,
            height: blockHeight,
            alpha: 0.9,
            color: color
        });
    }

    // ハードドロップ着地時のショックウェーブ＆スパーク
    createHardDropEffect(x, y, width, color = '#38bdf8') {
        // ショックウェーブ（輪）
        this.shockwaves.push({
            x: x + width / 2,
            y: y,
            radius: 5,
            maxRadius: width * 1.5,
            alpha: 0.8,
            speed: 3.5,
            color: color
        });

        // 接地面のスパーク
        for (let i = 0; i < 16; i++) {
            const angle = -Math.PI * (0.1 + Math.random() * 0.8); // 上向き半円
            const speed = 1.5 + Math.random() * 5;
            this.particles.push({
                x: x + Math.random() * width,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                gravity: 0.22,
                size: 2.5 + Math.random() * 3.5,
                color: color,
                alpha: 1.0,
                decay: 0.03 + Math.random() * 0.03,
                rotation: 0,
                vRot: (Math.random() - 0.5) * 0.2,
                shape: 'spark'
            });
        }
    }

    // フローティングテキスト（"TETRIS!", "COMBO x2"等）
    addFloatingText(text, x, y, color = '#fbbf24', fontSize = 28) {
        this.floatingTexts.push({
            text: text,
            x: x,
            y: y,
            vy: -1.2,
            scale: 0.6,
            maxScale: 1.2,
            alpha: 1.0,
            decay: 0.018,
            color: color,
            fontSize: fontSize
        });
    }

    // 更新処理
    update() {
        // 画面振動の減衰計算
        if (this.shakeAmount > 0.1) {
            this.shakeOffsetX = (Math.random() - 0.5) * this.shakeAmount * 2;
            this.shakeOffsetY = (Math.random() - 0.5) * this.shakeAmount * 2;
            this.shakeAmount *= this.shakeDecay;
        } else {
            this.shakeAmount = 0;
            this.shakeOffsetX = 0;
            this.shakeOffsetY = 0;
        }

        // パーティクル更新
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.vx *= 0.98;
            p.rotation += p.vRot;
            p.alpha -= p.decay;

            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // ショックウェーブ更新
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const sw = this.shockwaves[i];
            sw.radius += sw.speed;
            sw.alpha = Math.max(0, 1 - (sw.radius / sw.maxRadius));
            if (sw.radius >= sw.maxRadius || sw.alpha <= 0) {
                this.shockwaves.splice(i, 1);
            }
        }

        // ラインフラッシュ更新
        for (let i = this.lineFlashes.length - 1; i >= 0; i--) {
            const lf = this.lineFlashes[i];
            lf.alpha -= 0.05;
            if (lf.alpha <= 0) {
                this.lineFlashes.splice(i, 1);
            }
        }

        // フローティングテキスト更新
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.y += ft.vy;
            if (ft.scale < ft.maxScale) {
                ft.scale += 0.08;
            }
            ft.alpha -= ft.decay;
            if (ft.alpha <= 0) {
                this.floatingTexts.splice(i, 1);
            }
        }
    }

    // 描画処理
    render(ctx) {
        ctx.save();

        // 1. ラインフラッシュ
        for (const lf of this.lineFlashes) {
            ctx.fillStyle = lf.color;
            ctx.globalAlpha = lf.alpha * 0.7;
            ctx.shadowColor = lf.color;
            ctx.shadowBlur = 20;
            ctx.fillRect(0, lf.y, ctx.canvas.width, lf.height);
        }

        // 2. ショックウェーブ
        for (const sw of this.shockwaves) {
            ctx.save();
            ctx.globalAlpha = sw.alpha;
            ctx.strokeStyle = sw.color;
            ctx.shadowColor = sw.color;
            ctx.shadowBlur = 15;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(sw.x, sw.y, sw.radius, sw.radius * 0.35, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 3. パーティクル
        for (const p of this.particles) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);

            ctx.shadowColor = p.color;
            ctx.shadowBlur = 10;
            ctx.fillStyle = p.color;

            if (p.shape === 'diamond') {
                const s = p.size;
                ctx.beginPath();
                ctx.moveTo(0, -s);
                ctx.lineTo(s * 0.7, 0);
                ctx.lineTo(0, s);
                ctx.lineTo(-s * 0.7, 0);
                ctx.closePath();
                ctx.fill();
            } else {
                // スパーク（四芒星）
                const s = p.size;
                ctx.beginPath();
                ctx.moveTo(0, -s);
                ctx.quadraticCurveTo(0, 0, s, 0);
                ctx.quadraticCurveTo(0, 0, 0, s);
                ctx.quadraticCurveTo(0, 0, -s, 0);
                ctx.quadraticCurveTo(0, 0, 0, -s);
                ctx.fill();
            }

            // 中心の純白ハイライト
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = Math.max(0, p.alpha * 0.85);
            ctx.beginPath();
            ctx.arc(0, 0, p.size * 0.3, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        // 4. フローティングテキスト
        for (const ft of this.floatingTexts) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, ft.alpha);
            ctx.translate(ft.x, ft.y);
            ctx.scale(ft.scale, ft.scale);

            ctx.font = `900 ${ft.fontSize}px 'Outfit', -apple-system, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // 外側グロー
            ctx.shadowColor = ft.color;
            ctx.shadowBlur = 18;
            ctx.fillStyle = ft.color;
            ctx.fillText(ft.text, 0, 0);

            // 内側文字（白ハイライト）
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(ft.text, 0, 0);

            ctx.restore();
        }

        ctx.restore();
    }
}

window.effectEngine = new EffectEngine();
