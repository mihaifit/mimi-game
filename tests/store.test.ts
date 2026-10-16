import { describe, expect, it } from 'vitest';
import { SAVE_KEY } from '../src/core/save';
import { Store } from '../src/game/store';
import { HOUR, MemoryStorage } from './helpers';

describe('Store: persistencia de extremo a extremo', () => {
  it('guarda tras cada acción y aplica el tiempo al recargar', () => {
    let now = 1_700_000_000_000;
    const st = new MemoryStorage();
    const a = new Store(st, () => now);
    a.choosePersonality('glotona');
    a.feed();
    const runId = a.startRun();
    a.finishRun(runId, 8);
    a.finishRun(runId, 8); // doble llamada: no duplica
    const coins = a.save.coins;
    expect(coins).toBe(40 + 10);
    a.buy('lazo');
    expect(a.save.equipped.head).toBe('lazo');
    expect(JSON.parse(st.getItem(SAVE_KEY)!).coins).toBe(20);

    now += 2 * HOUR;
    const b = new Store(st, () => now);
    expect(b.loadSource).toBe('primary');
    expect(b.save.personality).toBe('glotona');
    expect(b.save.coins).toBe(20);
    expect(b.save.owned).toEqual(['lazo']);
    expect(b.save.hop.best).toBe(8);
    expect(b.save.stats.hunger).toBeLessThan(a.save.stats.hunger);
  });
});
