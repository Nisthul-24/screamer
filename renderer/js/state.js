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
 * AI Scream Coach lines (fake AI, real vibes) — troll quotes by scream level.
 */
export function coachMessage(score) {
  if (score >= 96) {
    return pick([
      "☢️ I’M CALLING SOMEONE.",
      'Humanity has peaked. Please hydrate.',
      'Your scream broke the fourth wall.',
      'MAXIMUM UNNECESSARY ENERGY DETECTED.'
    ]);
  }
  if (score >= 81) {
    return pick([
      '💀 Absolutely unhinged. Respect.',
      'The neighbors have formed a committee.',
      'Who hurt you? (besides this app)',
      'PLEASE STOP. (jk keep going)'
    ]);
  }
  if (score >= 61) {
    return pick([
      "🔥 THERE it is. Chaotic good energy.",
      'Your throat just filed a complaint.',
      'YouTube would fear you. The PC already does.',
      'Unnecessary? Yes. Effective? Also yes.'
    ]);
  }
  if (score >= 41) {
    return pick([
      '😠 Okay, now you’re mildly unhinged.',
      'Neighbors: “is everything okay?”',
      'Getting spicy. Keep going.',
      'Almost angry enough for premium volume.'
    ]);
  }
  if (score >= 21) {
    return pick([
      '🙂 Mildly annoyed. The computer yawned.',
      'That barely scared a mosquito.',
      'Warm-up scream. Where’s the main event?',
      'You’re negotiating with the volume. Stop.'
    ]);
  }
  if (score > 3) {
    return pick([
      '😐 That was a polite sigh, not a scream.',
      'Library energy detected. Wrong app.',
      'Try using lungs. Optional but recommended.',
      'Come on. I believe in you. Barely.'
    ]);
  }
  return pick([
    'Hello? Is this thing on?',
    'Even your keyboard clicks are louder.',
    'Silence is not a volume strategy.',
    'Waiting for your unnecessary vocal performance...'
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
