import { GAME_CONFIG } from '../config/constants.js?v=20261123174047';

/**
 * 体力バー・必殺技クールタイム・ラウンド表示・タイマー・タイトル/キャラ選択/リザルト/途中休憩画面を管理するクラス
 */
export class HudManager {
  constructor() {
    this.p1NameEl = document.getElementById('name-p1');
    this.p2NameEl = document.getElementById('name-p2');
    this.p1Bar = document.getElementById('hp-p1');
    this.p1Trail = document.getElementById('hp-p1-trail');
    this.p2Bar = document.getElementById('hp-p2');
    this.p2Trail = document.getElementById('hp-p2-trail');

    this.p1Sp1Fill = document.getElementById('sp1-fill-p1');
    this.p1Sp2Fill = document.getElementById('sp2-fill-p1');
    this.p1Sp1Text = document.getElementById('sp1-text-p1');
    this.p1Sp2Text = document.getElementById('sp2-text-p1');

    this.p2Sp1Fill = document.getElementById('sp1-fill-p2');
    this.p2Sp2Fill = document.getElementById('sp2-fill-p2');
    this.p2Sp1Text = document.getElementById('sp1-text-p2');
    this.p2Sp2Text = document.getElementById('sp2-text-p2');

    this.p1Rounds = document.getElementById('rounds-p1');
    this.p2Rounds = document.getElementById('rounds-p2');
    this.timerEl = document.getElementById('round-timer');

    this.bannerEl = document.getElementById('center-banner');
    this.calloutEl = document.getElementById('combat-callout');

    this.titleOverlay = document.getElementById('overlay-title');
    this.charSelectOverlay = document.getElementById('overlay-char-select');
    this.bracketOverlay = document.getElementById('overlay-bracket');
    this.championOverlay = document.getElementById('overlay-champion');
    this.emergencyOverlay = document.getElementById('overlay-emergency');
    this.endingOverlay = document.getElementById('overlay-ending');
    this.resultOverlay = document.getElementById('overlay-result');
    this.resultTitleEl = document.getElementById('result-title');
    this.resultDetailEl = document.getElementById('result-detail');
    this.resultRematchBtn = document.getElementById('btn-rematch');
    this.pauseOverlay = document.getElementById('overlay-pause');

    this.bracketKickerEl = document.getElementById('bracket-kicker');
    this.bracketTitleEl = document.getElementById('bracket-title');
    this.bracketNextEl = document.getElementById('bracket-next-card');
    this.bracketBoardEl = document.getElementById('bracket-board');
    this.champCrownEl = document.getElementById('champ-crown');
    this.champKickerEl = document.getElementById('champ-kicker');
    this.champSpeakerEl = document.getElementById('champ-speaker');
    this.champTitleEl = document.getElementById('champ-title');
    this.champDescEl = document.getElementById('champ-desc');
    this.champNextBtn = document.getElementById('btn-champ-next');
    this.champEndingBtn = document.getElementById('btn-champ-ending');
    this.champTitleBtn = document.getElementById('btn-champ-title');
    this.emergencySubtitleBar = document.getElementById('emergency-subtitle-bar');
    this.emergencySubtitleText = document.getElementById('emergency-subtitle-text');
    this.emergencyBanner = document.getElementById('emergency-banner');
    this.endingSpeakerEl = document.getElementById('ending-speaker');
    this.endingLocationEl = document.getElementById('ending-location');
    this.endingLinesEl = document.getElementById('ending-lines');
    this.endingNextBtn = document.getElementById('btn-ending-next');
    this.endingAgainBtn = document.getElementById('btn-ending-again');

    this.calloutTimer = 0;
    this.screenListener = null;
  }

  setScreenListener(listener) {
    this.screenListener = listener;
  }

  setFighterNames(p1Spec, p2Spec) {
    if (this.p1NameEl) this.p1NameEl.textContent = `1P ${p1Spec.name}`;
    if (this.p2NameEl) this.p2NameEl.textContent = `COM ${p2Spec.name}`;
  }

