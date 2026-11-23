/**
 * オーバーレイメニュー（TITLE / CHAR_SELECT / RESULT / PAUSE）のキーボード操作ナビゲーション
 * - CHAR_SELECT: IJKL / 方向キーで正方形アイコン一覧を移動、Enter で決定（COMランダム）、Tab で難易度切替
 * - TITLE / RESULT / PAUSE: IJKL / 方向キーで選択移動、Enter で決定、Esc で戻る・途中休憩
 */
export class MenuNavigator {
  constructor(handlers) {
    this.handlers = handlers;
    this.activeScreen = 'TITLE';

    this.titleActionIdx = 0;
    this.bracketIdx = 0;
    this.championIdx = 0;
    this.endingIdx = 0;
    this.resultIdx = 0;
    this.pauseIdx = 0;

    this.titleActionButtons = [
      document.getElementById('btn-mode-tournament'),
      document.getElementById('btn-mode-single'),
      document.getElementById('btn-title-manual'),
    ];
    this.bracketButtons = [
      document.getElementById('btn-bracket-fight'),
      document.getElementById('btn-bracket-back'),
    ];
    this.championButtons = [
      document.getElementById('btn-champ-next'),
      document.getElementById('btn-champ-ending'),
      document.getElementById('btn-champ-title'),
    ];
    this.emergencyButtons = [document.getElementById('btn-emergency-go')];
    this.endingButtons = [
      document.getElementById('btn-ending-next'),
      document.getElementById('btn-ending-again'),
      document.getElementById('btn-ending-title'),
    ];
    this.resultButtons = [
      document.getElementById('btn-rematch'),
      document.getElementById('btn-result-title'),
    ];
    this.pauseButtons = [
      document.getElementById('btn-resume'),
      document.getElementById('btn-forfeit'),
      document.getElementById('btn-pause-manual'),
      document.getElementById('btn-pause-title'),
    ];

    this._bindKeyboard();
    this.setScreen('TITLE');
  }

  _getVisibleChampionButtons() {
    return this.championButtons.filter((el) => el && !el.classList.contains('is-hidden'));
  }

  _getVisibleEndingButtons() {
    return this.endingButtons.filter((el) => el && !el.classList.contains('is-hidden'));
  }

  setScreen(screen) {
    this.activeScreen = screen;
    if (screen === 'TITLE') {
      this.titleActionIdx = 0;
    } else if (screen === 'BRACKET') {
      this.bracketIdx = 0;
    } else if (screen === 'CHAMPION') {
      this.championIdx = 0;
    } else if (screen === 'ENDING') {
      this.endingIdx = 0;
    } else if (screen === 'RESULT') {
      this.resultIdx = 0;
    } else if (screen === 'PAUSE') {
      this.pauseIdx = 0;
    }
    this._syncVisualFocus();
  }

  refreshChampionFocus() {
    const visible = this._getVisibleChampionButtons();
    if (this.championIdx >= visible.length) {
      this.championIdx = 0;
    }
    this._syncVisualFocus();
  }

  refreshEndingFocus() {
    const visible = this._getVisibleEndingButtons();
    if (this.endingIdx >= visible.length) {
      this.endingIdx = 0;
    }
    this._syncVisualFocus();
  }

  _clearAllFocus() {
    [
      ...this.titleActionButtons,
      ...this.bracketButtons,
      ...this.championButtons,
      ...this.endingButtons,
      ...this.resultButtons,
      ...this.pauseButtons,
    ].forEach((el) => {
      if (el) el.classList.remove('is-kbd-focus');
    });
  }

  _syncVisualFocus() {
    this._clearAllFocus();
    let target = null;

    if (this.activeScreen === 'TITLE') {
      target = this.titleActionButtons[this.titleActionIdx];
    } else if (this.activeScreen === 'BRACKET') {
      target = this.bracketButtons[this.bracketIdx];
    } else if (this.activeScreen === 'CHAMPION') {
      const visible = this._getVisibleChampionButtons();
      target = visible[this.championIdx % Math.max(1, visible.length)];
    } else if (this.activeScreen === 'EMERGENCY_EVENT') {
      target = this.emergencyButtons[0];
    } else if (this.activeScreen === 'ENDING') {
      const visible = this._getVisibleEndingButtons();
      target = visible[this.endingIdx % Math.max(1, visible.length)];
    } else if (this.activeScreen === 'RESULT') {
      target = this.resultButtons[this.resultIdx];
    } else if (this.activeScreen === 'PAUSE') {
      target = this.pauseButtons[this.pauseIdx];
    }

    if (target) {
      target.classList.add('is-kbd-focus');
    }
  }

