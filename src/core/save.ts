import { CATALOG, MAX_COINS, itemById } from './economy';
import { STAT_KEYS, clamp } from './needs';
import { isPersonalityId } from './personalities';
import type { Equipped, SaveData, Slot } from './types';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'mimi.save';
export const BACKUP_KEY = 'mimi.save.backup';
export const START_COINS = 40;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function defaultSave(now: number): SaveData {
  return {
    version: SAVE_VERSION,
    personality: 'juguetona',
    onboarded: false,
    stats: { hunger: 70, clean: 80, energy: 85, happiness: 65 },
    sleeping: false,
    lastUpdate: now,
    coins: START_COINS,
    owned: [],
    equipped: {},
    hop: { best: 0, runsStarted: 0, lastRewardedRun: 0, totalCoinsEarned: 0 },
  };
}

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const int = (v: unknown, fallback: number) => Math.max(0, Math.floor(num(v, fallback)));

/**
 * v1 (prototipo): { version: 1, stats, coins, best, hats: string[] }.
 * v2 añade personalidad, ranuras de accesorios y control de recompensas por partida.
 */
function migrate(raw: Raw): Raw {
  let data = { ...raw };
  const version = num(data.version, 1);
  if (version < 2) {
    const owned = Array.isArray(data.hats) ? data.hats : [];
    data = {
      ...data,
      version: 2,
      owned,
      equipped: {},
      hop: { best: num(data.best, 0), runsStarted: 0, lastRewardedRun: 0, totalCoinsEarned: 0 },
      onboarded: true,
    };
    delete data.hats;
    delete data.best;
  }
  return data;
}

/** Convierte cualquier valor en un SaveData válido, corrigiendo campos dañados. */
export function sanitize(input: unknown, now: number): SaveData {
  const d = defaultSave(now);
  if (!isObj(input)) return d;
  const raw = migrate(input);
  const stats = { ...d.stats };
  if (isObj(raw.stats)) {
    for (const k of STAT_KEYS) stats[k] = clamp(num(raw.stats[k], d.stats[k]));
  }
  const owned = Array.isArray(raw.owned)
    ? [...new Set(raw.owned.filter((id): id is string => typeof id === 'string' && !!itemById(id)))]
    : [];
  const equipped: Equipped = {};
  if (isObj(raw.equipped)) {
    for (const slot of ['head', 'face', 'neck'] as Slot[]) {
      const id = raw.equipped[slot];
      const item = typeof id === 'string' ? itemById(id) : undefined;
      if (item && item.slot === slot && owned.includes(item.id)) equipped[slot] = item.id;
    }
  }
  const hopRaw = isObj(raw.hop) ? raw.hop : {};
  const runsStarted = int(hopRaw.runsStarted, 0);
  const lastUpdate = num(raw.lastUpdate, now);
  return {
    version: SAVE_VERSION,
    personality: isPersonalityId(raw.personality) ? raw.personality : d.personality,
    onboarded: raw.onboarded === true,
    stats,
    sleeping: raw.sleeping === true,
    // Una fecha futura (reloj cambiado) se trae al presente.
    lastUpdate: lastUpdate > now ? now : lastUpdate,
    coins: Math.min(MAX_COINS, int(raw.coins, d.coins)),
    owned,
    equipped,
    hop: {
      best: int(hopRaw.best, 0),
      runsStarted,
      lastRewardedRun: Math.min(runsStarted, int(hopRaw.lastRewardedRun, 0)),
      totalCoinsEarned: int(hopRaw.totalCoinsEarned, 0),
    },
  };
}

export type LoadSource = 'new' | 'primary' | 'backup' | 'corrupt-reset';

function tryParse(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function loadSave(storage: StorageLike | null, now: number): { save: SaveData; source: LoadSource } {
  if (!storage) return { save: defaultSave(now), source: 'new' };
  let primaryText: string | null = null;
  let backupText: string | null = null;
  try {
    primaryText = storage.getItem(SAVE_KEY);
    backupText = storage.getItem(BACKUP_KEY);
  } catch {
    return { save: defaultSave(now), source: 'new' };
  }
  const primary = tryParse(primaryText);
  if (isObj(primary)) return { save: sanitize(primary, now), source: 'primary' };
  const backup = tryParse(backupText);
  if (isObj(backup)) return { save: sanitize(backup, now), source: 'backup' };
  if (primaryText !== null || backupText !== null) return { save: defaultSave(now), source: 'corrupt-reset' };
  return { save: defaultSave(now), source: 'new' };
}

/** Guarda; la copia anterior válida pasa a ser la de respaldo. Devuelve false si falla. */
export function writeSave(storage: StorageLike | null, save: SaveData): boolean {
  if (!storage) return false;
  try {
    const previous = storage.getItem(SAVE_KEY);
    if (previous && isObj(tryParse(previous))) storage.setItem(BACKUP_KEY, previous);
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export const ALL_ITEM_IDS = CATALOG.map((i) => i.id);
