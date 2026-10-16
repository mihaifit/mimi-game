import { describe, expect, it } from 'vitest';
import { claimHopReward, clean, feed, hopXpFor, pet, startHopRun, toggleSleep } from '../src/state/care';
import { createInitialState, type GameState } from '../src/state/model';
import {
  CARE_XP,
  CARE_XP_COOLDOWN_MS,
  MAX_LEVEL,
  SPORT_ITEM_ID,
  levelOf,
  levelProgress,
  levelReward,
  settle,
  xpForLevel,
  xpToNext,
} from '../src/state/progress';
import { mimiLine } from '../src/state/voice';
import { buyItem, toggleEquip } from '../src/state/shop';

const T0 = new Date(2026, 9, 16, 12, 0, 0).getTime();

function base(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialState(T0), personality: 'juguetona', ...overrides };
}
function withNeeds(s: GameState, needs: Partial<GameState['needs']>): GameState {
  return { ...s, needs: { ...s.needs, ...needs } };
}

describe('niveles de vínculo', () => {
  it('curva creciente y coherente', () => {
    expect(levelOf(0)).toBe(1);
    expect(xpToNext(1)).toBe(30);
    expect(levelOf(29)).toBe(1);
    expect(levelOf(30)).toBe(2);
    expect(xpForLevel(3)).toBe(30 + 45);
    expect(levelOf(75)).toBe(3);
    expect(levelOf(Number.NaN)).toBe(1);
    expect(levelOf(1e12)).toBe(MAX_LEVEL);
    const p = levelProgress(40);
    expect(p).toMatchObject({ level: 2, into: 10, needed: 45 });
    expect(levelProgress(1e12).ratio).toBe(1);
  });

  it('subir de nivel paga una sola vez y regala la cinta en el nivel 3', () => {
    const s = base({ xp: 80, coins: 0 });
    const first = settle(s);
    const ups = first.events.filter((e) => e.type === 'levelup');
    expect(ups.map((e) => (e.type === 'levelup' ? e.level : 0))).toEqual([2, 3]);
    expect(first.state.levelRewarded).toBe(3);
    expect(first.state.owned).toContain(SPORT_ITEM_ID);
    expect(first.state.equipped.head).toBe(SPORT_ITEM_ID);
    const levelCoins = levelReward(2) + levelReward(3);
    // + logro "Lazos fuertes" (nivel 3)
    expect(first.state.coins).toBe(levelCoins + 10);
    const again = settle(first.state);
    expect(again.events).toEqual([]);
    expect(again.state).toBe(first.state);
  });

  it('la cinta no quita un accesorio de cabeza ya puesto', () => {
    const s = base({ xp: 80, owned: ['corona'], equipped: { head: 'corona', face: null, neck: null } });
    const r = settle(s);
    expect(r.state.owned).toContain(SPORT_ITEM_ID);
    expect(r.state.equipped.head).toBe('corona');
    const worn = toggleEquip(r.state, SPORT_ITEM_ID);
    expect(worn.ok).toBe(true);
    expect(worn.state.equipped.head).toBe(SPORT_ITEM_ID);
  });

  it('la cinta no se puede comprar', () => {
    const r = buyItem(base({ coins: 999 }), SPORT_ITEM_ID);
    expect(r.ok).toBe(false);
    expect(r.state.coins).toBe(999);
    expect(r.message).toMatch(/nivel 3/);
  });
});

describe('XP de cuidados (anti-spam)', () => {
  it('solo da XP si el cuidado es útil', () => {
    expect(pet(withNeeds(base(), { affection: 95 }), T0).state.xp).toBe(0);
    const r = pet(withNeeds(base(), { affection: 50 }), T0);
    expect(r.state.xp).toBe(CARE_XP);
    expect(r.message).toMatch(/\+5 XP/);
    expect(r.state.daily.care).toBe(1);
  });

  it('spamear caricias no da XP infinita: enfriamiento por tipo', () => {
    let s = withNeeds(base(), { affection: 0 });
    for (let i = 0; i < 20; i++) s = pet(withNeeds(s, { affection: 0 }), T0 + i * 1000).state;
    expect(s.xp).toBe(CARE_XP);
    expect(s.daily.care).toBe(1);
    // Otro tipo de cuidado sí cuenta.
    s = feed(withNeeds(s, { hunger: 20 }), T0 + 20_000).state;
    expect(s.xp).toBe(2 * CARE_XP);
    // Pasado el enfriamiento vuelve a dar.
    s = pet(withNeeds(s, { affection: 0 }), T0 + CARE_XP_COOLDOWN_MS).state;
    expect(s.xp).toBe(3 * CARE_XP);
  });

  it('reloj hacia atrás no regala XP', () => {
    let s = pet(withNeeds(base(), { affection: 10 }), T0).state;
    s = pet(withNeeds(s, { affection: 10 }), T0 - 3_600_000).state;
    expect(s.xp).toBe(CARE_XP);
    // Se reancla: hay que esperar el enfriamiento completo desde el nuevo "ahora".
    s = pet(withNeeds(s, { affection: 10 }), T0 - 3_600_000 + CARE_XP_COOLDOWN_MS - 1).state;
    expect(s.xp).toBe(CARE_XP);
  });

  it('dormir y limpiar útiles dan XP; acciones rechazadas no', () => {
    expect(toggleSleep(withNeeds(base(), { energy: 20 }), T0).state.xp).toBe(CARE_XP);
    expect(clean(withNeeds(base(), { hygiene: 30 }), T0).state.xp).toBe(CARE_XP);
    expect(clean(withNeeds(base(), { hygiene: 99 }), T0).state.xp).toBe(0);
    expect(feed({ ...base(), sleeping: true }, T0).state.xp).toBe(0);
  });
});

describe('XP de MIMI HOP', () => {
  it('una vez por partida y con tope', () => {
    expect(hopXpFor(0)).toBe(2);
    expect(hopXpFor(1000)).toBe(15);
    const { state, runId } = startHopRun(base());
    const r = claimHopReward(state, runId, 7);
    expect(r.xp).toBe(5);
    expect(r.state.xp).toBe(5);
    expect(r.state.daily.hop).toBe(7);
    const replay = claimHopReward(r.state, runId, 7);
    expect(replay.alreadyClaimed).toBe(true);
    expect(replay.state.xp).toBe(5);
    expect(replay.state.daily.hop).toBe(7);
  });
});

describe('frases de Mimi', () => {
  it('dependen de la personalidad y del estado', () => {
    expect(mimiLine(withNeeds(base(), { hunger: 10 }), 'idle', () => 0)).toBe('Tengo un poquito de hambre…');
    expect(mimiLine({ ...base(), sleeping: true }, 'idle')).toBe('Zzz…');
    expect(mimiLine(base({ personality: 'glotona' }), 'feed', () => 0)).toBe('¡Más gelatina, por favor!');
    expect(mimiLine(base({ personality: null }), 'pet', () => 0.999)).toBe('¡Jiji, cosquillas!');
  });
});
