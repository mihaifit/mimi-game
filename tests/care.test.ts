import { describe, expect, it } from 'vitest';
import {
  DECAY_PER_MIN,
  HOP_MAX_COINS,
  advance,
  canPlayHop,
  choosePersonality,
  claimHopReward,
  clean,
  feed,
  hopCoinsFor,
  pet,
  startHopRun,
  toggleSleep,
} from '../src/state/care';
import { MAX_ELAPSED_MS, NEED_KEYS, createInitialState, moodOf, type GameState } from '../src/state/model';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

function base(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialState(T0), personality: 'juguetona', ...overrides };
}

describe('evolución de necesidades', () => {
  it('bajan con el tiempo según la tasa base', () => {
    const s = base({ personality: 'dormilona' });
    const next = advance(s, T0 + 10 * MIN);
    expect(next.needs.hunger).toBeCloseTo(s.needs.hunger - DECAY_PER_MIN.hunger * 10, 5);
    expect(next.lastTick).toBe(T0 + 10 * MIN);
  });

  it('nunca bajan de 0 ni pasan de 100', () => {
    const s = base();
    const next = advance(s, T0 + 1000 * MIN);
    for (const k of NEED_KEYS) {
      expect(next.needs[k]).toBeGreaterThanOrEqual(0);
      expect(next.needs[k]).toBeLessThanOrEqual(100);
    }
  });

  it('el tiempo acumulado está limitado a MAX_ELAPSED_MS', () => {
    const s = base({ needs: { hunger: 100, hygiene: 100, energy: 100, affection: 100 } });
    const capped = advance(s, T0 + MAX_ELAPSED_MS);
    const week = advance(s, T0 + 7 * 24 * 60 * MIN);
    expect(week.needs).toEqual(capped.needs);
  });

  it('si el reloj retrocede no cambia nada', () => {
    const s = base();
    const next = advance(s, T0 - 30 * MIN);
    expect(next.needs).toEqual(s.needs);
  });

  it('no muta el estado original', () => {
    const s = base();
    const copy = structuredClone(s);
    advance(s, T0 + 30 * MIN);
    feed(s);
    expect(s).toEqual(copy);
  });

  it('dormida recupera energía y se despierta sola al llenarla', () => {
    const s = base({ sleeping: true, needs: { hunger: 80, hygiene: 80, energy: 50, affection: 80 } });
    const after5 = advance(s, T0 + 5 * MIN);
    expect(after5.needs.energy).toBeGreaterThan(50);
    expect(after5.sleeping).toBe(true);
    const after60 = advance(s, T0 + 60 * MIN);
    expect(after60.needs.energy).toBe(100);
    expect(after60.sleeping).toBe(false);
  });
});

describe('cuidados', () => {
  it('alimentar sube saciedad y rechaza si está llena', () => {
    const s = base({ needs: { hunger: 50, hygiene: 80, energy: 80, affection: 80 } });
    const r = feed(s);
    expect(r.ok).toBe(true);
    expect(r.state.needs.hunger).toBe(80);
    const full = feed(base({ needs: { hunger: 99, hygiene: 80, energy: 80, affection: 80 } }));
    expect(full.ok).toBe(false);
  });

  it('no se puede comer ni bañar dormida, pero sí recibir caricias', () => {
    const s = base({ sleeping: true });
    expect(feed(s).ok).toBe(false);
    expect(clean(s).ok).toBe(false);
    expect(pet(s).ok).toBe(true);
  });

  it('dormir requiere algo de cansancio y despertar siempre funciona', () => {
    expect(toggleSleep(base({ needs: { hunger: 80, hygiene: 80, energy: 95, affection: 80 } })).ok).toBe(false);
    const asleep = toggleSleep(base({ needs: { hunger: 80, hygiene: 80, energy: 40, affection: 80 } }));
    expect(asleep.ok).toBe(true);
    expect(asleep.state.sleeping).toBe(true);
    const awake = toggleSleep(asleep.state);
    expect(awake.state.sleeping).toBe(false);
  });

  it('cuidar una necesidad baja da 1 moneda', () => {
    const s = base({ coins: 5, needs: { hunger: 20, hygiene: 80, energy: 80, affection: 80 } });
    expect(feed(s).state.coins).toBe(6);
    const fine = base({ coins: 5, needs: { hunger: 60, hygiene: 80, energy: 80, affection: 80 } });
    expect(feed(fine).state.coins).toBe(5);
  });

  it('el humor refleja las necesidades', () => {
    expect(moodOf({ hunger: 100, hygiene: 100, energy: 100, affection: 100 })).toBe('feliz');
    expect(moodOf({ hunger: 10, hygiene: 100, energy: 100, affection: 100 })).toBe('triste');
    expect(moodOf({ hunger: 30, hygiene: 60, energy: 60, affection: 60 })).toBe('inquieta');
  });
});

