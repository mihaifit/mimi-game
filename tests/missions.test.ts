import { describe, expect, it } from 'vitest';
import { claimHopReward, pet, startHopRun } from '../src/state/care';
import { createInitialState, dayKey, type GameState } from '../src/state/model';
import { ACHIEVEMENTS, MISSIONS, claimMission, ensureDay, missionStatus } from '../src/state/progress';
import { MemoryStorage } from '../src/state/storage';
import { Store } from '../src/state/store';

const DAY1 = new Date(2026, 9, 16, 9, 0, 0).getTime();
const DAY1_NIGHT = new Date(2026, 9, 16, 23, 59, 0).getTime();
const DAY2 = new Date(2026, 9, 17, 0, 5, 0).getTime();
const MIN = 60_000;

function base(now = DAY1): GameState {
  return { ...createInitialState(now), personality: 'juguetona' };
}

describe('misiones diarias', () => {
  it('se reclaman una sola vez al completarse', () => {
    let s = base();
    expect(claimMission(s, 'hop', DAY1).ok).toBe(false);
    s = { ...s, daily: { ...s.daily, hop: 3 } };
    expect(missionStatus(s, 'hop')).toBe('ready');
    const r = claimMission(s, 'hop', DAY1);
    expect(r.ok).toBe(true);
    expect(r.state.coins).toBe(s.coins + MISSIONS.hop.coins);
    expect(r.state.xp).toBe(MISSIONS.hop.xp);
    const again = claimMission(r.state, 'hop', DAY1 + MIN);
    expect(again.ok).toBe(false);
    expect(again.state.coins).toBe(r.state.coins);
  });

  it('los obstáculos se acumulan entre partidas', () => {
    let s = base();
    for (const score of [1, 1, 1]) {
      const run = startHopRun(s);
      s = claimHopReward(run.state, run.runId, score).state;
    }
    expect(s.daily.hop).toBe(3);
    expect(missionStatus(s, 'hop')).toBe('ready');
  });

  it('se renuevan al cambiar el día local', () => {
    const s = { ...base(), daily: { day: dayKey(DAY1), care: 3, hop: 5, move: 1, claimed: ['care' as const] } };
    expect(ensureDay(s, DAY1_NIGHT)).toBe(s);
    const next = ensureDay(s, DAY2);
    expect(next.daily).toEqual({ day: dayKey(DAY2), care: 0, hop: 0, move: 0, claimed: [] });
  });

  it('reloj hacia atrás no renueva ni duplica', () => {
    let s: GameState = { ...base(DAY2), daily: { day: dayKey(DAY2), care: 3, hop: 0, move: 0, claimed: [] } };
    s = claimMission(s, 'care', DAY2).state;
    const coins = s.coins;
    // Se atrasa el reloj al día anterior: el día guardado se mantiene y no se puede volver a cobrar.
    const back = claimMission(s, 'care', DAY1);
    expect(back.ok).toBe(false);
    expect(back.state.daily.day).toBe(dayKey(DAY2));
    expect(back.state.coins).toBe(coins);
  });

  it('recargar no permite reclamar otra vez (estado persistido)', () => {
    const storage = new MemoryStorage();
    let now = DAY1;
    const store = new Store(storage, () => now);
    store.update((s) => ({ ...s, daily: { ...s.daily, care: 3 } }));
    store.update((s) => claimMission(s, 'care', now).state);
    const coins = store.state.coins;
    now += 1000;
    const reloaded = new Store(storage, () => now);
    expect(missionStatus(reloaded.state, 'care')).toBe('claimed');
    reloaded.update((s) => claimMission(s, 'care', now).state);
    expect(reloaded.state.coins).toBe(coins);
  });

  it('día redondo: las tres misiones desbloquean un logro una vez', () => {
    let s: GameState = { ...base(), daily: { day: dayKey(DAY1), care: 3, hop: 3, move: 1, claimed: [] } };
    for (const id of ['care', 'hop', 'move'] as const) s = claimMission(s, id, DAY1).state;
    expect(s.stats.perfectDays).toBe(1);
  });

  it('cuidados útiles en el Store cuentan para la misión y respetan el enfriamiento', () => {
    let now = DAY1;
    const store = new Store(new MemoryStorage(), () => now);
    store.update((s) => ({ ...s, needs: { ...s.needs, affection: 10 } }));
    for (let i = 0; i < 10; i++) {
      store.run(pet, 'pet');
      now += 1000;
    }
    expect(store.state.daily.care).toBe(1);
    const firstAch = store.state.achievements;
    expect(firstAch).toContain('primer-mimo');
  });

  it('todos los logros tienen objetivo visible', () => {
    const s = base();
    for (const a of ACHIEVEMENTS) {
      const [have, goal] = a.progress(s);
      expect(goal).toBeGreaterThan(0);
      expect(have).toBeGreaterThanOrEqual(0);
    }
  });
});
