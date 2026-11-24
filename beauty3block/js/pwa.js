(function (global) {
  'use strict';
  const B3B = (global.Beauty3Block = global.Beauty3Block || {});

  function isIOSDevice() {
    const ua = global.navigator.userAgent || '';
    const platform = global.navigator.platform || '';
    return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && global.navigator.maxTouchPoints > 1);
  }

  function isStandaloneMode() {
    return (
      global.navigator.standalone === true ||
      (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches)
    );
  }

  class PWAController {
    constructor({ onInstallReady, onFullscreenChange, onShowIOSGuide } = {}) {
      this.deferredPrompt = null;
      this.onInstallReady = onInstallReady;
      this.onFullscreenChange = onFullscreenChange;
      this.onShowIOSGuide = onShowIOSGuide;
      this.isIOS = isIOSDevice();
      this.isStandalone = isStandaloneMode();
    }

    init() {
      this._initTouchAndZoomGuards();
      this._initServiceWorker();
      this._initInstallPrompt();
      this._initFullscreenListeners();
    }

    _initTouchAndZoomGuards() {
      const preventIfNotScrollable = (e) => {
        if (e.touches && e.touches.length > 1) {
          e.preventDefault();
          return;
        }
        const scrollable = e.target && e.target.closest ? e.target.closest('.allow-scroll') : null;
        if (!scrollable) {
          e.preventDefault();
        }
      };

      document.addEventListener('touchmove', preventIfNotScrollable, { passive: false });
      document.addEventListener(
        'touchstart',
        (e) => {
          if (e.touches && e.touches.length > 1) {
            e.preventDefault();
          }
        },
        { passive: false }
      );

      // Block Safari pinch gestures & double-tap zoom
      ['gesturestart', 'gesturechange', 'gestureend'].forEach((evt) => {
        document.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
      });

      let lastTouchEnd = 0;
      document.addEventListener(
        'touchend',
        (e) => {
          const now = Date.now();
          if (now - lastTouchEnd <= 280) {
            const allowFastTap =
              e.target &&
              e.target.closest &&
              e.target.closest('.game-btn, canvas, button, select, input, label, a');
            if (!allowFastTap) {
              e.preventDefault();
            }
          }
          lastTouchEnd = now;
        },
        { passive: false }
      );

      document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });

      // Prevent wheel zoom (Ctrl + Wheel) and page scroll
      document.addEventListener(
        'wheel',
        (e) => {
          if (e.ctrlKey || !e.target.closest('.allow-scroll')) {
            e.preventDefault();
          }
        },
        { passive: false }
      );
    }

    _initServiceWorker() {
      if (!('serviceWorker' in global.navigator)) return;
      const proto = global.location.protocol;
      const host = global.location.hostname;
      const isSecureOrigin =
        proto === 'https:' || host === 'localhost' || host === '127.0.0.1';
      if (!isSecureOrigin) return;

      const swUrl = `./sw.js?v=${encodeURIComponent(B3B.BUILD_ID || '1')}`;
      global.navigator.serviceWorker
        .register(swUrl, { updateViaCache: 'none' })
        .catch(() => {
          // Registration failure shouldn't stop gameplay
        });
    }

    _initInstallPrompt() {
      global.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        this.deferredPrompt = e;
        if (typeof this.onInstallReady === 'function') {
          this.onInstallReady(true);
        }
      });

      global.addEventListener('appinstalled', () => {
        this.deferredPrompt = null;
        if (typeof this.onInstallReady === 'function') {
          this.onInstallReady(false);
        }
      });
    }

    async promptInstall() {
      if (!this.deferredPrompt) {
        if (this.isIOS && !this.isStandalone && typeof this.onShowIOSGuide === 'function') {
          this.onShowIOSGuide();
        }
        return false;
      }
      this.deferredPrompt.prompt();
      const choice = await this.deferredPrompt.userChoice.catch(() => null);
      if (choice && choice.outcome === 'accepted') {
        this.deferredPrompt = null;
        if (typeof this.onInstallReady === 'function') {
          this.onInstallReady(false);
        }
        return true;
      }
      return false;
    }

    _initFullscreenListeners() {
      const notify = () => {
        if (typeof this.onFullscreenChange === 'function') {
          this.onFullscreenChange(this.isFullscreen());
        }
      };
      document.addEventListener('fullscreenchange', notify);
      document.addEventListener('webkitfullscreenchange', notify);
    }

    isFullscreen() {
      return Boolean(
        document.fullscreenElement ||
          document.webkitFullscreenElement ||
          isStandaloneMode()
      );
    }

    async toggleFullscreen() {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl) {
        try {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } catch (_) {}
        return;
      }

      const root = document.documentElement;
      try {
        if (root.requestFullscreen) {
          await root.requestFullscreen({ navigationUI: 'hide' });
          return;
        }
        if (root.webkitRequestFullscreen) {
          root.webkitRequestFullscreen();
          return;
        }
      } catch (_) {
        // Fallback below
      }

      if (this.isIOS && !isStandaloneMode() && typeof this.onShowIOSGuide === 'function') {
        this.onShowIOSGuide();
      }
    }
  }

  B3B.PWAController = PWAController;
  B3B.isIOSDevice = isIOSDevice;
  B3B.isStandaloneMode = isStandaloneMode;
})(window);
