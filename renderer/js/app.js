/**
 * Main application controller — THE SCREAMING VOLUME SLIDER™
 */

import { load, save, resetSection } from './storage.js';
import {
  AppState,
  createMachine,
  securityLevelForDelta,
  intensityLabel,
  coachMessage
} from './state.js';
import { ScreamAnalyzer } from './audio.js';
import {
  failMessage,
  successMessage,
  cooldownMessage,
  directionCopy
} from './messages.js';
import { SoundFX } from './sounds.js';
import { ACHIEVEMENTS, evaluateAchievements, seedDemoAchievements } from './achievements.js';
import {
  recordAttempt,
  averageScream,
  successRate,
  addLeaderboardEntry,
  seedDemoLeaderboard,
  formatDuration
} from './stats.js';

const SCREAM_LISTEN_MS = 2800;
const WHISPER_CEILING = 18;
/** Below this average = not a real scream attempt. */
const MIN_AVERAGE_TO_APPLY = 5;

class ScreamApp {
  constructor() {
    this.data = load();
    this.machine = createMachine();
    this.analyzer = new ScreamAnalyzer();
    this.sfx = new SoundFX();
    this.sfx.setEnabled(this.data.settings.soundEffects);
    this.sliderDragging = false;
    this.screamTimer = null;
    this.cooldownTimer = null;
    this.screamStartedAt = 0;
    this.pendingSliderValue = null;
    this.ignoreAttempts = 0;
    this.micSessionActive = false;

    this.$ = (sel) => document.querySelector(sel);
    this.$$ = (sel) => [...document.querySelectorAll(sel)];
  }

  async init() {
    this.bindNav();
    this.bindHome();
    this.bindSettings();
    this.bindOnboarding();
    this.bindGlobal();

    await this.refreshSystemVolume();
    this.renderAll();

    if (!this.data.onboardingComplete) {
      this.showOnboarding(true);
    }

    // Soft-poll system volume while idle (does not use mic)
    setInterval(() => {
      if (this.machine.state === AppState.IDLE && !this.sliderDragging) {
        this.refreshSystemVolume();
      }
    }, 4000);
  }

  async refreshSystemVolume() {
    try {
      const res = await window.screamAPI.getVolume();
      if (!res.ok) throw new Error(res.error || 'Volume API unavailable');
      this.machine.actualVolume = res.volume;
      if (this.machine.state === AppState.IDLE) {
        this.machine.requestedVolume = res.volume;
        this.syncSliderDisplay(res.volume, true);
      }
      this.clearError();
    } catch (err) {
      this.setError(`System volume unavailable: ${err.message}`);
    }
  }

  /* ---------- Navigation ---------- */

