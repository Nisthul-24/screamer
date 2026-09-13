/**
 * Content script — scream overlay + mic analysis + volume-based trolling.
 * Talks to inject.js (page world) via window.postMessage.
 */

(function () {
  const PAGE = 'scream-volume-page';
  const EXT = 'scream-volume-ext';
  const LISTEN_MS = 3500;
  const WHISPER_CEILING = 15;
  const ACTIVE_FLOOR = 8;
  const WARMUP_MS = 250;
  const BRIEFING_MS = 2200;

  /* ---------- Volume-request trolls (by requested %) ---------- */

  const VOLUME_RANGE_TROLLS = [
    {
      min: 0,
      max: 10,
      emoji: '🤫',
      messages: [
        'Whispering to your speakers?',
        'Your ears are apparently on vacation.',
        'Congratulations, you\'ve discovered silence.'
      ]
    },
    {
      min: 11,
      max: 20,
      emoji: '😐',
      messages: [
        'Barely audible. Just like your confidence.',
        'Are you trying to listen or summon a ghost?',
        'Volume detected. Barely.'
      ]
    },
    {
      min: 21,
      max: 30,
      emoji: '🙂',
      messages: [
        'Okay, we can work with this.',
        'A reasonable request. Suspicious.',
        'Your ears approve. For now.'
      ]
    },
    {
      min: 31,
      max: 40,
      emoji: '😏',
      messages: [
        'Getting a little ambitious, aren\'t we?',
        'Someone\'s feeling brave today.',
        'Fine. But you\'re going to have to earn it.'
      ]
    },
    {
      min: 41,
      max: 50,
      emoji: '🔥',
      messages: [
        'That\'s a respectable amount of noise.',
        'Now we\'re getting somewhere.',
        'Your neighbors remain unconcerned.'
      ]
    },
    {
      min: 51,
      max: 60,
      emoji: '😈',
      messages: [
        'Oh, you want THAT much volume?',
        'This feels unnecessarily loud.',
        'Your neighbors have entered the chat.'
      ]
    },
    {
      min: 61,
      max: 70,
      emoji: '🚨',
      messages: [
        'Okay, calm down.',
        'That\'s getting serious.',
        'Are you trying to wake the entire building?'
      ]
    },
    {
      min: 71,
      max: 80,
      emoji: '💀',
      messages: [
        'WHAT ARE YOU LISTENING TO?',
        'Your neighbors would like a word.',
        'This is no longer a volume adjustment. It\'s a declaration of war.'
      ]
    },
    {
      min: 81,
      max: 90,
      emoji: '☢️',
      messages: [
        'ABSOLUTELY NOT. SCREAM FOR IT.',
        'Your ears have filed a complaint.',
        'At this point, you\'re not listening. You\'re experiencing.'
      ]
    },
    {
      min: 91,
      max: 99,
      emoji: '☠️',
      messages: [
        'WHY DO YOU NEED THIS MUCH VOLUME?',
        'This is between you and your eardrums now.',
        'The speakers are requesting legal representation.'
      ]
    },
    {
      min: 100,
      max: 100,
      emoji: '💀☢️',
      messages: [
        'YOU WANT 100%?! PROVE YOUR WORTH.',
        'MAXIMUM VOLUME REQUEST DETECTED. THIS IS A TERRIBLE IDEA.',
        'Your ears have officially left the chat.',
        'Fine. Destroy your hearing. But first... SCREAM.'
      ]
    }
  ];

  const DELTA_TROLLS = [
    { min: 0, max: 10, messages: ['Sure, whatever.', 'Tiny change. Big drama.', 'Was that even worth screaming for?'] },
    { min: 11, max: 25, messages: ['A modest leap into chaos.', 'Okay, mildly spicy.', 'You could\'ve just… not.'] },
    { min: 26, max: 45, messages: ['That\'s a jump.', 'Someone discovered the volume slider.', 'Ambition levels: rising.'] },
    { min: 46, max: 70, messages: ['WHO GAVE YOU THIS POWER?', 'That\'s not adjusting. That\'s escalating.', 'Bold of you to assume your speakers agreed.'] },
    {
      min: 71,
      max: 100,
      messages: [
        '☢️ FINAL BOSS VOLUME REQUEST',
        'From chill to war crime in one drag.',
        'This jump should require a waiver.'
      ]
    }
  ];

  const SUCCESS_MESSAGES = [
    'That was unnecessarily aggressive.',
    'Vocal authorization accepted.',
    'The computer respects you now.',
    'Approved by the Scream Authority.',
    'Your lungs have spoken.',
    'Volume unlocked. Dignity: optional.',
    'THAT\'S MORE LIKE IT.',
    'ABSOLUTE POWER.'
  ];

  const FAIL_MESSAGES = [
    'That was pathetic. 💀',
    'LOUDER.',
    'Your scream has been rejected.',
    'Insufficient rage detected.',
    'Was that even a scream?',
    'Volume denied.'
  ];

  /** Avoid immediate repeats per message bank key. */
  const lastPicked = Object.create(null);

  function pickAvoidRepeat(key, messages) {
    if (!messages || !messages.length) return '';
    if (messages.length === 1) return messages[0];
    const last = lastPicked[key];
    let options = messages.filter((m) => m !== last);
    if (!options.length) options = messages.slice();
    const choice = options[Math.floor(Math.random() * options.length)];
    lastPicked[key] = choice;
    return choice;
  }

  function volumeRangeInfo(requested) {
    const r = Math.max(0, Math.min(100, Math.round(requested)));
    const band = VOLUME_RANGE_TROLLS.find((b) => r >= b.min && r <= b.max) || VOLUME_RANGE_TROLLS[0];
    return {
      emoji: band.emoji,
      message: pickAvoidRepeat(`vol-${band.min}-${band.max}`, band.messages),
      key: `${band.min}-${band.max}`
    };
  }

  function deltaTroll(from, to) {
    const delta = Math.abs(to - from);
    const band = DELTA_TROLLS.find((b) => delta >= b.min && delta <= b.max) || DELTA_TROLLS[0];
    // Special case near-max climb
    if (from >= 85 && to === 100) {
      return pickAvoidRepeat('delta-final', ['☢️ FINAL BOSS VOLUME REQUEST', 'One more percent. One more crime.', 'Endgame volume. Tragic.']);
    }
    return pickAvoidRepeat(`delta-${band.min}-${band.max}`, band.messages);
  }

  function requiredScreamForDelta(delta) {
    const d = Math.abs(delta);
    if (d <= 0) return 0;
    if (d <= 5) return 30;
    if (d <= 10) return 40;
    if (d <= 20) return 60;
    if (d <= 30) return 75;
    if (d <= 40) return 90;
    return 100;
  }

  function intensityLabel(score) {
    if (score <= 3) return { emoji: '😶', text: 'Dead silence' };
    if (score <= 20) return { emoji: '😐', text: 'Calm' };
    if (score <= 40) return { emoji: '🙂', text: 'Mildly annoyed' };
    if (score <= 60) return { emoji: '😠', text: 'Getting angry' };
    if (score <= 80) return { emoji: '🔥', text: 'Very angry' };
    if (score <= 95) return { emoji: '💀', text: 'Absolutely furious' };
    return { emoji: '☢️', text: 'UNNECESSARY ANGER' };
  }

  let toastHost = null;
  let overlay = null;
  let analyzer = null;
  let screamTimer = null;
  let briefingTimer = null;
  let busy = false;
  let enabled = true;
  let sensitivity = 0.6;
  let listenMs = 3500;
  let roastEnabled = true;
  let pendingRequest = null; // { current, requested, troll, deltaLine }
  let activePhaseBeforeSettings = 'briefing';

  function loadSettings() {
    try {
      chrome.storage.sync.get(
        { enabled: true, sensitivity: 0.6, screamDuration: 3500, roastEnabled: true },
        (data) => {
          enabled = data.enabled !== false;
          sensitivity = Number(data.sensitivity) || 0.6;
          listenMs = Number(data.screamDuration) || 3500;
          roastEnabled = data.roastEnabled !== false;
          updateOverlaySettingsUI();
        }
      );
    } catch (_) {
      /* ignore */
    }
  }

  loadSettings();

  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.enabled) enabled = changes.enabled.newValue !== false;
      if (changes.sensitivity) sensitivity = Number(changes.sensitivity.newValue) || 0.6;
      if (changes.screamDuration) listenMs = Number(changes.screamDuration.newValue) || 3500;
      if (changes.roastEnabled) roastEnabled = changes.roastEnabled.newValue !== false;
      updateOverlaySettingsUI();
    });
  } catch (_) {
    /* ignore */
  }

  function injectPageHook() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  }

  injectPageHook();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPageHook, { once: true });
  }

  function postToPage(type, payload = {}) {
    window.postMessage({ source: EXT, type, ...payload }, '*');
  }

  function amplitudeToScore(rms, peakSample) {
    const sens = Math.max(0.1, Number(sensitivity) || 0.6);
    const raw = Math.max(rms * 2.8, peakSample * 1.4) * sens;
    let score = Math.min(100, Math.pow(Math.min(1, raw * 2.2), 0.65) * 100);
    if (score < 3) score = 0;
    return score;
  }

  class ScreamAnalyzer {
    constructor() {
      this.audioContext = null;
      this.analyser = null;
      this.stream = null;
      this.source = null;
      this.rafId = null;
      this.running = false;
      this.smoothed = 0;
      this.peak = 0;
      this.activeSum = 0;
      this.activeCount = 0;
      this.startedAt = 0;
      this.onUpdate = null;
    }

    async start(onUpdate) {
      if (this.running) await this.stop();
      this.onUpdate = onUpdate;
      this.smoothed = 0;
      this.peak = 0;
      this.activeSum = 0;
      this.activeCount = 0;
      this.startedAt = performance.now();

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1
        }
      });
      this.audioContext = new AudioContext();
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.2;
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);
      this.running = true;
      this._tick();
    }

    getAverage() {
      if (this.activeCount > 0) return Math.round(this.activeSum / this.activeCount);
      return Math.round(this.smoothed);
    }

    _tick() {
      if (!this.running || !this.analyser) return;
      const buffer = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      let peakSample = 0;
      for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i] * buffer[i];
        const a = Math.abs(buffer[i]);
        if (a > peakSample) peakSample = a;
      }
      const score = amplitudeToScore(Math.sqrt(sum / buffer.length), peakSample);
      this.smoothed = this.smoothed * 0.55 + score * 0.45;
      if (this.smoothed > this.peak) this.peak = this.smoothed;
      if (performance.now() - this.startedAt > WARMUP_MS && this.smoothed >= ACTIVE_FLOOR) {
        this.activeSum += this.smoothed;
        this.activeCount += 1;
      }
      if (this.onUpdate) {
        this.onUpdate({
          live: Math.round(this.smoothed),
          peak: Math.round(this.peak),
          average: this.getAverage()
        });
      }
      this.rafId = requestAnimationFrame(() => this._tick());
    }

    async stop() {
      this.running = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = null;
      if (this.source) {
        try {
          this.source.disconnect();
        } catch (_) {}
        this.source = null;
      }
      if (this.audioContext) {
        try {
          await this.audioContext.close();
        } catch (_) {}
        this.audioContext = null;
      }
      if (this.stream) {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
      }
      this.analyser = null;
      const average = this.getAverage();
      const peak = Math.round(this.peak);
      const activeCount = this.activeCount;
      this.activeSum = 0;
      this.activeCount = 0;
      return { average, peak, activeCount };
    }
  }

  function ensureToastHost() {
    if (toastHost && toastHost.isConnected) return toastHost;
    toastHost = document.createElement('div');
    toastHost.id = 'scream-troll-toasts';
    toastHost.setAttribute('aria-live', 'polite');
    (document.documentElement || document.body).appendChild(toastHost);
    return toastHost;
  }

  function showNotification({ icon, title, body, success = true }) {
    const host = ensureToastHost();
    const toast = document.createElement('div');
    toast.className = `sv-troll-toast ${success ? 'sv-success' : 'sv-fail'}`;
    toast.innerHTML = `
      <div class="sv-notif-icon"></div>
      <div class="sv-troll-body">
        <div class="sv-notif-app">THE SCREAMING VOLUME SLIDER™</div>
        <div class="sv-troll-level"></div>
        <div class="sv-troll-text"></div>
      </div>
      <button type="button" class="sv-notif-close" aria-label="Dismiss">×</button>
    `;
    toast.querySelector('.sv-notif-icon').textContent = icon;
    toast.querySelector('.sv-troll-level').textContent = title;
    toast.querySelector('.sv-troll-text').textContent = body;

    const close = () => {
      toast.classList.remove('sv-show');
      toast.classList.add('sv-hide');
      setTimeout(() => toast.remove(), 320);
    };
    toast.querySelector('.sv-notif-close').addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });

    host.appendChild(toast);
    const kids = [...host.querySelectorAll('.sv-troll-toast')];
    kids.forEach((el, i) => {
      el.style.setProperty('--sv-stack', `${20 + (kids.length - 1 - i) * 120}px`);
    });
    requestAnimationFrame(() => toast.classList.add('sv-show'));
    while (host.children.length > 3) host.firstChild.remove();
    setTimeout(close, 10000);
  }

  function getSensitivityLabel(val) {
    const num = Number(val);
    if (num <= 0.35) return `${num.toFixed(2)}x (Hardcore Scream)`;
    if (num <= 0.55) return `${num.toFixed(2)}x (Firm Scream)`;
    if (num <= 0.8) return `${num.toFixed(2)}x (Balanced)`;
    if (num <= 1.2) return `${num.toFixed(2)}x (Sensitive)`;
    return `${num.toFixed(2)}x (Whisper Mode)`;
  }

  function updateOverlaySettingsUI() {
    if (!overlay) return;
    const sensInput = overlay.querySelector('.sv-ov-sensitivity');
    const sensVal = overlay.querySelector('.sv-ov-sensitivity-val');
    const durationInput = overlay.querySelector('.sv-ov-duration');
    const roastInput = overlay.querySelector('.sv-ov-roast');

    if (sensInput) sensInput.value = sensitivity;
    if (sensVal) sensVal.textContent = getSensitivityLabel(sensitivity);
    if (durationInput) durationInput.value = String(listenMs);
    if (roastInput) roastInput.checked = roastEnabled;
  }

  function ensureOverlay() {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'scream-volume-root';
    overlay.innerHTML = `
      <div class="sv-backdrop" data-sv-cancel></div>
      <div class="sv-card" role="dialog" aria-modal="true" aria-label="Scream to set volume">
        <div class="sv-phase sv-phase-briefing">
          <div class="sv-kicker sv-request-line">🚨 VOLUME CHANGE REQUESTED: —%</div>
          <h2 class="sv-title sv-brief-emoji">😈</h2>
          <p class="sv-quote sv-brief-troll">Loading unnecessary judgment...</p>
          <p class="sv-delta-line"></p>
          <div class="sv-req-box">
            <div>SCREAM MODE RULE</div>
            <strong style="font-size: 1rem; color: #ffd7c8; margin-top: 0.25rem;">YOUR SCREAM SOUND = VIDEO VOLUME</strong>
          </div>
          <p class="sv-authorize-line">🎤 GET READY TO SCREAM</p>
          <p class="sv-status sv-brief-status">Preparing microphone...</p>
        </div>
        <div class="sv-phase sv-phase-scream" hidden>
          <div class="sv-kicker">VOCAL VOLUME CONTROL</div>
          <h2 class="sv-title">🎤 SCREAM NOW!!!</h2>
          <p class="sv-sub sv-scream-sub">High scream = High volume. Soft scream = Low volume.</p>
          <div class="sv-grid">
            <div><span>PREVIOUS</span><strong class="sv-from">—</strong></div>
            <div><span>ATTEMPTED</span><strong class="sv-to">—</strong></div>
            <div><span>LIVE INTENSITY</span><strong class="sv-live">0%</strong></div>
            <div><span>CALCULATED VOL</span><strong class="sv-score">0%</strong></div>
          </div>
          <div class="sv-meter"><div class="sv-meter-fill"></div></div>
          <div class="sv-level"><span class="sv-level-emoji">😐</span> <span class="sv-level-text">Calm</span></div>
          <p class="sv-status sv-scream-status">ANALYZING SCREAM SOUND...</p>
        </div>
        <div class="sv-phase sv-phase-settings" hidden>
          <div class="sv-kicker">SCREAM SLIDER SETTINGS</div>
          <h2 class="sv-title">⚙️ ADJUST CONTROLS</h2>
          <div class="sv-settings-box">
            <div class="sv-setting-item">
              <div class="sv-setting-header">
                <span>🎚️ Mic Sensitivity</span>
                <span class="sv-setting-val sv-ov-sensitivity-val">0.60x (Balanced)</span>
              </div>
              <p class="sv-setting-desc">Lower sensitivity requiring harder screams. Higher sensitivity for soft microphones.</p>
              <input type="range" class="sv-ov-sensitivity" min="0.2" max="2.0" step="0.05" value="0.6" />
            </div>
            <div class="sv-setting-item">
              <div class="sv-setting-header"><span>⏱️ Scream Duration</span></div>
              <select class="sv-ov-duration">
                <option value="2000">2.0s (Fast)</option>
                <option value="3500">3.5s (Standard)</option>
                <option value="5000">5.0s (Long)</option>
              </select>
            </div>
            <div class="sv-setting-item sv-setting-row">
              <span>😈 Pre-Scream Roast Briefing</span>
              <input type="checkbox" class="sv-ov-roast" checked />
            </div>
          </div>
        </div>
        <p class="sv-privacy">Audio stays on this device. Recordings are never stored.</p>
        <div class="sv-card-actions">
          <button type="button" class="sv-cancel" data-sv-cancel>Cancel</button>
          <button type="button" class="sv-settings-btn" data-sv-toggle-settings>⚙️ Settings</button>
        </div>
      </div>
    `;
    (document.documentElement || document.body).appendChild(overlay);

    overlay.querySelectorAll('[data-sv-cancel]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        cancelScream();
      });
    });

    const settingsBtn = overlay.querySelector('[data-sv-toggle-settings]');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleOverlaySettings();
      });
    }

    const sensInput = overlay.querySelector('.sv-ov-sensitivity');
    if (sensInput) {
      sensInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        sensitivity = val;
        overlay.querySelector('.sv-ov-sensitivity-val').textContent = getSensitivityLabel(val);
        try {
          chrome.storage.sync.set({ sensitivity: val });
        } catch (_) {}
      });
    }

    const durationInput = overlay.querySelector('.sv-ov-duration');
    if (durationInput) {
      durationInput.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        listenMs = val;
        try {
          chrome.storage.sync.set({ screamDuration: val });
        } catch (_) {}
      });
    }

    const roastInput = overlay.querySelector('.sv-ov-roast');
    if (roastInput) {
      roastInput.addEventListener('change', (e) => {
        const val = e.target.checked;
        roastEnabled = val;
        try {
          chrome.storage.sync.set({ roastEnabled: val });
        } catch (_) {}
      });
    }

    updateOverlaySettingsUI();
    return overlay;
  }

  function toggleOverlaySettings() {
    const root = ensureOverlay();
    const settingsPhase = root.querySelector('.sv-phase-settings');
    const isCurrentlySettings = !settingsPhase.hidden;
    const btn = root.querySelector('[data-sv-toggle-settings]');

    if (isCurrentlySettings) {
      setPhase(activePhaseBeforeSettings || 'briefing');
      if (btn) btn.textContent = '⚙️ Settings';
    } else {
      if (root.querySelector('.sv-phase-briefing').hidden === false) {
        activePhaseBeforeSettings = 'briefing';
      } else {
        activePhaseBeforeSettings = 'scream';
      }
      setPhase('settings');
      if (btn) btn.textContent = '◀ Back';
    }
  }

  function setPhase(phase) {
    const root = ensureOverlay();
    root.querySelector('.sv-phase-briefing').hidden = phase !== 'briefing';
    root.querySelector('.sv-phase-scream').hidden = phase !== 'scream';
    root.querySelector('.sv-phase-settings').hidden = phase !== 'settings';
  }

  /**
   * Show volume-based troll BEFORE mic / scream starts.
   */
  function showBriefing({ current, requested, troll, deltaLine }) {
    const root = ensureOverlay();
    root.classList.add('sv-visible');
    setPhase('briefing');
    root.querySelector('.sv-request-line').textContent = `🚨 VOLUME CHANGE REQUESTED: ${requested}%`;
    root.querySelector('.sv-brief-emoji').textContent = troll.emoji;
    root.querySelector('.sv-brief-troll').textContent = `"${troll.message}"`;
    root.querySelector('.sv-delta-line').textContent = deltaLine ? `Δ ${current}% → ${requested}% — ${deltaLine}` : `${current}% → ${requested}%`;
    root.querySelector('.sv-brief-status').textContent = 'Roast delivered. Get ready to scream for real volume...';
  }

  function showScreamPhase(req) {
    const root = ensureOverlay();
    setPhase('scream');
    root.querySelector('.sv-from').textContent = `${req.current}%`;
    root.querySelector('.sv-to').textContent = `${req.requested}%`;
    root.querySelector('.sv-live').textContent = '0%';
    root.querySelector('.sv-score').textContent = '0%';
    root.querySelector('.sv-meter-fill').style.width = '0%';
    root.querySelector('.sv-scream-sub').textContent = 'Scream intensity determines video volume! High scream = loud, soft = quiet.';
    root.querySelector('.sv-scream-status').textContent = '🎤 SCREAM NOW!';
    root.querySelector('.sv-level-emoji').textContent = '😐';
    root.querySelector('.sv-level-text').textContent = 'Calm';
  }

  function hideOverlay() {
    if (overlay) overlay.classList.remove('sv-visible');
  }

  function updateOverlay({ live, peak, average }) {
    if (!overlay || !pendingRequest) return;
    const score = Math.min(100, Math.max(0, Math.round(Math.max(live, average, peak))));
    const label = intensityLabel(score);
    overlay.querySelector('.sv-live').textContent = `${score}%`;
    overlay.querySelector('.sv-score').textContent = `${score}%`;
    overlay.querySelector('.sv-meter-fill').style.width = `${score}%`;
    overlay.querySelector('.sv-level-emoji').textContent = label.emoji;
    overlay.querySelector('.sv-level-text').textContent = label.text;
    
    if (score < 10) {
      overlay.querySelector('.sv-scream-status').textContent = `🤫 Too quiet → Volume will be ~${score}%`;
    } else if (score < 40) {
      overlay.querySelector('.sv-scream-status').textContent = `🔉 Soft scream → Volume will be ~${score}%`;
    } else if (score < 75) {
      overlay.querySelector('.sv-scream-status').textContent = `🔊 Medium scream → Volume will be ~${score}%`;
    } else {
      overlay.querySelector('.sv-scream-status').textContent = `🔥 HIGH SCREAM → Volume will be ~${score}%!`;
    }
  }

  async function startScreamFlow({ current, requested }) {
    if (busy) return;
    if (!enabled) {
      postToPage('CANCEL_VOLUME');
      return;
    }

    const from = Math.round(current);
    const to = Math.round(requested);

    const troll = volumeRangeInfo(to);
    const deltaLine = deltaTroll(from, to);

    pendingRequest = { current: from, requested: to, troll, deltaLine };
    busy = true;

    if (roastEnabled) {
      // 1) Troll BEFORE scream authorization
      showBriefing(pendingRequest);

      clearTimeout(briefingTimer);
      briefingTimer = setTimeout(() => beginAuthorization(), BRIEFING_MS);
    } else {
      // Fast mode — go straight to scream phase
      const root = ensureOverlay();
      root.classList.add('sv-visible');
      beginAuthorization();
    }
  }

  async function beginAuthorization() {
    if (!pendingRequest || !busy) return;
    showScreamPhase(pendingRequest);

    analyzer = new ScreamAnalyzer();
    try {
      await analyzer.start((reading) => updateOverlay(reading));
    } catch (err) {
      if (overlay) {
        overlay.querySelector('.sv-scream-status').textContent =
          err.name === 'NotAllowedError'
            ? 'Microphone blocked — allow mic for this site, then try again.'
            : `Microphone error: ${err.message}`;
      }
      clearTimeout(screamTimer);
      screamTimer = setTimeout(() => {
        postToPage('CANCEL_VOLUME');
        hideOverlay();
        busy = false;
        pendingRequest = null;
      }, 2800);
      return;
    }

    clearTimeout(screamTimer);
    screamTimer = setTimeout(finishScream, listenMs);
  }

  async function finishScream() {
    clearTimeout(screamTimer);
    if (!analyzer || !pendingRequest) {
      busy = false;
      return;
    }
    const result = await analyzer.stop();
    analyzer = null;

    const peak = result.peak;
    const average = result.average;
    const score = Math.min(100, Math.max(0, Math.round(Math.max(peak, average))));
    const whisper = peak < WHISPER_CEILING && average < WHISPER_CEILING;

    if (whisper || score < 8) {
      if (overlay) {
        overlay.querySelector('.sv-title').textContent = '🤫 TOO QUIET';
        overlay.querySelector('.sv-scream-status').textContent = 'Not enough scream! Volume unchanged. Scream louder!';
      }
      postToPage('CANCEL_VOLUME');
      setTimeout(() => {
        hideOverlay();
        busy = false;
        showNotification({
          icon: '🤫',
          title: 'TOO QUIET',
          body: 'Not enough scream sound detected! Volume unchanged.',
          success: false
        });
        pendingRequest = null;
      }, 1000);
      return;
    }

    const finalVolume = score;

    if (overlay) {
      overlay.querySelector('.sv-title').textContent = `🔊 VOLUME SET TO ${finalVolume}%`;
      overlay.querySelector('.sv-scream-status').textContent = `Scream intensity (${finalVolume}%) applied to video!`;
    }

    postToPage('APPLY_VOLUME', { volume: finalVolume });
    setTimeout(() => postToPage('APPLY_VOLUME', { volume: finalVolume }), 120);
    setTimeout(() => postToPage('APPLY_VOLUME', { volume: finalVolume }), 400);
    setTimeout(() => postToPage('APPLY_VOLUME', { volume: finalVolume }), 900);

    const troll = volumeRangeInfo(finalVolume);
    setTimeout(() => {
      hideOverlay();
      busy = false;
      showNotification({
        icon: troll.emoji,
        title: `🔊 VOLUME SET TO ${finalVolume}%`,
        body: `"${troll.message}"`,
        success: true
      });
      pendingRequest = null;
    }, 900);
  }

  async function cancelScream() {
    clearTimeout(screamTimer);
    clearTimeout(briefingTimer);
    if (analyzer) {
      try {
        await analyzer.stop();
      } catch (_) {}
      analyzer = null;
    }
    postToPage('CANCEL_VOLUME');
    hideOverlay();
    busy = false;
    pendingRequest = null;
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== PAGE) return;

    if (data.type === 'VOLUME_REQUEST') {
      if (!enabled) {
        postToPage('APPLY_VOLUME', { volume: data.requested });
        return;
      }
      startScreamFlow({ current: data.current, requested: data.requested });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && busy) cancelScream();
  });
})();
