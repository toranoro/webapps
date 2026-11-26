/**
 * くっつけ！ぷにスクイーズ - メインエントリ＆ゲームループ
 * ポインター入力（マウス・タッチ統一）・キーボード操作・物理＆描画ループを統括します。
 */

import { WORLD, SQUEEZE_TYPES } from "./config.js";
import { SqueezeWorld } from "./physics.js";
import { GameRenderer, EffectManager } from "./renderer.js";
import { SoundEngine } from "./sound.js";
import { UIController } from "./ui.js";

class SqueezeGameApp {
  constructor() {
    this.sound = new SoundEngine();
    this.effects = new EffectManager();
    this.ui = new UIController({
      onRestart: () => this.restartGame(),
      onToggleMute: (muted) => {
        this.sound.setMuted(muted);
        if (!muted) this.sound.unlock();
      }
    });
    this.sound.setMuted(this.ui.muted);

    this.canvas = document.getElementById("gameCanvas");
    this.renderer = new GameRenderer(this.canvas);

    this.prevBestBeforeRun = this.ui.bestScore;
    this.world = new SqueezeWorld({
      onScoreChange: (score) => this.ui.updateScore(score),
      onSquish: (intensity) => this.sound.playSquish(intensity),
      onMerge: ({ x, y, levelIndex, gained, combo }) => {
        this.sound.playMerge(levelIndex, combo);
        const comboText = combo >= 2 ? `${combo}れんさ！ +${gained}` : `ぷにっ！ +${gained}`;
        this.effects.spawnMergeBurst(x, y, levelIndex, comboText);
      },
      onSuperMerge: ({ x, y, bonus }) => {
        this.sound.playSuperMerge();
        this.effects.spawnMergeBurst(x, y, SQUEEZE_TYPES.length - 1, `王様ビッグバン！ +${bonus}`);
        this.ui.showToast("王様もちふわ合体達成！大ボーナス！");
      },
      onGameOver: (score, maxLevelReached) => {
        this.sound.playGameOver();
        const isNewRecord = score > 0 && score >= this.ui.bestScore && score > this.prevBestBeforeRun;
        this.ui.showGameOver(score, maxLevelReached, isNewRecord);
      }
    });

    this.aimState = {
      x: WORLD.WIDTH * 0.5,
      currentLevel: this._randomSpawnLevel(),
      nextLevel: this._randomSpawnLevel(),
      canDrop: true,
      cooldownTimer: 0
    };

    this.isPointerDown = false;
    this.activePointerId = null;
    this.keys = { left: false, right: false };
    this.lastTime = performance.now();

    this._initResizeHandling();
    this._bindGameInputs();
    this._registerServiceWorker();

    this.ui.updateQueuePreview(this.aimState.currentLevel, this.aimState.nextLevel);
    if (!this.ui.shouldShowHint()) {
      this.ui.hideHintBanner();
    }

    requestAnimationFrame((t) => this._loop(t));
  }

  _randomSpawnLevel() {
    return Math.floor(Math.random() * (WORLD.MAX_SPAWN_LEVEL + 1));
  }

  _clampAimX(x) {
    const r = SQUEEZE_TYPES[this.aimState.currentLevel].radius;
    const minX = WORLD.WALL_THICKNESS + r + 3;
    const maxX = WORLD.WIDTH - WORLD.WALL_THICKNESS - r - 3;
    return Math.max(minX, Math.min(maxX, x));
  }

