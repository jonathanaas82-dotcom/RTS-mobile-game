/**
 * Procedural sound effects with the Web Audio API (no audio files needed). Every sound is a few
 * oscillators / filtered noise bursts with an envelope. Identical sounds are throttled so big
 * battles don't turn into noise. Music is only a hook for now (see `music`).
 */
export type SoundName =
  | 'click'
  | 'select'
  | 'command'
  | 'error'
  | 'hit'
  | 'arrow'
  | 'death'
  | 'built'
  | 'trained'
  | 'ageUp'
  | 'power'
  | 'alert'
  | 'victory'
  | 'defeat'
  | 'gather';

const MIN_GAP_MS: Partial<Record<SoundName, number>> = {
  hit: 70,
  arrow: 90,
  death: 120,
  gather: 400,
  trained: 300,
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SoundName, number>();
  private volume = 0.8;
  private muted = false;

  /** Must be called from a user gesture at least once (browser autoplay rules). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.applyVolume();
    // One second of white noise, reused by all noisy sounds.
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
  }

  setVolume(v: number, muted: boolean): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.muted = muted;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.5;
  }

  play(name: SoundName, gain = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.volume <= 0) return;
    const now = performance.now();
    const gap = MIN_GAP_MS[name] ?? 40;
    if (now - (this.last.get(name) ?? -1e9) < gap) return;
    this.last.set(name, now);
    const t = ctx.currentTime;
    switch (name) {
      case 'click':
        this.tone(880, t, 0.05, 'triangle', 0.25 * gain);
        break;
      case 'select':
        this.tone(660, t, 0.06, 'sine', 0.3 * gain);
        this.tone(990, t + 0.05, 0.07, 'sine', 0.25 * gain);
        break;
      case 'command':
        this.tone(520, t, 0.06, 'triangle', 0.25 * gain);
        break;
      case 'error':
        this.tone(140, t, 0.18, 'square', 0.15 * gain);
        break;
      case 'hit':
        this.noiseBurst(t, 0.06, 1800, 'bandpass', 0.25 * gain);
        break;
      case 'arrow':
        this.noiseBurst(t, 0.12, 3500, 'highpass', 0.12 * gain);
        break;
      case 'death':
        this.sweep(300, 90, t, 0.25, 'sawtooth', 0.12 * gain);
        break;
      case 'built':
        [523, 659, 784].forEach((f, i) =>
          this.tone(f, t + i * 0.08, 0.18, 'triangle', 0.25 * gain),
        );
        break;
      case 'trained':
        this.tone(440, t, 0.1, 'triangle', 0.2 * gain);
        this.tone(660, t + 0.06, 0.12, 'triangle', 0.18 * gain);
        break;
      case 'gather':
        this.tone(1200, t, 0.03, 'sine', 0.08 * gain);
        break;
      case 'ageUp':
        [392, 523, 659, 784, 1047].forEach((f, i) =>
          this.tone(f, t + i * 0.11, 0.35, 'triangle', 0.25 * gain),
        );
        break;
      case 'power':
        this.noiseBurst(t, 0.9, 260, 'lowpass', 0.5 * gain);
        this.sweep(900, 120, t, 0.35, 'sawtooth', 0.1 * gain);
        break;
      case 'alert':
        this.tone(330, t, 0.22, 'sawtooth', 0.15 * gain);
        this.tone(247, t + 0.25, 0.3, 'sawtooth', 0.15 * gain);
        break;
      case 'victory':
        [523, 659, 784, 1047, 1319].forEach((f, i) =>
          this.tone(f, t + i * 0.14, 0.5, 'triangle', 0.25 * gain),
        );
        break;
      case 'defeat':
        [392, 349, 311, 262].forEach((f, i) =>
          this.tone(f, t + i * 0.22, 0.5, 'sine', 0.25 * gain),
        );
        break;
    }
  }

  private envelope(g: GainNode, t: number, dur: number, peak: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, peak: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    this.envelope(g, t, dur, peak);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private sweep(
    f0: number,
    f1: number,
    t: number,
    dur: number,
    type: OscillatorType,
    peak: number,
  ): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.envelope(g, t, dur, peak);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(
    t: number,
    dur: number,
    freq: number,
    type: BiquadFilterType,
    peak: number,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    this.envelope(g, t, dur, peak);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /**
   * Music hook: call with a track id ('menu', 'peace', 'battle', 'victory'). No music ships yet;
   * plug a streaming <audio> element or AudioBuffer player in here later.
   */
  music(_track: 'menu' | 'peace' | 'battle' | 'victory' | null): void {
    // Intentionally empty (hook only).
  }
}

export const sfx = new Sfx();
