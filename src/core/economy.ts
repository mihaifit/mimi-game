import { PERSONALITIES } from './personalities';
import { clamp } from './needs';
import type { SaveData, Slot } from './types';

export interface ShopItem {
  id: string;
  name: string;
  slot: Slot;
  price: number;
}

export const CATALOG: ShopItem[] = [
  { id: 'lazo', name: 'Lazo rosa', slot: 'head', price: 30 },
  { id: 'gorro', name: 'Gorro de lana', slot: 'head', price: 60 },
  { id: 'corona', name: 'Corona brillante', slot: 'head', price: 120 },
  { id: 'gafas', name: 'Gafas redondas', slot: 'face', price: 45 },
  { id: 'estrellas', name: 'Gafas de estrella', slot: 'face', price: 80 },
  { id: 'pajarita', name: 'Pajarita', slot: 'neck', price: 35 },
  { id: 'bufanda', name: 'Bufanda menta', slot: 'neck', price: 50 },
];

export const SLOT_NAMES: Record<Slot, string> = { head: 'Cabeza', face: 'Cara', neck: 'Cuello' };

export const itemById = (id: string) => CATALOG.find((i) => i.id === id);

/** Tope de monedas por partida para que la economía no se dispare. */
export const MAX_COINS_PER_RUN = 40;
export const MAX_COINS = 99_999;

export type Result<T> = { ok: true; save: T } | { ok: false; save: T; reason: string };

export function buyItem(save: SaveData, id: string): Result<SaveData> {
  const item = itemById(id);
  if (!item) return { ok: false, save, reason: 'Ese accesorio no existe.' };
  if (save.owned.includes(id)) return { ok: false, save, reason: 'Ya tienes este accesorio.' };
  if (save.coins < item.price) {
    return { ok: false, save, reason: `Te faltan ${item.price - save.coins} monedas.` };
  }
  return {
    ok: true,
    save: { ...save, coins: save.coins - item.price, owned: [...save.owned, id] },
  };
}

/** Equipa (o quita, si ya estaba puesto) un accesorio comprado. */
export function toggleEquip(save: SaveData, id: string): Result<SaveData> {
  const item = itemById(id);
  if (!item) return { ok: false, save, reason: 'Ese accesorio no existe.' };
  if (!save.owned.includes(id)) return { ok: false, save, reason: 'Primero tienes que comprarlo.' };
  const equipped = { ...save.equipped };
  if (equipped[item.slot] === id) delete equipped[item.slot];
  else equipped[item.slot] = id;
  return { ok: true, save: { ...save, equipped } };
}

export function coinsForScore(save: SaveData, score: number): number {
  const s = Math.max(0, Math.floor(score));
  if (s === 0) return 0;
  const base = 2 + s; // 2 por participar con al menos un salto + 1 por obstáculo
  return Math.min(MAX_COINS_PER_RUN, Math.floor(base * PERSONALITIES[save.personality].hopCoinMul));
}

/** Registra el inicio de una partida y devuelve su id único. */
export function startRun(save: SaveData): { save: SaveData; runId: number } {
  const runId = save.hop.runsStarted + 1;
  return {
    runId,
    save: {
      ...save,
      stats: {
        ...save.stats,
        energy: clamp(save.stats.energy - 8),
        hunger: clamp(save.stats.hunger - 4),
      },
      hop: { ...save.hop, runsStarted: runId },
    },
  };
}

export interface RewardResult {
  save: SaveData;
  coins: number;
  newBest: boolean;
  duplicate: boolean;
}

/**
 * Cobra la recompensa de una partida terminada. Cada runId solo cobra una
 * vez: repetir la llamada (doble toque, recarga, reintento) no da más monedas.
 */
export function claimRunReward(save: SaveData, runId: number, score: number): RewardResult {
  if (!Number.isInteger(runId) || runId <= save.hop.lastRewardedRun || runId > save.hop.runsStarted) {
    return { save, coins: 0, newBest: false, duplicate: true };
  }
  const coins = coinsForScore(save, score);
  const s = Math.max(0, Math.floor(score));
  const newBest = s > save.hop.best;
  return {
    coins,
    newBest,
    duplicate: false,
    save: {
      ...save,
      coins: Math.min(MAX_COINS, save.coins + coins),
      stats: { ...save.stats, happiness: clamp(save.stats.happiness + Math.min(25, 6 + s * 2)) },
      hop: {
        ...save.hop,
        best: newBest ? s : save.hop.best,
        lastRewardedRun: runId,
        totalCoinsEarned: save.hop.totalCoinsEarned + coins,
      },
    },
  };
}
