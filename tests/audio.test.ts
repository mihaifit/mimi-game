import { describe, expect, it } from 'vitest';
import { MASTER_MAX, Sfx } from '../src/audio/sfx';
import { MemoryStorage } from '../src/state/storage';
import { PREFS_KEY, loadPrefs, savePrefs } from '../src/state/prefs';


class FakeParam {
  value = 0;
  events: string[] = [];
  setValueAtTime(v: number) {
    this.value = v;
    this.events.push(`set:${v}`);
  }
  exponentialRampToValueAtTime() {}
  cancelScheduledValues() {
    this.events.push('cancel');
  }
}
class FakeNode {
  connect() {}
  disconnect() {}
}
class FakeOsc extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  stopped = false;
  onended: (() => void) | null = null;
  start() {}
  stop() {
    this.stopped = true;
  }
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}

let created = 0;
class FakeCtx {
  static instances: FakeCtx[] = [];
  state: 'running' | 'suspended' = 'running';
  currentTime = 0;
  destination = new FakeNode();
  oscs: FakeOsc[] = [];
  resumed = 0;
  master?: FakeGain;
  constructor() {
    created++;
    FakeCtx.instances.push(this);
  }
  createGain() {
    const g = new FakeGain();
    this.master ??= g;
    return g;
  }
  createOscillator() {
    const o = new FakeOsc();
    this.oscs.push(o);
    return o;
  }
  resume() {
    this.resumed++;
    this.state = 'running';
    return Promise.resolve();
  }
}
class SuspendedCtx extends FakeCtx {
  override state: 'running' | 'suspended' = 'suspended';
  override resume() {
    this.resumed++;
    return Promise.reject(new Error('no'));
  }
}

const ctor = () => FakeCtx as unknown as new () => AudioContext;

describe('audio Web Audio', () => {
  it('no crea AudioContext hasta un gesto (unlock) ni suena antes', () => {
    created = 0;
    const sfx = new Sfx({ sound: true, volume: 0.5 }, ctor);
    expect(sfx.play('pet')).toBe(false);
    expect(created).toBe(0);
    sfx.unlock();
    expect(created).toBe(1);
    expect(sfx.play('pet')).toBe(true);
    sfx.unlock();
    expect(created).toBe(1);
  });

  it('volumen discreto y silencio inmediato', () => {
    const sfx = new Sfx({ sound: true, volume: 1 }, ctor);
    sfx.unlock();
    const ctx = FakeCtx.instances.at(-1)!;
    expect(ctx.master!.gain.value).toBeCloseTo(MASTER_MAX);
    expect(MASTER_MAX).toBeLessThan(0.5);
    sfx.play('levelup');
    sfx.setEnabled(false);
    expect(ctx.master!.gain.value).toBe(0);
    expect(ctx.oscs.every((o) => o.stopped)).toBe(true);
    const before = ctx.oscs.length;
    expect(sfx.play('pet')).toBe(false);
    expect(ctx.oscs.length).toBe(before);
    sfx.setEnabled(true);
    expect(ctx.master!.gain.value).toBeCloseTo(MASTER_MAX);
  });

  it('silenciado desde el inicio no crea contexto', () => {
    created = 0;
    const sfx = new Sfx({ sound: false, volume: 0.5 }, ctor);
    sfx.unlock();
    expect(created).toBe(0);
    expect(sfx.play('buy')).toBe(false);
  });

  it('tolera navegadores sin Web Audio o que fallan', () => {
    const none = new Sfx({ sound: true, volume: 0.5 }, () => undefined);
    expect(() => none.unlock()).not.toThrow();
    expect(none.play('hit')).toBe(false);
    expect(none.supported).toBe(false);
    const throwing = new Sfx({ sound: true, volume: 0.5 }, () => {
      return class {
        constructor() {
          throw new Error('NotAllowedError');
        }
      } as unknown as new () => AudioContext;
    });
    expect(() => throwing.unlock()).not.toThrow();
    expect(throwing.play('hit')).toBe(false);
  });

  it('contexto suspendido: intenta reanudar sin lanzar y no programa sonido', () => {
    const sfx = new Sfx({ sound: true, volume: 0.5 }, () => SuspendedCtx as unknown as new () => AudioContext);
    sfx.unlock();
    const ctx = FakeCtx.instances.at(-1)!;
    expect(sfx.play('jump')).toBe(false);
    expect(ctx.resumed).toBeGreaterThan(0);
    expect(ctx.oscs.length).toBe(0);
  });

  it('las preferencias de sonido se guardan y validan', () => {
    const storage = new MemoryStorage();
    expect(loadPrefs(storage)).toEqual({ sound: true, volume: 0.5 });
    savePrefs(storage, { sound: false, volume: 0.3 });
    expect(loadPrefs(storage)).toEqual({ sound: false, volume: 0.3 });
    storage.setItem(PREFS_KEY, '{roto');
    expect(loadPrefs(storage)).toEqual({ sound: true, volume: 0.5 });
    storage.setItem(PREFS_KEY, JSON.stringify({ sound: 'sí', volume: 7 }));
    expect(loadPrefs(storage)).toEqual({ sound: true, volume: 1 });
    expect(loadPrefs(null).sound).toBe(true);
    expect(savePrefs(null, { sound: true, volume: 1 })).toBe(false);
  });
});
