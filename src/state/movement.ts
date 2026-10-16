// Pausa activa corta: temporizador puro y recompensa limitada.
// Es un registro MANUAL y LOCAL: no hay sensores, pasos, cuentas ni entrenamientos reales.
// Solo cuenta lo que la persona confirma al terminar el tiempo con la app en primer plano.

import { MAX_COINS, cloneState, type GameState } from './model';
import { addXp, ensureDay } from './progress';

export const MOVE_DURATIONS_MIN = [1, 2] as const;
export type MoveMinutes = (typeof MOVE_DURATIONS_MIN)[number];

/** Pausas recompensadas por día. Después se puede seguir usando sin premio. */
export const MOVE_DAILY_LIMIT = 2;
export const MOVE_COINS = 5;
export const MOVE_XP = 10;
/**
 * Si entre dos ticks pasa más que esto, el tiempo no se cuenta: la pestaña estuvo
 * congelada o en segundo plano. Así nunca se completa sola fuera de la vista.
 */
export const MOVE_MAX_TICK_MS = 1500;

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';

export interface MoveTimer {
  status: TimerStatus;
  durationMs: number;
  remainingMs: number;
  /** Último instante contado mientras corre. */
  lastAt: number;
  /** Identificador de la sesión (para cobrar una sola vez). */
  sessionId: number;
  /** true si se pausó automáticamente por pasar a segundo plano o congelarse. */
  autoPaused: boolean;
}

export function idleTimer(): MoveTimer {
  return { status: 'idle', durationMs: 0, remainingMs: 0, lastAt: 0, sessionId: 0, autoPaused: false };
}

/** Registra una nueva sesión en el estado y arranca el temporizador. */
export function startMove(state: GameState, minutes: number, now: number): { state: GameState; timer: MoveTimer } {
  const m: MoveMinutes = minutes === 2 ? 2 : 1;
  const next = cloneState(state);
  next.moveSessions = state.moveSessions + 1;
  const durationMs = m * 60_000;
  return {
    state: next,
    timer: { status: 'running', durationMs, remainingMs: durationMs, lastAt: now, sessionId: next.moveSessions, autoPaused: false },
  };
}

/** Avanza el temporizador. Solo cuenta saltos cortos y positivos de tiempo. */
export function tickMove(t: MoveTimer, now: number): MoveTimer {
  if (t.status !== 'running') return t;
  const dt = now - t.lastAt;
  if (!Number.isFinite(dt) || dt < 0) return { ...t, lastAt: now }; // reloj atrás: no cuenta
  if (dt > MOVE_MAX_TICK_MS) return { ...t, status: 'paused', autoPaused: true, lastAt: now };
  const remainingMs = Math.max(0, t.remainingMs - dt);
  return { ...t, remainingMs, lastAt: now, status: remainingMs <= 0 ? 'done' : 'running' };
}

export function pauseMove(t: MoveTimer, now: number, auto = false): MoveTimer {
  if (t.status !== 'running') return t;
  const counted = tickMove(t, now);
  if (counted.status === 'done') return counted;
  return { ...counted, status: 'paused', autoPaused: auto || counted.autoPaused };
}

export function resumeMove(t: MoveTimer, now: number): MoveTimer {
  if (t.status !== 'paused') return t;
  return { ...t, status: 'running', lastAt: now, autoPaused: false };
}

export function cancelMove(): MoveTimer {
  return idleTimer();
}

export interface MoveClaim {
  state: GameState;
  ok: boolean;
  rewarded: boolean;
  message: string;
  coins: number;
  xp: number;
}

/**
 * La persona confirma que ha hecho su pausa. Solo vale si el temporizador terminó
 * (status 'done'), una vez por sesión y con premio como mucho MOVE_DAILY_LIMIT veces al día.
 */
export function confirmMove(state: GameState, t: MoveTimer, now: number): MoveClaim {
  const none = (message: string): MoveClaim => ({ state, ok: false, rewarded: false, message, coins: 0, xp: 0 });
  if (t.status !== 'done') return none('Termina el tiempo de la pausa para poder confirmarla.');
  if (!Number.isInteger(t.sessionId) || t.sessionId <= state.moveLastRewarded || t.sessionId > state.moveSessions) {
    return none('Esta pausa ya está registrada.');
  }
  const next = cloneState(ensureDay(state, now));
  next.moveLastRewarded = t.sessionId;
  next.stats.movePauses = Math.min(1_000_000, next.stats.movePauses + 1);
  if (next.daily.move >= MOVE_DAILY_LIMIT) {
    return {
      state: next,
      ok: true,
      rewarded: false,
      message: `¡Gracias por moverte! Hoy ya recibiste las ${MOVE_DAILY_LIMIT} recompensas de movimiento.`,
      coins: 0,
      xp: 0,
    };
  }
  next.daily.move += 1;
  next.coins = Math.min(MAX_COINS, next.coins + MOVE_COINS);
  addXp(next, MOVE_XP);
  return {
    state: next,
    ok: true,
    rewarded: true,
    message: `¡Pausa registrada! +${MOVE_COINS} monedas y +${MOVE_XP} XP.`,
    coins: MOVE_COINS,
    xp: MOVE_XP,
  };
}

/** Descarta una sesión terminada sin confirmar (no da premio, no se puede cobrar después). */
export function dismissMove(state: GameState, t: MoveTimer): GameState {
  if (t.sessionId <= state.moveLastRewarded || t.sessionId > state.moveSessions) return state;
  const next = cloneState(state);
  next.moveLastRewarded = t.sessionId;
  return next;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
