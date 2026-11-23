import { GameEngine } from './game/GameEngine.js?v=20261122222828';
import { TournamentManager } from './game/TournamentManager.js?v=20261122222828';
import { generateHeadPortraits } from './game/AnimalRig.js?v=20261122222828';
import { InputManager } from './input/InputManager.js?v=20261122222828';
import { VirtualPad } from './input/VirtualPad.js?v=20261122222828';
import { SoundEngine } from './audio/SoundEngine.js?v=20261122222828';
import { BgmManager } from './audio/BgmManager.js?v=20261122222828';
import { HudManager } from './ui/HudManager.js?v=20261122222828';
import { MenuNavigator } from './input/MenuNavigator.js?v=20261122222828';
import {
  ALL_CHARACTER_ORDER,
  CHARACTERS,
  CHARACTER_ORDER,
  getPlayableCharacterOrder,
  isPhase4Unlocked,
  setPhase4Unlocked,
} from './data/characters.js?v=20261122222828';
import { ANIMAL_ENDINGS } from './data/endings.js?v=20261122222828';

/**
 * キャッシュ・BFCache残存の徹底抑止
 */
function purgeBrowserCaches() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister().catch(() => {})))
      .catch(() => {});
  }
  if ('caches' in window) {
    caches
      .keys()
      .then((keys) => keys.forEach((k) => caches.delete(k).catch(() => {})))
      .catch(() => {});
  }
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});

/**
 * 意図しないスクロール・ピンチ拡大を防止しつつ、UIボタン操作は阻害しないタッチ制御
 */
