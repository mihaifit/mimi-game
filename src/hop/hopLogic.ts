// Lógica pura de MIMI HOP: física, obstáculos, colisiones y puntuación.
// Unidades: píxeles lógicos y segundos. Sin dependencias de Phaser.

export const HOP = {
  width: 720,
  height: 540,
  groundY: 450,
  playerX: 150,
  playerW: 74,
  playerH: 66,
  gravity: 2600,
  jumpVelocity: -1080,
  /** Margen de "tiempo coyote" tras dejar el suelo (s). */
  coyoteTime: 0.08,
  /** Un toque poco antes de aterrizar se recuerda (s). */
  jumpBuffer: 0.14,
  startSpeed: 300,
  speedPerPoint: 9,
  maxSpeed: 640,
  /** Reducción del área de choque para que sea justo con las formas redondeadas. */
  hitInset: 10,
  maxStep: 1 / 60,
} as const;

export interface ObstacleType {
  kind: number;
  w: number;
  h: number;
}

export const OBSTACLE_TYPES: readonly ObstacleType[] = [
  { kind: 0, w: 44, h: 50 },
  { kind: 1, w: 50, h: 76 },
  { kind: 2, w: 86, h: 52 },
];

export interface Obstacle {
  x: number;
  w: number;
  h: number;
  kind: number;
  passed: boolean;
}

export type HopStatus = 'ready' | 'running' | 'over';

export interface HopRun {
  status: HopStatus;
  time: number;
  /** y del borde inferior de Mimi (en el suelo = HOP.groundY). */
  y: number;
  vy: number;
  onGround: boolean;
  sinceGround: number;
  bufferedJump: number;
  speed: number;
  score: number;
  distance: number;
  nextSpawnIn: number;
  obstacles: Obstacle[];
}

export interface HopEvents {
  jumped: boolean;
  landed: boolean;
  scored: number;
  crashed: boolean;
}

export type Rng = () => number;

export function createRun(): HopRun {
  return {
    status: 'ready',
    time: 0,
    y: HOP.groundY,
    vy: 0,
    onGround: true,
    sinceGround: 0,
    bufferedJump: 0,
    speed: HOP.startSpeed,
    score: 0,
    distance: 0,
    nextSpawnIn: 1.1,
    obstacles: [],
  };
}

/** Pulsación de salto. En "ready" arranca la partida. */
export function pressJump(run: HopRun): void {
  if (run.status === 'over') return;
  if (run.status === 'ready') run.status = 'running';
  run.bufferedJump = HOP.jumpBuffer;
}

export function playerBox(run: HopRun): { x: number; y: number; w: number; h: number } {
  const i = HOP.hitInset;
  return {
    x: HOP.playerX - HOP.playerW / 2 + i,
    y: run.y - HOP.playerH + i,
    w: HOP.playerW - 2 * i,
    h: HOP.playerH - i,
  };
}

export function obstacleBox(o: Obstacle): { x: number; y: number; w: number; h: number } {
  const i = HOP.hitInset * 0.6;
  return { x: o.x + i, y: HOP.groundY - o.h + i, w: o.w - 2 * i, h: o.h - i };
}

export function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function spawnGap(run: HopRun, rng: Rng): number {
  // Hueco en segundos: se ajusta a la velocidad para que siempre sea saltable.
  const min = 0.95 - Math.min(0.3, run.score * 0.012);
  return min + rng() * 0.9;
}

function stepOnce(run: HopRun, dt: number, rng: Rng, ev: HopEvents): void {
  run.time += dt;
  run.bufferedJump = Math.max(0, run.bufferedJump - dt);

  const canJump = run.onGround || run.sinceGround <= HOP.coyoteTime;
  if (run.bufferedJump > 0 && canJump && run.vy >= 0) {
    run.vy = HOP.jumpVelocity;
    run.onGround = false;
    run.sinceGround = HOP.coyoteTime + 1;
    run.bufferedJump = 0;
    ev.jumped = true;
  }

  if (!run.onGround) {
    run.vy += HOP.gravity * dt;
    run.y += run.vy * dt;
    run.sinceGround += dt;
    if (run.y >= HOP.groundY) {
      run.y = HOP.groundY;
      run.vy = 0;
      run.onGround = true;
      run.sinceGround = 0;
      ev.landed = true;
    }
  }

  const dx = run.speed * dt;
  run.distance += dx;
  for (const o of run.obstacles) {
    o.x -= dx;
    if (!o.passed && o.x + o.w < HOP.playerX - HOP.playerW / 2) {
      o.passed = true;
      run.score += 1;
      ev.scored += 1;
      run.speed = Math.min(HOP.maxSpeed, HOP.startSpeed + run.score * HOP.speedPerPoint);
    }
  }
  run.obstacles = run.obstacles.filter((o) => o.x + o.w > -40);

  run.nextSpawnIn -= dt;
  if (run.nextSpawnIn <= 0) {
    const pool = run.score < 3 ? OBSTACLE_TYPES.slice(0, 1) : OBSTACLE_TYPES;
    const t = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    run.obstacles.push({ x: HOP.width + 20, w: t.w, h: t.h, kind: t.kind, passed: false });
    run.nextSpawnIn = spawnGap(run, rng);
  }

  const pb = playerBox(run);
  if (run.obstacles.some((o) => overlaps(pb, obstacleBox(o)))) {
    run.status = 'over';
    ev.crashed = true;
  }
}

/** Avanza la simulación. dt se trocea en pasos fijos pequeños para que las colisiones sean estables. */
export function stepRun(run: HopRun, dt: number, rng: Rng = Math.random): HopEvents {
  const ev: HopEvents = { jumped: false, landed: false, scored: 0, crashed: false };
  if (run.status !== 'running' || !(dt > 0)) return ev;
  let remaining = Math.min(dt, 0.25);
  while (remaining > 1e-9 && run.status === 'running') {
    const step = Math.min(HOP.maxStep, remaining);
    stepOnce(run, step, rng, ev);
    remaining -= step;
  }
  return ev;
}
