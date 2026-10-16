import { describe, expect, it } from 'vitest';
import { BACKUP_KEY, SAVE_KEY, SAVE_VERSION, defaultSave, loadSave, sanitize, writeSave } from '../src/core/save';
import { MemoryStorage } from './helpers';

const NOW = 1_700_000_000_000;

describe('guardado local versionado', () => {
  it('partida nueva: estado inicial útil', () => {
    const { save, source } = loadSave(new MemoryStorage(), NOW);
    expect(source).toBe('new');
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.coins).toBeGreaterThanOrEqual(30); // alcanza para el accesorio más barato
    expect(save.onboarded).toBe(false);
  });

  it('ida y vuelta conserva los datos', () => {
    const st = new MemoryStorage();
    const s = { ...defaultSave(NOW), coins: 77, owned: ['lazo'], equipped: { head: 'lazo' }, onboarded: true };
    expect(writeSave(st, s)).toBe(true);
    const { save, source } = loadSave(st, NOW);
    expect(source).toBe('primary');
    expect(save).toEqual(s);
  });

  it('JSON dañado recupera la copia de seguridad', () => {
    const st = new MemoryStorage();
    writeSave(st, { ...defaultSave(NOW), coins: 11 });
    writeSave(st, { ...defaultSave(NOW), coins: 22 });
    st.setItem(SAVE_KEY, '{roto');
    const { save, source } = loadSave(st, NOW);
    expect(source).toBe('backup');
    expect(save.coins).toBe(11);
  });

  it('todo dañado reinicia sin romper', () => {
    const st = new MemoryStorage();
    st.setItem(SAVE_KEY, 'nope');
    st.setItem(BACKUP_KEY, '[1,2');
    const { save, source } = loadSave(st, NOW);
    expect(source).toBe('corrupt-reset');
    expect(save).toEqual(defaultSave(NOW));
  });

  it('sanea valores fuera de rango y trampas', () => {
    const s = sanitize(
      {
        version: 2,
        personality: 'hacker',
        stats: { hunger: 500, clean: -3, energy: 'x', happiness: NaN },
        coins: -50,
        owned: ['lazo', 'lazo', 'nave-espacial', 3],
        equipped: { head: 'corona', face: 'lazo', neck: 'pajarita' },
        hop: { best: 12.7, runsStarted: 3, lastRewardedRun: 99 },
        lastUpdate: NOW + 10 * 3_600_000,
      },
      NOW,
    );
    expect(s.personality).toBe('juguetona');
    expect(s.stats).toEqual({ hunger: 100, clean: 0, energy: 85, happiness: 65 });
    expect(s.coins).toBe(0);
    expect(s.owned).toEqual(['lazo']);
    expect(s.equipped).toEqual({}); // corona no comprada; lazo en ranura equivocada
    expect(s.hop.best).toBe(12);
    expect(s.hop.lastRewardedRun).toBe(3);
    expect(s.lastUpdate).toBe(NOW);
  });

  it('migra la versión 1', () => {
    const s = sanitize({ version: 1, stats: { hunger: 40 }, coins: 15, best: 9, hats: ['gorro'] }, NOW);
    expect(s.version).toBe(2);
    expect(s.owned).toEqual(['gorro']);
    expect(s.hop.best).toBe(9);
    expect(s.stats.hunger).toBe(40);
    expect(s.coins).toBe(15);
  });

  it('almacenamiento lleno o bloqueado no lanza errores', () => {
    const st = new MemoryStorage();
    st.failWrites = true;
    expect(writeSave(st, defaultSave(NOW))).toBe(false);
    expect(writeSave(null, defaultSave(NOW))).toBe(false);
    expect(loadSave(null, NOW).source).toBe('new');
  });
});
