// Preferencias del dispositivo (sonido). Se guardan aparte de la partida para que
// funcionen aunque el guardado sea de una versión futura o esté dañado.
import type { StorageLike } from './storage';

export const PREFS_KEY = 'mimi-game.prefs';

export interface Prefs {
  sound: boolean;
  /** 0..1, discreto por defecto. */
  volume: number;
}

export const DEFAULT_PREFS: Prefs = { sound: true, volume: 0.5 };

export function loadPrefs(storage: StorageLike | null): Prefs {
  if (!storage) return { ...DEFAULT_PREFS };
  try {
    const raw = JSON.parse(storage.getItem(PREFS_KEY) ?? 'null') as unknown;
    if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFS };
    const r = raw as Record<string, unknown>;
    const volume = typeof r.volume === 'number' && Number.isFinite(r.volume) ? Math.min(1, Math.max(0, r.volume)) : DEFAULT_PREFS.volume;
    return { sound: typeof r.sound === 'boolean' ? r.sound : DEFAULT_PREFS.sound, volume };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage: StorageLike | null, prefs: Prefs): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}