  _moveHorizontal(delta) {
    if (this.activeScreen === 'TITLE') {
      this.titleActionIdx =
        (this.titleActionIdx + delta + this.titleActionButtons.length) %
        this.titleActionButtons.length;
    } else if (this.activeScreen === 'CHAR_SELECT') {
      if (this.handlers.onMoveCharCursor) {
        this.handlers.onMoveCharCursor(delta, 0);
      }
    } else if (this.activeScreen === 'BRACKET') {
      this.bracketIdx =
        (this.bracketIdx + delta + this.bracketButtons.length) % this.bracketButtons.length;
    } else if (this.activeScreen === 'CHAMPION') {
      const visible = this._getVisibleChampionButtons();
      if (visible.length > 0) {
        this.championIdx = (this.championIdx + delta + visible.length) % visible.length;
      }
    } else if (this.activeScreen === 'ENDING') {
      const visible = this._getVisibleEndingButtons();
      if (visible.length > 0) {
        this.endingIdx = (this.endingIdx + delta + visible.length) % visible.length;
      }
    } else if (this.activeScreen === 'RESULT') {
      this.resultIdx =
        (this.resultIdx + delta + this.resultButtons.length) % this.resultButtons.length;
    } else if (this.activeScreen === 'PAUSE') {
      this.pauseIdx =
        (this.pauseIdx + delta + this.pauseButtons.length) % this.pauseButtons.length;
    }
    this._syncVisualFocus();
  }

  _moveVertical(delta) {
    if (this.activeScreen === 'CHAR_SELECT') {
      if (this.handlers.onMoveCharCursor) {
        this.handlers.onMoveCharCursor(0, delta);
      }
    } else {
      this._moveHorizontal(delta);
    }
  }

  _confirmCurrent() {
    if (this.activeScreen === 'TITLE') {
      const target = this.titleActionButtons[this.titleActionIdx];
      if (target) target.click();
    } else if (this.activeScreen === 'CHAR_SELECT') {
      if (this.handlers.onFightStart) this.handlers.onFightStart();
    } else if (this.activeScreen === 'BRACKET') {
      const target = this.bracketButtons[this.bracketIdx];
      if (target) target.click();
    } else if (this.activeScreen === 'CHAMPION') {
      const visible = this._getVisibleChampionButtons();
      const target = visible[this.championIdx % Math.max(1, visible.length)];
      if (target) target.click();
    } else if (this.activeScreen === 'EMERGENCY_EVENT') {
      const banner = document.getElementById('emergency-banner');
      if (banner && banner.classList.contains('is-hidden')) {
        if (this.handlers.onSkipEmergency) this.handlers.onSkipEmergency();
      } else {
        const target = this.emergencyButtons[0];
        if (target) target.click();
      }
    } else if (this.activeScreen === 'ENDING') {
      const visible = this._getVisibleEndingButtons();
      const target = visible[this.endingIdx % Math.max(1, visible.length)];
      if (target) target.click();
    } else if (this.activeScreen === 'RESULT') {
      const target = this.resultButtons[this.resultIdx];
      if (target) target.click();
    } else if (this.activeScreen === 'PAUSE') {
      const target = this.pauseButtons[this.pauseIdx];
      if (target) target.click();
    }
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const phase = this.handlers.getPhase ? this.handlers.getPhase() : 'TITLE';

      if (e.code === 'Escape') {
        if (phase === 'FIGHTING' || phase === 'ROUND_INTRO' || phase === 'PAUSED') {
          e.preventDefault();
          if (this.handlers.onTogglePause) this.handlers.onTogglePause();
        } else if (
          phase === 'CHAR_SELECT' ||
          phase === 'BRACKET' ||
          phase === 'CHAMPION' ||
          phase === 'ENDING' ||
          phase === 'MATCH_END'
        ) {
          e.preventDefault();
          if (this.handlers.onReturnTitle) this.handlers.onReturnTitle();
        }
        return;
      }

      if (
        phase !== 'TITLE' &&
        phase !== 'CHAR_SELECT' &&
        phase !== 'BRACKET' &&
        phase !== 'CHAMPION' &&
        phase !== 'EMERGENCY_EVENT' &&
        phase !== 'ENDING' &&
        phase !== 'MATCH_END' &&
        phase !== 'PAUSED'
      ) {
        return;
      }

      if (e.repeat) return;

      if (phase === 'CHAR_SELECT' && e.code === 'Tab') {
        e.preventDefault();
        if (this.handlers.onStepDifficulty) this.handlers.onStepDifficulty(1);
        return;
      }

      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter') {
        e.preventDefault();
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        this._confirmCurrent();
        return;
      }

      switch (e.code) {
        case 'KeyJ':
        case 'ArrowLeft':
          e.preventDefault();
          this._moveHorizontal(-1);
          break;
        case 'KeyL':
        case 'ArrowRight':
          e.preventDefault();
          this._moveHorizontal(1);
          break;
        case 'KeyI':
        case 'ArrowUp':
          e.preventDefault();
          this._moveVertical(-1);
          break;
        case 'KeyK':
        case 'ArrowDown':
          e.preventDefault();
          this._moveVertical(1);
          break;
        default:
          break;
      }
    });
  }
}