describe('personalidades', () => {
  const needs = { hunger: 50, hygiene: 50, energy: 50, affection: 50 };

  it('juguetona: caricias +50 % y pierde cariño más rápido', () => {
    const j = base({ personality: 'juguetona', needs });
    const g = base({ personality: 'glotona', needs });
    expect(pet(j).state.needs.affection).toBe(68);
    expect(pet(g).state.needs.affection).toBe(62);
    expect(advance(j, T0 + 10 * MIN).needs.affection).toBeLessThan(advance(g, T0 + 10 * MIN).needs.affection);
  });

  it('glotona: comer sacia más y da cariño', () => {
    const g = feed(base({ personality: 'glotona', needs }));
    const d = feed(base({ personality: 'dormilona', needs }));
    expect(g.state.needs.hunger).toBeGreaterThan(d.state.needs.hunger);
    expect(g.state.needs.affection).toBeGreaterThan(d.state.needs.affection);
  });

  it('dormilona: dormir recupera más energía', () => {
    const d = advance(base({ personality: 'dormilona', sleeping: true, needs }), T0 + 4 * MIN);
    const j = advance(base({ personality: 'juguetona', sleeping: true, needs }), T0 + 4 * MIN);
    expect(d.needs.energy).toBeGreaterThan(j.needs.energy);
  });

  it('se puede elegir personalidad', () => {
    const r = choosePersonality(base({ personality: null }), 'glotona');
    expect(r.state.personality).toBe('glotona');
  });
});

describe('recompensas de MIMI HOP', () => {
  it('calcula monedas con tope y bonus de juguetona', () => {
    expect(hopCoinsFor(0, 'glotona')).toBe(0);
    expect(hopCoinsFor(1, 'glotona')).toBe(1);
    expect(hopCoinsFor(10, 'glotona')).toBe(6);
    expect(hopCoinsFor(10, 'juguetona')).toBe(7);
    expect(hopCoinsFor(10_000, 'juguetona')).toBe(HOP_MAX_COINS);
    expect(hopCoinsFor(Number.NaN, 'glotona')).toBe(0);
    expect(hopCoinsFor(-5, 'glotona')).toBe(0);
  });

  it('cobra una sola vez por partida y actualiza el récord', () => {
    const s0 = base({ personality: 'glotona', coins: 10 });
    const { state: s1, runId } = startHopRun(s0);
    const r1 = claimHopReward(s1, runId, 10);
    expect(r1.alreadyClaimed).toBe(false);
    expect(r1.state.coins).toBe(16);
    expect(r1.newRecord).toBe(true);
    expect(r1.state.hopBest).toBe(10);
    const r2 = claimHopReward(r1.state, runId, 10);
    expect(r2.alreadyClaimed).toBe(true);
    expect(r2.state.coins).toBe(16);
  });

  it('rechaza identificadores de partida no iniciados', () => {
    const s = base();
    expect(claimHopReward(s, 1, 50).alreadyClaimed).toBe(true);
    expect(claimHopReward(s, 0, 50).alreadyClaimed).toBe(true);
  });

  it('un récord inferior no lo sobrescribe', () => {
    const s0 = base({ hopBest: 30 });
    const { state, runId } = startHopRun(s0);
    const r = claimHopReward(state, runId, 5);
    expect(r.newRecord).toBe(false);
    expect(r.state.hopBest).toBe(30);
  });

  it('no se puede jugar dormida ni sin energía', () => {
    expect(canPlayHop(base({ sleeping: true })).ok).toBe(false);
    expect(canPlayHop(base({ needs: { hunger: 80, hygiene: 80, energy: 5, affection: 80 } })).ok).toBe(false);
    expect(canPlayHop(base()).ok).toBe(true);
  });
});
