/**
 * Content script — scream overlay + mic analysis.
 * Talks to inject.js (page world) via window.postMessage.
 */

(function () {
  const PAGE = 'scream-volume-page';
  const EXT = 'scream-volume-ext';
  const LISTEN_MS = 2800;
  const MIN_AVERAGE = 5;
  const WHISPER_CEILING = 18;

  let overlay = null;
  let analyzer = null;
  let screamTimer = null;
  let busy = false;
  let enabled = true;

  // Load enabled flag
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
    if (document.documentElement.dataset.screamHook === '1') return;
    document.documentElement.dataset.screamHook = '1';
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  }

  injectPageHook();
  // Re-inject if SPA replaces document early
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPageHook, { once: true });
  }

  function postToPage(type, payload = {}) {
    window.postMessage({ source: EXT, type, ...payload }, '*');
  }

  /* ---------- Scream analyzer (inline, no modules in content script) ---------- */

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
      this.sampleSum = 0;
      this.sampleCount = 0;
      this.onUpdate = null;
    }

    async start(onUpdate) {
      if (this.running) await this.stop();
      this.onUpdate = onUpdate;
      this.smoothed = 0;
      this.peak = 0;
      this.sampleSum = 0;
      this.sampleCount = 0;

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.35;
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);
      this.running = true;
      this._tick();
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
      const raw = Math.max(rms * 3.2, peakSample * 1.6);
      let score = Math.min(100, Math.pow(Math.min(1, raw * 2.8), 0.72) * 100);
      if (score < 4) score = 0;

      this.smoothed = this.smoothed * 0.72 + score * 0.28;
      if (this.smoothed > this.peak) this.peak = this.smoothed;
      this.sampleSum += this.smoothed;
      this.sampleCount += 1;

      const live = Math.round(this.smoothed);
      const peak = Math.round(this.peak);
      const average = this.sampleCount ? Math.round(this.sampleSum / this.sampleCount) : 0;
      const isWhisper = live > 0 && live < 12 && this.peak < 18;

      if (this.onUpdate) this.onUpdate({ live, peak, average, isWhisper });
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
      const average = this.sampleCount ? Math.round(this.sampleSum / this.sampleCount) : 0;
      const peak = Math.round(this.peak);
      this.sampleSum = 0;
      this.sampleCount = 0;
      return { average, peak };
    }
  }

  /* ---------- Overlay UI ---------- */

  function ensureOverlay() {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'scream-volume-root';
    overlay.innerHTML = `
      <div class="sv-backdrop" data-sv-cancel></div>
      <div class="sv-card" role="dialog" aria-modal="true" aria-label="Scream to set volume">
        <div class="sv-kicker">YOUR SCREAM AVERAGE BECOMES THE VOLUME</div>
        <h2 class="sv-title">🎤 SCREAM NOW!!!</h2>
        <p class="sv-sub">You don’t pick the number — your average scream does.</p>
        <div class="sv-grid">
          <div><span>CURRENT</span><strong class="sv-from">—</strong></div>
          <div><span>AVG → VOLUME</span><strong class="sv-avg">0%</strong></div>
          <div><span>LIVE</span><strong class="sv-live">0</strong></div>
          <div><span>PEAK</span><strong class="sv-peak">0</strong></div>
        </div>
        <div class="sv-meter"><div class="sv-meter-fill"></div></div>
        <p class="sv-status">ANALYZING VOCAL INTENSITY...</p>
        <p class="sv-privacy">Audio stays on this device. Recordings are never stored.</p>
        <button type="button" class="sv-cancel" data-sv-cancel>Cancel</button>
      </div>
    `;
    const mount = document.documentElement || document.body;
    mount.appendChild(overlay);
    overlay.querySelectorAll('[data-sv-cancel]').forEach((el) => {
      el.addEventListener('click', cancelScream);
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
    root.querySelector('.sv-status').textContent = 'ANALYZING VOCAL INTENSITY...';
    root.querySelector('.sv-title').textContent = '🎤 SCREAM NOW!!!';
  }

  function hideOverlay() {
    if (overlay) overlay.classList.remove('sv-visible');
  }

  function updateOverlay({ live, peak, average }) {
    if (!overlay) return;
    overlay.querySelector('.sv-live').textContent = String(live);
    overlay.querySelector('.sv-peak').textContent = String(peak);
    overlay.querySelector('.sv-avg').textContent = `${average}%`;
    overlay.querySelector('.sv-meter-fill').style.width = `${average}%`;
  }

  async function startScreamFlow({ current }) {
    if (busy || !enabled) {
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
            ? 'Microphone blocked — allow mic access for this site, then try again.'
            : `Microphone error: ${err.message}`;
      }
      clearTimeout(screamTimer);
      screamTimer = setTimeout(() => {
        postToPage('CANCEL_VOLUME');
        hideOverlay();
        busy = false;
      }, 2200);
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

    const average = result.average;
    const whisper = result.peak < WHISPER_CEILING && average < WHISPER_CEILING;

    if (whisper || average < MIN_AVERAGE) {
      if (overlay) {
        overlay.querySelector('.sv-title').textContent = '🤫 TOO QUIET';
        overlay.querySelector('.sv-status').textContent =
          'That is not a scream. Volume unchanged. Try again louder.';
      }
      postToPage('CANCEL_VOLUME');
      setTimeout(() => {
        hideOverlay();
        busy = false;
      }, 1800);
      return;
    }

    if (overlay) {
      overlay.querySelector('.sv-title').textContent = '🔥 VOLUME SET';
      overlay.querySelector('.sv-status').textContent = `Volume set to ${average}% (scream average).`;
    }
    postToPage('APPLY_VOLUME', { volume: average });
    setTimeout(() => {
      hideOverlay();
      busy = false;
    }, 1200);
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
        // Pass through: unlock and let user control normally — request re-apply via cancel then...
        // inject already blocked; tell it to apply requested without scream
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
