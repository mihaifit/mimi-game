import {
  MAX_COINS,
  MAX_NAME_LENGTH,
  NEED_KEYS,
  PERSONALITY_IDS,
  SLOTS,
  clampNeed,
  createInitialState,
  type GameState,
  type PersonalityId,
} from './model';
import { findItem } from './shop';

export const SAVE_KEY = 'mimi-game.save';
export const BACKUP_KEY = 'mimi-game.save.backup';
export const SAVE_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadStatus = 'new' | 'loaded' | 'corrupt' | 'unsupported-version' | 'unavailable';

export interface LoadResult {
  state: GameState;
  status: LoadStatus;
}

/** Devuelve localStorage si se puede leer y escribir; si no, null (modo privado, cuota, bloqueado...). */
export function detectStorage(getter: () => StorageLike | undefined = () => globalThis.localStorage): StorageLike | null {
  try {
    const storage = getter();
    if (!storage) return null;
    const probe = '__mimi_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function int(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

/**
 * Valida y normaliza un estado leído del almacenamiento. Nunca lanza.
 * Devuelve null si la forma básica no es reconocible.
 */
export function sanitizeState(raw: unknown, now: number): GameState | null {
  if (!isRecord(raw)) return null;
  if (!isRecord(raw.needs)) return null;
  const base = createInitialState(now);
  const needsRaw = raw.needs;

  const needs = { ...base.needs };
  for (const k of NEED_KEYS) {
    const v = needsRaw[k];
    needs[k] = typeof v === 'number' && Number.isFinite(v) ? clampNeed(v) : base.needs[k];
  }

  const personality: PersonalityId | null =
    typeof raw.personality === 'string' && (PERSONALITY_IDS as readonly string[]).includes(raw.personality)
      ? (raw.personality as PersonalityId)
      : null;

  const owned = Array.isArray(raw.owned)
    ? [...new Set(raw.owned.filter((id): id is string => typeof id === 'string' && !!findItem(id)))]
    : [];

  const equipped = { ...base.equipped };
  if (isRecord(raw.equipped)) {
    for (const slot of SLOTS) {
      const id = raw.equipped[slot];
      if (typeof id === 'string' && owned.includes(id) && findItem(id)?.slot === slot) equipped[slot] = id;
    }
  }

  const name =
    typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim().slice(0, MAX_NAME_LENGTH) : base.name;

  // Un lastTick en el futuro (reloj cambiado) se trata como "ahora".
  const lastTick =
    typeof raw.lastTick === 'number' && Number.isFinite(raw.lastTick) && raw.lastTick > 0
      ? Math.min(raw.lastTick, now)
      : now;

  const hopRuns = int(raw.hopRuns, 0, Number.MAX_SAFE_INTEGER, 0);

  return {
    name,
    personality,
    needs,
    coins: int(raw.coins, 0, MAX_COINS, base.coins),
    owned,
    equipped,
    sleeping: raw.sleeping === true,
    lastTick,
    hopBest: int(raw.hopBest, 0, 1_000_000, 0),
    hopRuns,
    hopLastRewardedRun: int(raw.hopLastRewardedRun, 0, hopRuns, hopRuns),
  };
}

export function loadGame(storage: StorageLike | null, now: number): LoadResult {
  if (!storage) return { state: createInitialState(now), status: 'unavailable' };
  let text: string | null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return { state: createInitialState(now), status: 'unavailable' };
  }
  if (text === null) return { state: createInitialState(now), status: 'new' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    backup(storage, text);
    return { state: createInitialState(now), status: 'corrupt' };
  }
  if (!isRecord(parsed) || typeof parsed.version !== 'number') {
    backup(storage, text);
    return { state: createInitialState(now), status: 'corrupt' };
  }
  if (parsed.version > SAVE_VERSION) {
    // Guardado de una versión más nueva: no se toca para no perderlo.
    return { state: createInitialState(now), status: 'unsupported-version' };
  }
  const state = sanitizeState(parsed.state, now);
  if (!state) {
    backup(storage, text);
    return { state: createInitialState(now), status: 'corrupt' };
  }
  return { state, status: 'loaded' };
}

function backup(storage: StorageLike, text: string): void {
  try {
    storage.setItem(BACKUP_KEY, text);
  } catch {
    /* sin espacio: se ignora */
  }
}

export function serialize(state: GameState): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: Date.now(), state });
}

/** Guarda; devuelve false si no se pudo (sin almacenamiento, cuota llena...). */
export function saveGame(storage: StorageLike | null, state: GameState): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* ignorado */
  }
}

/** Almacenamiento en memoria para pruebas. */
export class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}
