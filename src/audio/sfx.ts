// Efectos de sonido sintetizados con Web Audio: sin archivos ni servicios externos.
// - El AudioContext se crea solo tras un gesto de la persona (unlock()).
// - Silenciar corta al instante (ganancia a 0 y se detienen las notas en curso).
// - Si no hay Web Audio, o el contexto está suspendido, simplemente no suena.
// - No hay música ni nada que suene por sí solo.

export type SoundName =
  | 'pet'
  | 'feed'
  | 'clean'
  | 'sleep'
  | 'jump'
  | 'point'
  | 'hit'
  | 'buy'
  | 'claim'
  | 'levelup'
  | 'move'
  | 'error'
  | 'tap';

export interface SoundPrefs {
  sound: boolean;
  volume: number;
}

type AudioCtor = new () => AudioContext;

/** Volumen máximo real: discreto incluso con el control al 100 %. */
export const MASTER_MAX = 0.28;

function defaultCtor(): AudioCtor | undefined {
  const w = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

interface Note {
  f: number;
  /** Frecuencia final (barrido); por defecto igual a f. */
  to?: number;
  /** Inicio relativo en segundos. */
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

const SOUNDS: Record<SoundName, Note[]> = {
  pet: [
    { f: 660, to: 880, at: 0, dur: 0.12, type: 'sine', gain: 0.7 },
    { f: 990, to: 1180, at: 0.09, dur: 0.14, type: 'sine', gain: 0.5 },
  ],
  feed: [
    { f: 420, to: 300, at: 0, dur: 0.09, type: 'triangle' },
    { f: 520, to: 360, at: 0.12, dur: 0.09, type: 'triangle' },
    { f: 700, to: 900, at: 0.26, dur: 0.12, type: 'sine', gain: 0.5 },
  ],
  clean: [
    { f: 500, to: 1100, at: 0, dur: 0.08, type: 'sine', gain: 0.45 },
    { f: 640, to: 1300, at: 0.08, dur: 0.08, type: 'sine', gain: 0.4 },
    { f: 560, to: 1200, at: 0.17, dur: 0.08, type: 'sine', gain: 0.4 },
    { f: 760, to: 1500, at: 0.25, dur: 0.09, type: 'sine', gain: 0.35 },
  ],
  sleep: [
    { f: 520, to: 390, at: 0, dur: 0.3, type: 'sine', gain: 0.5 },
    { f: 390, to: 330, at: 0.25, dur: 0.4, type: 'sine', gain: 0.4 },
  ],
  jump: [{ f: 320, to: 760, at: 0, dur: 0.13, type: 'square', gain: 0.22 }],
  point: [
    { f: 1046, at: 0, dur: 0.06, type: 'triangle', gain: 0.5 },
    { f: 1568, at: 0.05, dur: 0.08, type: 'triangle', gain: 0.4 },
  ],
  hit: [
    { f: 300, to: 90, at: 0, dur: 0.32, type: 'sawtooth', gain: 0.3 },
    { f: 150, to: 60, at: 0.02, dur: 0.3, type: 'triangle', gain: 0.6 },
  ],
  buy: [
    { f: 988, at: 0, dur: 0.08, type: 'square', gain: 0.22 },
    { f: 1319, at: 0.08, dur: 0.22, type: 'square', gain: 0.22 },
  ],
  claim: [
    { f: 784, at: 0, dur: 0.1, type: 'triangle' },
    { f: 988, at: 0.09, dur: 0.1, type: 'triangle' },
    { f: 1175, at: 0.18, dur: 0.2, type: 'triangle' },
  ],
  levelup: [
    { f: 523, at: 0, dur: 0.12, type: 'triangle' },
    { f: 659, at: 0.11, dur: 0.12, type: 'triangle' },
    { f: 784, at: 0.22, dur: 0.12, type: 'triangle' },
    { f: 1047, at: 0.33, dur: 0.32, type: 'triangle' },
    { f: 1568, at: 0.33, dur: 0.32, type: 'sine', gain: 0.35 },
  ],
  move: [
    { f: 587, at: 0, dur: 0.18, type: 'sine', gain: 0.6 },
    { f: 880, at: 0.14, dur: 0.3, type: 'sine', gain: 0.5 },
  ],
  error: [{ f: 220, to: 180, at: 0, dur: 0.16, type: 'triangle', gain: 0.5 }],
  tap: [{ f: 880, at: 0, dur: 0.05, type: 'sine', gain: 0.35 }],
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private failed = false;
  private live = new Set<OscillatorNode>();

  constructor(
    private prefs: SoundPrefs,
    private getCtor: () => AudioCtor | undefined = defaultCtor,
  ) {}

  get enabled(): boolean {
    return this.prefs.sound;
  }

  get volume(): number {
    return this.prefs.volume;
  }

  /** ¿Hay Web Audio en este navegador? (no crea nada) */
  get supported(): boolean {
    return !this.failed && !!this.getCtor();
  }

  /** Llamar desde un gesto de la persona (pointerdown/keydown). */
  unlock(): void {
    if (!this.prefs.sound || this.failed) return;
    try {
      if (!this.ctx) {
        const Ctor = this.getCtor();
        if (!Ctor) {
          this.failed = true;
          return;
        }
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.targetGain();
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.failed = true;
      this.ctx = null;
      this.master = null;
    }
  }

  private targetGain(): number {
    return this.prefs.sound ? MASTER_MAX * this.prefs.volume : 0;
  }

  private applyGain(): void {
    if (!this.ctx || !this.master) return;
    try {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.targetGain(), t);
    } catch {
      /* ignorado */
    }
  }

  setEnabled(on: boolean): void {
    this.prefs.sound = on;
    if (!on) this.stopAll();
    this.applyGain();
  }

  setVolume(v: number): void {
    this.prefs.volume = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
    if (this.prefs.volume === 0) this.stopAll();
    this.applyGain();
  }

  private stopAll(): void {
    for (const o of this.live) {
      try {
        o.stop();
      } catch {
        /* ya parada */
      }
    }
    this.live.clear();
  }

  /** Reproduce un efecto. Devuelve true si se programó algún sonido. */
  play(name: SoundName): boolean {
    if (!this.prefs.sound || this.prefs.volume <= 0) return false;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return false;
    if (ctx.state !== 'running') {
      // Suspendido (p. ej. tras volver de segundo plano): se intenta reanudar y se omite este efecto.
      try {
        void ctx.resume().catch(() => undefined);
      } catch {
        /* ignorado */
      }
      return false;
    }
    const notes = SOUNDS[name];
    if (!notes) return false;
    try {
      const t0 = ctx.currentTime + 0.005;
      for (const n of notes) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = n.type ?? 'sine';
        const start = t0 + n.at;
        const end = start + n.dur;
        osc.frequency.setValueAtTime(n.f, start);
        if (n.to && n.to !== n.f) osc.frequency.exponentialRampToValueAtTime(n.to, end);
        const peak = n.gain ?? 0.6;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.02, n.dur / 3));
        g.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(g);
        g.connect(master);
        osc.start(start);
        osc.stop(end + 0.02);
        this.live.add(osc);
        osc.onended = () => {
          this.live.delete(osc);
          try {
            g.disconnect();
          } catch {
            /* ignorado */
          }
        };
      }
      return true;
    } catch {
      return false;
    }
  }
}
