import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/state/model';
import { SHOP_ITEMS, buyItem, findItem, toggleEquip } from '../src/state/shop';

const T0 = 1_700_000_000_000;

describe('tienda', () => {
  it('compra descuenta el precio y equipa el accesorio', () => {
    const s = { ...createInitialState(T0), coins: 50 };
    const r = buyItem(s, 'lazo');
    expect(r.ok).toBe(true);
    expect(r.state.coins).toBe(50 - findItem('lazo')!.price);
    expect(r.state.owned).toContain('lazo');
    expect(r.state.equipped.head).toBe('lazo');
  });

  it('nunca deja el saldo en negativo', () => {
    const s = { ...createInitialState(T0), coins: 10 };
    const r = buyItem(s, 'corona');
    expect(r.ok).toBe(false);
    expect(r.state.coins).toBe(10);
    expect(r.state.owned).not.toContain('corona');
    expect(r.message).toMatch(/Te faltan 50 monedas/);
  });

  it('con el precio exacto queda a 0', () => {
    const price = findItem('gafas')!.price;
    const r = buyItem({ ...createInitialState(T0), coins: price }, 'gafas');
    expect(r.ok).toBe(true);
    expect(r.state.coins).toBe(0);
  });

  it('no se puede comprar dos veces ni algo inexistente', () => {
    const s = buyItem({ ...createInitialState(T0), coins: 100 }, 'lazo').state;
    const again = buyItem(s, 'lazo');
    expect(again.ok).toBe(false);
    expect(again.state.coins).toBe(s.coins);
    expect(buyItem(s, 'dragon').ok).toBe(false);
  });

  it('comprar todo con saldo justo nunca baja de 0', () => {
    let s = { ...createInitialState(T0), coins: 100 };
    for (const item of SHOP_ITEMS) {
      s = buyItem(s, item.id).state;
      expect(s.coins).toBeGreaterThanOrEqual(0);
    }
  });

  it('equipar requiere tenerlo; un accesorio por zona; volver a pulsar lo quita', () => {
    let s = { ...createInitialState(T0), coins: 200 };
    expect(toggleEquip(s, 'gorro').ok).toBe(false);
    s = buyItem(s, 'lazo').state;
    s = buyItem(s, 'gorro').state;
    expect(s.equipped.head).toBe('gorro');
    s = toggleEquip(s, 'lazo').state;
    expect(s.equipped.head).toBe('lazo');
    s = toggleEquip(s, 'lazo').state;
    expect(s.equipped.head).toBeNull();
    s = buyItem(s, 'bufanda').state;
    s = toggleEquip(s, 'gorro').state;
    expect(s.equipped).toEqual({ head: 'gorro', face: null, neck: 'bufanda' });
  });
});
