import { describe, expect, it } from 'vitest';
import { MAX_COINS_PER_RUN, buyItem, claimRunReward, coinsForScore, startRun, toggleEquip } from '../src/core/economy';
import { defaultSave } from '../src/core/save';

const NOW = 1_700_000_000_000;

describe('tienda', () => {
  it('compra con saldo suficiente y descuenta', () => {
    const r = buyItem({ ...defaultSave(NOW), coins: 40 }, 'lazo');
    expect(r.ok).toBe(true);
    expect(r.save.coins).toBe(10);
    expect(r.save.owned).toEqual(['lazo']);
  });

  it('rechaza saldo insuficiente, duplicados e ids falsos', () => {
    const s = { ...defaultSave(NOW), coins: 40 };
    const poor = buyItem(s, 'corona');
    expect(poor.ok).toBe(false);
    expect(poor.save).toBe(s);
    if (!poor.ok) expect(poor.reason).toContain('80');
    const owned = buyItem({ ...s, owned: ['lazo'] }, 'lazo');
    expect(owned.ok).toBe(false);
    expect(buyItem(s, 'trampa').ok).toBe(false);
  });

  it('equipar requiere tenerlo; una pieza por ranura; volver a tocar lo quita', () => {
    const s = { ...defaultSave(NOW), owned: ['lazo', 'gorro', 'gafas'] };
    expect(toggleEquip(defaultSave(NOW), 'lazo').ok).toBe(false);
    let x = toggleEquip(s, 'lazo').save;
    x = toggleEquip(x, 'gafas').save;
    x = toggleEquip(x, 'gorro').save;
    expect(x.equipped).toEqual({ head: 'gorro', face: 'gafas' });
    x = toggleEquip(x, 'gorro').save;
    expect(x.equipped).toEqual({ face: 'gafas' });
  });
});

describe('recompensas de MIMI HOP', () => {
  it('cobra una sola vez por partida', () => {
    const { save, runId } = startRun(defaultSave(NOW));
    expect(runId).toBe(1);
    const r1 = claimRunReward(save, runId, 10);
    expect(r1.duplicate).toBe(false);
    expect(r1.coins).toBe(Math.floor(12 * 1.25));
    expect(r1.save.coins).toBe(save.coins + r1.coins);
    const r2 = claimRunReward(r1.save, runId, 10);
    expect(r2.duplicate).toBe(true);
    expect(r2.coins).toBe(0);
    expect(r2.save.coins).toBe(r1.save.coins);
  });

  it('no cobra partidas no iniciadas ni antiguas', () => {
    const s = defaultSave(NOW);
    expect(claimRunReward(s, 1, 50).duplicate).toBe(true);
    let { save } = startRun(s);
    const a = startRun(save);
    save = claimRunReward(a.save, a.runId, 3).save;
    expect(claimRunReward(save, 1, 50).duplicate).toBe(true); // la partida 1 es anterior
  });

  it('récord local y tope por partida', () => {
    const { save, runId } = startRun({ ...defaultSave(NOW), hop: { best: 5, runsStarted: 0, lastRewardedRun: 0, totalCoinsEarned: 0 } });
    const r = claimRunReward(save, runId, 500);
    expect(r.newBest).toBe(true);
    expect(r.save.hop.best).toBe(500);
    expect(r.coins).toBe(MAX_COINS_PER_RUN);
    expect(coinsForScore(save, 0)).toBe(0);
  });

  it('una partida gasta energía', () => {
    const s = defaultSave(NOW);
    expect(startRun(s).save.stats.energy).toBeLessThan(s.stats.energy);
  });
});
