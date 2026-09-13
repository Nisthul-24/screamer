/**
 * Funny / system / coach message banks.
 */

import { pick } from './state.js';

export const FAIL_MESSAGES = [
  'That was pathetic. 💀',
  'LOUDER.',
  "I've heard louder from a mosquito.",
  'Your scream has been rejected.',
  'The computer is not impressed.',
  'Was that even a scream?',
  'Try using your lungs next time.',
  'Your ancestors are disappointed.',
  'Volume denied.',
  'Insufficient rage detected.'
];

export const SUCCESS_MESSAGES = [
  "THAT'S MORE LIKE IT.",
  'Volume set to your scream average.',
  'ABSOLUTE POWER.',
  'The computer respects you now.',
  'Your lungs chose the volume.',
  'That was unnecessarily aggressive.',
  'Approved by the Scream Authority.',
  'Your lungs have spoken.'
];

export const COOLDOWN_MESSAGES = [
  'Please recover your dignity.',
  'Vocal system overheating.',
  'Your neighbors have been notified.',
  'Allowing your lungs to respawn...',
  'Touch grass while you wait.'
];

export function failMessage(funny) {
  return funny ? pick(FAIL_MESSAGES) : 'Scream insufficient. Try again.';
}

export function successMessage(funny) {
  return funny ? pick(SUCCESS_MESSAGES) : 'Vocal authorization accepted.';
}

export function cooldownMessage(funny) {
  return funny ? pick(COOLDOWN_MESSAGES) : 'Recharging vocal system...';
}

export function directionCopy(increasing) {
  if (increasing) {
    return {
      title: 'SCREAM TO SET VOLUME',
      subtitle: 'You don’t pick the number — your average scream does.'
    };
  }
  return {
    title: 'SCREAM TO SET VOLUME',
    subtitle: 'Want it quieter? Scream quieter. (Yes, really.)'
  };
}
