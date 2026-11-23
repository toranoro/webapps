/**
 * タブレット・スマホ向け画面上バーチャルコントローラー
 * - 方向入力: 円形ベース内で「◯」ノブを上下左右へドラッグし、奥・手前・左・右の3D移動を行う
 * - 専用ボタン: JUMP / かがむ（長押し＆ワンタップ切替両対応）/ 防御 / 投げ / 弱強P・K / SP1・SP2
 * - 左右配置反転トグル対応
 */
export class VirtualPad {
  constructor(rootEl, onAnyInteraction) {
    this.rootEl = rootEl;
    this.onAnyInteraction = onAnyInteraction;

    this.stickZone = rootEl.querySelector('#vpad-stick-zone');
    this.stickKnob = rootEl.querySelector('#vpad-stick-knob');
    this.actionCluster = rootEl.querySelector('#vpad-actions');

    this.stickPointerId = null;
    this.stickX = 0; // -1 (左) ～ +1 (右)
    this.stickY = 0; // -1 (手前) ～ +1 (奥)

    this.guardHeld = false;
    this.guardPointers = new Set();

    // かがむ: 長押し中 または タップトグルでしゃがみ維持
    this.crouchPointers = new Map(); // pointerId -> downTimeMs
    this.crouchHeld = false;
    this.crouchLatched = false;

    this.queuedAttack = null;
    this.queuedThrow = false;
    this.queuedJump = false;
    this.queuedSpecial = null;

    this.sp1Btn = rootEl.querySelector('[data-action="SP1"]');
    this.sp2Btn = rootEl.querySelector('[data-action="SP2"]');
    this.crouchBtn = rootEl.querySelector('[data-action="CROUCH"]');

    this._bindStickEvents();
    this._bindActionButtons();
  }

  setVisible(visible) {
    this.rootEl.classList.toggle('is-hidden', !visible);
    if (!visible) {
      this.resetAll();
    }
  }

  setSwapped(swapped) {
    this.rootEl.classList.toggle('is-swapped', Boolean(swapped));
  }

  resetAll() {
    this.stickPointerId = null;
    this.stickX = 0;
    this.stickY = 0;
    this._updateKnobVisual(0, 0);
    this.stickZone.classList.remove('is-active');

    this.guardPointers.clear();
    this.guardHeld = false;
    this.crouchPointers.clear();
    this.crouchHeld = false;
    this.crouchLatched = false;

    this.queuedAttack = null;
    this.queuedThrow = false;
    this.queuedJump = false;
    this.queuedSpecial = null;

    const buttons = this.actionCluster.querySelectorAll('[data-action]');
    buttons.forEach((btn) => btn.classList.remove('is-pressed'));
  }

  _syncCrouchButtonVisual() {
    if (this.crouchBtn) {
      this.crouchBtn.classList.toggle('is-pressed', this.crouchHeld || this.crouchLatched);
    }
  }

  _bindStickEvents() {
    const zone = this.stickZone;

    const updateFromEvent = (e) => {
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxR = Math.max(24, rect.width * 0.36);

      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);

      if (dist > maxR) {
        const scale = maxR / dist;
        dx *= scale;
        dy *= scale;
      }

      this._updateKnobVisual(dx, dy);

      const normX = dx / maxR;
      const normY = -dy / maxR; // 画面上方向(+Y)を3D奥方向(+1)にマップ
      const mag = Math.hypot(normX, normY);
      const deadzone = 0.16;

      if (mag < deadzone) {
        this.stickX = 0;
        this.stickY = 0;
      } else {
        const scaled = Math.min(1, (mag - deadzone) / (1 - deadzone));
        this.stickX = (normX / mag) * scaled;
        this.stickY = (normY / mag) * scaled;
      }
    };

    const releaseStick = (e) => {
      if (e && e.pointerId !== undefined && e.pointerId !== this.stickPointerId) return;
      this.stickPointerId = null;
      this.stickX = 0;
      this.stickY = 0;
      this._updateKnobVisual(0, 0);
      zone.classList.remove('is-active');
    };

