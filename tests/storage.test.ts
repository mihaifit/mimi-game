import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/state/model';
import {
  BACKUP_KEY,
  MemoryStorage,
  SAVE_KEY,
  SAVE_VERSION,
  detectStorage,
  loadGame,
  sanitizeState,
  saveGame,
  type StorageLike,
} from '../src/state/storage';
import { Store } from '../src/state/store';
import { feed } from '../src/state/care';

const T0 = 1_700_000_000_000;

class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
  removeItem(): void {
    throw new Error('SecurityError');
  }
}

describe('persistencia', () => {
  it('guarda y carga el mismo estado (ida y vuelta)', () => {
    const storage = new MemoryStorage();
    const s = { ...createInitialState(T0), personality: 'glotona' as const, coins: 42, owned: ['lazo'], hopBest: 7 };
    s.equipped.head = 'lazo';
    expect(saveGame(storage, s)).toBe(true);
    const raw = JSON.parse(storage.getItem(SAVE_KEY)!);
    expect(raw.version).toBe(SAVE_VERSION);
    const loaded = loadGame(storage, T0 + 1000);
    expect(loaded.status).toBe('loaded');
    expect(loaded.state).toEqual(s);
  });

  it('sin guardado devuelve estado nuevo', () => {
    const r = loadGame(new MemoryStorage(), T0);
    expect(r.status).toBe('new');
    expect(r.state.coins).toBe(20);
  });

  it('JSON roto: estado nuevo y copia de seguridad', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{nope');
    const r = loadGame(storage, T0);
    expect(r.status).toBe('corrupt');
    expect(storage.getItem(BACKUP_KEY)).toBe('{nope');
  });

  it('versión futura no se sobrescribe', () => {
    const storage = new MemoryStorage();
    const future = JSON.stringify({ version: SAVE_VERSION + 1, state: {} });
    storage.setItem(SAVE_KEY, future);
    const r = loadGame(storage, T0);
    expect(r.status).toBe('unsupported-version');
    const store = new Store(storage, () => T0);
    store.run(feed);
    expect(storage.getItem(SAVE_KEY)).toBe(future);
  });

  it('valida y corrige datos manipulados', () => {
    const s = sanitizeState(
      {
        name: '   ',
        personality: 'malvada',
        needs: { hunger: 500, hygiene: -20, energy: 'mucho', affection: Number.NaN },
        coins: -100,
        owned: ['lazo', 'lazo', 'espada', 3],
        equipped: { head: 'lazo', face: 'bufanda', neck: 'gorro' },
        sleeping: 'sí',
        lastTick: T0 + 99_999_999,
        hopBest: 1e12,
        hopRuns: 3,
        hopLastRewardedRun: 99,
      },
      T0,
    )!;
    expect(s.name).toBe('Mimi');
    expect(s.personality).toBeNull();
    expect(s.needs.hunger).toBe(100);
    expect(s.needs.hygiene).toBe(0);
    expect(s.needs.energy).toBe(90);
    expect(s.needs.affection).toBe(75);
    expect(s.coins).toBe(0);
    expect(s.owned).toEqual(['lazo']);
    expect(s.equipped).toEqual({ head: 'lazo', face: null, neck: null });
    expect(s.sleeping).toBe(false);
    expect(s.lastTick).toBe(T0);
    expect(s.hopBest).toBe(1_000_000);
    expect(s.hopLastRewardedRun).toBe(3);
  });

  it('forma irreconocible se trata como dañada', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, state: [1, 2, 3] }));
    expect(loadGame(storage, T0).status).toBe('corrupt');
    storage.setItem(SAVE_KEY, JSON.stringify('hola'));
    expect(loadGame(storage, T0).status).toBe('corrupt');
  });

  it('tolera almacenamiento que lanza excepciones', () => {
    expect(detectStorage(() => new ThrowingStorage())).toBeNull();
    expect(
      detectStorage(() => {
        throw new Error('denied');
      }),
    ).toBeNull();
    expect(detectStorage(() => undefined)).toBeNull();
    expect(loadGame(new ThrowingStorage(), T0).status).toBe('unavailable');
    expect(saveGame(new ThrowingStorage(), createInitialState(T0))).toBe(false);
    expect(saveGame(null, createInitialState(T0))).toBe(false);
  });

  it('la tienda funciona aunque no haya almacenamiento', () => {
    const store = new Store(null, () => T0);
    expect(store.loadStatus).toBe('unavailable');
    const r = store.run(feed);
    expect(r.state).toBe(store.state);
  });

  it('Store aplica el tiempo transcurrido al cargar', () => {
    const storage = new MemoryStorage();
    saveGame(storage, { ...createInitialState(T0), personality: 'glotona' });
    const store = new Store(storage, () => T0 + 10 * 60_000);
    expect(store.state.needs.hunger).toBeLessThan(80);
  });
});
