/**
 * Core state machine for scream-gated volume control.
 *
 * IDLE → REQUESTED → SCREAMING → SUCCESS|FAILED → COOLDOWN → IDLE
 *                                              ↘ IDLE (on fail)
 */

export const AppState = Object.freeze({
  IDLE: 'IDLE',
  REQUESTED: 'REQUESTED',
  SCREAMING: 'SCREAMING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  COOLDOWN: 'COOLDOWN',
  ERROR: 'ERROR'
});

/**
 * Required scream score based on absolute volume delta.
 */
export function requiredScreamForDelta(delta) {
  const d = Math.abs(delta);
  if (d <= 0) return 0;
  if (d <= 5) return 30;
  if (d <= 10) return 40;
  if (d <= 20) return 60;
  if (d <= 30) return 75;
  if (d <= 40) return 90;
  return 100;
}

/**
 * Security level label from volume delta.
 */
export function securityLevelForDelta(delta) {
  const d = Math.abs(delta);
  if (d <= 5) return 'LOW';
  if (d <= 10) return 'MEDIUM';
  if (d <= 20) return 'HIGH';
  return 'EXTREME';
}

/**
 * Intensity / "anger" classification (not real emotion detection).
 */
export function intensityLabel(score) {
  if (score <= 20) return { emoji: '😐', text: 'Calm' };
  if (score <= 40) return { emoji: '🙂', text: 'Mildly annoyed' };
  if (score <= 60) return { emoji: '😠', text: 'Getting angry' };
  if (score <= 80) return { emoji: '🔥', text: 'Very angry' };
  if (score <= 95) return { emoji: '💀', text: 'Absolutely furious' };
  return { emoji: '☢️', text: 'UNNECESSARY LEVELS OF ANGER' };
}

/**
 * AI Scream Coach lines (fake AI, real vibes).
 */
export function coachMessage(score) {
  if (score >= 100) {
    return pick([
      "I'M CALLING SOMEONE.",
      'Humanity has peaked. Please stop.',
      'MAXIMUM UNNECESSARY ENERGY DETECTED.'
    ]);
  }
  if (score >= 90) {
    return pick([
      'PLEASE STOP.',
      'That was… a lot.',
      'Your neighbors have filed a ticket.'
    ]);
  }
  if (score >= 70) {
    return pick([
      "YES! THAT'S THE ENERGY.",
      'Vocal authority confirmed.',
      'Now THAT is a scream.'
    ]);
  }
  if (score >= 40) {
    return pick([
      'Better. But you can do more.',
      'Warming up? Keep going.',
      'Almost angry enough.'
    ]);
  }
  return pick([
    'Come on. I believe in you.',
    'That was more of a polite cough.',
    'Your lungs called. They want overtime.'
  ]);
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function createMachine() {
  return {
    state: AppState.IDLE,
    actualVolume: 50,
    /** Slider intent only — does NOT become the volume. */
    requestedVolume: 50,
    peakScream: 0,
    liveScream: 0,
    /** Running average scream intensity → becomes the new volume. */
    averageScream: 0,
    direction: 'increase',
    securityLevel: 'LOW',
    whisperDetected: false,
    statusMessage: 'Waiting for an unnecessary volume adjustment...',
    errorMessage: null,
    cooldownRemaining: 0
  };
}
