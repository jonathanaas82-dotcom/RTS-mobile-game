import { Music, type Track } from './Music';

/**
 * Procedural audio with the Web Audio API (no audio files needed): one-shot sound effects built
 * from oscillators and filtered noise, a generative music player (see `Music`) and an ambient bed
 * (wind and birdsong). Identical sounds are throttled so big battles don't turn into noise, and
 * positional sounds are panned and attenuated by the caller (see WorldScene).
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
  | 'gather'
  // Worker activity.
  | 'chop'
  | 'mine'
  | 'hammer'
  | 'hoe'
  | 'pick'
  | 'plop'
  | 'splash'
  | 'treeFall'
  | 'charge';

const MIN_GAP_MS: Partial<Record<SoundName, number>> = {
  hit: 70,
  arrow: 90,
  death: 120,
  gather: 250,
  trained: 300,
  chop: 70,
  mine: 70,
  hammer: 70,
  hoe: 110,
  pick: 160,
  plop: 200,
  splash: 300,
  treeFall: 400,
  charge: 250,
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly last = new Map<SoundName, number>();
  private volume = 0.8;
  private muted = false;
  private musicOn = true;
  private readonly musicPlayer = new Music();
  private wantTrack: Track | null = null;
  private wantAmbience = false;
  private wind: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private birdTimer = 0;
  /** Output node for the sound currently being built (set per play call). */
  private out: AudioNode | null = null;

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
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.6;
    this.ambBus.connect(this.master);
    // Two seconds of white noise, reused by all noisy sounds and the wind.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    this.musicPlayer.attach(ctx, this.master);
    this.applyVolume();
    this.music(this.wantTrack);
    this.ambience(this.wantAmbience);
  }

  setVolume(v: number, muted: boolean, music = this.musicOn): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.muted = muted;
    this.musicOn = music;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.5;
    this.musicPlayer.setLevel(this.musicOn ? 0.32 : 0);
  }

  /**
   * Play a one-shot sound. `gain` scales loudness (callers attenuate by distance) and `pan`
   * (-1 left … 1 right) places it in the stereo field.
   */
  play(name: SoundName, gain = 1, pan = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.muted || this.volume <= 0 || gain <= 0.02) return;
    const now = performance.now();
    const gap = MIN_GAP_MS[name] ?? 40;
    if (now - (this.last.get(name) ?? -1e9) < gap) return;
    this.last.set(name, now);
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.sfxBus);
      this.out = p;
    } else this.out = this.sfxBus;
    const t = ctx.currentTime;
    // Small random pitch variation keeps repeated sounds from sounding mechanical.
    const r = 0.92 + Math.random() * 0.16;
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
        // Thud of the blow plus, sometimes, a ringing metal clash.
        this.noiseBurst(t, 0.06, 1500 * r, 'bandpass', 0.28 * gain);
        if (Math.random() < 0.5) {
          this.tone(2100 * r, t, 0.16, 'sine', 0.05 * gain);
          this.tone(3150 * r, t, 0.1, 'sine', 0.03 * gain);
        }
        break;
      case 'arrow':
        this.noiseBurst(t, 0.12, 3500, 'highpass', 0.12 * gain);
        break;
      case 'death':
        this.sweep(300 * r, 90, t, 0.25, 'sawtooth', 0.1 * gain);
        this.noiseBurst(t + 0.05, 0.18, 400, 'lowpass', 0.3 * gain);
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
        // Goods dropped at a store: a soft double tick.
        this.tone(1180 * r, t, 0.04, 'sine', 0.07 * gain);
        this.tone(1580 * r, t + 0.05, 0.05, 'sine', 0.05 * gain);
        break;
      case 'chop':
        // Axe into wood: a pitched thump, a woody knock and a bite of high click.
        this.sweep(170 * r, 70, t, 0.1, 'sine', 0.45 * gain);
        this.noiseBurst(t, 0.07, 850 * r, 'bandpass', 0.4 * gain);
        this.noiseBurst(t, 0.015, 3200, 'highpass', 0.15 * gain);
        break;
      case 'mine':
        // Pick on rock: inharmonic metallic clink over a gritty crack.
        this.tone(2350 * r, t, 0.22, 'sine', 0.09 * gain);
        this.tone(3720 * r, t, 0.14, 'sine', 0.06 * gain);
        this.noiseBurst(t, 0.03, 4200, 'highpass', 0.22 * gain);
        this.noiseBurst(t, 0.06, 700, 'bandpass', 0.18 * gain);
        break;
      case 'hammer':
        this.sweep(340 * r, 210, t, 0.07, 'triangle', 0.3 * gain);
        this.noiseBurst(t, 0.05, 1500 * r, 'bandpass', 0.28 * gain);
        break;
      case 'hoe':
        // Blade into soil: a soft scrape with a dull thud.
        this.noiseBurst(t, 0.15, 650 * r, 'bandpass', 0.24 * gain);
        this.sweep(120, 70, t, 0.06, 'sine', 0.18 * gain);
        break;
      case 'pick':
        // Rustling leaves and a tiny pop as a berry comes off.
        this.noiseBurst(t, 0.12, 2600 * r, 'highpass', 0.07 * gain);
        this.tone(900 * r, t + 0.06, 0.03, 'sine', 0.05 * gain);
        break;
      case 'plop':
        this.sweep(720 * r, 240, t, 0.09, 'sine', 0.16 * gain);
        this.noiseBurst(t, 0.12, 1100, 'lowpass', 0.1 * gain);
        break;
      case 'splash':
        this.noiseBurst(t, 0.32, 1000 * r, 'bandpass', 0.24 * gain);
        this.sweep(600 * r, 180, t, 0.12, 'sine', 0.12 * gain);
        break;
      case 'treeFall':
        // Creak, then the crash of the canopy.
        this.sweep(140 * r, 90, t, 0.35, 'sawtooth', 0.05 * gain);
        this.noiseBurst(t + 0.3, 0.5, 700, 'lowpass', 0.35 * gain);
        this.noiseBurst(t + 0.3, 0.3, 2400, 'bandpass', 0.12 * gain);
        break;
      case 'charge':
        // Hooves and impact: a deep double thump with a rush of air.
        this.sweep(110 * r, 45, t, 0.18, 'sine', 0.5 * gain);
        this.sweep(130 * r, 50, t + 0.07, 0.16, 'sine', 0.35 * gain);
        this.noiseBurst(t, 0.22, 500, 'lowpass', 0.3 * gain);
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
    o.connect(g).connect(this.out!);
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
    o.connect(g).connect(this.out!);
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
    src.connect(f).connect(g).connect(this.out!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** Switch the generative music track (null = silence). Remembered until audio unlocks. */
  music(track: Track | null): void {
    this.wantTrack = track;
    if (this.ctx) this.musicPlayer.play(track);
  }

  get track(): Track | null {
    return this.wantTrack;
  }

  /** Ambient bed for the battlefield: gusting wind and occasional birdsong. */
  ambience(on: boolean): void {
    this.wantAmbience = on;
    const ctx = this.ctx;
    if (!ctx || !this.ambBus || !this.noise) return;
    if (on && !this.wind) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(0.03, ctx.currentTime + 2);
      // Slow gusts: an LFO swells the wind and opens the filter a little.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.018;
      lfo.connect(lfoGain).connect(gain.gain);
      const lfoF = ctx.createGain();
      lfoF.gain.value = 160;
      lfo.connect(lfoF).connect(lp.frequency);
      src.connect(lp).connect(gain).connect(this.ambBus);
      src.start();
      lfo.start();
      src.onended = () => lfo.stop();
      this.wind = { src, gain };
      this.scheduleBird();
    } else if (!on && this.wind) {
      const w = this.wind;
      this.wind = null;
      w.gain.gain.cancelScheduledValues(ctx.currentTime);
      w.gain.gain.setValueAtTime(Math.max(0.0001, w.gain.gain.value), ctx.currentTime);
      w.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1);
      w.src.stop(ctx.currentTime + 1.1);
      window.clearTimeout(this.birdTimer);
    }
  }

  private scheduleBird(): void {
    window.clearTimeout(this.birdTimer);
    this.birdTimer = window.setTimeout(
      () => {
        if (!this.wind) return;
        // Birds fall silent while the battle music plays.
        if (this.wantTrack !== 'battle') this.bird();
        this.scheduleBird();
      },
      3500 + Math.random() * 7000,
    );
  }

  /** A short trill: two to four quick upward-gliding chirps, panned somewhere random. */
  private bird(): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambBus || this.muted) return;
    const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    if (pan) {
      pan.pan.value = Math.random() * 1.6 - 0.8;
      pan.connect(this.ambBus);
    }
    const out = pan ?? this.ambBus;
    const base = 2300 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 3);
    let t = ctx.currentTime + 0.05;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.15), t);
      o.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.07);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.12);
      t += 0.11 + Math.random() * 0.06;
    }
  }
}

export const sfx = new Sfx();
