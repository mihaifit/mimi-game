// Progresión de vínculo: experiencia, niveles, misiones diarias y logros.
// Todo es puro y determinista: recibe el estado y el instante, devuelve un estado nuevo.
// No hay castigos por no volver: las misiones simplemente se renuevan cada día.

import {
  MAX_COINS,
  MISSION_IDS,
  cloneState,
  dayKey,
  emptyDaily,
  type CareKind,
  type GameState,
  type MissionId,
} from './model';

/* ---------------- Experiencia y niveles ---------------- */

export const MAX_LEVEL = 50;
export const MAX_XP = 1_000_000;

/** XP necesaria para pasar del nivel `level` al siguiente. */
export function xpToNext(level: number): number {
  return 30 + 15 * (Math.max(1, level) - 1);
}

/** XP total acumulada necesaria para estar en `level`. */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.min(level, MAX_LEVEL); l++) total += xpToNext(l);
  return total;
}

export function levelOf(xp: number): number {
  const safe = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let level = 1;
  while (level < MAX_LEVEL && safe >= xpForLevel(level + 1)) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP dentro del nivel actual. */
  into: number;
  /** XP que hace falta para el siguiente nivel (0 en el máximo). */
  needed: number;
  /** 0..1 */
  ratio: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelOf(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, needed: 0, ratio: 1 };
  const into = Math.floor(xp - xpForLevel(level));
  const needed = xpToNext(level);
  return { level, into, needed, ratio: Math.min(1, into / needed) };
}

/** Monedas que da subir a `level` (solo una vez). */
export function levelReward(level: number): number {
  return 10 + level * 2;
}

/** Accesorio deportivo que se regala al llegar a este nivel. */
export const SPORT_ITEM_ID = 'cinta';
export const SPORT_ITEM_LEVEL = 3;
/** Pañuelo MihaiFIT: regalo del logro de 3 retos (pausas) confirmados. */
export const SCARF_ITEM_ID = 'panuelo-mihaifit';
export const SCARF_ACHIEVEMENT_ID = 'retos-3';
export const SCARF_PAUSES = 3;

export function addXp(state: GameState, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.xp = Math.min(MAX_XP, Math.floor(state.xp + amount));
}

function addCoinsTo(state: GameState, amount: number): void {
  state.coins = Math.min(MAX_COINS, Math.max(0, Math.floor(state.coins + amount)));
}

/* ---------------- Cuidados útiles (anti-spam) ---------------- */

export const CARE_XP = 5;
/** Cada tipo de cuidado da XP como mucho una vez cada 45 s. */
export const CARE_XP_COOLDOWN_MS = 45_000;
/** Un cuidado solo es "útil" si la necesidad estaba por debajo de este valor. */
export const USEFUL_THRESHOLD: Record<CareKind, number> = { feed: 70, clean: 70, pet: 80, sleep: 40 };

export function careXpReadyIn(state: GameState, kind: CareKind, now: number): number {
  const last = state.careXpAt[kind];
  if (now < last) return CARE_XP_COOLDOWN_MS; // reloj atrás: se reinicia la espera
  return Math.max(0, last + CARE_XP_COOLDOWN_MS - now);
}

/**
 * Concede XP por un cuidado si fue útil (la necesidad estaba baja) y no está en enfriamiento.
 * Muta `state` (ya clonado por el llamador). Devuelve la XP concedida.
 */
export function grantCareXp(state: GameState, kind: CareKind, needBefore: number, now: number): number {
  if (!(needBefore < USEFUL_THRESHOLD[kind])) return 0;
  const last = state.careXpAt[kind];
  if (now < last) {
    // El reloj ha ido hacia atrás: no se concede nada y se reancla la espera.
    state.careXpAt[kind] = now;
    return 0;
  }
  if (now - last < CARE_XP_COOLDOWN_MS) return 0;
  state.careXpAt[kind] = now;
  addXp(state, CARE_XP);
  state.daily.care = Math.min(999, state.daily.care + 1);
  state.stats.usefulCares = Math.min(1_000_000, state.stats.usefulCares + 1);
  return CARE_XP;
}

