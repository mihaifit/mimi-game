import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState } from '../src/state/model';
import {
  MOVE_COINS,
  MOVE_DAILY_LIMIT,
  MOVE_XP,
  confirmMove,
  dismissMove,
  formatClock,
  pauseMove,
  resumeMove,
  startMove,
  tickMove,
  type MoveTimer,
} from '../src/state/movement';

const T0 = new Date(2026, 9, 16, 12, 0, 0).getTime();

function base(): GameState {
  return { ...createInitialState(T0), personality: 'dormilona' };
}

/** Avanza el temporizador en pasos de 250 ms, como la interfaz en primer plano. */
function runFor(t: MoveTimer, from: number, ms: number): { t: MoveTimer; now: number } {
  let now = from;
  let timer = t;
  for (let left = ms; left > 0; left -= 250) {
    now += Math.min(250, left);
    timer = tickMove(timer, now);
  }
  return { t: timer, now };
}

describe('pausa activa', () => {
  it('cuenta en primer plano y termina', () => {
    const { state, timer } = startMove(base(), 1, T0);
    expect(state.moveSessions).toBe(1);
    expect(timer.remainingMs).toBe(60_000);
    const half = runFor(timer, T0, 30_000);
    expect(half.t.status).toBe('running');
    expect(formatClock(half.t.remainingMs)).toBe('0:30');
    const end = runFor(half.t, half.now, 30_000);
    expect(end.t.status).toBe('done');
  });

  it('solo se aceptan 1 o 2 minutos', () => {
    expect(startMove(base(), 2, T0).timer.durationMs).toBe(120_000);
    expect(startMove(base(), 30, T0).timer.durationMs).toBe(60_000);
  });

  it('pausar y continuar no cuenta el tiempo en pausa', () => {
    const { timer } = startMove(base(), 1, T0);
    const a = runFor(timer, T0, 10_000);
    const paused = pauseMove(a.t, a.now);
    expect(paused.status).toBe('paused');
    const still = tickMove(paused, a.now + 600_000);
    expect(still.remainingMs).toBe(50_000);
    const resumed = resumeMove(still, a.now + 600_000);
    expect(resumed.status).toBe('running');
    expect(runFor(resumed, a.now + 600_000, 1000).t.remainingMs).toBe(49_000);
  });

  it('en segundo plano se pausa y nunca se completa sola', () => {
    const { timer } = startMove(base(), 1, T0);
    const a = runFor(timer, T0, 5000);
    // La pestaña se oculta: la interfaz llama a pauseMove(auto).
    const hidden = pauseMove(a.t, a.now, true);
    expect(hidden.autoPaused).toBe(true);
    // Aunque no llegue el evento de visibilidad, un salto grande de tiempo pausa en vez de completar.
    const frozen = tickMove(a.t, a.now + 10 * 60_000);
    expect(frozen.status).toBe('paused');
    expect(frozen.autoPaused).toBe(true);
    expect(frozen.remainingMs).toBe(55_000);
    expect(confirmMove(base(), frozen, a.now).ok).toBe(false);
  });

  it('reloj hacia atrás no adelanta el temporizador', () => {
    const { timer } = startMove(base(), 1, T0);
    const back = tickMove(timer, T0 - 50_000);
    expect(back.remainingMs).toBe(60_000);
    expect(back.status).toBe('running');
  });

  it('confirmar da premio una sola vez por sesión', () => {
    const started = startMove(base(), 1, T0);
    const end = runFor(started.timer, T0, 60_000);
    const early = confirmMove(started.state, started.timer, T0);
    expect(early.ok).toBe(false);
    const r = confirmMove(started.state, end.t, end.now);
    expect(r.rewarded).toBe(true);
    expect(r.state.coins).toBe(started.state.coins + MOVE_COINS);
    expect(r.state.xp).toBe(MOVE_XP);
    expect(r.state.daily.move).toBe(1);
    expect(r.state.stats.movePauses).toBe(1);
    const twice = confirmMove(r.state, end.t, end.now + 10);
    expect(twice.ok).toBe(false);
    expect(twice.state.coins).toBe(r.state.coins);
  });

  it('límite diario de recompensas', () => {
    let s = base();
    let now = T0;
    for (let i = 0; i < MOVE_DAILY_LIMIT + 2; i++) {
      const st = startMove(s, 1, now);
      const end = runFor(st.timer, now, 60_000);
      now = end.now;
      s = confirmMove(st.state, end.t, now).state;
    }
    expect(s.daily.move).toBe(MOVE_DAILY_LIMIT);
    expect(s.coins).toBe(base().coins + MOVE_DAILY_LIMIT * MOVE_COINS);
    expect(s.stats.movePauses).toBe(MOVE_DAILY_LIMIT + 2);
  });

  it('descartar una sesión impide cobrarla después', () => {
    const st = startMove(base(), 1, T0);
    const end = runFor(st.timer, T0, 60_000);
    const dismissed = dismissMove(st.state, end.t);
    expect(confirmMove(dismissed, end.t, end.now).ok).toBe(false);
  });

  it('una sesión de otra partida (id inexistente) no cobra', () => {
    const fake: MoveTimer = { status: 'done', durationMs: 60_000, remainingMs: 0, lastAt: T0, sessionId: 7, autoPaused: false };
    expect(confirmMove(base(), fake, T0).ok).toBe(false);
  });
});
