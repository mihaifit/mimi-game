import {
  MAX_COINS,
  MAX_ELAPSED_MS,
  NEED_KEYS,
  clampNeed,
  cloneState,
  type GameState,
  type NeedKey,
  type PersonalityId,
} from './model';
import { personalityOf } from './personality';

export interface ActionResult {
  state: GameState;
  ok: boolean;
  message: string;
}

/** Desgaste base por minuto (despierta). */
export const DECAY_PER_MIN: Record<NeedKey, number> = {
  hunger: 1.2,
  hygiene: 0.8,
  energy: 0.9,
  affection: 1.0,
};
/** Mientras duerme el resto de necesidades bajan a la mitad. */
export const SLEEP_DECAY_FACTOR = 0.5;
/** Energía recuperada por minuto durmiendo (antes de personalidad). */
export const SLEEP_GAIN_PER_MIN = 5;

export const FEED_GAIN = 30;
export const CLEAN_GAIN = 40;
export const PET_GAIN = 12;
export const PET_SLEEPING_GAIN = 3;
/** Cuidar una necesidad que estaba por debajo de este valor da 1 moneda. */
export const CARE_COIN_THRESHOLD = 40;

export const HOP_MIN_ENERGY = 10;
export const HOP_ENERGY_COST = 6;
export const HOP_AFFECTION_GAIN = 6;
export const HOP_MAX_COINS = 40;

export function addCoins(state: GameState, amount: number): void {
  state.coins = Math.min(MAX_COINS, Math.max(0, Math.floor(state.coins + amount)));
}

/**
 * Aplica el paso del tiempo. El tiempo transcurrido se limita a MAX_ELAPSED_MS
 * y si el reloj retrocede no se aplica nada.
 */
export function advance(state: GameState, now: number): GameState {
  if (!Number.isFinite(now)) return state;
  const elapsedMs = Math.min(MAX_ELAPSED_MS, Math.max(0, now - state.lastTick));
  const next = cloneState(state);
  next.lastTick = now;
  if (elapsedMs <= 0) return next;

  const minutes = elapsedMs / 60_000;
  const p = personalityOf(state.personality);
  for (const k of NEED_KEYS) {
    if (state.sleeping && k === 'energy') continue;
    const factor = state.sleeping ? SLEEP_DECAY_FACTOR : 1;
    next.needs[k] = clampNeed(state.needs[k] - DECAY_PER_MIN[k] * p.decay[k] * factor * minutes);
  }
  if (state.sleeping) {
    next.needs.energy = clampNeed(state.needs.energy + SLEEP_GAIN_PER_MIN * p.sleepBoost * minutes);
    if (next.needs.energy >= 100) next.sleeping = false;
  }
  return next;
}

function careCoin(state: GameState, before: number): boolean {
  if (before < CARE_COIN_THRESHOLD) {
    addCoins(state, 1);
    return true;
  }
  return false;
}

export function feed(state: GameState): ActionResult {
  if (state.sleeping) return { state, ok: false, message: `${state.name} está dormida. Despiértala para comer.` };
  if (state.needs.hunger >= 95) return { state, ok: false, message: `${state.name} no tiene hambre ahora.` };
  const p = personalityOf(state.personality);
  const next = cloneState(state);
  next.needs.hunger = clampNeed(state.needs.hunger + FEED_GAIN * p.feedBoost);
  next.needs.hygiene = clampNeed(state.needs.hygiene - 4);
  next.needs.affection = clampNeed(state.needs.affection + p.feedAffection);
  const coin = careCoin(next, state.needs.hunger);
  return { state: next, ok: true, message: `¡Ñam! A ${state.name} le encanta la gelatina de fresa.${coin ? ' +1 moneda' : ''}` };
}

