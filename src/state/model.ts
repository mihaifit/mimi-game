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

/** Cuidados que pueden dar experiencia (con enfriamiento anti-spam). */
export const CARE_KINDS = ['feed', 'clean', 'pet', 'sleep'] as const;
export type CareKind = (typeof CARE_KINDS)[number];

export const MISSION_IDS = ['care', 'hop', 'move'] as const;
export type MissionId = (typeof MISSION_IDS)[number];

/** Progreso de las misiones del día (fecha local AAAA-MM-DD). */
export interface DailyState {
  day: string;
  /** Cuidados útiles hechos hoy. */
  care: number;
  /** Obstáculos superados hoy en MIMI HOP (acumulados entre partidas). */
  hop: number;
  /** Pausas de movimiento confirmadas y recompensadas hoy. */
  move: number;
  claimed: MissionId[];
}

export interface Stats {
  usefulCares: number;
  hopObstacles: number;
  movePauses: number;
  /** Días en los que se reclamaron las tres misiones. */
  perfectDays: number;
}

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
  /* ---- v2 ---- */
  /** Experiencia total de vínculo. El nivel se deriva de ella. */
  xp: number;
  /** Nivel más alto cuya recompensa ya se entregó (evita cobrarla dos veces). */
  levelRewarded: number;
  /** Último instante en que cada cuidado dio experiencia. */
  careXpAt: Record<CareKind, number>;
  daily: DailyState;
  /** Contador de pausas de movimiento iniciadas (identificador de sesión). */
  moveSessions: number;
  /** Última sesión de movimiento ya resuelta (cobrada o descartada). */
  moveLastRewarded: number;
  /** Logros desbloqueados (permanentes). */
  achievements: string[];
  stats: Stats;
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

/** Clave de día local AAAA-MM-DD. */
export function dayKey(now: number): string {
  const d = new Date(now);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function emptyDaily(day: string): DailyState {
  return { day, care: 0, hop: 0, move: 0, claimed: [] };
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
    xp: 0,
    levelRewarded: 1,
    careXpAt: { feed: 0, clean: 0, pet: 0, sleep: 0 },
    daily: emptyDaily(dayKey(now)),
    moveSessions: 0,
    moveLastRewarded: 0,
    achievements: [],
    stats: { usefulCares: 0, hopObstacles: 0, movePauses: 0, perfectDays: 0 },
  };
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    needs: { ...s.needs },
    owned: [...s.owned],
    equipped: { ...s.equipped },
    careXpAt: { ...s.careXpAt },
    daily: { ...s.daily, claimed: [...s.daily.claimed] },
    achievements: [...s.achievements],
    stats: { ...s.stats },
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
