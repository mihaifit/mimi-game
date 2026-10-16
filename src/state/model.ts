// Modelo de datos puro de MIMI: sin DOM, sin Phaser, fácil de probar.

export const NEED_KEYS = ['hunger', 'hygiene', 'energy', 'affection'] as const;
export type NeedKey = (typeof NEED_KEYS)[number];
export type Needs = Record<NeedKey, number>;

export const NEED_LABELS: Record<NeedKey, string> = {
  hunger: 'Saciedad',
  hygiene: 'Limpieza',
  energy: 'Energía',
  affection: 'Cariño',
};

export const PERSONALITY_IDS = ['juguetona', 'dormilona', 'glotona'] as const;
export type PersonalityId = (typeof PERSONALITY_IDS)[number];

export const SLOTS = ['head', 'face', 'neck'] as const;
export type Slot = (typeof SLOTS)[number];
export type Equipped = Record<Slot, string | null>;

export interface GameState {
  name: string;
  personality: PersonalityId | null;
  needs: Needs;
  coins: number;
  owned: string[];
  equipped: Equipped;
  sleeping: boolean;
  /** Último instante (ms epoch) hasta el que se aplicó la evolución de necesidades. */
  lastTick: number;
  hopBest: number;
  /** Contador de partidas de MIMI HOP iniciadas (identificador de partida). */
  hopRuns: number;
  /** Última partida cuya recompensa ya se cobró: evita cobrar dos veces. */
  hopLastRewardedRun: number;
}

export const NEED_MIN = 0;
export const NEED_MAX = 100;
export const START_COINS = 20;
export const MAX_COINS = 999_999;
export const MAX_NAME_LENGTH = 16;
/** La evolución acumulada fuera de la app se limita a 4 horas. */
export const MAX_ELAPSED_MS = 4 * 60 * 60 * 1000;

export function clampNeed(value: number): number {
  if (!Number.isFinite(value)) return NEED_MIN;
  return Math.min(NEED_MAX, Math.max(NEED_MIN, value));
}

export function createInitialState(now: number): GameState {
  return {
    name: 'Mimi',
    personality: null,
    needs: { hunger: 80, hygiene: 85, energy: 90, affection: 75 },
    coins: START_COINS,
    owned: [],
    equipped: { head: null, face: null, neck: null },
    sleeping: false,
    lastTick: now,
    hopBest: 0,
    hopRuns: 0,
    hopLastRewardedRun: 0,
  };
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    needs: { ...s.needs },
    owned: [...s.owned],
    equipped: { ...s.equipped },
  };
}

export type Mood = 'feliz' | 'tranquila' | 'inquieta' | 'triste';

export function moodOf(needs: Needs): Mood {
  const avg = NEED_KEYS.reduce((sum, k) => sum + needs[k], 0) / NEED_KEYS.length;
  const lowest = Math.min(...NEED_KEYS.map((k) => needs[k]));
  if (lowest < 15 || avg < 30) return 'triste';
  if (lowest < 35 || avg < 55) return 'inquieta';
  if (avg < 78) return 'tranquila';
  return 'feliz';
}

export const MOOD_LABELS: Record<Mood, string> = {
  feliz: 'Feliz',
  tranquila: 'Tranquila',
  inquieta: 'Inquieta',
  triste: 'Triste',
};

export function lowestNeed(needs: Needs): NeedKey {
  return NEED_KEYS.reduce((min, k) => (needs[k] < needs[min] ? k : min), NEED_KEYS[0]);
}
