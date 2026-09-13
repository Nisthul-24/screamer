/**
 * Synthesized sound effects (no copyrighted audio).
 */

export class SoundFX {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  setEnabled(on) {
    this.enabled = !!on;
  }

  _ctx() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  _tone(freq, duration, type = 'sine', gain = 0.08, startAt = 0) {
    if (!this.enabled) return;
    const ctx = this._ctx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime + startAt;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  warning() {
    this._tone(880, 0.12, 'square', 0.06);
    this._tone(660, 0.18, 'square', 0.05, 0.12);
    this._tone(990, 0.22, 'sawtooth', 0.04, 0.28);
  }

  success() {
    this._tone(523, 0.1, 'sine', 0.07);
    this._tone(659, 0.1, 'sine', 0.07, 0.1);
    this._tone(784, 0.18, 'sine', 0.08, 0.2);
  }

  fail() {
    this._tone(220, 0.25, 'sawtooth', 0.06);
    this._tone(165, 0.35, 'triangle', 0.05, 0.15);
  }

  achievement() {
    this._tone(523, 0.08, 'sine', 0.06);
    this._tone(659, 0.08, 'sine', 0.06, 0.09);
    this._tone(784, 0.08, 'sine', 0.06, 0.18);
    this._tone(1046, 0.2, 'sine', 0.07, 0.28);
  }

  cooldown() {
    this._tone(180, 0.4, 'sine', 0.04);
    this._tone(140, 0.5, 'triangle', 0.03, 0.2);
  }
}
