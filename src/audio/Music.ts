/**
 * Generative background music with the Web Audio API: a soft drone or pad chords under a
 * wandering harp-like melody, plus war drums for the battle track. Nothing is pre-recorded;
 * notes are scheduled a little ahead of time by a timer (the standard Web Audio lookahead
 * pattern) and each track fades in and out over a couple of seconds.
 */
export type Track = 'menu' | 'peace' | 'battle' | 'victory';

interface TrackDef {
  bpm: number;
  /** Scale as semitone offsets from the root. */
  scale: number[];
  /** Root note (MIDI). */
  root: number;
  /** Chord roots (scale degrees) cycling every `barsPerChord` bars. */
  chords: number[];
  barsPerChord: number;
  /** Chance a melody note plays on each eighth. */
  density: number;
  drums: boolean;
  /** Low plucked ostinato on every beat. */
  ostinato: boolean;
}

const TRACKS: Record<Track, TrackDef> = {
  // D dorian, slow and spacious.
  menu: {
    bpm: 62,
    scale: [0, 2, 3, 5, 7, 9, 10],
    root: 62,
    chords: [0, 3, 6, 4],
    barsPerChord: 2,
    density: 0.32,
    drums: false,
    ostinato: false,
  },
  // G major pentatonic feel, gentle and warm.
  peace: {
    bpm: 74,
    scale: [0, 2, 4, 7, 9],
    root: 67,
    chords: [0, 4, 2, 3],
    barsPerChord: 2,
    density: 0.38,
    drums: false,
    ostinato: false,
  },
  // E aeolian with drums and a driving low ostinato.
  battle: {
    bpm: 112,
    scale: [0, 2, 3, 5, 7, 8, 10],
    root: 64,
    chords: [0, 5, 6, 0],
    barsPerChord: 1,
    density: 0.42,
    drums: true,
    ostinato: true,
  },
  // Bright C major, triumphant.
  victory: {
    bpm: 84,
    scale: [0, 2, 4, 5, 7, 9, 11],
    root: 60,
    chords: [0, 3, 4, 0],
    barsPerChord: 1,
    density: 0.5,
    drums: true,
    ostinato: false,
  },
};

const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);

export class Music {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private level = 0.32;
  private current: { def: TrackDef; gain: GainNode; name: Track } | null = null;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private melody = 4;

  attach(ctx: AudioContext, out: AudioNode): void {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.level;
    // Gentle reverb-ish smear: a filtered feedback delay.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.31;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1800;
    this.bus.connect(out);
    this.bus.connect(delay);
    delay.connect(damp).connect(fb).connect(delay);
    fb.connect(out);
  }

  setLevel(v: number): void {
    this.level = v;
    if (this.bus && this.ctx)
      this.bus.gain.setTargetAtTime(Math.max(0.0001, v), this.ctx.currentTime, 0.3);
  }

  play(track: Track | null): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    if (this.current?.name === track) return;
    const now = ctx.currentTime;
    if (this.current) {
      const g = this.current.gain;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
      window.setTimeout(() => g.disconnect(), 2600);
      this.current = null;
    }
    window.clearInterval(this.timer);
    if (!track) return;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(1, now + 2.5);
    gain.connect(this.bus);
    this.current = { def: TRACKS[track], gain, name: track };
    this.nextTime = now + 0.1;
    this.step = 0;
    this.melody = 4;
    this.timer = window.setInterval(() => this.schedule(), 90);
  }

  /** Schedule all eighth-notes that fall within the lookahead window. */
  private schedule(): void {
    const ctx = this.ctx;
    const cur = this.current;
    if (!ctx || !cur) return;
    if (ctx.state !== 'running') {
      this.nextTime = ctx.currentTime + 0.1;
      return;
    }
    const eighth = 30 / cur.def.bpm;
    while (this.nextTime < ctx.currentTime + 0.35) {
      this.eighthNote(cur.def, cur.gain, this.nextTime, eighth);
      this.nextTime += eighth;
      this.step++;
    }
  }

  private note(def: TrackDef, degree: number, octave: number): number {
    const n = def.scale.length;
    const d = ((degree % n) + n) % n;
    const o = Math.floor(degree / n);
    return midi(def.root + (o + octave) * 12 + def.scale[d]!);
  }

  private eighthNote(def: TrackDef, out: GainNode, t: number, eighth: number): void {
    const s = this.step;
    const beat = s % 2 === 0;
    const bar = Math.floor(s / 8);
    const chord = def.chords[Math.floor(bar / def.barsPerChord) % def.chords.length]!;
    // Pad chord at the start of each chord change.
    if (s % (8 * def.barsPerChord) === 0) {
      const dur = eighth * 8 * def.barsPerChord;
      for (const k of [0, 2, 4]) this.pad(this.note(def, chord + k, -1), t, dur, out);
      this.pad(this.note(def, chord, -2), t, dur, out, 0.6);
    }
    if (def.ostinato && beat) {
      const pat = [0, 0, 2, 0];
      this.pluck(this.note(def, chord + pat[(s / 2) % 4]!, -2), t, eighth * 1.6, out, 0.5);
    }
    if (def.drums) {
      if (s % 8 === 0 || s % 8 === 5) this.drum(t, 1, out);
      else if (s % 8 === 4) this.drum(t, 0.7, out, true);
      else if (s % 4 === 2) this.shaker(t, out);
    }
    // Melody: a random walk over the scale, leaning towards chord tones on the beat.
    if (Math.random() < def.density * (beat ? 1.3 : 0.7)) {
      const stepBy = [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]!;
      this.melody = Math.max(0, Math.min(11, this.melody + stepBy));
      if (beat && Math.random() < 0.4)
        this.melody = chord + [0, 2, 4][Math.floor(Math.random() * 3)]!;
      const len = eighth * (Math.random() < 0.3 ? 4 : 2);
      this.pluck(this.note(def, this.melody, 0), t, len, out, 0.35);
    }
  }

  /** Harp/lute-like pluck: bright attack, warm decay. */
  private pluck(freq: number, t: number, dur: number, out: AudioNode, peak: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(700, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * 0.25, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
    for (const [mul, type, amp] of [
      [1, 'triangle', 1],
      [2, 'sine', 0.35],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mul;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + dur + 0.5);
    }
    f.connect(g).connect(out);
  }

  /** Soft string pad: two detuned saws through a low-pass with slow attack and release. */
  private pad(freq: number, t: number, dur: number, out: AudioNode, amp = 1): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 850;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035 * amp, t + Math.min(1.2, dur * 0.3));
    g.gain.setValueAtTime(0.035 * amp, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.8);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.9);
    }
    f.connect(g).connect(out);
  }

  /** War drum: a pitched sine thump (lighter "rim" variant for off-beats). */
  private drum(t: number, amp: number, out: AudioNode, high = false): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(high ? 190 : 120, t);
    o.frequency.exponentialRampToValueAtTime(high ? 90 : 48, t + 0.25);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4 * amp, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.4);
  }

  /** Short high tick that keeps time between drum hits. */
  private shaker(t: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'square';
    o.frequency.value = 5200 + Math.random() * 800;
    f.type = 'highpass';
    f.frequency.value = 4000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.025, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.06);
  }
}
