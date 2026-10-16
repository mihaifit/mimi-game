import { describe, expect, it } from 'vitest';
import { dayKey } from '../src/state/model';
import { BACKUP_KEY, MemoryStorage, SAVE_KEY, SAVE_VERSION, V1_BACKUP_KEY, loadGame } from '../src/state/storage';
import { Store } from '../src/state/store';
import { pet } from '../src/state/care';

// Hora local fija (mediodía) para que el día no dependa de la zona horaria.
const T0 = new Date(2026, 9, 16, 12, 0, 0).getTime();

/** Guardado exactamente como lo escribía MIMI 0.1.0 (version 1). */
function v1Save(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 1,
    savedAt: T0 - 60_000,
    state: {
      name: 'Gelatina',
      personality: 'dormilona',
      needs: { hunger: 61.5, hygiene: 44, energy: 72, affection: 30 },
      coins: 137,
      owned: ['lazo', 'gafas', 'bufanda'],
      equipped: { head: 'lazo', face: 'gafas', neck: 'bufanda' },
      sleeping: false,
      lastTick: T0 - 60_000,
      hopBest: 23,
      hopRuns: 9,
      hopLastRewardedRun: 9,
      ...overrides,
    },
  });
}

describe('migración v1 → v2', () => {
  it('conserva nombre, personalidad, monedas, accesorios y récord', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, v1Save());
    const r = loadGame(storage, T0);
    expect(r.status).toBe('migrated');
    expect(r.state.name).toBe('Gelatina');
    expect(r.state.personality).toBe('dormilona');
    expect(r.state.coins).toBe(137);
    expect(r.state.owned).toEqual(['lazo', 'gafas', 'bufanda']);
    expect(r.state.equipped).toEqual({ head: 'lazo', face: 'gafas', neck: 'bufanda' });
    expect(r.state.hopBest).toBe(23);
    expect(r.state.hopRuns).toBe(9);
    expect(r.state.hopLastRewardedRun).toBe(9);
    expect(r.state.needs.hunger).toBe(61.5);
    // Campos nuevos con valores por defecto.
    expect(r.state.xp).toBe(0);
    expect(r.state.levelRewarded).toBe(1);
    expect(r.state.daily).toEqual({ day: dayKey(T0), care: 0, hop: 0, move: 0, claimed: [] });
    expect(r.state.achievements).toEqual([]);
    expect(r.state.moveSessions).toBe(0);
  });

  it('guarda una copia intacta del v1 y reescribe como v2; la segunda carga ya es normal', () => {
    const storage = new MemoryStorage();
    const original = v1Save();
    storage.setItem(SAVE_KEY, original);
    const store = new Store(storage, () => T0);
    expect(store.loadStatus).toBe('migrated');
    store.persist();
    expect(storage.getItem(V1_BACKUP_KEY)).toBe(original);
    const saved = JSON.parse(storage.getItem(SAVE_KEY)!);
    expect(saved.version).toBe(SAVE_VERSION);
    expect(saved.state.name).toBe('Gelatina');
    expect(saved.state.owned).toEqual(['lazo', 'gafas', 'bufanda']);

    const again = loadGame(storage, T0 + 1000);
    expect(again.status).toBe('loaded');
    // La copia v1 no se pisa en cargas posteriores.
    expect(storage.getItem(V1_BACKUP_KEY)).toBe(original);
  });

  it('logros que la partida v1 ya cumplía se pagan una sola vez aunque se recargue', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, v1Save());
    const first = new Store(storage, () => T0);
    const events = first.takePendingEvents();
    const ids = events.filter((e) => e.type === 'achievement').map((e) => (e.type === 'achievement' ? e.id : ''));
    expect(ids).toEqual(['saltarina', 'coleccion']); // récord 23 ≥ 10 y 3 accesorios
    expect(first.state.coins).toBe(137 + 10 + 10);
    first.persist();
    for (let i = 0; i < 3; i++) {
      const reload = new Store(storage, () => T0 + (i + 1) * 1000);
      expect(reload.takePendingEvents()).toEqual([]);
      expect(reload.state.coins).toBe(157);
      reload.persist();
    }
  });

  it('valida un v1 manipulado sin perder lo válido', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SAVE_KEY,
      v1Save({ coins: 'muchas', owned: ['lazo', 'cinta', 'espada'], equipped: { head: 'cinta', face: 'lazo', neck: null }, hopBest: -4 }),
    );
    const r = loadGame(storage, T0);
    expect(r.status).toBe('migrated');
    expect(r.state.coins).toBe(20);
    // La cinta es un regalo de nivel 3: un v1 no puede tenerla.
    expect(r.state.owned).toEqual(['lazo']);
    expect(r.state.equipped).toEqual({ head: null, face: null, neck: null });
    expect(r.state.hopBest).toBe(0);
    expect(r.state.name).toBe('Gelatina');
  });

  it('una versión futura no se sobrescribe ni se migra', () => {
    const storage = new MemoryStorage();
    const future = JSON.stringify({ version: SAVE_VERSION + 1, state: { coins: 5 } });
    storage.setItem(SAVE_KEY, future);
    const store = new Store(storage, () => T0);
    expect(store.loadStatus).toBe('unsupported-version');
    store.run(pet, 'pet');
    store.persist();
    expect(storage.getItem(SAVE_KEY)).toBe(future);
    expect(storage.getItem(V1_BACKUP_KEY)).toBeNull();
  });

  it('versiones inválidas se tratan como dañadas y se respaldan', () => {
    for (const version of [0, -1, 1.5, '2', null]) {
      const storage = new MemoryStorage();
      const text = JSON.stringify({ version, state: JSON.parse(v1Save()).state });
      storage.setItem(SAVE_KEY, text);
      expect(loadGame(storage, T0).status).toBe('corrupt');
      expect(storage.getItem(BACKUP_KEY)).toBe(text);
    }
  });

  it('campos v2 dañados se normalizan', () => {
    const storage = new MemoryStorage();
    const state = {
      ...JSON.parse(v1Save()).state,
      xp: 1e15,
      levelRewarded: 999,
      careXpAt: { feed: T0 + 1e9, clean: 'ayer', pet: -5 },
      daily: { day: '16/10/2026', care: 5 },
      moveSessions: 3,
      moveLastRewarded: 50,
      achievements: ['saltarina', 'saltarina', 'inventado', 7],
      stats: { usefulCares: -3, hopObstacles: 'x' },
    };
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 2, state }));
    const r = loadGame(storage, T0);
    expect(r.status).toBe('loaded');
    expect(r.state.xp).toBe(1_000_000);
    expect(r.state.levelRewarded).toBe(50); // tope: nivel máximo
    expect(r.state.careXpAt).toEqual({ feed: T0, clean: 0, pet: 0, sleep: 0 });
    expect(r.state.daily).toEqual({ day: dayKey(T0), care: 0, hop: 0, move: 0, claimed: [] });
    expect(r.state.moveLastRewarded).toBe(3);
    expect(r.state.achievements).toEqual(['saltarina']);
    expect(r.state.stats).toEqual({ usefulCares: 0, hopObstacles: 0, movePauses: 0, perfectDays: 0 });
  });

  it('sin almacenamiento se juega igual con estado nuevo', () => {
    const store = new Store(null, () => T0);
    expect(store.loadStatus).toBe('unavailable');
    expect(store.canPersist).toBe(false);
    const r = store.run(pet, 'pet');
    expect(r.ok).toBe(true);
  });
});
