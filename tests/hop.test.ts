import { describe, expect, it } from 'vitest';
import { HOP, createHop, overlaps, queueJump, stepHop } from '../src/core/hop';

const DT = 1 / 60;

/** Piloto automático sencillo: salta cuando un bloque se acerca. */
function autoplay(seed: number, seconds: number, speedMul = 1) {
  const s = createHop(seed, speedMul);
  for (let t = 0; t < seconds && s.alive; t += DT) {
    const next = s.obstacles.find((o) => o.x + o.w > HOP.playerX - HOP.playerW / 2);
    if (next && s.grounded) {
      const dist = next.x - (HOP.playerX + HOP.playerW / 2);
      const lead = s.speed * 0.16;
      if (dist < lead && dist > -10) queueJump(s);
    }
    stepHop(s, DT, 800);
  }
  return s;
}

describe('MIMI HOP', () => {
  it('saltar sube y vuelve al suelo', () => {
    const s = createHop(1);
    queueJump(s);
    stepHop(s, DT, 800);
    expect(s.events).toContain('jump');
    let maxY = 0;
    let landed = false;
    for (let i = 0; i < 120; i++) {
      stepHop(s, DT, 800);
      maxY = Math.max(maxY, s.y);
      if (s.events.includes('land')) landed = true;
    }
    expect(maxY).toBeGreaterThan(120);
    expect(landed).toBe(true);
    expect(s.y).toBe(0);
  });

  it('sin saltar, choca: game over', () => {
    const s = createHop(2);
    for (let i = 0; i < 60 * 20 && s.alive; i++) stepHop(s, DT, 800);
    expect(s.alive).toBe(false);
    expect(s.score).toBe(0);
    // Tras el game over la simulación se congela.
    const frozen = JSON.stringify(s.obstacles);
    stepHop(s, DT, 800);
    expect(JSON.stringify(s.obstacles)).toBe(frozen);
    queueJump(s);
    expect(s.jumpQueued).toBe(0);
  });

  it('se puede puntuar saltando y los huecos son saltables', () => {
    for (const seed of [1, 7, 42, 99, 1234]) {
      const s = autoplay(seed, 45);
      expect(s.score).toBeGreaterThan(15);
    }
  });

  it('determinista con la misma semilla', () => {
    expect(autoplay(5, 20).score).toBe(autoplay(5, 20).score);
  });

  it('la velocidad aumenta hasta un máximo y respeta la personalidad', () => {
    const s = createHop(3, 0.9);
    expect(s.speed).toBeCloseTo(HOP.startSpeed * 0.9);
    for (let i = 0; i < 60 * 200; i++) {
      stepHop(s, DT, 800);
      s.obstacles = []; // sin obstáculos, solo medimos velocidad
    }
    expect(s.speed).toBeCloseTo(HOP.maxSpeed * 0.9);
  });

  it('colisión: caja justa', () => {
    const s = createHop(4);
    const o = { id: 1, x: HOP.playerX - 10, w: 40, h: 40, passed: false };
    expect(overlaps(s, o)).toBe(true);
    s.y = 60;
    expect(overlaps(s, o)).toBe(false);
  });

  it('dt enorme (pestaña en segundo plano) se limita', () => {
    const s = createHop(6);
    stepHop(s, 5, 800);
    expect(s.time).toBeCloseTo(HOP.maxDt);
  });
});
