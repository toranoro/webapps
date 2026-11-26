/**
 * くっつけ！ぷにスクイーズ - UI・レスポンシブ・全画面・PWA制御
 */

import { SQUEEZE_TYPES, WORLD } from "./config.js";
import { drawSqueezeCharacter } from "./renderer.js";

const STORAGE_KEYS = {
  BEST_SCORE: "kuttuke_best_score_v1",
  MUTED: "kuttuke_muted_v1",
  PLAYED_ONCE: "kuttuke_played_once_v1"
};

export class UIController {
  constructor(handlers) {
    this.handlers = handlers;
    this.bestScore = Number(localStorage.getItem(STORAGE_KEYS.BEST_SCORE) || 0);
    this.muted = localStorage.getItem(STORAGE_KEYS.MUTED) === "1";
    this.deferredInstallPrompt = null;
    this.toastTimer = null;

    this._cacheElements();
    this._bindProtectionEvents();
    this._bindButtons();
    this._bindPWAEvents();
    this._buildEvolutionCharts();
    this.updateScore(0);
    this.updateMuteState(this.muted);
  }

  _cacheElements() {
    this.els = {
      stageArea: document.getElementById("stageArea"),
      canvas: document.getElementById("gameCanvas"),
      hintBanner: document.getElementById("hintBanner"),
      scoreMobile: document.getElementById("scoreMobile"),
      bestMobile: document.getElementById("bestMobile"),
      scoreDesktop: document.getElementById("scoreDesktop"),
      bestDesktop: document.getElementById("bestDesktop"),
      nextCanvasMobile: document.getElementById("nextCanvasMobile"),
      nextCanvasDesktop: document.getElementById("nextCanvasDesktop"),
      nextNameDesktop: document.getElementById("nextNameDesktop"),
      miniEvoBar: document.getElementById("miniEvoBar"),
      desktopEvoList: document.getElementById("desktopEvoList"),
      ruleEvoGrid: document.getElementById("ruleEvoGrid"),

      ruleModal: document.getElementById("ruleModal"),
      gameOverModal: document.getElementById("gameOverModal"),
      iosGuideModal: document.getElementById("iosGuideModal"),

      finalScore: document.getElementById("finalScore"),
      finalBest: document.getElementById("finalBest"),
      finalMaxChar: document.getElementById("finalMaxChar"),
      newRecordBadge: document.getElementById("newRecordBadge"),

      installBtns: document.querySelectorAll("[data-action='install']"),
      fullscreenBtns: document.querySelectorAll("[data-action='fullscreen']"),
      muteBtns: document.querySelectorAll("[data-action='mute']"),
      toast: document.getElementById("toast")
    };
  }

  /** レイアウト崩れ・スクロール・ピンチ・長押しメニューの完全防止 */
  _bindProtectionEvents() {
    const isScrollableTarget = (target) => {
      return Boolean(target && target.closest && target.closest(".modal-body, .evo-list"));
    };

    document.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length > 1 || !isScrollableTarget(e.target)) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    document.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    // iOS Safari ピンチジェスチャ抑止
    for (const evtName of ["gesturestart", "gesturechange", "gestureend"]) {
      document.addEventListener(
        evtName,
        (e) => {
          e.preventDefault();
        },
        { passive: false }
      );
    }

