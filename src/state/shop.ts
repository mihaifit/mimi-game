import { cloneState, type GameState, type Slot } from './model';
import type { ActionResult } from './care';

export interface ShopItem {
  id: string;
  name: string;
  slot: Slot;
  price: number;
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  { id: 'lazo', name: 'Lazo rosa', slot: 'head', price: 15 },
  { id: 'gorro', name: 'Gorrito de lana', slot: 'head', price: 35 },
  { id: 'corona', name: 'Corona de flores', slot: 'head', price: 60 },
  { id: 'gafas', name: 'Gafas redondas', slot: 'face', price: 25 },
  { id: 'estrellas', name: 'Gafas de estrella', slot: 'face', price: 45 },
  { id: 'pajarita', name: 'Pajarita', slot: 'neck', price: 20 },
  { id: 'bufanda', name: 'Bufanda menta', slot: 'neck', price: 40 },
];

export const SLOT_LABELS: Record<Slot, string> = { head: 'Cabeza', face: 'Cara', neck: 'Cuello' };

export function findItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

export function buyItem(state: GameState, id: string): ActionResult {
  const item = findItem(id);
  if (!item) return { state, ok: false, message: 'Ese accesorio no existe.' };
  if (state.owned.includes(id)) return { state, ok: false, message: `Ya tienes ${item.name}.` };
  if (state.coins < item.price) {
    const missing = item.price - state.coins;
    return { state, ok: false, message: `Te faltan ${missing} ${missing === 1 ? 'moneda' : 'monedas'} para ${item.name}.` };
  }
  const next = cloneState(state);
  next.coins = state.coins - item.price;
  next.owned.push(id);
  next.equipped[item.slot] = id;
  return { state: next, ok: true, message: `¡Has comprado ${item.name}! Ya lo lleva puesto.` };
}

/** Equipa un accesorio propio; si ya está puesto, se lo quita. */
export function toggleEquip(state: GameState, id: string): ActionResult {
  const item = findItem(id);
  if (!item) return { state, ok: false, message: 'Ese accesorio no existe.' };
  if (!state.owned.includes(id)) return { state, ok: false, message: `Primero tienes que comprar ${item.name}.` };
  const next = cloneState(state);
  if (state.equipped[item.slot] === id) {
    next.equipped[item.slot] = null;
    return { state: next, ok: true, message: `Le has quitado ${item.name}.` };
  }
  next.equipped[item.slot] = id;
  return { state: next, ok: true, message: `Mimi lleva ${item.name}.` };
}