  bindNav() {
    this.$$('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        this.showPage(page);
      });
    });
  }

  showPage(page) {
    this.$$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
    this.$$('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${page}`));
    if (page === 'stats') this.renderStats();
    if (page === 'achievements') this.renderAchievements();
    if (page === 'leaderboard') this.renderLeaderboard();
    if (page === 'history') this.renderHistory();
    if (page === 'settings') this.renderSettings();
    if (page === 'hackathon') this.renderHackathon();
  }

  /* ---------- Home / slider ---------- */

  bindHome() {
    const slider = this.$('#volume-slider');
    slider.addEventListener('pointerdown', () => {
      this.sliderDragging = true;
    });
    slider.addEventListener('pointerup', () => this.onSliderRelease());
    slider.addEventListener('change', () => this.onSliderRelease());
    slider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      this.pendingSliderValue = val;
      this.$('#slider-preview').textContent = `${val}%`;
      if (this.machine.state === AppState.IDLE) {
        this.$('#request-hint').textContent =
          `Slider intent: ${val}% — volume will equal your scream average, not this number.`;
      }
    });

    this.$('#btn-cancel-scream')?.addEventListener('click', () => this.cancelScream());
    this.$('#btn-retry-error')?.addEventListener('click', () => this.retryFromError());
  }

  onSliderRelease() {
    this.sliderDragging = false;
    if (this.pendingSliderValue == null) return;

    const requested = Math.round(this.pendingSliderValue);
    this.pendingSliderValue = null;

    if (this.machine.state === AppState.COOLDOWN) {
      this.toast('🫁 Vocal energy depleted — wait for cooldown.');
      this.syncSliderDisplay(this.machine.actualVolume, true);
      return;
    }

    if (this.machine.state !== AppState.IDLE) {
      this.syncSliderDisplay(this.machine.actualVolume, true);
      return;
    }

    if (requested === this.machine.actualVolume) {
      this.syncSliderDisplay(this.machine.actualVolume, true);
      return;
    }

    this.beginVolumeRequest(requested);
  }

  beginVolumeRequest(requested) {
    const actual = this.machine.actualVolume;
    const delta = requested - actual;

    // Snap slider back — the slider never sets volume directly
    this.syncSliderDisplay(actual, true);

    this.machine.requestedVolume = requested;
    this.machine.direction = delta > 0 ? 'increase' : 'decrease';
    this.machine.securityLevel = securityLevelForDelta(delta);
    this.machine.peakScream = 0;
    this.machine.liveScream = 0;
    this.machine.averageScream = 0;
    this.machine.whisperDetected = false;
    this.machine.state = AppState.REQUESTED;

    if (Math.abs(delta) >= 40) {
      const unlocked = evaluateAchievements(this.data, {
        success: false,
        peak: 0,
        delta,
        combo: this.data.combo
      });
      if (unlocked.length) {
        save(this.data);
        unlocked.forEach((a) => this.toastAchievement(a));
      }
    }

    this.renderHome();
    this.enterScreamMode();
  }

  async enterScreamMode() {
    if (this.micSessionActive) return;

    this.machine.state = AppState.SCREAMING;
    this.machine.statusMessage = 'YOUR SCREAM AVERAGE WILL BECOME THE VOLUME';
    document.body.classList.add('scream-mode');
    this.sfx.warning();
    this.renderHome();

    const copy = directionCopy(this.machine.direction === 'increase');
    this.$('#scream-title').textContent = this.specialTitle();
    this.$('#scream-subtitle').textContent = copy.subtitle;

    this.screamStartedAt = performance.now();
    this.micSessionActive = true;

    try {
      await this.analyzer.start({
        deviceId: this.data.settings.micDeviceId,
        sensitivity: this.data.settings.sensitivity,
        onUpdate: (reading) => this.onScreamReading(reading)
      });
    } catch (err) {
      this.micSessionActive = false;
      this.machine.state = AppState.ERROR;
      document.body.classList.remove('scream-mode');
      this.setError(
        err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow mic access to scream.'
          : `Microphone unavailable: ${err.message}`
      );
      this.renderHome();
      return;
    }

    clearTimeout(this.screamTimer);
    this.screamTimer = setTimeout(() => this.finishScreamAttempt(), SCREAM_LISTEN_MS);
  }

  specialTitle() {
    return '🎤 SCREAM TO SET THE VOLUME!!!';
  }

  onScreamReading({ live, peak, average, isWhisper }) {
    if (this.machine.state !== AppState.SCREAMING) return;
    this.machine.liveScream = live;
    this.machine.peakScream = peak;
    this.machine.averageScream = average;
    if (isWhisper && peak < WHISPER_CEILING) {
      this.machine.whisperDetected = true;
    } else if (peak >= WHISPER_CEILING) {
      this.machine.whisperDetected = false;
    }
    this.updateLiveMeter();
  }

  updateLiveMeter() {
    const live = this.machine.liveScream;
    const peak = this.machine.peakScream;
    let average = this.machine.averageScream;
    if (this.data.comboBonusActive) {
      average = Math.min(100, average + 5);
    }
    const intensity = intensityLabel(live);

    const fill = this.$('#scream-meter-fill');
    const peakMark = this.$('#scream-meter-peak');
    if (fill) fill.style.width = `${average}%`;
    if (peakMark) peakMark.style.left = `${peak}%`;

    this.$('#scream-live-score').textContent = `${live} / 100`;
    this.$('#scream-peak-score').textContent = `${peak} / 100`;
    this.$('#scream-required').textContent = `${average}%`;
    this.$('#intensity-label').textContent = `${intensity.emoji} ${intensity.text}`;
    this.$('#coach-line').textContent = coachMessage(average);
    this.$('#home-scream-power').textContent = `${average} / 100`;
    this.$('#home-scream-bar').style.width = `${average}%`;

    // Live preview of resulting volume
    if (this.$('#req-volume')) {
      this.$('#req-volume').textContent = `${average}%`;
    }
    this.$('#extreme-banner').hidden = !(average >= 95);
    this.$('#silence-banner').hidden = !(average > 0 && average <= 5);
  }

  async finishScreamAttempt() {
    clearTimeout(this.screamTimer);
    const durationMs = performance.now() - this.screamStartedAt;
    const result = await this.analyzer.stop();
    this.micSessionActive = false;

    const peak = Math.max(result.peak, this.machine.peakScream);
    let average = Math.max(result.average, 0);
    if (this.data.comboBonusActive) {
      average = Math.min(100, average + 5);
      this.data.comboBonusActive = false;
      save(this.data);
    }

    this.machine.peakScream = peak;
    this.machine.averageScream = average;

    const whisperOnly = this.machine.whisperDetected && peak < WHISPER_CEILING;
    const tooQuiet = average < MIN_AVERAGE_TO_APPLY;
    const from = this.machine.actualVolume;
    // Volume = scream average (not the slider target)
    const to = Math.max(0, Math.min(100, average));

    if (whisperOnly || tooQuiet) {
      this.handleWhisper(from, to, average, durationMs);
      return;
    }

    await this.handleSuccess(from, to, average, durationMs, peak);
  }

  async handleSuccess(from, to, average, durationMs, peak = average) {
    this.machine.state = AppState.SUCCESS;
    document.body.classList.remove('scream-mode');
    this.sfx.success();

    try {
      const res = await window.screamAPI.setVolume(to);
      if (!res.ok) throw new Error(res.error || 'Failed to set volume');
      this.machine.actualVolume = res.volume;
      this.machine.requestedVolume = res.volume;
      this.syncSliderDisplay(res.volume, true);
    } catch (err) {
      this.setError(`Could not apply volume: ${err.message}`);
      this.machine.state = AppState.ERROR;
      this.renderHome();
      return;
    }

    this.data.combo += 1;
    if (this.data.combo > this.data.stats.bestCombo) {
      dataBestCombo(this.data);
    }
    if (this.data.combo >= 3) {
      this.data.comboBonusActive = true;
      this.toast('🔥🔥🔥 SCREAM COMBO! Next scream gets +5 average mercy boost.');
    }
    this.data.stats.consecutiveFails = 0;
    this.data.stats.totalSuccessfulLifetime += 1;

    const funny = this.data.settings.funnyMessages;
    let msg = successMessage(funny);
    msg = `Volume set to ${to}% (scream average). ${msg}`;
    if (to === 100) msg = 'YOU HAVE MADE A TERRIBLE DECISION. ☢️ Your ears have left the chat.';
    if (to === 0) msg = 'Congratulations. Silence achieved through screaming.';
    if (peak >= 100 || average >= 100) msg = 'Humanity has peaked. ' + msg;

    this.machine.statusMessage = msg;

    recordAttempt(this.data, {
      at: Date.now(),
      score: average,
      success: true,
      from,
      to,
      type: 'scream',
      durationMs
    });
    addLeaderboardEntry(this.data, average);

    const unlocked = evaluateAchievements(this.data, {
      success: true,
      peak: Math.max(peak, average),
      delta: to - from,
      combo: this.data.combo
    });
    save(this.data);
    unlocked.forEach((a) => this.toastAchievement(a));

    if (this.data.stats.totalSuccessfulLifetime === 10) {
      this.toast('Please seek professional vocal assistance.');
    }

    this.renderHome();
    this.startCooldown();
  }

  handleFailure(from, to, score, durationMs) {
    this.machine.state = AppState.FAILED;
    document.body.classList.remove('scream-mode');
    this.sfx.fail();

    this.data.combo = 0;
    this.data.stats.consecutiveFails += 1;

    const funny = this.data.settings.funnyMessages;
    let msg = failMessage(funny);
    if (this.data.stats.consecutiveFails >= 5) {
      msg = 'At this point, just use the keyboard.';
    }

    this.machine.statusMessage = msg;
    this.machine.requestedVolume = this.machine.actualVolume;
    this.syncSliderDisplay(this.machine.actualVolume, true);

    recordAttempt(this.data, {
      at: Date.now(),
      score,
      success: false,
      from,
      to,
      type: 'scream',
      durationMs
    });
    save(this.data);

    this.renderHome();

    setTimeout(() => {
      if (this.machine.state === AppState.FAILED) {
        this.machine.state = AppState.IDLE;
        this.machine.statusMessage = 'Waiting for an unnecessary volume adjustment...';
        this.renderHome();
      }
    }, 2200);
  }

  handleWhisper(from, to, score, durationMs) {
    this.machine.state = AppState.FAILED;
    document.body.classList.remove('scream-mode');
    this.sfx.fail();
    this.data.combo = 0;

    this.machine.statusMessage =
      score < MIN_AVERAGE_TO_APPLY
        ? '🤫 Too quiet — no volume change. Your scream average becomes the volume. Try again louder.'
        : '🤫 WHISPER DETECTED — That is not a scream. You are requesting VOLUME, not a library card.';
    this.machine.requestedVolume = this.machine.actualVolume;
    this.syncSliderDisplay(this.machine.actualVolume, true);

    recordAttempt(this.data, {
      at: Date.now(),
      score,
      success: false,
      from,
      to,
      type: 'whisper',
      durationMs
    });
    save(this.data);
    this.renderHome();

    setTimeout(() => {
      if (this.machine.state === AppState.FAILED) {
        this.machine.state = AppState.IDLE;
        this.machine.statusMessage = 'Waiting for an unnecessary volume adjustment...';
        this.renderHome();
      }
    }, 2800);
  }

  async cancelScream() {
    clearTimeout(this.screamTimer);
    if (this.micSessionActive) {
      await this.analyzer.stop();
      this.micSessionActive = false;
    }
    document.body.classList.remove('scream-mode');
    this.machine.state = AppState.IDLE;
    this.machine.requestedVolume = this.machine.actualVolume;
    this.machine.statusMessage = 'Authorization cancelled. Volume unchanged.';
    this.syncSliderDisplay(this.machine.actualVolume, true);
    this.ignoreAttempts += 1;
    if (this.ignoreAttempts >= 4) {
      this.toast('Stop trying to negotiate.');
      this.ignoreAttempts = 0;
    }
    this.renderHome();
  }

  startCooldown() {
    const seconds = this.data.settings.cooldownSeconds || 5;
    this.machine.state = AppState.COOLDOWN;
    this.machine.cooldownRemaining = seconds;
    this.machine.statusMessage = `🫁 VOCAL ENERGY DEPLETED — ${cooldownMessage(this.data.settings.funnyMessages)}`;
    this.sfx.cooldown();
    this.renderHome();

    clearInterval(this.cooldownTimer);
    this.cooldownTimer = setInterval(() => {
      this.machine.cooldownRemaining -= 1;
      if (this.machine.cooldownRemaining <= 0) {
        clearInterval(this.cooldownTimer);
        this.machine.state = AppState.IDLE;
        this.machine.statusMessage = 'Vocal system restored. Waiting for an unnecessary volume adjustment...';
        this.renderHome();
        return;
      }
      this.$('#cooldown-count').textContent = String(this.machine.cooldownRemaining);
      this.renderHome();
    }, 1000);
  }

  syncSliderDisplay(value, setInput) {
    const v = Math.round(value);
    if (setInput) this.$('#volume-slider').value = String(v);
    this.$('#current-volume-value').textContent = `${v}%`;
    this.$('#slider-preview').textContent = `${v}%`;
  }

  /* ---------- Settings / mic test ---------- */

  bindSettings() {
    this.$('#settings-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettingsFromForm();
    });

    this.$('#btn-test-mic')?.addEventListener('click', () => this.toggleMicTest());
    this.$('#btn-stop-mic-test')?.addEventListener('click', () => this.stopMicTest());
    this.$('#btn-reset-stats')?.addEventListener('click', () => {
      this.data = resetSection('stats');
      this.toast('Statistics reset.');
      this.renderStats();
    });
    this.$('#btn-reset-achievements')?.addEventListener('click', () => {
      this.data = resetSection('achievements');
      this.toast('Achievements reset.');
      this.renderAchievements();
    });
    this.$('#btn-reset-leaderboard')?.addEventListener('click', () => {
      this.data = resetSection('leaderboard');
      this.toast('Leaderboard reset.');
      this.renderLeaderboard();
    });
    this.$('#btn-demo-seed')?.addEventListener('click', () => {
      this.data.settings.demoMode = true;
      seedDemoLeaderboard(this.data);
      seedDemoAchievements(this.data);
      save(this.data);
      this.toast('Demo Mode data seeded (still uses real mic + real volume).');
      this.renderAll();
    });
    this.$('#nickname-input')?.addEventListener('change', (e) => {
      this.data.nickname = e.target.value.trim() || 'YOU';
      save(this.data);
    });
  }

  saveSettingsFromForm() {
    const s = this.data.settings;
    s.micDeviceId = this.$('#setting-mic').value || '';
    s.sensitivity = Number(this.$('#setting-sensitivity').value) || 1;
    s.cooldownSeconds = Number(this.$('#setting-cooldown').value) || 5;
    s.soundEffects = this.$('#setting-sfx').checked;
    s.funnyMessages = this.$('#setting-funny').checked;
    s.animations = this.$('#setting-anim').checked;
    s.demoMode = this.$('#setting-demo').checked;
    this.sfx.setEnabled(s.soundEffects);
    document.body.classList.toggle('no-anim', !s.animations);
    document.body.classList.toggle('demo-mode', s.demoMode);
    save(this.data);
    this.toast('Settings saved.');
  }

  async renderSettings() {
    const s = this.data.settings;
    this.$('#nickname-input').value = this.data.nickname || 'YOU';
    this.$('#setting-sensitivity').value = s.sensitivity;
    this.$('#setting-cooldown').value = s.cooldownSeconds;
    this.$('#setting-sfx').checked = s.soundEffects;
    this.$('#setting-funny').checked = s.funnyMessages;
    this.$('#setting-anim').checked = s.animations;
    this.$('#setting-demo').checked = s.demoMode;

    const select = this.$('#setting-mic');
    select.innerHTML = '<option value="">System default</option>';
    try {
      // Permission nudge so labels appear
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
      tmp.getTracks().forEach((t) => t.stop());
      const devices = await this.analyzer.listDevices();
      devices.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Microphone ${d.deviceId.slice(0, 6)}`;
        if (d.deviceId === s.micDeviceId) opt.selected = true;
        select.appendChild(opt);
      });
    } catch {
      const opt = document.createElement('option');
      opt.textContent = 'Grant mic permission to list devices';
      select.appendChild(opt);
    }
  }

  async toggleMicTest() {
    const panel = this.$('#mic-test-panel');
    panel.hidden = false;
    if (this.micSessionActive) return;
    this.micSessionActive = true;
    try {
      await this.analyzer.start({
        deviceId: this.data.settings.micDeviceId,
        sensitivity: this.data.settings.sensitivity,
        onUpdate: ({ live, peak }) => {
          this.$('#mic-test-bar').style.width = `${live}%`;
          this.$('#mic-test-live').textContent = String(live);
          this.$('#mic-test-power').textContent = String(peak);
          this.$('#mic-test-status').textContent = live > 5 ? 'Microphone working.' : 'Speak or scream…';
        }
      });
    } catch (err) {
      this.micSessionActive = false;
      this.$('#mic-test-status').textContent = `Error: ${err.message}`;
    }
  }

  async stopMicTest() {
    if (this.micSessionActive && this.machine.state !== AppState.SCREAMING) {
      await this.analyzer.stop();
      this.micSessionActive = false;
    }
    this.$('#mic-test-panel').hidden = true;
  }

  /* ---------- Onboarding ---------- */

  bindOnboarding() {
    let step = 0;
    const steps = this.$$('.onboard-step');
    const show = (i) => {
      steps.forEach((el, idx) => el.classList.toggle('active', idx === i));
    };
    this.$('#btn-onboard-next')?.addEventListener('click', () => {
      step = Math.min(step + 1, steps.length - 1);
      show(step);
      if (step === steps.length - 1) {
        this.$('#btn-onboard-next').hidden = true;
        this.$('#btn-start-screaming').hidden = false;
      }
    });
    this.$('#btn-start-screaming')?.addEventListener('click', () => {
      this.data.onboardingComplete = true;
      save(this.data);
      this.showOnboarding(false);
    });
    this.$('#btn-skip-onboard')?.addEventListener('click', () => {
      this.data.onboardingComplete = true;
      save(this.data);
      this.showOnboarding(false);
    });
  }

  showOnboarding(show) {
    this.$('#onboarding').hidden = !show;
  }

  /* ---------- Render ---------- */

  renderAll() {
    document.body.classList.toggle('no-anim', !this.data.settings.animations);
    document.body.classList.toggle('demo-mode', this.data.settings.demoMode);
    this.renderHome();
    this.renderStats();
    this.renderAchievements();
    this.renderLeaderboard();
    this.renderHistory();
  }

  renderHome() {
    const m = this.machine;
    const locked = m.state !== AppState.IDLE && m.state !== AppState.COOLDOWN;
    const slider = this.$('#volume-slider');
    slider.disabled = m.state === AppState.SCREAMING || m.state === AppState.COOLDOWN || m.state === AppState.REQUESTED;

    this.syncSliderDisplay(
      m.state === AppState.SCREAMING || m.state === AppState.REQUESTED ? m.actualVolume : m.actualVolume,
      !this.sliderDragging
    );

    this.$('#lock-badge').textContent =
      m.state === AppState.IDLE
        ? '🔒 UNAUTHORIZED'
        : m.state === AppState.COOLDOWN
          ? '🫁 COOLDOWN'
          : '🚨 AUTHORIZATION IN PROGRESS';

    this.$('#status-text').textContent = m.statusMessage;
    this.$('#combo-value').textContent = `🔥 × ${this.data.combo}`;
    this.$('#best-scream-value').textContent = String(this.data.stats.highestScream || 0);
    this.$('#home-scream-power').textContent = `${m.peakScream || 0} / 100`;
    this.$('#home-scream-bar').style.width = `${m.peakScream || 0}%`;

    const overlay = this.$('#scream-overlay');
    const showOverlay = m.state === AppState.SCREAMING || m.state === AppState.REQUESTED;
    overlay.hidden = !showOverlay;

    if (showOverlay) {
      this.$('#req-volume').textContent = `${m.averageScream || 0}%`;
      this.$('#req-required').textContent = `${m.averageScream || 0}%`;
      this.$('#req-security').textContent = m.securityLevel;
      this.$('#req-from').textContent = `${m.actualVolume}%`;
      const copy = directionCopy(m.direction === 'increase');
      this.$('#scream-dir-title').textContent = copy.title;
    }

    const cd = this.$('#cooldown-panel');
    cd.hidden = m.state !== AppState.COOLDOWN;
    if (m.state === AppState.COOLDOWN) {
      this.$('#cooldown-count').textContent = String(m.cooldownRemaining);
    }

    const err = this.$('#error-panel');
    err.hidden = m.state !== AppState.ERROR && !this.machine.errorMessage;
    if (this.machine.errorMessage) {
      this.$('#error-text').textContent = this.machine.errorMessage;
    }

    // Extreme / silence based on scream average (not slider target)
    this.$('#extreme-banner').hidden = !(showOverlay && (m.averageScream || 0) >= 95);
    this.$('#silence-banner').hidden = !(showOverlay && (m.averageScream || 0) > 0 && (m.averageScream || 0) <= 5);
  }

  renderStats() {
    const s = this.data.stats;
    const el = this.$('#stats-grid');
    if (!el) return;
    el.innerHTML = [
      ['Total attempts', s.totalAttempts],
      ['Successful', s.successful],
      ['Failed', s.failed],
      ['Success rate', `${successRate(s)}%`],
      ['Highest scream', s.highestScream],
      ['Average scream', averageScream(s)],
      ['Best combo', s.bestCombo],
      ['Largest volume Δ', `${s.largestVolumeChange}%`],
      ['Time screaming', formatDuration(s.timeSpentScreamingMs)]
    ]
      .map(
        ([label, val]) =>
          `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${val}</div></div>`
      )
      .join('');
  }

  renderAchievements() {
    const grid = this.$('#achievements-grid');
    if (!grid) return;
    grid.innerHTML = ACHIEVEMENTS.map((a) => {
      const unlocked = !!this.data.achievements[a.id];
      return `
        <button class="achievement-card ${unlocked ? 'unlocked' : 'locked'}" data-id="${a.id}" type="button">
          <div class="ach-icon">${unlocked ? a.icon : '🔒'}</div>
          <div class="ach-title">${unlocked ? a.title : '????'}</div>
          <div class="ach-desc">${a.description}</div>
        </button>`;
    }).join('');

    grid.querySelectorAll('.achievement-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const a = ACHIEVEMENTS.find((x) => x.id === btn.dataset.id);
        if (a) this.toast(`${a.icon} ${a.title} — ${a.description}`);
      });
    });
  }

  renderLeaderboard() {
    const list = this.$('#leaderboard-list');
    if (!list) return;
    const medals = ['🥇', '🥈', '🥉'];
    const rows = this.data.leaderboard.length
      ? this.data.leaderboard
      : [{ name: 'No screams yet', score: 0 }];
    list.innerHTML = rows
      .map((r, i) => {
        const medal = medals[i] || `#${i + 1}`;
        return `<div class="lb-row"><span>${medal} ${escapeHtml(r.name)}</span><strong>${r.score}</strong></div>`;
      })
      .join('');

    const meta = this.$('#leaderboard-meta');
    if (meta) {
      meta.textContent = `Achievements unlocked: ${Object.keys(this.data.achievements).length} / ${ACHIEVEMENTS.length}`;
    }
  }

  renderHistory() {
    const list = this.$('#history-list');
    if (!list) return;
    if (!this.data.history.length) {
      list.innerHTML = `<div class="empty">No scream attempts yet. Go make poor decisions.</div>`;
      return;
    }
    list.innerHTML = this.data.history
      .map((h) => {
        const t = new Date(h.at);
        const time = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const icon = h.type === 'whisper' ? '🤫 WHISPER' : h.success ? '🔥 SUCCESS' : '💀 FAILED';
        return `<div class="hist-row"><span>${time} — ${h.score}</span><span>${icon}</span><span>${h.from}% → ${h.to}%</span></div>`;
      })
      .join('');
  }

  renderHackathon() {
    // Static page — nothing dynamic required
  }

  /* ---------- Errors / toasts ---------- */

  setError(msg) {
    this.machine.errorMessage = msg;
    this.machine.state = AppState.ERROR;
    this.machine.statusMessage = msg;
    this.renderHome();
  }

  clearError() {
    if (this.machine.state === AppState.ERROR) {
      this.machine.state = AppState.IDLE;
    }
    this.machine.errorMessage = null;
  }

  async retryFromError() {
    this.clearError();
    await this.refreshSystemVolume();
    this.machine.statusMessage = 'Waiting for an unnecessary volume adjustment...';
    this.renderHome();
  }

  toast(message) {
    const host = this.$('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  toastAchievement(a) {
    this.sfx.achievement();
    this.toast(`🏆 Achievement unlocked: ${a.title}`);
  }

  bindGlobal() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.machine.state === AppState.SCREAMING) {
        this.cancelScream();
      }
    });
  }
}

function dataBestCombo(data) {
  data.stats.bestCombo = data.combo;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new ScreamApp();
  app.init().catch((err) => {
    console.error(err);
    const status = document.querySelector('#status-text');
    if (status) status.textContent = `Startup failure: ${err.message}`;
  });
});