    zone.addEventListener('pointerdown', (e) => {
      if (this.stickPointerId !== null) return;
      e.preventDefault();
      this.stickPointerId = e.pointerId;
      zone.classList.add('is-active');
      try {
        zone.setPointerCapture(e.pointerId);
      } catch (_) {}
      updateFromEvent(e);
      if (this.onAnyInteraction) this.onAnyInteraction();
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickPointerId) return;
      e.preventDefault();
      updateFromEvent(e);
    });

    zone.addEventListener('pointerup', releaseStick);
    zone.addEventListener('pointercancel', releaseStick);
    zone.addEventListener('lostpointercapture', releaseStick);
    window.addEventListener('blur', () => this.resetAll());
  }

  _updateKnobVisual(dx, dy) {
    this.stickKnob.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
  }

  _bindActionButtons() {
    const buttons = this.actionCluster.querySelectorAll('[data-action]');

    buttons.forEach((btn) => {
      const action = btn.dataset.action;

      const onDown = (e) => {
        e.preventDefault();
        try {
          btn.setPointerCapture(e.pointerId);
        } catch (_) {}
        btn.classList.add('is-pressed');
        if (this.onAnyInteraction) this.onAnyInteraction();

        if (action === 'GUARD') {
          this.guardPointers.add(e.pointerId);
          this.guardHeld = true;
        } else if (action === 'CROUCH') {
          this.crouchPointers.set(e.pointerId, performance.now());
          this.crouchHeld = true;
          this._syncCrouchButtonVisual();
        } else if (action === 'THROW') {
          this.queuedThrow = true;
        } else if (action === 'JUMP') {
          this.crouchLatched = false;
          this._syncCrouchButtonVisual();
          this.queuedJump = true;
        } else if (action === 'SP1') {
          this.queuedSpecial = 'sp1';
        } else if (action === 'SP2') {
          this.queuedSpecial = 'sp2';
        } else {
          this.queuedAttack = action;
        }
      };

      const onUp = (e) => {
        e.preventDefault();
        if (action === 'GUARD') {
          this.guardPointers.delete(e.pointerId);
          this.guardHeld = this.guardPointers.size > 0;
          if (!this.guardHeld) {
            btn.classList.remove('is-pressed');
          }
        } else if (action === 'CROUCH') {
          const downTime = this.crouchPointers.get(e.pointerId);
          this.crouchPointers.delete(e.pointerId);
          this.crouchHeld = this.crouchPointers.size > 0;
          if (downTime !== undefined && e.type === 'pointerup') {
            const elapsed = performance.now() - downTime;
            // 短タップならトグル切替、長押しなら離した時点でしゃがみ解除
            if (elapsed < 240) {
              this.crouchLatched = !this.crouchLatched;
            } else {
              this.crouchLatched = false;
            }
          }
          this._syncCrouchButtonVisual();
        } else {
          btn.classList.remove('is-pressed');
        }
      };

      btn.addEventListener('pointerdown', onDown);
      btn.addEventListener('pointerup', onUp);
      btn.addEventListener('pointercancel', onUp);
      btn.addEventListener('lostpointercapture', onUp);
    });
  }

  updateSkillButtons(sp1Cd, sp2Cd, sp1Label = 'SP1', sp2Label = 'SP2') {
    if (this.sp1Btn) {
      this.sp1Btn.classList.toggle('is-cooldown', sp1Cd > 0.05);
      const main = this.sp1Btn.querySelector('.pad-main');
      if (main) main.textContent = sp1Cd > 0.05 ? `${sp1Cd.toFixed(1)}s` : sp1Label;
    }
    if (this.sp2Btn) {
      this.sp2Btn.classList.toggle('is-cooldown', sp2Cd > 0.05);
      const main = this.sp2Btn.querySelector('.pad-main');
      if (main) main.textContent = sp2Cd > 0.05 ? `${sp2Cd.toFixed(1)}s` : sp2Label;
    }
  }

  consumeState() {
    const isCrouchActive = this.crouchHeld || this.crouchLatched;
    // しゃがみ投げ(巴投)実行後はトグルしゃがみを自動解除して立ち回りに戻す
    if (this.queuedThrow && this.crouchLatched) {
      this.crouchLatched = false;
      this._syncCrouchButtonVisual();
    }

    const state = {
      moveX: this.stickX,
      moveY: this.stickY,
      crouch: isCrouchActive,
      guard: this.guardHeld,
      attackId: this.queuedAttack,
      throwPressed: this.queuedThrow,
      jump: this.queuedJump,
      specialSlot: this.queuedSpecial,
    };
    this.queuedAttack = null;
    this.queuedThrow = false;
    this.queuedJump = false;
    this.queuedSpecial = null;
    return state;
  }
}