/* ---------------- Misiones diarias ---------------- */

export interface MissionDef {
  id: MissionId;
  title: string;
  description: string;
  goal: number;
  coins: number;
  xp: number;
}

export const MISSIONS: Record<MissionId, MissionDef> = {
  care: {
    id: 'care',
    title: 'Cuidado útil',
    description: 'Atiende 3 veces una necesidad que esté baja (comida, baño, sueño o cariño).',
    goal: 3,
    coins: 8,
    xp: 15,
  },
  hop: {
    id: 'hop',
    title: 'Saltos del día',
    description: 'Supera 3 obstáculos en MIMI HOP (se suman entre partidas).',
    goal: 3,
    coins: 8,
    xp: 15,
  },
  move: {
    id: 'move',
    title: 'Momento de movimiento',
    description: 'Completa un reto MihaiFIT (pausa activa corta) y confírmalo.',
    goal: 1,
    coins: 10,
    xp: 20,
  },
};

export function missionProgress(state: GameState, id: MissionId): number {
  return Math.min(MISSIONS[id].goal, state.daily[id]);
}

export function missionStatus(state: GameState, id: MissionId): 'pending' | 'ready' | 'claimed' {
  if (state.daily.claimed.includes(id)) return 'claimed';
  return state.daily[id] >= MISSIONS[id].goal ? 'ready' : 'pending';
}

/**
 * Renueva las misiones si ha cambiado el día local. Si el reloj va hacia atrás
 * (día actual anterior al guardado) se conserva el día guardado: nada se duplica.
 */
export function ensureDay(state: GameState, now: number): GameState {
  if (!Number.isFinite(now)) return state;
  const today = dayKey(now);
  if (today <= state.daily.day) return state;
  const next = cloneState(state);
  next.daily = emptyDaily(today);
  return next;
}

export interface ClaimResult {
  state: GameState;
  ok: boolean;
  message: string;
  coins: number;
  xp: number;
}

export function claimMission(state: GameState, id: MissionId, now: number): ClaimResult {
  const fresh = ensureDay(state, now);
  const def = MISSIONS[id];
  if (!def) return { state, ok: false, message: 'Esa misión no existe.', coins: 0, xp: 0 };
  const status = missionStatus(fresh, id);
  if (status === 'claimed') return { state: fresh, ok: false, message: 'Ya has reclamado esta misión hoy.', coins: 0, xp: 0 };
  if (status === 'pending') {
    const left = def.goal - missionProgress(fresh, id);
    return { state: fresh, ok: false, message: `Aún falta ${left} para completar «${def.title}».`, coins: 0, xp: 0 };
  }
  const next = cloneState(fresh);
  next.daily.claimed.push(id);
  addCoinsTo(next, def.coins);
  addXp(next, def.xp);
  if (MISSION_IDS.every((m) => next.daily.claimed.includes(m))) next.stats.perfectDays += 1;
  return {
    state: next,
    ok: true,
    message: `Misión «${def.title}» reclamada: +${def.coins} monedas y +${def.xp} XP.`,
    coins: def.coins,
    xp: def.xp,
  };
}