  updateBars(p1Hp, p2Hp, p1Max = GAME_CONFIG.MAX_HP, p2Max = GAME_CONFIG.MAX_HP) {
    const p1Pct = Math.max(0, Math.min(100, (p1Hp / Math.max(1, p1Max)) * 100));
    const p2Pct = Math.max(0, Math.min(100, (p2Hp / Math.max(1, p2Max)) * 100));
    this.p1Bar.style.width = `${p1Pct}%`;
    this.p1Trail.style.width = `${p1Pct}%`;
    this.p2Bar.style.width = `${p2Pct}%`;
    this.p2Trail.style.width = `${p2Pct}%`;
  }

  updateSkillCooldowns(p1, p2) {
    this._renderSkillGauge(
      this.p1Sp1Fill,
      this.p1Sp1Text,
      p1.charSpec.skills.sp1,
      p1.sp1Cooldown,
      p1.headDetached && p1.charSpec.skills.sp1.hidePart === 'head'
    );
    this._renderSkillGauge(
      this.p1Sp2Fill,
      this.p1Sp2Text,
      p1.charSpec.skills.sp2,
      p1.sp2Cooldown,
      false
    );
    this._renderSkillGauge(
      this.p2Sp1Fill,
      this.p2Sp1Text,
      p2.charSpec.skills.sp1,
      p2.sp1Cooldown,
      p2.headDetached && p2.charSpec.skills.sp1.hidePart === 'head'
    );
    this._renderSkillGauge(
      this.p2Sp2Fill,
      this.p2Sp2Text,
      p2.charSpec.skills.sp2,
      p2.sp2Cooldown,
      false
    );
  }

  _renderSkillGauge(fillEl, textEl, skill, cd, blockedByHead) {
    if (!fillEl || !textEl || !skill) return;
    const maxCd = skill.cooldown || 4;
    const ready = cd <= 0.05 && !blockedByHead;
    const pct = ready ? 100 : Math.max(0, Math.min(100, ((maxCd - cd) / maxCd) * 100));
    fillEl.style.width = `${pct}%`;
    fillEl.parentElement.classList.toggle('is-ready', ready);
    textEl.textContent = blockedByHead
      ? `${skill.keyHint}: 頭飛行中`
      : ready
      ? `${skill.keyHint}: ${skill.name}`
      : `${skill.keyHint}: ${cd.toFixed(1)}s`;
  }

  updateRounds(p1Wins, p2Wins) {
    this._renderPips(this.p1Rounds, p1Wins);
    this._renderPips(this.p2Rounds, p2Wins);
  }

  _renderPips(container, wins) {
    const pips = container.querySelectorAll('.round-pip');
    pips.forEach((pip, idx) => {
      pip.classList.toggle('is-won', idx < wins);
    });
  }

  updateTimer(seconds) {
    this.timerEl.textContent = String(Math.max(0, Math.ceil(seconds))).padStart(2, '0');
  }

  showBanner(text, subText = '') {
    if (!text) {
      this.bannerEl.classList.remove('is-visible');
      return;
    }
    this.bannerEl.innerHTML = subText
      ? `<span class="banner-main">${text}</span><span class="banner-sub">${subText}</span>`
      : `<span class="banner-main">${text}</span>`;
    this.bannerEl.classList.add('is-visible');
  }

  showCallout(text, type = 'hit') {
    this.calloutEl.textContent = text;
    this.calloutEl.dataset.type = type;
    this.calloutEl.classList.add('is-visible');
    this.calloutTimer = 0.72;
  }

  tick(dt) {
    if (this.calloutTimer > 0) {
      this.calloutTimer -= dt;
      if (this.calloutTimer <= 0) {
        this.calloutEl.classList.remove('is-visible');
      }
    }
  }

  showScreen(screen) {
    document.body.dataset.screen = screen;
    this.titleOverlay.classList.toggle('is-hidden', screen !== 'TITLE');
    if (this.charSelectOverlay) {
      this.charSelectOverlay.classList.toggle('is-hidden', screen !== 'CHAR_SELECT');
    }
    if (this.bracketOverlay) {
      this.bracketOverlay.classList.toggle('is-hidden', screen !== 'BRACKET');
    }
    if (this.championOverlay) {
      this.championOverlay.classList.toggle('is-hidden', screen !== 'CHAMPION');
    }
    if (this.emergencyOverlay) {
      this.emergencyOverlay.classList.toggle('is-hidden', screen !== 'EMERGENCY_EVENT');
    }
    if (this.endingOverlay) {
      this.endingOverlay.classList.toggle('is-hidden', screen !== 'ENDING');
    }
    this.resultOverlay.classList.toggle('is-hidden', screen !== 'RESULT');
    this.pauseOverlay.classList.toggle('is-hidden', screen !== 'PAUSE');
    if (this.screenListener) {
      this.screenListener(screen);
    }
  }

