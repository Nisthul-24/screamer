/**
 * Microphone scream analysis via Web Audio API.
 * Measures RMS loudness only — no speech recognition, no recordings saved.
 */

export class ScreamAnalyzer {
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
    this.sensitivity = 1.0;
    this.deviceId = '';
  }

  async listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  async start({ deviceId = '', sensitivity = 1.0, onUpdate } = {}) {
    if (this.running) await this.stop();

    this.sensitivity = sensitivity;
    this.deviceId = deviceId || '';
    this.onUpdate = onUpdate || null;
    this.smoothed = 0;
    this.peak = 0;
    this.sampleSum = 0;
    this.sampleCount = 0;

    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : {})
      }
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
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

    // RMS amplitude
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / buffer.length);

    // Peak sample in window
    let peakSample = 0;
    for (let i = 0; i < buffer.length; i++) {
      const a = Math.abs(buffer[i]);
      if (a > peakSample) peakSample = a;
    }

    // Blend RMS + peak; calibrate so talking is low, screaming is high
    const raw = Math.max(rms * 3.2, peakSample * 1.6) * this.sensitivity;
    // Nonlinear curve: quiet stays quiet, loud screams climb fast
    let score = Math.min(100, Math.pow(Math.min(1, raw * 2.8), 0.72) * 100);

    // Ignore tiny accidental blips in the live meter
    if (score < 4) score = 0;

    // Smooth meter
    this.smoothed = this.smoothed * 0.72 + score * 0.28;
    if (this.smoothed > this.peak) this.peak = this.smoothed;

    // Running average over the whole listen window (silence pulls it down —
    // sustained screaming raises the resulting volume).
    this.sampleSum += this.smoothed;
    this.sampleCount += 1;

    const live = Math.round(this.smoothed);
    const peak = Math.round(this.peak);
    const average = this.getAverage();
    const isWhisper = live > 0 && live < 12 && this.peak < 18;

    if (this.onUpdate) {
      this.onUpdate({ live, peak, average, isWhisper, rawRms: rms });
    }

    this.rafId = requestAnimationFrame(() => this._tick());
  }

  getAverage() {
    if (!this.sampleCount) return 0;
    return Math.round(this.sampleSum / this.sampleCount);
  }

  async stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch { /* ignore */ }
      this.source = null;
    }
    if (this.audioContext) {
      try { await this.audioContext.close(); } catch { /* ignore */ }
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.analyser = null;

    const result = {
      peak: Math.round(this.peak),
      live: Math.round(this.smoothed),
      average: this.getAverage()
    };
    this.smoothed = 0;
    this.sampleSum = 0;
    this.sampleCount = 0;
    return result;
  }

  getPeak() {
    return Math.round(this.peak);
  }

  resetPeak() {
    this.peak = 0;
    this.smoothed = 0;
    this.sampleSum = 0;
    this.sampleCount = 0;
  }
}
