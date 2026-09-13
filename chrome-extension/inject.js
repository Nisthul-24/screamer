/**
 * Runs in the PAGE world (not the extension isolated world).
 * Hooks HTMLMediaElement.volume so YouTube / Netflix / etc. are intercepted.
 */
(function () {
  if (window.__SCREAM_VOLUME_HOOKED__) return;
  window.__SCREAM_VOLUME_HOOKED__ = true;

  const SRC = 'scream-volume-page';
  const EXT = 'scream-volume-ext';
  const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  if (!desc || !desc.get || !desc.set) return;

  let bypass = false;
  let locked = false;
  let userIntentUntil = 0;
  let pendingEl = null;

  function markUserIntent() {
    userIntentUntil = Date.now() + 2500;
  }

  function looksLikeVolumeControl(el) {
    if (!el || !el.closest) return false;
    return !!el.closest([
      '.ytp-volume-area',
      '.ytp-volume-panel',
      '.ytp-mute-button',
      '.ytp-volume-slider',
      '.ytp-volume-slider-handle',
      '[class*="volume" i]',
      '[class*="Volume"]',
      '[aria-label*="olume" i]',
      '[aria-label*="Mute" i]',
      '[aria-label*="Unmute" i]',
      '[data-tooltip*="olume" i]',
      'input[type="range"]'
    ].join(','));
  }

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (looksLikeVolumeControl(e.target)) markUserIntent();
    },
    true
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'm' || e.key === 'M') markUserIntent();
    },
    true
  );

  document.addEventListener(
    'wheel',
    (e) => {
      if (looksLikeVolumeControl(e.target)) markUserIntent();
    },
    true
  );

  function post(type, payload) {
    window.postMessage({ source: SRC, type, ...payload }, '*');
  }

  Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
    configurable: true,
    enumerable: desc.enumerable,
    get() {
      return desc.get.call(this);
    },
    set(value) {
      const next = Math.max(0, Math.min(1, Number(value)));
      if (Number.isNaN(next)) return;

      if (bypass) {
        desc.set.call(this, next);
        return;
      }

      const current = desc.get.call(this);
      if (Math.abs(current - next) < 0.002) {
        desc.set.call(this, next);
        return;
      }

      // Allow programmatic sets (ads, autoplay init) unless user just touched volume UI
      const userTrying = Date.now() <= userIntentUntil;
      if (!userTrying || locked) {
        if (!locked) desc.set.call(this, next);
        return;
      }

      // Intercept user volume change — keep old volume, ask extension to scream
      locked = true;
      pendingEl = this;
      userIntentUntil = 0;
      post('VOLUME_REQUEST', {
        current: Math.round(current * 100),
        requested: Math.round(next * 100)
      });
    }
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== EXT) return;

    if (data.type === 'APPLY_VOLUME') {
      const vol = Math.max(0, Math.min(1, Number(data.volume) / 100));
      bypass = true;
      try {
        const targets = new Set();
        if (pendingEl && pendingEl.isConnected) targets.add(pendingEl);
        document.querySelectorAll('video, audio').forEach((el) => targets.add(el));
        targets.forEach((el) => {
          try {
            desc.set.call(el, vol);
            // Help YouTube UI stay roughly in sync
            el.dispatchEvent(new Event('volumechange'));
          } catch (_) {
            /* ignore */
          }
        });
      } finally {
        bypass = false;
        locked = false;
        pendingEl = null;
      }
      post('VOLUME_APPLIED', { volume: Math.round(vol * 100) });
    }

    if (data.type === 'CANCEL_VOLUME') {
      locked = false;
      pendingEl = null;
    }

    if (data.type === 'PING') {
      post('PONG', {});
    }
  });

  post('HOOK_READY', {});
})();