  setResult(title, detail) {
    this.resultTitleEl.textContent = title;
    this.resultDetailEl.textContent = detail;
  }

  setResultActionLabel(text) {
    if (this.resultRematchBtn) {
      this.resultRematchBtn.textContent = text;
    }
  }

  setChampionInterview(spec, stepIndex) {
    if (this.championOverlay) {
      this.championOverlay.classList.add('is-interview-mode');
    }
    if (this.champCrownEl) this.champCrownEl.textContent = '🎤';
    if (this.champKickerEl) this.champKickerEl.textContent = 'HERO INTERVIEW // RING CENTER';
    if (this.champSpeakerEl) {
      this.champSpeakerEl.classList.remove('is-hidden');
      this.champSpeakerEl.textContent = stepIndex === 0 ? 'アナウンサー' : spec.name;
    }
    if (this.champTitleEl) {
      this.champTitleEl.textContent = `${spec.name} オモテ制覇!!`;
    }
    if (this.champDescEl) {
      this.champDescEl.textContent =
        stepIndex === 0
          ? `「歴史を塗り替えた新王者 ${spec.name}！ 優勝の今のお気持ちをどうぞ！！」`
          : `「応援ありがとう！ 最強の座はみんなのおかげだ―― ………………。」`;
    }
    if (this.champNextBtn) this.champNextBtn.classList.remove('is-hidden');
    if (this.champEndingBtn) this.champEndingBtn.classList.add('is-hidden');
    if (this.champTitleBtn) this.champTitleBtn.classList.add('is-hidden');
  }

  setChampion(spec, isTrueChampion = false) {
    if (this.championOverlay) {
      this.championOverlay.classList.remove('is-interview-mode');
    }
    if (this.champSpeakerEl) this.champSpeakerEl.classList.add('is-hidden');
    if (this.champNextBtn) this.champNextBtn.classList.add('is-hidden');
    if (this.champEndingBtn) this.champEndingBtn.classList.remove('is-hidden');
    if (this.champTitleBtn) this.champTitleBtn.classList.remove('is-hidden');

    if (this.champCrownEl) {
      this.champCrownEl.textContent = isTrueChampion ? '👑' : '🏆';
    }
    if (this.champKickerEl) {
      this.champKickerEl.textContent = isTrueChampion
        ? 'TRUE ANIMAL BUDOKAI GRAND CHAMPION!!'
        : 'ANIMAL BUDOKAI CHAMPION';
    }
    if (this.champTitleEl) {
      this.champTitleEl.textContent = isTrueChampion
        ? `${spec.name} 真の完全制覇!!`
        : `${spec.name} 優勝!!`;
    }
    if (this.champDescEl) {
      this.champDescEl.textContent = isTrueChampion
        ? `猛獣四天王と極北の帝王しろくまを全員撃破！ キャラ選択で全14体が解放されました！！`
        : `${spec.title}・${spec.name}が全8体の頂点に立ちました！`;
    }
  }

  setEmergencyStage(stage, charName) {
    if (!this.emergencyOverlay) return;
    if (stage === 'SUBTITLE') {
      this.emergencyOverlay.classList.add('is-cutscene-only');
      if (this.emergencySubtitleBar) this.emergencySubtitleBar.classList.remove('is-hidden');
      if (this.emergencySubtitleText) {
        this.emergencySubtitleText.textContent = `${charName}：「――誰だ！！」`;
      }
      if (this.emergencyBanner) this.emergencyBanner.classList.add('is-hidden');
    } else {
      this.emergencyOverlay.classList.remove('is-cutscene-only');
      if (this.emergencySubtitleBar) this.emergencySubtitleBar.classList.add('is-hidden');
      if (this.emergencyBanner) this.emergencyBanner.classList.remove('is-hidden');
    }
  }

