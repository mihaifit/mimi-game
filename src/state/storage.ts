import {
  CARE_KINDS,
  MAX_COINS,
  MISSION_IDS,
  MAX_NAME_LENGTH,
  NEED_KEYS,
  PERSONALITY_IDS,
  SLOTS,
  clampNeed,
  createInitialState,
  dayKey,
  emptyDaily,
  type DailyState,
  type GameState,
  type MissionId,
  type PersonalityId,
} from './model';
import { ACHIEVEMENT_IDS, MAX_XP, levelOf } from './progress';
import { findItem } from './shop';

export const SAVE_KEY = 'mimi-game.save';
export const BACKUP_KEY = 'mimi-game.save.backup';
/** Copia intacta del guardado v1 que se hace una sola vez antes de migrarlo. */
export const V1_BACKUP_KEY = 'mimi-game.save.v1';
export const SAVE_VERSION = 2;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadStatus = 'new' | 'loaded' | 'migrated' | 'corrupt' | 'unsupported-version' | 'unavailable';

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

  // v2 (campos ausentes en v1 → valores por defecto: migración aditiva).
  const xp = int(raw.xp, 0, MAX_XP, 0);
  const level = levelOf(xp);
  // Si falta, se asume que los niveles ya alcanzados están pagados (nunca se paga doble).
  const levelRewarded = int(raw.levelRewarded, 1, level, level);

  const owned = Array.isArray(raw.owned)
    ? [
        ...new Set(
          raw.owned.filter((id): id is string => {
            if (typeof id !== 'string') return false;
            const item = findItem(id);
            // Los regalos de nivel solo valen si ese nivel se alcanzó.
            return !!item && (!item.unlockLevel || levelRewarded >= item.unlockLevel);
          }),
        ),
      ]
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

  const careXpAt = { ...base.careXpAt };
  if (isRecord(raw.careXpAt)) {
    for (const k of CARE_KINDS) careXpAt[k] = int(raw.careXpAt[k], 0, now, 0);
  }

  const moveSessions = int(raw.moveSessions, 0, Number.MAX_SAFE_INTEGER, 0);
  const statsRaw = isRecord(raw.stats) ? raw.stats : {};
  const achievements = Array.isArray(raw.achievements)
    ? [...new Set(raw.achievements.filter((id): id is string => typeof id === 'string' && ACHIEVEMENT_IDS.includes(id)))]
    : [];

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
    xp,
    levelRewarded,
    careXpAt,
    daily: sanitizeDaily(raw.daily, now),
    moveSessions,
    moveLastRewarded: int(raw.moveLastRewarded, 0, moveSessions, moveSessions),
    achievements,
    stats: {
      usefulCares: int(statsRaw.usefulCares, 0, 1_000_000, 0),
      hopObstacles: int(statsRaw.hopObstacles, 0, 1_000_000_000, 0),
      movePauses: int(statsRaw.movePauses, 0, 1_000_000, 0),
      perfectDays: int(statsRaw.perfectDays, 0, 1_000_000, 0),
    },
  };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeDaily(raw: unknown, now: number): DailyState {
  if (!isRecord(raw) || typeof raw.day !== 'string' || !DAY_RE.test(raw.day)) return emptyDaily(dayKey(now));
  // Un día guardado en el futuro (reloj atrasado ahora) se conserva: así no se renuevan ni duplican premios.
  const claimed = Array.isArray(raw.claimed)
    ? [...new Set(raw.claimed.filter((id): id is MissionId => typeof id === 'string' && (MISSION_IDS as readonly string[]).includes(id)))]
    : [];
  return {
    day: raw.day,
    care: int(raw.care, 0, 999, 0),
    hop: int(raw.hop, 0, 999, 0),
    move: int(raw.move, 0, 999, 0),
    claimed,
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
  if (!isRecord(parsed) || typeof parsed.version !== 'number' || !Number.isInteger(parsed.version) || parsed.version < 1) {
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
  if (parsed.version < SAVE_VERSION) {
    // Migración aditiva: se conserva una copia exacta del guardado antiguo (solo la primera vez).
    try {
      if (storage.getItem(V1_BACKUP_KEY) === null) storage.setItem(V1_BACKUP_KEY, text);
    } catch {
      /* sin espacio: la migración sigue igualmente */
    }
    return { state, status: 'migrated' };
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