function setupTouchSafeguards(canvas, vpadRoot) {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((evtName) => {
    document.addEventListener(
      evtName,
      (e) => {
        e.preventDefault();
      },
      { passive: false }
    );
  });

  document.addEventListener(
    'touchmove',
    (e) => {
      if (!e.target.closest('.allow-scroll')) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 1 && !e.target.closest('#touch-controls')) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  [canvas, vpadRoot].forEach((el) => {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

function bootstrap() {
  purgeBrowserCaches();

  const canvas = document.getElementById('game-canvas');
  const vpadRoot = document.getElementById('touch-controls');
  setupTouchSafeguards(canvas, vpadRoot);

  const sound = new SoundEngine();
  const bgm = new BgmManager();
  const unlockAudio = () => {
    sound.unlock();
    bgm.unlock();
  };
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });

  const virtualPad = new VirtualPad(vpadRoot, unlockAudio);
  const input = new InputManager(virtualPad, unlockAudio);
  const hud = new HudManager();

  const DIFFICULTIES = ['EASY', 'NORMAL', 'HARD'];
  let selectedDifficulty = 'NORMAL';
  let gameMode = 'TOURNAMENT'; // 'TOURNAMENT' | 'SINGLE'
  let tournamentAdvancePending = false;
  let p1Idx = 0;
  let lastComId = CHARACTER_ORDER[1];

  const tournament = new TournamentManager();
  const engine = new GameEngine(canvas, input, sound, hud);
  engine.setBgmManager(bgm);

  const syncViewport = () => {
    const vv = window.visualViewport;
    const width = Math.floor(vv ? vv.width : window.innerWidth);
    const height = Math.floor(vv ? vv.height : window.innerHeight);
    document.documentElement.style.setProperty('--app-width', `${width}px`);
    document.documentElement.style.setProperty('--app-height', `${height}px`);
    engine.resize(width, height);
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }
  };

  syncViewport();
  window.addEventListener('resize', syncViewport);
  window.addEventListener('orientationchange', () => setTimeout(syncViewport, 120));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
  }

  // キャラ選択正方形アイコン一覧の構築（全14体分を事前生成し、解放状況に応じて9体/14体を動的切替）
  const portraits = generateHeadPortraits(engine.renderer, CHARACTERS, ALL_CHARACTER_ORDER);
  const charGridEl = document.getElementById('char-grid');
  const p1NameEl = document.getElementById('cs-p1-name');
  const p1MetaEl = document.getElementById('cs-p1-meta');
  const p1SkillsEl = document.getElementById('cs-p1-skills');
  let playableOrder = getPlayableCharacterOrder();
  let tileButtons = [];

  const refreshCharSelectUI = () => {
    if (p1Idx >= playableOrder.length) p1Idx = 0;
    const p1Id = playableOrder[p1Idx];
    const p1Spec = CHARACTERS[p1Id];

    tileButtons.forEach((btn, idx) => {
      const active = idx === p1Idx;
      btn.classList.toggle('is-selected', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    p1NameEl.textContent = p1Spec.name;
    p1MetaEl.textContent = `HP ${p1Spec.stats.maxHp} / ${p1Spec.title}`;
    p1SkillsEl.textContent = `Q: ${p1Spec.skills.sp1.name} / W: ${p1Spec.skills.sp2.name}`;

    engine.setCharacters(p1Id, lastComId);
  };

  const rebuildCharGrid = () => {
    playableOrder = getPlayableCharacterOrder();
    if (p1Idx >= playableOrder.length) p1Idx = 0;
    charGridEl.classList.toggle('is-expanded-14', playableOrder.length > 9);
    charGridEl.innerHTML = '';
    tileButtons = [];

    playableOrder.forEach((id, idx) => {
      const spec = CHARACTERS[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'char-tile';
      btn.dataset.charId = id;
      btn.setAttribute('role', 'option');

      const badge = document.createElement('span');
      badge.className = 'char-tile-badge';
      badge.textContent = '1P';
      btn.appendChild(badge);

      if (portraits[id]) {
        const img = document.createElement('img');
        img.className = 'char-tile-img';
        img.src = portraits[id];
        img.alt = spec.name;
        btn.appendChild(img);
      }

      const label = document.createElement('span');
      label.className = 'char-tile-name';
      label.textContent = spec.name;
      btn.appendChild(label);

      btn.addEventListener('click', () => {
        unlockAudio();
        p1Idx = idx;
        refreshCharSelectUI();
      });

      charGridEl.appendChild(btn);
      tileButtons.push(btn);
    });
  };

  const pickRandomComId = () => {
    const pool = isPhase4Unlocked() ? ALL_CHARACTER_ORDER : CHARACTER_ORDER;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  rebuildCharGrid();
  refreshCharSelectUI();

  const moveCharCursor = (dx, dy) => {
    const total = playableOrder.length;
    const expanded = total > 9;
    const cols = window.innerHeight <= 460 ? (expanded ? 7 : total) : (expanded ? 5 : 3);
    if (dx !== 0) {
      p1Idx = (p1Idx + dx + total) % total;
    } else if (dy !== 0) {
      const next = p1Idx + dy * cols;
      if (next >= 0 && next < total) {
        p1Idx = next;
      } else if (next < 0) {
        const wrapped = p1Idx + Math.floor((total - 1) / cols) * cols;
        p1Idx = wrapped < total ? wrapped : p1Idx;
      } else {
        p1Idx = p1Idx % cols;
      }
    }
    refreshCharSelectUI();
  };

  // バーチャルパッド表示モード
  let padMode = 'AUTO';
  let padSwapped = false;
  const padBtn = document.getElementById('btn-pad-toggle');
  const swapBtn = document.getElementById('btn-pad-swap');
  const muteBtn = document.getElementById('btn-mute');
  const pauseBtn = document.getElementById('btn-pause');

  const isTouchEnvironment = () =>
    window.matchMedia('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0 ||
    window.innerWidth <= 1024;

  const updatePadVisibility = () => {
    const show = padMode === 'ON' || (padMode === 'AUTO' && isTouchEnvironment());
    virtualPad.setVisible(show);
    padBtn.textContent = `PAD: ${padMode}`;
    swapBtn.classList.toggle('is-disabled', !show);
  };

  updatePadVisibility();
  window.addEventListener('resize', updatePadVisibility);

  padBtn.addEventListener('click', () => {
    unlockAudio();
    padMode = padMode === 'AUTO' ? 'ON' : padMode === 'ON' ? 'OFF' : 'AUTO';
    updatePadVisibility();
  });

  swapBtn.addEventListener('click', () => {
    unlockAudio();
    padSwapped = !padSwapped;
    virtualPad.setSwapped(padSwapped);
    swapBtn.textContent = padSwapped ? '配置: 右◯' : '配置: 左◯';
  });

  const bgmBtn = document.getElementById('btn-bgm-toggle');

  muteBtn.addEventListener('click', () => {
    const nextMuted = !sound.isMuted();
    sound.setMuted(nextMuted);
    if (!nextMuted) unlockAudio();
    muteBtn.textContent = nextMuted ? 'SE: OFF' : 'SE: ON';
    muteBtn.classList.toggle('is-muted', nextMuted);
  });

  if (bgmBtn) {
    bgmBtn.addEventListener('click', () => {
      const nextMuted = !bgm.isMuted();
      bgm.setMuted(nextMuted);
      if (!nextMuted) unlockAudio();
      bgmBtn.textContent = nextMuted ? 'BGM: OFF' : 'BGM: ON';
      bgmBtn.classList.toggle('is-muted', nextMuted);
    });
  }

  pauseBtn.addEventListener('click', () => {
    unlockAudio();
    engine.togglePause();
  });

  // 難易度選択
  const diffButtons = document.querySelectorAll('[data-difficulty]');
  const selectDifficulty = (diff) => {
    selectedDifficulty = diff;
    diffButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.difficulty === diff));
    engine.setDifficulty(selectedDifficulty);
  };

  diffButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      unlockAudio();
      selectDifficulty(btn.dataset.difficulty);
    });
  });

  const csComTagEl = document.getElementById('cs-com-tag');
  const csComTitleEl = document.getElementById('cs-com-title');
  const csComMetaEl = document.getElementById('cs-com-meta');
  const csDiffGroupEl = document.getElementById('cs-diff-group');
  const btnCharFightEl = document.getElementById('btn-char-fight');

  const openCharSelectForMode = (mode) => {
    gameMode = mode;
    tournamentAdvancePending = false;
    const isSingle = mode === 'SINGLE';
    if (csComTagEl) csComTagEl.textContent = isSingle ? 'COM RIVAL' : 'CHALLENGE LADDER';
    if (csComTitleEl) csComTitleEl.textContent = isSingle ? 'RANDOM' : '8 FIGHTERS GAUNTLET';
    if (csComMetaEl) {
      csComMetaEl.textContent = isSingle
        ? '対戦決定時にランダム選出'
        : '全8体総当たり勝ち抜き（オモテ→裏5戦へ！）';
    }
    if (csDiffGroupEl) csDiffGroupEl.classList.toggle('is-hidden', !isSingle);
    if (btnCharFightEl) btnCharFightEl.textContent = isSingle ? 'FIGHT! (Enter)' : 'NEXT! (Enter)';
    refreshCharSelectUI();
    engine.openCharSelect();
  };

  const openBracketScreen = () => {
    const snap = tournament.getSnapshot();
    lastComId = snap.opponentId;
    engine.setCharacters(snap.playerId, lastComId);
    hud.renderBracket(snap, CHARACTERS, portraits);
    engine.openBracket();
  };

  const startTournamentMatch = () => {
    const snap = tournament.getSnapshot();
    lastComId = snap.opponentId;
    tournamentAdvancePending = false;
    engine.setCharacters(snap.playerId, lastComId);
    engine.setStageScale(snap.stage.scale);
    engine.startMatch('NORMAL');
  };

  const startFromCharSelect = () => {
    const p1Id = playableOrder[p1Idx];
    if (gameMode === 'TOURNAMENT') {
      tournament.start(p1Id);
      openBracketScreen();
      return;
    }
    tournament.stop();
    tournamentAdvancePending = false;
    lastComId = pickRandomComId();
    engine.setCharacters(p1Id, lastComId);
    engine.setStageScale(1.0);
    engine.startMatch(selectedDifficulty);
  };

  const rematchSameCom = () => {
    const p1Id = playableOrder[p1Idx];
    tournamentAdvancePending = false;
    engine.setCharacters(p1Id, lastComId);
    engine.setStageScale(tournament.active ? tournament.getStageScale() : 1.0);
    engine.startMatch(tournament.active ? 'NORMAL' : selectedDifficulty);
  };

  engine.setMatchEndHandler((playerWon) => {
    if (!tournament.active) {
      tournamentAdvancePending = false;
      hud.setResultActionLabel('REMATCH');
      return false;
    }

    if (playerWon) {
      const outcome = tournament.recordPlayerWin();
      if (outcome === 'CHAMPION') {
        // オモテ全8戦制覇 → ヒーローインタビューへ（その後「誰だ!!」→ 空から五獣降臨へ！）
        tournamentAdvancePending = false;
        engine.openChampion({ isTrueChampion: false, isInterview: true });
        menuNav.refreshChampionFocus();
        return true;
      }
      if (outcome === 'TRUE_CHAMPION') {
        // 裏トーナメント制覇 → 全14体解放 & 真・優勝トロフィー！
        tournamentAdvancePending = false;
        setPhase4Unlocked(true);
        rebuildCharGrid();
        engine.openChampion({ isTrueChampion: true, isInterview: false });
        menuNav.refreshChampionFocus();
        return true;
      }
      tournamentAdvancePending = true;
      const nextStage = tournament.getStageInfo();
      hud.setResult(
        `${CHARACTERS[tournament.playerId].name} WIN!`,
        `${tournament.isHidden ? '裏武道会突破！ ' : '勝ち上がり！ '}次戦：${nextStage.label}（VS ${CHARACTERS[tournament.getCurrentOpponentId()].name}）`
      );
      hud.setResultActionLabel('勝ち抜き表へ (Enter)');
      hud.showScreen('RESULT');
      sound.playAnnounce('win');
      return true;
    }

    tournamentAdvancePending = false;
    hud.setResultActionLabel('リトライ (Enter)');
    return false;
  });

  // タイトル・キャラ選択・トーナメント・リザルト・優勝・途中休憩ボタン
  document.getElementById('btn-mode-tournament').addEventListener('click', () => {
    unlockAudio();
    openCharSelectForMode('TOURNAMENT');
  });
  document.getElementById('btn-mode-single').addEventListener('click', () => {
    unlockAudio();
    openCharSelectForMode('SINGLE');
  });

  document.getElementById('btn-char-fight').addEventListener('click', () => {
    unlockAudio();
    startFromCharSelect();
  });
  document.getElementById('btn-char-back').addEventListener('click', () => {
    unlockAudio();
    tournament.stop();
    engine.returnToTitle();
  });

  document.getElementById('btn-bracket-fight').addEventListener('click', () => {
    unlockAudio();
    startTournamentMatch();
  });
  document.getElementById('btn-bracket-back').addEventListener('click', () => {
    unlockAudio();
    tournament.stop();
    engine.returnToTitle();
  });

  let activeEnding = ANIMAL_ENDINGS.GRIZZLY;
  let endingLineCount = 1;

  const openEndingForCharacter = (charId) => {
    activeEnding = ANIMAL_ENDINGS[charId] || ANIMAL_ENDINGS.GRIZZLY;
    endingLineCount = 1;
    engine.setCharacters(charId, lastComId);
    hud.setEndingState(activeEnding, endingLineCount);
    engine.openEnding(activeEnding);
  };

  document.getElementById('btn-champ-next').addEventListener('click', () => {
    unlockAudio();
    engine.advanceChampionInterview();
  });
  document.getElementById('btn-champ-ending').addEventListener('click', () => {
    unlockAudio();
    openEndingForCharacter(engine.p1?.charSpec?.id || playableOrder[p1Idx]);
  });
  document.getElementById('btn-champ-title').addEventListener('click', () => {
    unlockAudio();
    tournament.stop();
    engine.returnToTitle();
  });

  document.getElementById('overlay-emergency').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    unlockAudio();
    engine.skipEmergencyCutscene();
  });

  document.getElementById('btn-emergency-go').addEventListener('click', () => {
    unlockAudio();
    const p1Id = tournament.playerId || engine.p1?.charSpec?.id || playableOrder[p1Idx];
    gameMode = 'TOURNAMENT';
    tournament.startHidden(p1Id);
    openBracketScreen();
  });

  const advanceEnding = () => {
    if (engine.phase !== 'ENDING') return;
    if (endingLineCount < activeEnding.lines.length) {
      endingLineCount += 1;
      hud.setEndingState(activeEnding, endingLineCount);
      menuNav.refreshEndingFocus();
    }
  };

  document.getElementById('btn-ending-next').addEventListener('click', (e) => {
    e.stopPropagation();
    unlockAudio();
    advanceEnding();
  });
  document.getElementById('ending-dialogue-box').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    unlockAudio();
    advanceEnding();
  });
  document.getElementById('btn-ending-again').addEventListener('click', () => {
    unlockAudio();
    openCharSelectForMode('TOURNAMENT');
  });
  document.getElementById('btn-ending-title').addEventListener('click', () => {
    unlockAudio();
    tournament.stop();
    engine.returnToTitle();
  });

  document.getElementById('btn-rematch').addEventListener('click', () => {
    unlockAudio();
    if (tournament.active && tournamentAdvancePending) {
      openBracketScreen();
    } else {
      rematchSameCom();
    }
  });

  document.getElementById('btn-result-title').addEventListener('click', () => {
    unlockAudio();
    tournament.stop();
    engine.returnToTitle();
  });

  document.getElementById('btn-resume').addEventListener('click', () => {
    unlockAudio();
    engine.togglePause();
  });

  document.getElementById('btn-forfeit').addEventListener('click', () => {
    unlockAudio();
    engine.forfeitMatch();
  });

  document.getElementById('btn-pause-title').addEventListener('click', () => {
    unlockAudio();
    tournament.stop();
    engine.returnToTitle();
  });

  // DEV / Phase 4 検証用デバッグ細工 (DEVボタン or Shift+D or ?dev=1)
  const devBtn = document.getElementById('btn-dev-toggle');
  const devToolbar = document.getElementById('dev-toolbar');
  let devOpen = new URLSearchParams(window.location.search).get('dev') === '1';

  const syncDevUI = () => {
    if (devBtn) devBtn.classList.toggle('is-active', devOpen);
    if (devToolbar) devToolbar.classList.toggle('is-hidden', !devOpen);
  };
  syncDevUI();

  if (devBtn) {
    devBtn.addEventListener('click', () => {
      unlockAudio();
      devOpen = !devOpen;
      syncDevUI();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.code === 'KeyD') {
      devOpen = !devOpen;
      syncDevUI();
    }
  });

  document.getElementById('btn-dev-final').addEventListener('click', () => {
    unlockAudio();
    const p1Id = playableOrder[p1Idx];
    gameMode = 'TOURNAMENT';
    if (!tournament.active || tournament.playerId !== p1Id) {
      tournament.start(p1Id);
    }
    tournament.skipToGrandFinal();
    openBracketScreen();
  });

  document.getElementById('btn-dev-win').addEventListener('click', () => {
    unlockAudio();
    engine.debugInstantWinRound();
  });

  document.getElementById('btn-dev-champ').addEventListener('click', () => {
    unlockAudio();
    const p1Id = playableOrder[p1Idx];
    gameMode = 'TOURNAMENT';
    tournament.start(p1Id);
    tournament.skipToGrandFinal();
    tournament.recordPlayerWin();
    engine.setCharacters(p1Id, lastComId);
    engine.openChampion({ isTrueChampion: false, isInterview: true });
    menuNav.refreshChampionFocus();
  });

  document.getElementById('btn-dev-emergency').addEventListener('click', () => {
    unlockAudio();
    const p1Id = playableOrder[p1Idx];
    gameMode = 'TOURNAMENT';
    tournament.start(p1Id);
    engine.setCharacters(p1Id, 'POLAR_KING');
    engine.openEmergencyIntrusion();
  });

  document.getElementById('btn-dev-ending').addEventListener('click', () => {
    unlockAudio();
    openEndingForCharacter(playableOrder[p1Idx]);
  });

  document.getElementById('btn-dev-unlock').addEventListener('click', () => {
    unlockAudio();
    const nextState = !isPhase4Unlocked();
    setPhase4Unlocked(nextState);
    rebuildCharGrid();
    refreshCharSelectUI();
    hud.showCallout(nextState ? 'ALL 14 FIGHTERS UNLOCKED!' : 'LOCKED TO 9 FIGHTERS', 'counter');
  });

  // キーボードによるメニュー・キャラ一覧・難易度ナビゲーション
  const menuNav = new MenuNavigator({
    getPhase: () => engine.phase,
    onMoveCharCursor: (dx, dy) => {
      unlockAudio();
      moveCharCursor(dx, dy);
    },
    onStepDifficulty: (delta) => {
      unlockAudio();
      if (gameMode !== 'SINGLE') return;
      const idx = DIFFICULTIES.indexOf(selectedDifficulty);
      const next = DIFFICULTIES[(idx + delta + DIFFICULTIES.length) % DIFFICULTIES.length];
      selectDifficulty(next);
    },
    onFightStart: () => {
      unlockAudio();
      startFromCharSelect();
    },
    onSkipEmergency: () => {
      unlockAudio();
      engine.skipEmergencyCutscene();
    },
    onReturnTitle: () => {
      unlockAudio();
      tournament.stop();
      engine.returnToTitle();
    },
    onTogglePause: () => {
      unlockAudio();
      engine.togglePause();
    },
  });
  hud.setScreenListener((screen) => menuNav.setScreen(screen));
  hud.showScreen('TITLE');
  engine._syncBgm();

  engine.startLoop();
}

bootstrap();