  setEndingState(endingSpec, shownCount) {
    if (!endingSpec) return;
    if (this.endingSpeakerEl) {
      this.endingSpeakerEl.textContent = `${endingSpec.name} ENDING`;
    }
    if (this.endingLocationEl) {
      this.endingLocationEl.textContent = endingSpec.subtitle;
    }
    if (this.endingLinesEl) {
      this.endingLinesEl.innerHTML = '';
      const count = Math.max(1, Math.min(endingSpec.lines.length, shownCount));
      for (let i = 0; i < count; i++) {
        const line = endingSpec.lines[i];
        const p = document.createElement('p');
        p.className = `ending-line${line.includes('『') ? ' is-quote' : ''}`;
        p.textContent = line;
        this.endingLinesEl.appendChild(p);
      }
    }
    const isFinished = shownCount >= endingSpec.lines.length;
    if (this.endingNextBtn) this.endingNextBtn.classList.toggle('is-hidden', isFinished);
    if (this.endingAgainBtn) this.endingAgainBtn.classList.toggle('is-hidden', !isFinished);
  }

  renderBracket(snapshot, charactersMap, portraitsMap = {}) {
    if (!this.bracketBoardEl) return;
    const pSpec = charactersMap[snapshot.playerId];
    const oppSpec = charactersMap[snapshot.opponentId];
    const stage = snapshot.stage;

    if (this.bracketOverlay) {
      this.bracketOverlay.classList.toggle('is-hidden-mode', Boolean(snapshot.isHidden));
    }
    if (this.bracketKickerEl) {
      this.bracketKickerEl.textContent = snapshot.isHidden
        ? `HIDDEN LADDER // ${stage.enLabel} (AI Lv x${stage.scale.toFixed(2)})`
        : `CHALLENGE LADDER // ${stage.enLabel} (AI Lv x${stage.scale.toFixed(2)})`;
    }
    if (this.bracketTitleEl) {
      this.bracketTitleEl.textContent = snapshot.isHidden
        ? `裏武道会・全${snapshot.totalStages}戦【${stage.label}】`
        : `オモテ地獄勝ち抜き・全${snapshot.totalStages}戦【${stage.label}】`;
    }
    if (this.bracketNextEl && pSpec && oppSpec) {
      this.bracketNextEl.textContent = `NEXT MATCH: 1P ${pSpec.name} VS ${oppSpec.name}`;
    }

    this.bracketBoardEl.className = `bracket-board ladder-grid${snapshot.isHidden ? ' is-hidden-ladder' : ''}`;
    this.bracketBoardEl.innerHTML = '';

    (snapshot.ladder || []).forEach((slot, idx) => {
      const opp = charactersMap[slot.oppId];
      const card = document.createElement('div');
      const isCurrent = idx === snapshot.stageIndex;
      const isCleared = Boolean(slot.cleared);
      card.className = `ladder-card${isCurrent ? ' is-current' : ''}${isCleared ? ' is-cleared' : ''}`;

      const badge = document.createElement('div');
      badge.className = 'ladder-stage-badge';
      badge.textContent = snapshot.isHidden
        ? idx === snapshot.totalStages - 1
          ? 'TRUE BOSS'
          : `四天王 ${idx + 1}`
        : `STAGE ${idx + 1}`;
      card.appendChild(badge);

      if (portraitsMap[slot.oppId]) {
        const img = document.createElement('img');
        img.className = 'ladder-portrait';
        img.src = portraitsMap[slot.oppId];
        img.alt = opp ? opp.name : slot.oppId;
        card.appendChild(img);
      }

      const name = document.createElement('div');
      name.className = 'ladder-name';
      name.textContent = opp ? opp.name : slot.oppId;
      card.appendChild(name);

      const status = document.createElement('div');
      status.className = 'ladder-status';
      status.textContent = isCleared ? 'WIN!' : isCurrent ? 'NEXT!!' : `Lv x${slot.scale.toFixed(2)}`;
      card.appendChild(status);

      this.bracketBoardEl.appendChild(card);
    });
  }
}
