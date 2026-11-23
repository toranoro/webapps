/**
 * PCキーボード（J/L・←/→移動、I/↑/SPACEジャンプ、K/↓しゃがみ、U/O・Shift+↑↓ 3Dサイドステップ、ZXCVASQW）
 * とタブレット用バーチャルパッド（◯ 4方向移動＋JUMP/かがむ専用ボタン）を統合するマネージャー
 */
export class InputManager {
  constructor(virtualPad, onFirstInput) {
    this.virtualPad = virtualPad;
    this.onFirstInput = onFirstInput;
    this.heldCodes = new Set();
    this.shiftHeld = false;
    this.queuedAttack = null;
    this.queuedThrow = false;
    this.queuedJump = false;
    this.queuedSpecial = null;
    this.queuedSidestep = 0; // +1: 奥へステップ, -1: 手前へステップ
    this.gameplayActive = false;

    this._bindKeyboard();
  }

  setGameplayActive(active) {
    this.gameplayActive = Boolean(active);
    if (!active) {
      this.queuedAttack = null;
      this.queuedThrow = false;
      this.queuedJump = false;
      this.queuedSpecial = null;
      this.queuedSidestep = 0;
      this.virtualPad.resetAll();
    }
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      this.shiftHeld = Boolean(e.shiftKey);
      if (this.onFirstInput) this.onFirstInput();

      if (
        this.gameplayActive &&
        ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)
      ) {
        e.preventDefault();
      }

      this.heldCodes.add(code);
      if (e.repeat || !this.gameplayActive) return;

      switch (code) {
        case 'KeyC':
          this.queuedAttack = 'LIGHT_PUNCH';
          break;
        case 'KeyV':
          this.queuedAttack = 'HEAVY_PUNCH';
          break;
        case 'KeyZ':
          this.queuedAttack = 'LIGHT_KICK';
          break;
        case 'KeyX':
          this.queuedAttack = 'HEAVY_KICK';
          break;
        case 'KeyA':
          this.queuedThrow = true;
          break;
        case 'KeyQ':
          this.queuedSpecial = 'sp1';
          break;
        case 'KeyW':
          this.queuedSpecial = 'sp2';
          break;
        case 'KeyU':
          this.queuedSidestep = 1; // 奥へ3Dサイドステップ
          break;
        case 'KeyO':
          this.queuedSidestep = -1; // 手前へ3Dサイドステップ
          break;
        case 'KeyI':
        case 'ArrowUp':
          if (e.shiftKey) {
            this.queuedSidestep = 1;
          } else {
            this.queuedJump = true;
          }
          break;
        case 'KeyK':
        case 'ArrowDown':
          if (e.shiftKey) {
            this.queuedSidestep = -1;
          }
          break;
        case 'Space':
          this.queuedJump = true;
          break;
        default:
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.shiftHeld = Boolean(e.shiftKey);
      this.heldCodes.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.shiftHeld = false;
      this.heldCodes.clear();
    });
  }

  consumePlayerInput() {
    let kbX = 0;
    let kbY = 0;
    if (this.heldCodes.has('KeyJ') || this.heldCodes.has('ArrowLeft')) kbX -= 1;
    if (this.heldCodes.has('KeyL') || this.heldCodes.has('ArrowRight')) kbX += 1;
    if (this.heldCodes.has('KeyU')) kbY += 1;
    if (this.heldCodes.has('KeyO')) kbY -= 1;

    const kbCrouch =
      !this.shiftHeld && (this.heldCodes.has('KeyK') || this.heldCodes.has('ArrowDown'));
    const kbGuard = this.heldCodes.has('KeyS');
    const pad = this.virtualPad.consumeState();

    const moveX = Math.max(-1, Math.min(1, kbX + pad.moveX));
    const moveY = Math.max(-1, Math.min(1, kbY + pad.moveY));

    const input = {
      moveX,
      moveY,
      crouch: kbCrouch || pad.crouch,
      guard: kbGuard || pad.guard,
      attackId: this.queuedAttack || pad.attackId,
      throwPressed: this.queuedThrow || pad.throwPressed,
      jump: this.queuedJump || pad.jump,
      specialSlot: this.queuedSpecial || pad.specialSlot,
      sidestepDir: this.queuedSidestep,
    };

    this.queuedAttack = null;
    this.queuedThrow = false;
    this.queuedJump = false;
    this.queuedSpecial = null;
    this.queuedSidestep = 0;
    return input;
  }
}