export function clean(state: GameState): ActionResult {
  if (state.sleeping) return { state, ok: false, message: `${state.name} está dormida. Mejor el baño luego.` };
  if (state.needs.hygiene >= 95) return { state, ok: false, message: `${state.name} ya está reluciente.` };
  const next = cloneState(state);
  next.needs.hygiene = clampNeed(state.needs.hygiene + CLEAN_GAIN);
  const coin = careCoin(next, state.needs.hygiene);
  return { state: next, ok: true, message: `¡Burbujas! ${state.name} brilla de limpia.${coin ? ' +1 moneda' : ''}` };
}

export function pet(state: GameState): ActionResult {
  const next = cloneState(state);
  if (state.sleeping) {
    next.needs.affection = clampNeed(state.needs.affection + PET_SLEEPING_GAIN);
    return { state: next, ok: true, message: `${state.name} sonríe en sueños.` };
  }
  const p = personalityOf(state.personality);
  next.needs.affection = clampNeed(state.needs.affection + PET_GAIN * p.petBoost);
  const coin = careCoin(next, state.needs.affection);
  return { state: next, ok: true, message: `${state.name} tiembla de felicidad.${coin ? ' +1 moneda' : ''}` };
}

export function toggleSleep(state: GameState): ActionResult {
  const next = cloneState(state);
  if (state.sleeping) {
    next.sleeping = false;
    return { state: next, ok: true, message: `${state.name} se despierta y se estira.` };
  }
  if (state.needs.energy >= 90) return { state, ok: false, message: `${state.name} no tiene sueño todavía.` };
  next.sleeping = true;
  if (state.needs.energy < CARE_COIN_THRESHOLD) careCoin(next, state.needs.energy);
  return { state: next, ok: true, message: `Buenas noches, ${state.name}. Zzz…` };
}

export function choosePersonality(state: GameState, id: PersonalityId): ActionResult {
  const next = cloneState(state);
  next.personality = id;
  const name = personalityOf(id).name;
  return { state: next, ok: true, message: `${state.name} ahora es ${name.toLowerCase()}.` };
}

export function canPlayHop(state: GameState): { ok: boolean; message: string } {
  if (state.sleeping) return { ok: false, message: `${state.name} está dormida. Despiértala para jugar.` };
  if (state.needs.energy < HOP_MIN_ENERGY) return { ok: false, message: `${state.name} está demasiado cansada para saltar. Necesita dormir.` };
  return { ok: true, message: '' };
}

/** Registra el inicio de una partida y devuelve su identificador. */
export function startHopRun(state: GameState): { state: GameState; runId: number } {
  const next = cloneState(state);
  next.hopRuns = state.hopRuns + 1;
  return { state: next, runId: next.hopRuns };
}

export function hopCoinsFor(score: number, personality: PersonalityId | null): number {
  const safe = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));
  const base = Math.floor(safe / 2) + (safe > 0 ? 1 : 0);
  return Math.min(HOP_MAX_COINS, Math.floor(base * personalityOf(personality).hopCoinBoost));
}

export interface HopReward {
  state: GameState;
  coins: number;
  newRecord: boolean;
  alreadyClaimed: boolean;
}

/** Cobra la recompensa de una partida terminada. Solo una vez por runId. */
export function claimHopReward(state: GameState, runId: number, score: number): HopReward {
  if (!Number.isInteger(runId) || runId <= state.hopLastRewardedRun || runId > state.hopRuns) {
    return { state, coins: 0, newRecord: false, alreadyClaimed: true };
  }
  const safeScore = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));
  const next = cloneState(state);
  const coins = hopCoinsFor(safeScore, state.personality);
  addCoins(next, coins);
  next.hopLastRewardedRun = runId;
  const newRecord = safeScore > state.hopBest;
  if (newRecord) next.hopBest = safeScore;
  next.needs.energy = clampNeed(state.needs.energy - HOP_ENERGY_COST);
  next.needs.affection = clampNeed(state.needs.affection + HOP_AFFECTION_GAIN);
  return { state: next, coins, newRecord, alreadyClaimed: false };
}
