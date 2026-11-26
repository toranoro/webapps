/**
 * PWA（インストール・キャッシュ無効化SW）・全画面・誤操作（スクロール/ピンチ）防止モジュール
 */

export function setupViewportGuards() {
  // iOS Safari ピンチイン・ピンチアウト完全抑止
  const prevent = (e) => e.preventDefault();
  document.addEventListener('gesturestart', prevent, { passive: false });
  document.addEventListener('gesturechange', prevent, { passive: false });
  document.addEventListener('gestureend', prevent, { passive: false });

  // スクロール可能なモーダル外でのタッチスクロール・ドラッグ崩れを防止
  document.addEventListener('touchmove', (e) => {
    if (!e.target.closest('.scrollable')) {
      e.preventDefault();
    }
  }, { passive: false });

  // ダブルタップ拡大防止
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 280) {
      if (!e.target.closest('.scrollable') && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
      }
    }
    lastTouchEnd = now;
  }, { passive: false });

  // 右クリック・長押しメニュー抑止
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.scrollable')) {
      e.preventDefault();
    }
  });
}

export function registerNoCacheServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js?v=20261127063332', { updateViaCache: 'none' })
    .then((reg) => {
      reg.update().catch(() => {});
    })
    .catch(() => {});
}

export function setupInstallAndFullscreen({ installBtn, fullscreenBtn, iosFsModal, closeIosFsBtn }) {
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (installBtn) installBtn.classList.add('hidden');
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.classList.add('hidden');
    });
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', async () => {
      const docEl = document.documentElement;
      const isStandalone =
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;

      if (isStandalone) return;

      const fsElem = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsElem) {
        if (document.exitFullscreen) await document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        return;
      }

      if (docEl.requestFullscreen) {
        try {
          await docEl.requestFullscreen({ navigationUI: 'hide' });
          return;
        } catch {
          // fallback below
        }
      } else if (docEl.webkitRequestFullscreen) {
        try {
          docEl.webkitRequestFullscreen();
          return;
        } catch {
          // fallback below
        }
      }

      // iOS Safari等でFullscreen APIが使えない場合、ホーム画面追加ガイドを表示
      if (iosFsModal) {
        iosFsModal.classList.remove('hidden');
      }
    });
  }

  if (closeIosFsBtn && iosFsModal) {
    closeIosFsBtn.addEventListener('click', () => {
      iosFsModal.classList.add('hidden');
    });
  }
}
