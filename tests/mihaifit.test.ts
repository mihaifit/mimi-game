import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState } from '../src/state/model';
import { MOVE_CHALLENGES, confirmMove, startMove, tickMove, type MoveTimer } from '../src/state/movement';
import { SCARF_ACHIEVEMENT_ID, SCARF_ITEM_ID, SPORT_ITEM_ID, settle } from '../src/state/progress';
import { SHOP_ITEMS, buyItem, findItem, toggleEquip } from '../src/state/shop';
import { MemoryStorage, SAVE_KEY, loadGame } from '../src/state/storage';
import { Store } from '../src/state/store';

const T0 = new Date(2026, 9, 16, 12, 0, 0).getTime();

function base(): GameState {
  return { ...createInitialState(T0), personality: 'juguetona' };
}

/** Completa y confirma un reto (temporizador en primer plano) y asienta premios. */
function doChallenge(s: GameState, now: number): { state: GameState; now: number } {
  const st = startMove(s, 1, now);
  let t: MoveTimer = st.timer;
  let n = now;
  while (t.status === 'running') {
    n += 250;
    t = tickMove(t, n);
  }
  return { state: settle(confirmMove(st.state, t, n).state).state, now: n };
}

describe('Retos MihaiFIT', () => {
  it('nombres amigables sin cambiar duraciones', () => {
    expect(MOVE_CHALLENGES).toEqual({ 1: 'Activa tu día', 2: 'Hoy toca moverse' });
    expect(startMove(base(), 1, T0).timer.durationMs).toBe(60_000);
    expect(startMove(base(), 2, T0).timer.durationMs).toBe(120_000);
  });

  it('accesorios MihaiFIT: ids estables, regalo y no se compran', () => {
    expect(findItem('cinta')).toMatchObject({ name: 'Cinta MihaiFIT', slot: 'head', unlockLevel: 3 });
    expect(findItem(SCARF_ITEM_ID)).toMatchObject({ name: 'Pañuelo MihaiFIT', slot: 'neck' });
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
    const r = buyItem({ ...base(), coins: 999 }, SCARF_ITEM_ID);
    expect(r.ok).toBe(false);
    expect(r.state.coins).toBe(999);
  });

  it('el pañuelo se desbloquea al confirmar 3 retos, una sola vez', () => {
    let s = base();
    let now = T0;
    for (let i = 0; i < 2; i++) ({ state: s, now } = doChallenge(s, now));
    expect(s.owned).not.toContain(SCARF_ITEM_ID);
    ({ state: s, now } = doChallenge(s, now));
    expect(s.stats.movePauses).toBe(3);
    expect(s.achievements).toContain(SCARF_ACHIEVEMENT_ID);
    expect(s.owned).toContain(SCARF_ITEM_ID);
    expect(s.equipped.neck).toBe(SCARF_ITEM_ID);
    const coins = s.coins;
    // Más retos o volver a asentar no vuelven a pagar ni duplican el accesorio.
    ({ state: s } = doChallenge(s, now + 1000));
    const again = settle(settle(s).state).state;
    expect(again.owned.filter((id) => id === SCARF_ITEM_ID)).toHaveLength(1);
    expect(again.achievements.filter((id) => id === SCARF_ACHIEVEMENT_ID)).toHaveLength(1);
    expect(again.coins).toBe(coins); // el 4.º reto del día ya no tiene premio (límite 2)
  });

  it('el pañuelo no quita un accesorio de cuello ya puesto y se lleva junto a la cinta', () => {
    const s: GameState = {
      ...base(),
      xp: 80,
      owned: ['bufanda'],
      equipped: { head: null, face: null, neck: 'bufanda' },
      stats: { ...base().stats, movePauses: 3 },
    };
    const r = settle(s).state;
    expect(r.owned).toEqual(expect.arrayContaining([SPORT_ITEM_ID, SCARF_ITEM_ID, 'bufanda']));
    expect(r.equipped).toEqual({ head: SPORT_ITEM_ID, face: null, neck: 'bufanda' });
    const both = toggleEquip(r, SCARF_ITEM_ID).state;
    expect(both.equipped).toEqual({ head: SPORT_ITEM_ID, face: null, neck: SCARF_ITEM_ID });
  });

  it('guardados: el pañuelo sin su logro se descarta; con logro se conserva; recargar no repaga', () => {
    const storage = new MemoryStorage();
    const v1 = { name: 'Gelatina', needs: { hunger: 50, hygiene: 50, energy: 50, affection: 50 }, coins: 30, owned: ['lazo', SCARF_ITEM_ID], equipped: { head: 'lazo', face: null, neck: SCARF_ITEM_ID } };
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, state: v1 }));
    const migrated = loadGame(storage, T0);
    expect(migrated.state.owned).toEqual(['lazo']);
    expect(migrated.state.equipped.neck).toBeNull();
    expect(migrated.state.coins).toBe(30);

    const store = new Store(storage, () => T0);
    store.update((st) => ({ ...st, stats: { ...st.stats, movePauses: 3 } }));
    expect(store.state.owned).toContain(SCARF_ITEM_ID);
    const coins = store.state.coins;
    for (let i = 1; i <= 3; i++) {
      const reload = new Store(storage, () => T0 + i * 1000);
      expect(reload.takePendingEvents()).toEqual([]);
      expect(reload.state.coins).toBe(coins);
      expect(reload.state.owned.filter((id) => id === SCARF_ITEM_ID)).toHaveLength(1);
    }
  });
});
