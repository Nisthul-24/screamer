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
  let lastApplied = -1;

  function markUserIntent() {
    userIntentUntil = Date.now() + 4000;
  }

  function looksLikeVolumeControl(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(
      [
        '.ytp-volume-area',
        '.ytp-volume-panel',
        '.ytp-mute-button',
        '.ytp-volume-slider',
        '.ytp-volume-slider-handle',
        '.ytp-volume-icon',
        '[class*="volume"]',
        '[class*="Volume"]',
        '[aria-label*="olume"]',
        '[aria-label*="Mute"]',
        '[aria-label*="Unmute"]',
        '[data-tooltip*="olume"]',
        'input[type="range"]'
      ].join(',')
    );
  }

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (looksLikeVolumeControl(e.target)) markUserIntent();
    },
    true
  );

  document.addEventListener(
    'pointermove',
    (e) => {
      // YouTube volume drag
      if (e.buttons && looksLikeVolumeControl(e.target)) markUserIntent();
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

  function setMediaVolume(el, vol01) {
    desc.set.call(el, vol01);
    try {
      if (vol01 > 0.001 && el.muted) el.muted = false;
    } catch (_) {}
    try {
      el.dispatchEvent(new Event('volumechange'));
    } catch (_) {}
  }

  function setYouTubePlayerVolume(percent) {
    try {
      const player =
        document.querySelector('#movie_player') ||
        document.querySelector('.html5-video-player');
      if (!player) return;
      if (typeof player.unMute === 'function') player.unMute();
      if (typeof player.setVolume === 'function') player.setVolume(percent);
    } catch (_) {}
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
        setMediaVolume(this, next);
        return;
      }

      const current = desc.get.call(this);
      if (Math.abs(current - next) < 0.002) {
        setMediaVolume(this, next);
        return;
      }

      // While locked in scream mode, ignore site trying to change volume
      if (locked) {
        return;
      }

      const userTrying = Date.now() <= userIntentUntil;
      if (!userTrying) {
        setMediaVolume(this, next);
        return;
      }

      // If site is syncing back to what we just applied, allow it
      if (lastApplied >= 0 && Math.abs(next * 100 - lastApplied) < 2) {
        setMediaVolume(this, next);
        return;
      }

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
      const percent = Math.max(0, Math.min(100, Math.round(Number(data.volume))));
      const vol = percent / 100;
      lastApplied = percent;
      bypass = true;
      try {
        setYouTubePlayerVolume(percent);
        const targets = new Set();
        if (pendingEl && pendingEl.isConnected) targets.add(pendingEl);
        document.querySelectorAll('video, audio').forEach((el) => targets.add(el));
        targets.forEach((el) => {
          try {
            setMediaVolume(el, vol);
          } catch (_) {}
        });
      } finally {
        bypass = false;
        locked = false;
        // Keep a short grace so YouTube UI sync doesn't re-trigger scream
        userIntentUntil = 0;
        pendingEl = null;
      }
      post('VOLUME_APPLIED', { volume: percent });
    }

    if (data.type === 'CANCEL_VOLUME') {
      locked = false;
      pendingEl = null;
      userIntentUntil = 0;
    }

    if (data.type === 'PING') {
      post('PONG', {});
    }
  });

  post('HOOK_READY', {});
})();