/* ---------------- Logros permanentes ---------------- */

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  coins: number;
  /** Progreso actual y meta, para mostrar objetivos visibles. */
  progress: (s: GameState) => [number, number];
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'primer-mimo', title: 'Primer mimo útil', description: 'Atiende una necesidad baja.', coins: 5, progress: (s) => [s.stats.usefulCares, 1] },
  { id: 'cuidadora', title: 'Cuidadora constante', description: 'Haz 25 cuidados útiles.', coins: 15, progress: (s) => [s.stats.usefulCares, 25] },
  { id: 'saltarina', title: 'Saltarina', description: 'Consigue 10 puntos en una partida de MIMI HOP.', coins: 10, progress: (s) => [s.hopBest, 10] },
  { id: 'vinculo-3', title: 'Lazos fuertes', description: 'Llega al nivel 3 de vínculo.', coins: 10, progress: (s) => [levelOf(s.xp), 3] },
  { id: 'en-marcha', title: 'En marcha', description: 'Completa tu primer reto MihaiFIT.', coins: 10, progress: (s) => [s.stats.movePauses, 1] },
  {
    id: SCARF_ACHIEVEMENT_ID,
    title: 'Hoy toca.',
    description: `Confirma ${SCARF_PAUSES} retos MihaiFIT. Regalo: Pañuelo MihaiFIT.`,
    coins: 10,
    progress: (s) => [s.stats.movePauses, SCARF_PAUSES],
  },
  { id: 'dia-redondo', title: 'Día redondo', description: 'Reclama las tres misiones de un mismo día.', coins: 15, progress: (s) => [s.stats.perfectDays, 1] },
  { id: 'coleccion', title: 'Coleccionista', description: 'Consigue 3 accesorios.', coins: 10, progress: (s) => [s.owned.length, 3] },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

/* ---------------- Asentar progreso ---------------- */

export type ProgressEvent =
  | { type: 'levelup'; level: number; coins: number; gift: string | null }
  | { type: 'achievement'; id: string; title: string; coins: number; gift: string | null };

/** Accesorios que regala un logro (se entregan una sola vez, al desbloquearlo). */
export const ACHIEVEMENT_GIFTS: Record<string, { item: string; slot: 'head' | 'face' | 'neck' }> = {
  [SCARF_ACHIEVEMENT_ID]: { item: SCARF_ITEM_ID, slot: 'neck' },
};

/**
 * Entrega las recompensas pendientes de nivel y logros. Idempotente: llamarla
 * varias veces con el mismo estado no vuelve a pagar nada.
 */
export function settle(state: GameState): { state: GameState; events: ProgressEvent[] } {
  const events: ProgressEvent[] = [];
  let next: GameState | null = null;
  const edit = () => (next ??= cloneState(state));

  // Varias pasadas: un logro puede dar monedas pero nunca XP, así que basta con
  // niveles → logros (el logro de nivel depende del nivel ya resuelto).
  const level = levelOf(state.xp);
  if (level > state.levelRewarded) {
    const s = edit();
    for (let l = state.levelRewarded + 1; l <= level; l++) {
      const coins = levelReward(l);
      addCoinsTo(s, coins);
      let gift: string | null = null;
      if (l === SPORT_ITEM_LEVEL && !s.owned.includes(SPORT_ITEM_ID)) {
        s.owned.push(SPORT_ITEM_ID);
        if (!s.equipped.head) s.equipped.head = SPORT_ITEM_ID;
        gift = SPORT_ITEM_ID;
      }
      events.push({ type: 'levelup', level: l, coins, gift });
    }
    s.levelRewarded = level;
  }
  // Red de seguridad: si alguien llegó al nivel sin recibir el regalo (p. ej. datos editados).
  const cur = next ?? state;
  if (cur.levelRewarded >= SPORT_ITEM_LEVEL && !cur.owned.includes(SPORT_ITEM_ID)) edit().owned.push(SPORT_ITEM_ID);
  for (const [ach, g] of Object.entries(ACHIEVEMENT_GIFTS)) {
    const s = next ?? state;
    if (s.achievements.includes(ach) && !s.owned.includes(g.item)) edit().owned.push(g.item);
  }

  for (const a of ACHIEVEMENTS) {
    const s = next ?? state;
    if (s.achievements.includes(a.id)) continue;
    const [have, goal] = a.progress(s);
    if (have < goal) continue;
    const e = edit();
    e.achievements.push(a.id);
    addCoinsTo(e, a.coins);
    const g = ACHIEVEMENT_GIFTS[a.id];
    let gift: string | null = null;
    if (g && !e.owned.includes(g.item)) {
      e.owned.push(g.item);
      if (!e.equipped[g.slot]) e.equipped[g.slot] = g.item;
      gift = g.item;
    }
    events.push({ type: 'achievement', id: a.id, title: a.title, coins: a.coins, gift });
  }
  return { state: next ?? state, events };
}
