import { PERSONALITIES } from './personalities';
import type { Mood, SaveData, StatKey, Stats } from './types';

/** Desgaste base por hora con MIMI despierta. */
export const BASE_DECAY_PER_HOUR: Stats = { hunger: 18, clean: 10, energy: 12, happiness: 15 };
/** Mientras duerme: la energía sube y el resto baja más despacio. */
export const SLEEP_DECAY_PER_HOUR: Stats = { hunger: 6, clean: 3, energy: -45, happiness: 3 };
/** Tiempo transcurrido máximo que se aplica de una vez (al volver tras una ausencia). */
export const MAX_ELAPSED_MS = 4 * 60 * 60 * 1000;
/** La ausencia nunca deja una necesidad por debajo de este suelo. */
export const OFFLINE_FLOOR = 8;

export const STAT_KEYS: StatKey[] = ['hunger', 'clean', 'energy', 'happiness'];

export const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));

/**
 * Aplica el paso del tiempo. Tiempo negativo (reloj atrasado) se ignora y el
 * tiempo transcurrido se limita a MAX_ELAPSED_MS.
 */
export function applyElapsed(save: SaveData, now: number): SaveData {
  const raw = now - save.lastUpdate;
  if (!Number.isFinite(raw) || raw <= 0) {
    return raw < 0 ? { ...save, lastUpdate: now } : save;
  }
  const elapsed = Math.min(raw, MAX_ELAPSED_MS);
  const hours = elapsed / 3_600_000;
  const p = PERSONALITIES[save.personality];
  const stats = { ...save.stats };
  const neglected = stats.hunger < 25 || stats.clean < 25;
  for (const k of STAT_KEYS) {
    let rate: number;
    if (save.sleeping) {
      rate = SLEEP_DECAY_PER_HOUR[k];
      if (k === 'energy') rate *= p.sleepRegenMul;
    } else {
      rate = BASE_DECAY_PER_HOUR[k] * p.decay[k];
      if (k === 'happiness' && neglected) rate *= 1.5;
    }
    const before = stats[k];
    let after = before - rate * hours;
    // Una ausencia larga no puede hundir a MIMI por debajo del suelo.
    if (rate > 0 && after < OFFLINE_FLOOR) after = Math.min(before, OFFLINE_FLOOR);
    stats[k] = clamp(after);
  }
  let sleeping = save.sleeping;
  // Se despierta sola al llenar la energía.
  if (sleeping && stats.energy >= 100) sleeping = false;
  return { ...save, stats, sleeping, lastUpdate: now };
}

export function moodOf(save: SaveData): Mood {
  if (save.sleeping) return 'sleeping';
  const s = save.stats;
  if (STAT_KEYS.some((k) => s[k] < 20)) return 'sad';
  const avg = (s.hunger + s.clean + s.energy + s.happiness) / 4;
  return avg >= 65 ? 'happy' : 'neutral';
}

/** Mensaje corto para la UI sobre la necesidad más urgente. */
export function needMessage(save: SaveData): string {
  if (save.sleeping) return 'MIMI está durmiendo… zzz';
  const s = save.stats;
  const lowest = STAT_KEYS.reduce((a, b) => (s[a] <= s[b] ? a : b));
  if (s[lowest] >= 60) return '¡MIMI está de maravilla! Acaríciala o juega a MIMI HOP.';
  const msg: Record<StatKey, string> = {
    hunger: 'MIMI tiene hambre. Dale de comer 🍓',
    clean: 'MIMI necesita un baño de burbujas 🫧',
    energy: 'MIMI tiene sueño. Llévala a dormir 🌙',
    happiness: 'MIMI se aburre. Acaríciala o jugad a MIMI HOP 💜',
  };
  return msg[lowest];
}
