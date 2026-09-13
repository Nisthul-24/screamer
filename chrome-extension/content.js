/**
 * Content script — scream overlay + mic analysis.
 * Talks to inject.js (page world) via window.postMessage.
 */

(function () {
  const PAGE = 'scream-volume-page';
  const EXT = 'scream-volume-ext';
  const LISTEN_MS = 3500;
  const MIN_AVERAGE = 8;
  const WHISPER_CEILING = 15;
  /** Only samples at/above this count toward the scream average (ignore silence). */
  const ACTIVE_FLOOR = 8;
  const WARMUP_MS = 250;

  const TROLL_QUOTES = {
    silent: [
      'Hello? Is this thing on?',
      'Even your keyboard clicks are louder.',
      'Are you screaming in another dimension?',
      'Mic check… still waiting.',
      'Silence is not a volume strategy.'
    ],
    calm: [
      '😐 That was a polite sigh, not a scream.',
      'Did you ask the volume nicely? Cute.',
      'Library energy detected. Wrong app.',
      'Your ancestors expected more drama.',
      'Try using lungs. Optional but recommended.'
    ],
    mild: [
      '🙂 Mildly annoyed. YouTube is unimpressed.',
      'That barely scared a mosquito.',
      'Warm-up scream. Where’s the main event?',
      'You’re negotiating with the volume. Stop.',
      'Meh. The algorithm yawned.'
    ],
    angry: [
      '😠 Okay, now you’re mildly unhinged.',
      'Neighbors: “is everything okay?”',
      'Getting spicy. Keep going.',
      'This is the rage of someone who lost the remote.',
      'Volume is listening… reluctantly.'
    ],
    very: [
      '🔥 THERE it is. Chaotic good energy.',
      'Your throat just filed a complaint.',
      'YouTube fears you now.',
      'Unnecessary? Yes. Effective? Also yes.',
      'Certified scream. Still ridiculous.'
    ],
    furious: [
      '💀 Absolutely unhinged. Respect.',
      'The neighbors have formed a committee.',
      'Who hurt you? (besides this extension)',
      'This scream has main-character syndrome.',
      'Police may confuse this with an emergency.'
    ],
    max: [
      '☢️ UNNECESSARY LEVELS OF ANGER',
      'I’M CALLING SOMEONE.',
      'Humanity has peaked. Please hydrate.',
      'Your scream broke the fourth wall.',
      'Volume set by pure chaos. Congrats?'
    ]
  };

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function screamBand(score) {
    if (score <= 3) return 'silent';
    if (score <= 20) return 'calm';
    if (score <= 40) return 'mild';
    if (score <= 60) return 'angry';
    if (score <= 80) return 'very';
    if (score <= 95) return 'furious';
    return 'max';
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

  let lastQuoteBand = '';
  let lastQuoteAt = 0;
  let currentQuote = '';
  let toastHost = null;

  function trollQuoteFor(score, force) {
    const band = screamBand(score);
    const now = Date.now();
    if (!force && band === lastQuoteBand && now - lastQuoteAt < 900) {
      return currentQuote;
    }
    lastQuoteBand = band;
    lastQuoteAt = now;
    currentQuote = pick(TROLL_QUOTES[band] || TROLL_QUOTES.calm);
    return currentQuote;
  }

  function ensureToastHost() {
    if (toastHost && toastHost.isConnected) return toastHost;
    toastHost = document.createElement('div');
    toastHost.id = 'scream-troll-toasts';
    toastHost.setAttribute('aria-live', 'polite');
    (document.documentElement || document.body).appendChild(toastHost);
    return toastHost;
  }

  /**
   * Notification-style troll popup — shown AFTER screaming ends.
   */
  function showTrollNotification(score, { success = true, title = null } = {}) {
    const band = screamBand(score);
    const label = intensityLabel(score);
    const quote = pick(TROLL_QUOTES[band] || TROLL_QUOTES.calm);
    const host = ensureToastHost();

    const toast = document.createElement('div');
    toast.className = `sv-troll-toast sv-band-${band} ${success ? 'sv-success' : 'sv-fail'}`;
    toast.innerHTML = `
      <div class="sv-notif-icon">${success ? '🔊' : '🤫'}</div>
      <div class="sv-troll-body">
        <div class="sv-notif-app">THE SCREAMING VOLUME SLIDER™</div>
        <div class="sv-troll-level"></div>
        <div class="sv-troll-text"></div>
      </div>
      <button type="button" class="sv-notif-close" aria-label="Dismiss">×</button>
    `;
    toast.querySelector('.sv-troll-level').textContent =
      title ||
      (success
        ? `${label.emoji} ${label.text} · Volume ${Math.round(score)}%`
        : `${label.emoji} Scream rejected`);
    toast.querySelector('.sv-troll-text').textContent = quote;

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
    // Stack from bottom
    const kids = [...host.querySelectorAll('.sv-troll-toast')];
    kids.forEach((el, i) => {
      const fromBottom = (kids.length - 1 - i) * 100;
      el.style.setProperty('--sv-stack', `${16 + fromBottom}px`);
    });

    requestAnimationFrame(() => toast.classList.add('sv-show'));

    while (host.children.length > 3) {
      host.firstChild.remove();
    }

    setTimeout(close, success ? 4500 : 3800);
    return quote;
  }

  /** After scream ends: close overlay, then pop notification(s). */
  function notifyAfterScream(score, { success }) {
    hideOverlay();
    busy = false;
    // Small delay so it feels like a real Chrome notification after the modal closes
    setTimeout(() => {
      showTrollNotification(score, { success });
      if (success && score >= 70) {
        setTimeout(() => showTrollNotification(score, { success: true, title: '🔥 Unnecessary power achieved' }), 500);
      }
      if (success && score >= 90) {
        setTimeout(
          () => showTrollNotification(100, { success: true, title: '☢️ Neighbor complaint incoming' }),
          1000
        );
      }
    }, 280);
  }

  let overlay = null;
  let analyzer = null;
  let screamTimer = null;
  let busy = false;
  let enabled = true;
  let lastAverage = 0;

  try {
    chrome.storage.sync.get({ enabled: true }, (data) => {
      enabled = data.enabled !== false;
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.enabled) enabled = changes.enabled.newValue !== false;
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

  /**
   * Map mic amplitude → 0–100 scream score.
   * Tuned so normal talk is mid-low; real screams climb high in the browser.
   */
  function amplitudeToScore(rms, peakSample) {
    const raw = Math.max(rms * 5.5, peakSample * 2.4);
    // Gentler curve so medium screams aren't stuck in the teens
    let score = Math.min(100, Math.pow(Math.min(1, raw * 3.4), 0.55) * 100);
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
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.2;
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);
      this.running = true;
      this._tick();
    }

    getAverage() {
      // Average of active scream samples only — silence does not pull volume down
      if (this.activeCount > 0) {
        return Math.round(this.activeSum / this.activeCount);
      }
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
      const rms = Math.sqrt(sum / buffer.length);
      const score = amplitudeToScore(rms, peakSample);

      this.smoothed = this.smoothed * 0.55 + score * 0.45;
      if (this.smoothed > this.peak) this.peak = this.smoothed;

      const warmedUp = performance.now() - this.startedAt > WARMUP_MS;
      if (warmedUp && this.smoothed >= ACTIVE_FLOOR) {
        this.activeSum += this.smoothed;
        this.activeCount += 1;
      }

      const live = Math.round(this.smoothed);
      const peak = Math.round(this.peak);
      const average = this.getAverage();
      const isWhisper = peak > 0 && peak < WHISPER_CEILING;

      if (this.onUpdate) this.onUpdate({ live, peak, average, isWhisper, activeCount: this.activeCount });
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

  function ensureOverlay() {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'scream-volume-root';
    overlay.innerHTML = `
      <div class="sv-backdrop" data-sv-cancel></div>
      <div class="sv-card" role="dialog" aria-modal="true" aria-label="Scream to set volume">
        <div class="sv-kicker">YOUR SCREAM AVERAGE BECOMES THE VOLUME</div>
        <h2 class="sv-title">🎤 SCREAM NOW!!!</h2>
        <p class="sv-sub">Louder you scream → higher the volume. Silence is ignored in the average.</p>
        <div class="sv-grid">
          <div><span>CURRENT</span><strong class="sv-from">—</strong></div>
          <div><span>AVG → VOLUME</span><strong class="sv-avg">0%</strong></div>
          <div><span>LIVE</span><strong class="sv-live">0</strong></div>
          <div><span>PEAK</span><strong class="sv-peak">0</strong></div>
        </div>
        <div class="sv-meter"><div class="sv-meter-fill"></div></div>
        <div class="sv-level"><span class="sv-level-emoji">😐</span> <span class="sv-level-text">Calm</span></div>
        <p class="sv-quote">Waiting for your unnecessary vocal performance...</p>
        <p class="sv-status">ANALYZING VOCAL INTENSITY...</p>
        <p class="sv-privacy">Audio stays on this device. Recordings are never stored.</p>
        <button type="button" class="sv-cancel" data-sv-cancel>Cancel</button>
      </div>
    `;
    const mount = document.documentElement || document.body;
    mount.appendChild(overlay);
    overlay.querySelectorAll('[data-sv-cancel]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        cancelScream();
      });
    });
    return overlay;
  }

  function showOverlay(current) {
    const root = ensureOverlay();
    root.classList.add('sv-visible');
    root.querySelector('.sv-from').textContent = `${current}%`;
    root.querySelector('.sv-avg').textContent = '0%';
    root.querySelector('.sv-live').textContent = '0';
    root.querySelector('.sv-peak').textContent = '0';
    root.querySelector('.sv-meter-fill').style.width = '0%';
    root.querySelector('.sv-status').textContent = 'SCREAM NOW — volume will match your average';
    root.querySelector('.sv-title').textContent = '🎤 SCREAM NOW!!!';
    lastQuoteBand = '';
    lastQuoteAt = 0;
    lastAverage = 0;
    const label = intensityLabel(0);
    root.querySelector('.sv-level-emoji').textContent = label.emoji;
    root.querySelector('.sv-level-text').textContent = label.text;
    root.querySelector('.sv-quote').textContent = trollQuoteFor(0, true);
  }

  function hideOverlay() {
    if (overlay) overlay.classList.remove('sv-visible');
  }

  function updateOverlay({ live, peak, average }) {
    if (!overlay) return;
    lastAverage = average;
    const score = Math.max(live, average);
    const label = intensityLabel(score);
    const quote = trollQuoteFor(score, false);
    overlay.querySelector('.sv-live').textContent = String(live);
    overlay.querySelector('.sv-peak').textContent = String(peak);
    overlay.querySelector('.sv-avg').textContent = `${average}%`;
    overlay.querySelector('.sv-meter-fill').style.width = `${Math.max(live, average)}%`;
    overlay.querySelector('.sv-level-emoji').textContent = label.emoji;
    overlay.querySelector('.sv-level-text').textContent = label.text;
    overlay.querySelector('.sv-quote').textContent = quote;
    overlay.querySelector('.sv-status').textContent =
      average > 0
        ? `Scream avg ${average}% → this will be the volume`
        : `Live ${live}/100 — keep screaming…`;
  }

  async function startScreamFlow({ current }) {
    if (busy) return;
    if (!enabled) {
      postToPage('CANCEL_VOLUME');
      return;
    }
    busy = true;
    showOverlay(current);

    analyzer = new ScreamAnalyzer();
    try {
      await analyzer.start((reading) => updateOverlay(reading));
    } catch (err) {
      if (overlay) {
        overlay.querySelector('.sv-status').textContent =
          err.name === 'NotAllowedError'
            ? 'Microphone blocked — click the lock icon in the address bar → allow mic, then try again.'
            : `Microphone error: ${err.message}`;
        overlay.querySelector('.sv-quote').textContent = 'No mic, no scream, no volume. Tragic.';
      }
      clearTimeout(screamTimer);
      screamTimer = setTimeout(() => {
        postToPage('CANCEL_VOLUME');
        hideOverlay();
        busy = false;
      }, 2800);
      return;
    }

    clearTimeout(screamTimer);
    screamTimer = setTimeout(finishScream, LISTEN_MS);
  }

  async function finishScream() {
    clearTimeout(screamTimer);
    if (!analyzer) {
      busy = false;
      return;
    }
    const result = await analyzer.stop();
    analyzer = null;

    // Prefer active-scream average; fall back to last UI average / peak
    let volumeLevel = result.average;
    if (result.activeCount < 8) {
      // Not enough sustained sound — use peak if they did scream briefly
      volumeLevel = result.peak >= MIN_AVERAGE ? Math.round(result.peak * 0.85) : 0;
    }
    volumeLevel = Math.max(0, Math.min(100, volumeLevel || lastAverage));

    const whisper = result.peak < WHISPER_CEILING && volumeLevel < WHISPER_CEILING;

    if (whisper || volumeLevel < MIN_AVERAGE) {
      if (overlay) {
        overlay.querySelector('.sv-title').textContent = '🤫 TOO QUIET';
        overlay.querySelector('.sv-quote').textContent = pick(TROLL_QUOTES.silent.concat(TROLL_QUOTES.calm));
        overlay.querySelector('.sv-status').textContent =
          'Not enough scream. Volume unchanged. Louder + longer.';
      }
      postToPage('CANCEL_VOLUME');
      setTimeout(() => {
        notifyAfterScream(Math.max(volumeLevel, 2), { success: false });
      }, 900);
      return;
    }

    if (overlay) {
      const label = intensityLabel(volumeLevel);
      overlay.querySelector('.sv-title').textContent = '🔥 VOLUME SET';
      overlay.querySelector('.sv-avg').textContent = `${volumeLevel}%`;
      overlay.querySelector('.sv-meter-fill').style.width = `${volumeLevel}%`;
      overlay.querySelector('.sv-level-emoji').textContent = label.emoji;
      overlay.querySelector('.sv-level-text').textContent = label.text;
      overlay.querySelector('.sv-quote').textContent = trollQuoteFor(volumeLevel, true);
      overlay.querySelector('.sv-status').textContent = `Volume set to ${volumeLevel}% from your scream.`;
    }

    // Apply and re-apply so YouTube can't instantly overwrite
    postToPage('APPLY_VOLUME', { volume: volumeLevel });
    setTimeout(() => postToPage('APPLY_VOLUME', { volume: volumeLevel }), 120);
    setTimeout(() => postToPage('APPLY_VOLUME', { volume: volumeLevel }), 400);
    setTimeout(() => postToPage('APPLY_VOLUME', { volume: volumeLevel }), 900);

    setTimeout(() => {
      notifyAfterScream(volumeLevel, { success: true });
    }, 900);
  }

  async function cancelScream() {
    clearTimeout(screamTimer);
    if (analyzer) {
      try {
        await analyzer.stop();
      } catch (_) {}
      analyzer = null;
    }
    postToPage('CANCEL_VOLUME');
    hideOverlay();
    busy = false;
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
