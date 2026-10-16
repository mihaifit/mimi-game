/**
 * Simulación pura de MIMI HOP (sin Phaser) para poder probarla.
 * Unidades: píxeles de mundo; y = altura sobre el suelo (positiva hacia arriba).
 */

export const HOP = {
  playerX: 110,
  playerW: 56,
  playerH: 50,
  gravity: 2800,
  jumpVelocity: 980,
  startSpeed: 330,
  accel: 9,
  maxSpeed: 680,
  coyoteTime: 0.08,
  jumpBuffer: 0.14,
  minGap: 300,
  maxGap: 560,
  maxDt: 1 / 20,
} as const;

export interface Obstacle {
  id: number;
  x: number;
  w: number;
  h: number;
  passed: boolean;
}

export interface HopState {
  y: number;
  vy: number;
  grounded: boolean;
  sinceGrounded: number;
  jumpQueued: number; // segundos restantes del buffer de salto
  obstacles: Obstacle[];
  nextId: number;
  nextSpawnIn: number;
  speed: number;
  speedMul: number;
  time: number;
  score: number;
  alive: boolean;
  rngState: number;
  /** Eventos del último paso, para animación y sonido. */
  events: Array<'jump' | 'land' | 'score' | 'hit'>;
}

/** Generador determinista (mulberry32). */
export function nextRandom(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, (state + 0x6d2b79f5) | 0];
}

export function createHop(seed: number, speedMul = 1): HopState {
  return {
    y: 0,
    vy: 0,
    grounded: true,
    sinceGrounded: 0,
    jumpQueued: 0,
    obstacles: [],
    nextId: 1,
    nextSpawnIn: 420,
    speed: HOP.startSpeed * speedMul,
    speedMul,
    time: 0,
    score: 0,
    alive: true,
    rngState: seed | 0,
    events: [],
  };
}

export function queueJump(s: HopState): void {
  if (s.alive) s.jumpQueued = HOP.jumpBuffer;
}

function rand(s: HopState): number {
  const [r, next] = nextRandom(s.rngState);
  s.rngState = next;
  return r;
}

export function overlaps(s: HopState, o: Obstacle): boolean {
  // Caja de colisión algo más pequeña que el dibujo para que sea justo.
  const px1 = HOP.playerX - HOP.playerW / 2 + 8;
  const px2 = HOP.playerX + HOP.playerW / 2 - 8;
  const py1 = s.y;
  const py2 = s.y + HOP.playerH - 8;
  return px2 > o.x + 4 && px1 < o.x + o.w - 4 && py1 < o.h - 4 && py2 > 0;
}

/**
 * Avanza la simulación. `viewWidth` es el ancho visible en unidades de mundo,
 * para que los obstáculos aparezcan justo fuera de la pantalla.
 */
export function stepHop(s: HopState, dtRaw: number, viewWidth: number): HopState {
  s.events = [];
  if (!s.alive) return s;
  const dt = Math.min(Math.max(dtRaw, 0), HOP.maxDt);
  s.time += dt;
  s.speed = Math.min(HOP.maxSpeed * s.speedMul, s.speed + HOP.accel * s.speedMul * dt);

  // Salto con buffer y "coyote time".
  if (s.jumpQueued > 0) {
    s.jumpQueued = Math.max(0, s.jumpQueued - dt);
    if (s.grounded || s.sinceGrounded < HOP.coyoteTime) {
      s.vy = HOP.jumpVelocity;
      s.grounded = false;
      s.sinceGrounded = HOP.coyoteTime;
      s.jumpQueued = 0;
      s.events.push('jump');
    }
  }

  // Física vertical.
  if (!s.grounded) {
    s.vy -= HOP.gravity * dt;
    s.y += s.vy * dt;
    s.sinceGrounded += dt;
    if (s.y <= 0) {
      s.y = 0;
      s.vy = 0;
      s.grounded = true;
      s.sinceGrounded = 0;
      s.events.push('land');
    }
  }

  // Obstáculos.
  const dx = s.speed * dt;
  for (const o of s.obstacles) {
    o.x -= dx;
    if (!o.passed && o.x + o.w < HOP.playerX - HOP.playerW / 2) {
      o.passed = true;
      s.score += 1;
      s.events.push('score');
    }
  }
  s.obstacles = s.obstacles.filter((o) => o.x + o.w > -80);

  s.nextSpawnIn -= dx;
  if (s.nextSpawnIn <= 0) {
    const tall = rand(s) < Math.min(0.45, 0.1 + s.score * 0.02);
    const w = 34 + Math.floor(rand(s) * 26);
    const h = tall ? 70 + Math.floor(rand(s) * 22) : 36 + Math.floor(rand(s) * 22);
    s.obstacles.push({ id: s.nextId++, x: Math.max(viewWidth, 360) + 40, w, h, passed: false });
    // El hueco crece con la velocidad para que siempre sea saltable.
    const speedFactor = s.speed / HOP.startSpeed;
    s.nextSpawnIn = (HOP.minGap + rand(s) * (HOP.maxGap - HOP.minGap)) * (0.8 + speedFactor * 0.4);
  }

  for (const o of s.obstacles) {
    if (overlaps(s, o)) {
      s.alive = false;
      s.events.push('hit');
      break;
    }
  }
  return s;
}