  _clientToWorldX(clientX) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return WORLD.WIDTH * 0.5;
    const norm = (clientX - rect.left) / rect.width;
    return this._clampAimX(norm * WORLD.WIDTH);
  }

  _bindGameInputs() {
    const stage = document.getElementById("stageArea");

    stage.addEventListener("pointerdown", (e) => {
      if (this.ui.isModalOpen() || this.world.gameOver) return;
      if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
      this.sound.unlock();
      this.isPointerDown = true;
      this.activePointerId = e.pointerId;
      if (stage.setPointerCapture) {
        try {
          stage.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
      this.aimState.x = this._clientToWorldX(e.clientX);
    });

    stage.addEventListener("pointermove", (e) => {
      if (this.ui.isModalOpen() || this.world.gameOver) return;
      if (e.pointerType === "mouse" || (this.isPointerDown && e.pointerId === this.activePointerId)) {
        this.aimState.x = this._clientToWorldX(e.clientX);
      }
    });

    const releaseDrop = (e) => {
      if (!this.isPointerDown || e.pointerId !== this.activePointerId) return;
      this.isPointerDown = false;
      this.activePointerId = null;
      if (!this.ui.isModalOpen() && !this.world.gameOver) {
        this.aimState.x = this._clientToWorldX(e.clientX);
        this.dropCurrent();
      }
    };

    stage.addEventListener("pointerup", releaseDrop);
    stage.addEventListener("pointercancel", () => {
      this.isPointerDown = false;
      this.activePointerId = null;
    });

    // キーボード操作（PC向け）
    window.addEventListener("keydown", (e) => {
      if (this.ui.isModalOpen()) {
        if (e.key === "Escape") this.ui.closeAllModals();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        this.keys.left = true;
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        this.keys.right = true;
      } else if (e.key === " " || e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        this.sound.unlock();
        this.dropCurrent();
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") this.keys.left = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") this.keys.right = false;
    });
  }

  dropCurrent() {
    if (!this.aimState.canDrop || this.world.gameOver) return;
    this.ui.hideHintBanner();

    this.world.spawnDrop(this.aimState.currentLevel, this.aimState.x);
    this.sound.playDrop();

    this.aimState.canDrop = false;
    this.aimState.cooldownTimer = WORLD.DROP_COOLDOWN_SEC;
    this.aimState.currentLevel = this.aimState.nextLevel;
    this.aimState.nextLevel = this._randomSpawnLevel();
    this.aimState.x = this._clampAimX(this.aimState.x);
    this.ui.updateQueuePreview(this.aimState.currentLevel, this.aimState.nextLevel);
  }

  restartGame() {
    this.prevBestBeforeRun = this.ui.bestScore;
    this.world.reset();
    this.effects.clear();
    this.aimState.currentLevel = this._randomSpawnLevel();
    this.aimState.nextLevel = this._randomSpawnLevel();
    this.aimState.x = WORLD.WIDTH * 0.5;
    this.aimState.canDrop = true;
    this.aimState.cooldownTimer = 0;
    this.ui.updateQueuePreview(this.aimState.currentLevel, this.aimState.nextLevel);
  }

  _initResizeHandling() {
    const updateSize = () => {
      const { width, height } = this.ui.computeCanvasSize();
      this.renderer.resizeDisplay(width, height);
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    window.addEventListener("orientationchange", () => setTimeout(updateSize, 120));
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateSize);
    }
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(updateSize);
      ro.observe(document.getElementById("stageArea"));
    }
  }

  _registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "http:" && location.protocol !== "https:") return;

    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register("./sw.js", {
          updateViaCache: "none"
        });
        reg.update().catch(() => {});
      } catch {
        // ローカル環境等で未対応時は無視
      }
    });
  }

  _loop(now) {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    // キーボードでの左右移動
    if (!this.ui.isModalOpen() && !this.world.gameOver) {
      const moveSpeed = 260;
      if (this.keys.left) this.aimState.x = this._clampAimX(this.aimState.x - moveSpeed * dt);
      if (this.keys.right) this.aimState.x = this._clampAimX(this.aimState.x + moveSpeed * dt);
    }

    // ドロップクールダウン
    if (!this.aimState.canDrop) {
      this.aimState.cooldownTimer -= dt;
      if (this.aimState.cooldownTimer <= 0) {
        this.aimState.canDrop = true;
      }
    }

    this.world.step(dt);
    this.effects.update(dt);
    this.renderer.render(this.world, this.effects, this.aimState, now / 1000);

    requestAnimationFrame((t) => this._loop(t));
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new SqueezeGameApp();
});
