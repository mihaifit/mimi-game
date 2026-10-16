import { describe, expect, it } from 'vitest';
import * as A from '../src/core/actions';
import { MAX_ELAPSED_MS, OFFLINE_FLOOR, applyElapsed, moodOf } from '../src/core/needs';
import { defaultSave } from '../src/core/save';
import { HOUR } from './helpers';

const NOW = 1_700_000_000_000;

describe('necesidades y tiempo transcurrido', () => {
  it('bajan con el tiempo', () => {
    const s = applyElapsed(defaultSave(NOW), NOW + HOUR);
    expect(s.stats.hunger).toBeCloseTo(70 - 18, 5);
    expect(s.lastUpdate).toBe(NOW + HOUR);
  });

  it('el tiempo transcurrido está limitado y hay un suelo', () => {
    const a = applyElapsed(defaultSave(NOW), NOW + MAX_ELAPSED_MS);
    const b = applyElapsed(defaultSave(NOW), NOW + 30 * 24 * HOUR);
    expect(b.stats).toEqual(a.stats);
    for (const v of Object.values(b.stats)) expect(v).toBeGreaterThanOrEqual(OFFLINE_FLOOR - 1e-9);
  });

  it('reloj hacia atrás no cambia nada', () => {
    const s0 = defaultSave(NOW);
    const s = applyElapsed(s0, NOW - 5 * HOUR);
    expect(s.stats).toEqual(s0.stats);
    expect(s.lastUpdate).toBe(NOW - 5 * HOUR);
  });

  it('dormir recupera energía y despierta al llenarse', () => {
    const s0 = { ...defaultSave(NOW), sleeping: true, stats: { ...defaultSave(NOW).stats, energy: 20 } };
    const s1 = applyElapsed(s0, NOW + HOUR);
    expect(s1.stats.energy).toBeCloseTo(65, 5);
    const s2 = applyElapsed(s0, NOW + 3 * HOUR);
    expect(s2.stats.energy).toBe(100);
    expect(s2.sleeping).toBe(false);
  });

  it('acciones', () => {
    const s = { ...defaultSave(NOW), stats: { hunger: 10, clean: 10, energy: 50, happiness: 10 } };
    expect(A.feed(s).save.stats.hunger).toBe(35);
    expect(A.wash(s).save.stats.clean).toBe(50);
    expect(A.pet(s).save.stats.happiness).toBe(19); // juguetona: 6 * 1.5
    expect(A.toggleSleep(s).save.sleeping).toBe(true);
    const asleep = { ...s, sleeping: true };
    expect(A.feed(asleep).ok).toBe(false);
    expect(A.canPlay(asleep).ok).toBe(false);
    expect(A.canPlay({ ...s, stats: { ...s.stats, energy: 5 } }).ok).toBe(false);
    expect(moodOf(s)).toBe('sad');
    expect(moodOf(asleep)).toBe('sleeping');
  });
});

describe('las personalidades tienen efectos reales', () => {
  const base = { ...defaultSave(NOW), stats: { hunger: 50, clean: 50, energy: 50, happiness: 50 } };
  const as = (p: 'juguetona' | 'glotona' | 'dormilona') => ({ ...base, personality: p });

  it('glotona: más hambre y la comida llena más', () => {
    const g = applyElapsed(as('glotona'), NOW + HOUR).stats.hunger;
    const j = applyElapsed(as('juguetona'), NOW + HOUR).stats.hunger;
    expect(g).toBeLessThan(j);
    expect(A.feed(as('glotona')).save.stats.hunger).toBeGreaterThan(A.feed(as('juguetona')).save.stats.hunger);
  });

  it('dormilona: se cansa antes y recupera más rápido', () => {
    expect(applyElapsed(as('dormilona'), NOW + HOUR).stats.energy).toBeLessThan(
      applyElapsed(as('glotona'), NOW + HOUR).stats.energy,
    );
    const sleepD = applyElapsed({ ...as('dormilona'), sleeping: true }, NOW + HOUR).stats.energy;
    const sleepG = applyElapsed({ ...as('glotona'), sleeping: true }, NOW + HOUR).stats.energy;
    expect(sleepD).toBeGreaterThan(sleepG);
  });

  it('juguetona: se aburre antes y los mimos cuentan más', () => {
    expect(applyElapsed(as('juguetona'), NOW + HOUR).stats.happiness).toBeLessThan(
      applyElapsed(as('glotona'), NOW + HOUR).stats.happiness,
    );
    expect(A.pet(as('juguetona')).save.stats.happiness).toBeGreaterThan(A.pet(as('glotona')).save.stats.happiness);
  });
});