    // Ctrl+ホイールズーム防止
    document.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey) e.preventDefault();
      },
      { passive: false }
    );

    // 右クリック・長押しメニュー防止（マニュアルリンク以外）
    document.addEventListener("contextmenu", (e) => {
      if (!e.target.closest("a")) {
        e.preventDefault();
      }
    });
  }

  _bindButtons() {
    document.querySelectorAll("[data-action='restart']").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.closeAllModals();
        this.handlers.onRestart();
      });
    });

    document.querySelectorAll("[data-action='rules']").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.openModal(this.els.ruleModal);
      });
    });

    document.querySelectorAll("[data-action='close-modal']").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.closeAllModals();
      });
    });

    this.els.muteBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.muted = !this.muted;
        localStorage.setItem(STORAGE_KEYS.MUTED, this.muted ? "1" : "0");
        this.updateMuteState(this.muted);
        this.handlers.onToggleMute(this.muted);
      });
    });

    this.els.fullscreenBtns.forEach((btn) => {
      btn.addEventListener("click", () => this.toggleFullscreen());
    });

    this.els.installBtns.forEach((btn) => {
      btn.addEventListener("click", () => this.triggerInstall());
    });

    [this.els.ruleModal, this.els.gameOverModal, this.els.iosGuideModal].forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal && modal !== this.els.gameOverModal) {
          this.closeAllModals();
        }
      });
    });
  }

  _bindPWAEvents() {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      this.els.installBtns.forEach((btn) => {
        btn.style.display = "inline-flex";
      });
    });

    window.addEventListener("appinstalled", () => {
      this.deferredInstallPrompt = null;
      this.els.installBtns.forEach((btn) => {
        btn.style.display = "none";
      });
      this.showToast("アプリをインストールしました！");
    });
  }

  async triggerInstall() {
    if (this.deferredInstallPrompt) {
      this.deferredInstallPrompt.prompt();
      await this.deferredInstallPrompt.userChoice;
      this.deferredInstallPrompt = null;
      return;
    }
    if (this._isIOS()) {
      this.openModal(this.els.iosGuideModal);
    } else {
      this.showToast("ブラウザのメニューから「アプリをインストール」を選べます");
    }
  }

  async toggleFullscreen() {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

    if (isStandalone) {
      this.showToast("すでに全画面アプリモードで動作中です");
      return;
    }

    const docEl = document.documentElement;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;

    if (!fsEl) {
      const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
      if (req) {
        try {
          await req.call(docEl);
          return;
        } catch {
          // iOS Safari等で拒否された場合は案内へ
        }
      }
      if (this._isIOS()) {
        this.openModal(this.els.iosGuideModal);
      } else {
        this.showToast("この環境ではブラウザの全画面機能をご利用ください");
      }
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) {
        try {
          await exit.call(document);
        } catch {
          // ignore
        }
      }
    }
  }

  _isIOS() {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }

  /** ステージ領域に収まる最大Canvas CSSサイズを計算 */
  computeCanvasSize() {
    const rect = this.els.stageArea.getBoundingClientRect();
    const availW = Math.max(200, rect.width - 16);
    const availH = Math.max(240, rect.height - 16);
    const aspect = WORLD.WIDTH / WORLD.HEIGHT;

    let cssW = availW;
    let cssH = cssW / aspect;
    if (cssH > availH) {
      cssH = availH;
      cssW = cssH * aspect;
    }
    return {
      width: Math.floor(cssW),
      height: Math.floor(cssH)
    };
  }

  /** 進化チャート（ミニバー・サイドリスト・ルール図鑑）を描画 */
  _buildEvolutionCharts() {
    this.miniEvoItems = [];
    this.desktopEvoRows = [];

    // 1. モバイル用ミニ進化バー
    this.els.miniEvoBar.innerHTML = "";
    SQUEEZE_TYPES.forEach((def, idx) => {
      const item = document.createElement("div");
      item.className = "mini-evo-item";
      item.title = `${def.level}. ${def.name}`;
      const c = document.createElement("canvas");
      c.width = 36;
      c.height = 36;
      const ctx = c.getContext("2d");
      drawSqueezeCharacter(ctx, idx, 18, 18, 13, 0, { simple: true });
      item.appendChild(c);
      this.els.miniEvoBar.appendChild(item);
      this.miniEvoItems.push(item);
    });

    // 2. デスクトップ・タブレット横用リスト
    this.els.desktopEvoList.innerHTML = "";
    SQUEEZE_TYPES.forEach((def, idx) => {
      const row = document.createElement("div");
      row.className = "evo-row";
      const c = document.createElement("canvas");
      c.width = 48;
      c.height = 48;
      const ctx = c.getContext("2d");
      drawSqueezeCharacter(ctx, idx, 24, 24, 17, 0, { simple: true });

      const name = document.createElement("span");
      name.className = "evo-row-name";
      name.textContent = `${def.level}. ${def.name}`;

      const pts = document.createElement("span");
      pts.className = "evo-row-pts";
      pts.textContent = `+${def.score}`;

      row.append(c, name, pts);
      this.els.desktopEvoList.appendChild(row);
      this.desktopEvoRows.push(row);
    });

    // 3. ルールモーダル内図鑑グリッド
    this.els.ruleEvoGrid.innerHTML = "";
    SQUEEZE_TYPES.forEach((def, idx) => {
      const card = document.createElement("div");
      card.className = "evo-grid-card";
      const c = document.createElement("canvas");
      c.width = 68;
      c.height = 68;
      const ctx = c.getContext("2d");
      drawSqueezeCharacter(ctx, idx, 34, 34, 24, 0, {});

      const meta = document.createElement("div");
      meta.className = "evo-grid-meta";
      meta.innerHTML = `
        <div class="evo-grid-lv">Lv.${def.level}</div>
        <div class="evo-grid-name">${def.name}</div>
        <div class="evo-grid-pts">+${def.score} pts</div>
      `;

      card.append(c, meta);
      this.els.ruleEvoGrid.appendChild(card);
    });
  }

  updateScore(score) {
    this.els.scoreMobile.textContent = score.toLocaleString();
    this.els.scoreDesktop.textContent = score.toLocaleString();

    if (score > this.bestScore) {
      this.bestScore = score;
      localStorage.setItem(STORAGE_KEYS.BEST_SCORE, String(this.bestScore));
    }
    this.els.bestMobile.textContent = this.bestScore.toLocaleString();
    this.els.bestDesktop.textContent = this.bestScore.toLocaleString();
  }

  updateQueuePreview(currentLevel, nextLevel) {
    // モバイルNEXT & デスクトップNEXTの描画
    this._drawPreviewCanvas(this.els.nextCanvasMobile, nextLevel, 19);
    this._drawPreviewCanvas(this.els.nextCanvasDesktop, nextLevel, 42);
    this.els.nextNameDesktop.textContent = SQUEEZE_TYPES[nextLevel]?.name || "";

    // 進化チャートのハイライト更新
    this.miniEvoItems.forEach((el, idx) => {
      el.classList.toggle("is-current", idx === currentLevel);
      el.classList.toggle("is-next", idx === nextLevel);
    });
    this.desktopEvoRows.forEach((el, idx) => {
      el.classList.toggle("is-current", idx === currentLevel);
      el.classList.toggle("is-next", idx === nextLevel);
    });
  }

  _drawPreviewCanvas(canvas, levelIndex, radius) {
    if (!canvas || levelIndex === null || levelIndex === undefined) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSqueezeCharacter(ctx, levelIndex, canvas.width * 0.5, canvas.height * 0.54, radius, 0, {});
  }

  updateMuteState(muted) {
    this.els.muteBtns.forEach((btn) => {
      btn.textContent = muted ? "🔇" : "🔊";
      btn.setAttribute("aria-label", muted ? "サウンドONにする" : "サウンドOFFにする");
      btn.title = muted ? "サウンドOFF中（クリックでON）" : "サウンドON中（クリックでOFF）";
    });
  }

  hideHintBanner() {
    this.els.hintBanner.classList.add("hidden");
    localStorage.setItem(STORAGE_KEYS.PLAYED_ONCE, "1");
  }

  shouldShowHint() {
    return localStorage.getItem(STORAGE_KEYS.PLAYED_ONCE) !== "1";
  }

  showGameOver(score, maxLevelIndex, isNewRecord) {
    this.els.finalScore.textContent = score.toLocaleString();
    this.els.finalBest.textContent = this.bestScore.toLocaleString();
    const maxDef = SQUEEZE_TYPES[maxLevelIndex] || SQUEEZE_TYPES[0];
    this.els.finalMaxChar.textContent = `Lv.${maxDef.level} ${maxDef.name}`;
    this.els.newRecordBadge.style.display = isNewRecord ? "inline-block" : "none";
    this.openModal(this.els.gameOverModal);
  }

  openModal(modalEl) {
    this.closeAllModals();
    modalEl.classList.remove("hidden");
  }

  closeAllModals() {
    this.els.ruleModal.classList.add("hidden");
    this.els.gameOverModal.classList.add("hidden");
    this.els.iosGuideModal.classList.add("hidden");
  }

  isModalOpen() {
    return (
      !this.els.ruleModal.classList.contains("hidden") ||
      !this.els.gameOverModal.classList.contains("hidden") ||
      !this.els.iosGuideModal.classList.contains("hidden")
    );
  }

  showToast(message) {
    this.els.toast.textContent = message;
    this.els.toast.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.els.toast.classList.remove("show");
    }, 2600);
  }
}
