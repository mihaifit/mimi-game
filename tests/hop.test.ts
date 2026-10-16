import { describe, expect, it } from 'vitest';
import { HOP, createRun, obstacleBox, overlaps, playerBox, pressJump, stepRun, type HopRun } from '../src/hop/hopLogic';

const fixedRng = () => 0.5;

function simulate(run: HopRun, seconds: number, autoJump = false): { crashed: boolean; jumps: number } {
  let jumps = 0;
  for (let t = 0; t < seconds && run.status === 'running'; t += 1 / 60) {
    if (autoJump) {
      const pb = playerBox(run);
      const danger = run.obstacles.some((o) => o.x > pb.x && o.x - (pb.x + pb.w) < run.speed * 0.12);
      if (danger && run.onGround) pressJump(run);
    }
    const ev = stepRun(run, 1 / 60, fixedRng);
    if (ev.jumped) jumps++;
    if (ev.crashed) return { crashed: true, jumps };
  }
  return { crashed: false, jumps };
}

describe('MIMI HOP', () => {
  it('empieza en espera y no avanza hasta el primer toque', () => {
    const run = createRun();
    stepRun(run, 1, fixedRng);
    expect(run.status).toBe('ready');
    expect(run.distance).toBe(0);
    pressJump(run);
    expect(run.status).toBe('running');
  });

  it('saltar eleva a Mimi y vuelve a aterrizar', () => {
    const run = createRun();
    pressJump(run);
    const ev = stepRun(run, 1 / 60, fixedRng);
    expect(ev.jumped).toBe(true);
    let minY = run.y;
    let landed = false;
    for (let i = 0; i < 120 && !landed; i++) {
      const e = stepRun(run, 1 / 60, fixedRng);
      minY = Math.min(minY, run.y);
      landed = e.landed;
    }
    expect(landed).toBe(true);
    expect(HOP.groundY - minY).toBeGreaterThan(150);
    expect(run.y).toBe(HOP.groundY);
  });

  it('no hay doble salto en el aire', () => {
    const run = createRun();
    pressJump(run);
    stepRun(run, 1 / 60, fixedRng);
    stepRun(run, 0.2, fixedRng);
    const vyBefore = run.vy;
    pressJump(run);
    const ev = stepRun(run, 1 / 60, fixedRng);
    expect(ev.jumped).toBe(false);
    expect(run.vy).toBeGreaterThan(vyBefore);
  });

  it('sin saltar choca con el primer obstáculo y termina', () => {
    const run = createRun();
    run.status = 'running';
    const r = simulate(run, 20);
    expect(r.crashed).toBe(true);
    expect(run.status).toBe('over');
    expect(run.score).toBe(0);
  });

  it('saltando a tiempo supera obstáculos y suma puntos', () => {
    const run = createRun();
    run.status = 'running';
    const r = simulate(run, 25, true);
    expect(r.crashed).toBe(false);
    expect(run.score).toBeGreaterThan(5);
    expect(run.speed).toBeGreaterThan(HOP.startSpeed);
    expect(run.speed).toBeLessThanOrEqual(HOP.maxSpeed);
  });

  it('tras terminar ignora saltos y pasos', () => {
    const run = createRun();
    run.status = 'over';
    pressJump(run);
    expect(stepRun(run, 1, fixedRng).jumped).toBe(false);
    expect(run.status).toBe('over');
  });

  it('un dt enorme (pestaña en segundo plano) se limita', () => {
    const run = createRun();
    pressJump(run);
    stepRun(run, 30, fixedRng);
    expect(run.time).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it('colisión AABB', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(overlaps(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(overlaps(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    const box = obstacleBox({ x: 100, w: 40, h: 50, kind: 0, passed: false });
    expect(box.y + box.h).toBe(HOP.groundY);
  });
});
