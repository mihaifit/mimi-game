// Arte procedural propio dibujado con Canvas 2D (gradientes, reflejos y sombras).
// Todo se dibuja a resolución RES para que se vea nítido en pantallas densas.
// No se usa ningún recurso externo.

export const RES = 2;

type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * RES);
  canvas.height = Math.ceil(h * RES);
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.scale(RES, RES);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return { canvas, ctx };
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function radial(ctx: Ctx, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/* ------------------------------------------------------------------ */
/* Mimi                                                                */
/* ------------------------------------------------------------------ */

export const BODY = {
  w: 240,
  h: 230,
  /** y del "suelo" del cuerpo dentro del lienzo. */
  baseY: 219,
  eyesY: 133,
  mouthY: 160,
  topY: 52,
};

function bodyPath(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(120, 52);
  ctx.bezierCurveTo(186, 52, 224, 118, 222, 172);
  ctx.bezierCurveTo(221, 204, 198, 219, 160, 219);
  ctx.bezierCurveTo(140, 219, 136, 214, 120, 214);
  ctx.bezierCurveTo(104, 214, 100, 219, 80, 219);
  ctx.bezierCurveTo(42, 219, 19, 204, 18, 172);
  ctx.bezierCurveTo(16, 118, 54, 52, 120, 52);
  ctx.closePath();
}

function drawEar(ctx: Ctx, x: number, y: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ellipse(ctx, 0, 0, 25, 40);
  ctx.fillStyle = radial(ctx, -8, -16, 4, 0, 0, 46, [
    [0, '#efe4ff'],
    [0.5, '#b89cf6'],
    [1, '#7a5cd3'],
  ]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(88,58,168,0.45)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ellipse(ctx, 2, 6, 12, 25);
  ctx.fillStyle = radial(ctx, 0, 0, 2, 2, 6, 26, [
    [0, '#ffd3ec'],
    [1, '#f19ccc'],
  ]);
  ctx.fill();
  ellipse(ctx, -9, -18, 6, 10, 0.2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
  ctx.restore();
}

export function drawBody(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(BODY.w, BODY.h);
  drawEar(ctx, 66, 62, -0.45);
  drawEar(ctx, 174, 62, 0.45);

  // Volumen principal: luz arriba a la izquierda.
  bodyPath(ctx);
  ctx.fillStyle = radial(ctx, 92, 92, 8, 120, 140, 160, [
    [0, '#f6efff'],
    [0.28, '#d2bfff'],
    [0.62, '#a98cf0'],
    [1, '#6f50c8'],
  ]);
  ctx.fill();

  ctx.save();
  bodyPath(ctx);
  ctx.clip();
  // Núcleo translúcido de gelatina.
  ctx.fillStyle = radial(ctx, 126, 168, 4, 126, 168, 80, [
    [0, 'rgba(255,255,255,0.28)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fillRect(0, 0, BODY.w, BODY.h);
  // Oclusión en la base.
  ctx.fillStyle = linear(ctx, 0, 168, 0, 222, [
    [0, 'rgba(60,30,130,0)'],
    [1, 'rgba(60,30,130,0.35)'],
  ]);
  ctx.fillRect(0, 0, BODY.w, BODY.h);
  // Luz rebotada rosada en el borde derecho.
  ctx.fillStyle = radial(ctx, 232, 190, 4, 232, 190, 90, [
    [0, 'rgba(255,190,235,0.55)'],
    [1, 'rgba(255,190,235,0)'],
  ]);
  ctx.fillRect(0, 0, BODY.w, BODY.h);
  ctx.restore();

  // Contorno suave.
  bodyPath(ctx);
  ctx.strokeStyle = 'rgba(84,52,166,0.55)';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Brillo especular principal y secundario.
  ctx.save();
  ctx.translate(84, 92);
  ctx.rotate(-0.55);
  ellipse(ctx, 0, 0, 30, 15);
  ctx.fillStyle = radial(ctx, 0, 0, 2, 0, 0, 30, [
    [0, 'rgba(255,255,255,0.95)'],
    [0.6, 'rgba(255,255,255,0.55)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fill();
  ctx.restore();
  ellipse(ctx, 132, 74, 6, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();
  ellipse(ctx, 196, 150, 5, 14, 0.2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();

  // Mofletes.
  for (const x of [66, 174]) {
    ellipse(ctx, x, 156, 17, 10);
    ctx.fillStyle = radial(ctx, x, 156, 1, x, 156, 18, [
      [0, 'rgba(255,128,190,0.75)'],
      [1, 'rgba(255,128,190,0)'],
    ]);
    ctx.fill();
  }
  return canvas;
}

export function drawShadow(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(220, 40);
  ellipse(ctx, 110, 20, 105, 17);
  ctx.fillStyle = radial(ctx, 110, 20, 4, 110, 20, 105, [
    [0, 'rgba(60,30,110,0.42)'],
    [0.7, 'rgba(60,30,110,0.18)'],
    [1, 'rgba(60,30,110,0)'],
  ]);
  ctx.fill();
  return canvas;
}

export type EyesKind = 'open' | 'closed' | 'happy';
export const EYE_SPACING = 54;

export function drawEyes(kind: EyesKind): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(140, 64);
  for (const cx of [70 - EYE_SPACING / 2, 70 + EYE_SPACING / 2]) {
    const cy = 32;
    if (kind === 'open') {
      ellipse(ctx, cx, cy, 13, 17);
      ctx.fillStyle = linear(ctx, 0, cy - 17, 0, cy + 17, [
        [0, '#2a1950'],
        [1, '#4b2f86'],
      ]);
      ctx.fill();
      ellipse(ctx, cx - 4, cy - 7, 5.5, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ellipse(ctx, cx + 5, cy + 7, 2.6, 2.6);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = '#2f1d58';
      if (kind === 'closed') {
        ctx.moveTo(cx - 12, cy + 2);
        ctx.quadraticCurveTo(cx, cy + 11, cx + 12, cy + 2);
      } else {
        ctx.moveTo(cx - 12, cy + 6);
        ctx.quadraticCurveTo(cx, cy - 8, cx + 12, cy + 6);
      }
      ctx.stroke();
    }
  }
  return canvas;
}

export type MouthKind = 'smile' | 'neutral' | 'sad' | 'open';

export function drawMouth(kind: MouthKind): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(60, 40);
  const cx = 30;
  const cy = 18;
  ctx.strokeStyle = '#3a2160';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  if (kind === 'smile') {
    ctx.moveTo(cx - 11, cy);
    ctx.quadraticCurveTo(cx - 5.5, cy + 8, cx, cy + 1);
    ctx.quadraticCurveTo(cx + 5.5, cy + 8, cx + 11, cy);
    ctx.stroke();
  } else if (kind === 'neutral') {
    ctx.moveTo(cx - 7, cy + 3);
    ctx.quadraticCurveTo(cx, cy + 6, cx + 7, cy + 3);
    ctx.stroke();
  } else if (kind === 'sad') {
    ctx.moveTo(cx - 9, cy + 7);
    ctx.quadraticCurveTo(cx, cy - 2, cx + 9, cy + 7);
    ctx.stroke();
  } else {
    ellipse(ctx, cx, cy + 4, 10, 11);
    ctx.fillStyle = '#5a2350';
    ctx.fill();
    ctx.stroke();
    ellipse(ctx, cx, cy + 10, 6, 4);
    ctx.fillStyle = '#ff8fb8';
    ctx.fill();
  }
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Accesorios                                                          */
/* ------------------------------------------------------------------ */

export interface AccessoryArt {
  canvas: HTMLCanvasElement;
  /** Posición del ancla respecto al centro-base del cuerpo (unidades del cuerpo). */
  x: number;
  y: number;
  originX: number;
  originY: number;
  /** Se dibuja detrás de los ojos (true) o delante. */
  behindFace: boolean;
}

function drawBow(ctx: Ctx, cx: number, cy: number, size: number, c1: string, c2: string): void {
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.bezierCurveTo(cx + dir * size * 0.6, cy - size * 0.75, cx + dir * size * 1.2, cy - size * 0.35, cx + dir * size * 1.05, cy);
    ctx.bezierCurveTo(cx + dir * size * 1.2, cy + size * 0.4, cx + dir * size * 0.6, cy + size * 0.7, cx, cy);
    ctx.fillStyle = linear(ctx, cx, cy - size, cx, cy + size, [
      [0, c1],
      [1, c2],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,30,80,0.45)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ellipse(ctx, cx + dir * size * 0.62, cy - size * 0.22, size * 0.2, size * 0.1, dir * 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();
  }
  ellipse(ctx, cx, cy, size * 0.28, size * 0.32);
  ctx.fillStyle = c2;
  ctx.fill();
  ctx.stroke();
}

function star(ctx: Ctx, cx: number, cy: number, r: number, inner: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : inner;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function flower(ctx: Ctx, cx: number, cy: number, r: number, petal: string): void {
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5;
    ellipse(ctx, cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75, r * 0.6, r * 0.6);
    ctx.fillStyle = petal;
    ctx.fill();
  }
  ellipse(ctx, cx, cy, r * 0.45, r * 0.45);
  ctx.fillStyle = '#ffd25a';
  ctx.fill();
}

export function drawAccessory(id: string): AccessoryArt | null {
  const top = BODY.topY - BODY.baseY; // negativo
  const eyes = BODY.eyesY - BODY.baseY;
  switch (id) {
    case 'lazo': {
      const { canvas, ctx } = makeCanvas(100, 70);
      drawBow(ctx, 50, 35, 34, '#ffb3d6', '#f0609f');
      return { canvas, x: 46, y: top + 14, originX: 0.5, originY: 0.5, behindFace: true };
    }
    case 'gorro': {
      const { canvas, ctx } = makeCanvas(170, 120);
      ctx.beginPath();
      ctx.moveTo(18, 100);
      ctx.bezierCurveTo(18, 30, 152, 30, 152, 100);
      ctx.closePath();
      ctx.fillStyle = linear(ctx, 0, 30, 0, 100, [
        [0, '#ff9e8a'],
        [1, '#e4604f'],
      ]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,40,30,0.4)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      for (let x = 40; x <= 130; x += 15) {
        ctx.beginPath();
        ctx.moveTo(x, 92);
        ctx.quadraticCurveTo(85 + (x - 85) * 0.6, 50, 85 + (x - 85) * 0.3, 40);
        ctx.stroke();
      }
      roundRect(ctx, 10, 88, 150, 26, 13);
      ctx.fillStyle = linear(ctx, 0, 88, 0, 114, [
        [0, '#fff4e8'],
        [1, '#f0d6c2'],
      ]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,70,40,0.35)';
      ctx.stroke();
      ellipse(ctx, 85, 26, 20, 20);
      ctx.fillStyle = radial(ctx, 78, 19, 2, 85, 26, 22, [
        [0, '#ffffff'],
        [1, '#f2dccb'],
      ]);
      ctx.fill();
      return { canvas, x: 0, y: top + 30, originX: 0.5, originY: 0.8, behindFace: true };
    }
    case 'corona': {
      const { canvas, ctx } = makeCanvas(190, 70);
      ctx.beginPath();
      ctx.moveTo(14, 46);
      ctx.quadraticCurveTo(95, 6, 176, 46);
      ctx.strokeStyle = '#6bbf7a';
      ctx.lineWidth = 6;
      ctx.stroke();
      const colors = ['#ff9fcf', '#ffffff', '#ffb36b', '#c9a3ff', '#ff9fcf', '#ffffff', '#ffb36b'];
      colors.forEach((c, i) => {
        const t = i / (colors.length - 1);
        const x = 14 + t * 162;
        const y = 46 - Math.sin(t * Math.PI) * 20;
        ellipse(ctx, x + 8, y + 6, 8, 4, 0.6);
        ctx.fillStyle = '#7fcf8c';
        ctx.fill();
        flower(ctx, x, y, 11, c);
      });
      return { canvas, x: 0, y: top + 16, originX: 0.5, originY: 0.6, behindFace: true };
    }
    case 'gafas':
    case 'estrellas': {
      const { canvas, ctx } = makeCanvas(160, 64);
      const xs = [80 - EYE_SPACING / 2, 80 + EYE_SPACING / 2];
      if (id === 'gafas') {
        for (const x of xs) {
          ellipse(ctx, x, 32, 23, 23);
          ctx.fillStyle = 'rgba(200,235,255,0.25)';
          ctx.fill();
          ctx.lineWidth = 4.5;
          ctx.strokeStyle = '#5a3b2a';
          ctx.stroke();
          ellipse(ctx, x - 8, 22, 6, 3.5, -0.6);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fill();
        }
      } else {
        for (const x of xs) {
          star(ctx, x, 33, 29, 15);
          ctx.fillStyle = 'rgba(255,230,120,0.3)';
          ctx.fill();
          ctx.lineWidth = 4.5;
          ctx.strokeStyle = '#f2b51d';
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.moveTo(xs[0] + 21, 30);
      ctx.quadraticCurveTo(80, 22, xs[1] - 21, 30);
      ctx.lineWidth = 4;
      ctx.strokeStyle = id === 'gafas' ? '#5a3b2a' : '#f2b51d';
      ctx.stroke();
      return { canvas, x: 0, y: eyes, originX: 0.5, originY: 0.5, behindFace: false };
    }
    case 'pajarita': {
      const { canvas, ctx } = makeCanvas(90, 56);
      drawBow(ctx, 45, 28, 26, '#8fd0ff', '#3f8fd6');
      return { canvas, x: 0, y: -28, originX: 0.5, originY: 0.5, behindFace: false };
    }
    case 'bufanda': {
      const { canvas, ctx } = makeCanvas(230, 90);
      ctx.beginPath();
      ctx.moveTo(10, 22);
      ctx.quadraticCurveTo(115, 52, 220, 22);
      ctx.lineTo(222, 46);
      ctx.quadraticCurveTo(115, 78, 8, 46);
      ctx.closePath();
      ctx.fillStyle = linear(ctx, 0, 20, 0, 70, [
        [0, '#a8f0d4'],
        [1, '#4fc4a0'],
      ]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,90,70,0.4)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      roundRect(ctx, 150, 46, 28, 42, 8);
      ctx.fillStyle = linear(ctx, 0, 46, 0, 88, [
        [0, '#7fe0bd'],
        [1, '#3bb08c'],
      ]);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      for (let x = 40; x < 200; x += 26) {
        ctx.beginPath();
        ctx.moveTo(x, 30 + Math.sin((x / 230) * Math.PI) * 14);
        ctx.lineTo(x + 6, 52 + Math.sin((x / 230) * Math.PI) * 14);
        ctx.stroke();
      }
      return { canvas, x: 0, y: -40, originX: 0.5, originY: 0.4, behindFace: false };
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Efectos                                                             */
/* ------------------------------------------------------------------ */

export function drawHeart(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(40, 36);
  ctx.beginPath();
  ctx.moveTo(20, 33);
  ctx.bezierCurveTo(-6, 16, 4, -4, 20, 9);
  ctx.bezierCurveTo(36, -4, 46, 16, 20, 33);
  ctx.fillStyle = linear(ctx, 0, 0, 0, 34, [
    [0, '#ff9cc8'],
    [1, '#ef4f8f'],
  ]);
  ctx.fill();
  ellipse(ctx, 12, 12, 4, 3, -0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
  return canvas;
}

export function drawBubble(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(40, 40);
  ellipse(ctx, 20, 20, 17, 17);
  ctx.fillStyle = radial(ctx, 20, 20, 8, 20, 20, 18, [
    [0, 'rgba(200,240,255,0.08)'],
    [0.85, 'rgba(180,220,255,0.35)'],
    [1, 'rgba(255,255,255,0.8)'],
  ]);
  ctx.fill();
  ellipse(ctx, 13, 12, 5, 3, -0.7);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  return canvas;
}

export function drawFood(): HTMLCanvasElement {
  // Gelatina de fresa en tarrina.
  const { canvas, ctx } = makeCanvas(56, 56);
  ctx.beginPath();
  ctx.moveTo(10, 30);
  ctx.lineTo(46, 30);
  ctx.lineTo(41, 52);
  ctx.lineTo(15, 52);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, 30, 0, 52, [
    [0, '#ffffff'],
    [1, '#cfd8ff'],
  ]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,60,140,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(12, 31);
  ctx.bezierCurveTo(12, 8, 44, 8, 44, 31);
  ctx.closePath();
  ctx.fillStyle = radial(ctx, 22, 16, 2, 28, 24, 22, [
    [0, '#ffb0c4'],
    [0.6, '#ff4f7c'],
    [1, '#d22a5b'],
  ]);
  ctx.fill();
  ellipse(ctx, 21, 18, 5, 3, -0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
  ellipse(ctx, 28, 9, 4, 3);
  ctx.fillStyle = '#ff2f62';
  ctx.fill();
  return canvas;
}

export function drawSparkle(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(30, 30);
  star(ctx, 15, 15, 13, 4);
  ctx.fillStyle = '#fff6b8';
  ctx.fill();
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Escenarios                                                          */
/* ------------------------------------------------------------------ */

export function drawRoom(w: number, h: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  const floorY = h * 0.66;
  ctx.fillStyle = linear(ctx, 0, 0, 0, floorY, [
    [0, '#efe2ff'],
    [1, '#fde9f2'],
  ]);
  ctx.fillRect(0, 0, w, floorY);
  // Papel pintado de lunares.
  ctx.fillStyle = 'rgba(180,150,235,0.18)';
  for (let y = 18; y < floorY - 10; y += 34) {
    for (let x = (y / 34) % 2 ? 0 : 17; x < w; x += 34) {
      ellipse(ctx, x, y, 3.5, 3.5);
      ctx.fill();
    }
  }
  // Ventana.
  const wx = w * 0.64;
  const wy = 46;
  const ww = 190;
  const wh = 150;
  roundRect(ctx, wx - 8, wy - 8, ww + 16, wh + 16, 18);
  ctx.fillStyle = '#fffaf5';
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,110,90,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();
  roundRect(ctx, wx, wy, ww, wh, 12);
  ctx.fillStyle = linear(ctx, 0, wy, 0, wy + wh, [
    [0, '#9fd3ff'],
    [1, '#ffd9ec'],
  ]);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const [cx, cy, s] of [
    [wx + 50, wy + 46, 1],
    [wx + 140, wy + 90, 0.8],
  ] as const) {
    ellipse(ctx, cx, cy, 24 * s, 12 * s);
    ctx.fill();
    ellipse(ctx, cx + 18 * s, cy - 6 * s, 16 * s, 12 * s);
    ctx.fill();
    ellipse(ctx, cx - 16 * s, cy + 2 * s, 14 * s, 9 * s);
    ctx.fill();
  }
  ctx.fillStyle = '#fffaf5';
  ctx.fillRect(wx + ww / 2 - 4, wy, 8, wh);
  ctx.fillRect(wx, wy + wh / 2 - 4, ww, 8);
  // Cortinas.
  for (const dir of [-1, 1]) {
    const cx = dir < 0 ? wx - 14 : wx + ww + 14;
    ctx.beginPath();
    ctx.moveTo(cx - 22, wy - 18);
    ctx.lineTo(cx + 22, wy - 18);
    ctx.quadraticCurveTo(cx + dir * -6, wy + 90, cx + 18 * -dir + dir * 4, wy + wh + 30);
    ctx.lineTo(cx + dir * 22, wy + wh + 30);
    ctx.quadraticCurveTo(cx + dir * 30, wy + 80, cx - 22 * -dir, wy - 18);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, cx - 22, 0, cx + 22, 0, [
      [0, '#ffc6dc'],
      [1, '#f59cc0'],
    ]);
    ctx.fill();
  }
  ctx.fillStyle = '#d8b48f';
  roundRect(ctx, wx - 44, wy - 24, ww + 88, 10, 5);
  ctx.fill();

  // Cuadro con corazón.
  roundRect(ctx, 60, 60, 92, 74, 10);
  ctx.fillStyle = '#e9c9a3';
  ctx.fill();
  roundRect(ctx, 70, 70, 72, 54, 6);
  ctx.fillStyle = '#fff7ee';
  ctx.fill();
  ctx.save();
  ctx.translate(86, 78);
  ctx.scale(1, 1);
  ctx.drawImage(drawHeart(), 0, 0, 40, 36);
  ctx.restore();

  // Estante con planta.
  roundRect(ctx, 40, 180, 140, 12, 6);
  ctx.fillStyle = '#d8b48f';
  ctx.fill();
  roundRect(ctx, 64, 150, 34, 30, 8);
  ctx.fillStyle = linear(ctx, 0, 150, 0, 180, [
    [0, '#ffd2a8'],
    [1, '#f0a77a'],
  ]);
  ctx.fill();
  for (const [dx, rot] of [
    [-10, -0.6],
    [0, 0],
    [10, 0.6],
  ] as const) {
    ellipse(ctx, 81 + dx, 136, 8, 18, rot);
    ctx.fillStyle = '#7fcf8c';
    ctx.fill();
  }
  ellipse(ctx, 140, 168, 14, 12);
  ctx.fillStyle = '#c9a3ff';
  ctx.fill();

  // Suelo de madera.
  ctx.fillStyle = linear(ctx, 0, floorY, 0, h, [
    [0, '#efcfae'],
    [1, '#ddb08a'],
  ]);
  ctx.fillRect(0, floorY, w, h - floorY);
  ctx.strokeStyle = 'rgba(150,100,60,0.18)';
  ctx.lineWidth = 2;
  for (let y = floorY + 26; y < h; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#fff5ec';
  ctx.fillRect(0, floorY - 8, w, 10);
  // Alfombra.
  ellipse(ctx, w / 2, h * 0.84, w * 0.33, 52);
  ctx.fillStyle = radial(ctx, w / 2, h * 0.84, 10, w / 2, h * 0.84, w * 0.33, [
    [0, '#e3d4ff'],
    [0.7, '#cdb6ff'],
    [1, '#b49bf2'],
  ]);
  ctx.fill();
  ellipse(ctx, w / 2, h * 0.84, w * 0.27, 40);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
  return canvas;
}

export function drawSky(w: number, h: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = linear(ctx, 0, 0, 0, h, [
    [0, '#b9a3ff'],
    [0.55, '#ffc9e3'],
    [1, '#ffe7c7'],
  ]);
  ctx.fillRect(0, 0, w, h);
  ellipse(ctx, w * 0.8, h * 0.2, 46, 46);
  ctx.fillStyle = radial(ctx, w * 0.8, h * 0.2, 10, w * 0.8, h * 0.2, 80, [
    [0, 'rgba(255,250,220,1)'],
    [0.5, 'rgba(255,240,200,0.6)'],
    [1, 'rgba(255,240,200,0)'],
  ]);
  ctx.fill();
  return canvas;
}

/** Colinas repetibles en horizontal (el ancho es un periodo exacto). */
export function drawHills(w: number, h: number, color1: string, color2: string, amp: number, waves: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) {
    const t = (x / w) * Math.PI * 2;
    const y = h * 0.45 - Math.sin(t * waves) * amp - Math.sin(t * waves * 2 + 1) * amp * 0.3;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, 0, 0, h, [
    [0, color1],
    [1, color2],
  ]);
  ctx.fill();
  return canvas;
}

export function drawGround(w: number, h: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = linear(ctx, 0, 0, 0, h, [
    [0, '#9be3b8'],
    [0.18, '#7fd3a3'],
    [0.2, '#f6d6b0'],
    [1, '#e7b98f'],
  ]);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  for (let x = 0; x < w; x += 24) {
    ellipse(ctx, x + 12, 6, 10, 3);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(200,140,100,0.25)';
  for (let x = 0; x < w; x += 60) {
    ellipse(ctx, x + 20, h * 0.55, 6, 3);
    ctx.fill();
    ellipse(ctx, x + 48, h * 0.8, 4, 2);
    ctx.fill();
  }
  return canvas;
}

/** Obstáculos de gominola. Las medidas coinciden con OBSTACLE_TYPES. */
export function drawObstacle(kind: number, w: number, h: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  if (kind === 2) {
    // Flan de caramelo.
    ctx.beginPath();
    ctx.moveTo(6, h);
    ctx.lineTo(14, 12);
    ctx.quadraticCurveTo(w / 2, 2, w - 14, 12);
    ctx.lineTo(w - 6, h);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, 0, w, 0, [
      [0, '#f7c45f'],
      [0.4, '#ffe39b'],
      [1, '#e9a83c'],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,70,20,0.45)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(14, 13);
    ctx.quadraticCurveTo(w / 2, 2, w - 14, 13);
    ctx.quadraticCurveTo(w - 18, 26, w - 26, 20);
    ctx.quadraticCurveTo(w / 2, 30, 24, 22);
    ctx.quadraticCurveTo(16, 26, 14, 13);
    ctx.fillStyle = '#a4521d';
    ctx.fill();
    ellipse(ctx, 26, 30, 4, 9, 0.1);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    return canvas;
  }
  // Cactus de gominola.
  const trunkW = w * 0.52;
  const tx = (w - trunkW) / 2;
  const grad = linear(ctx, 0, 0, w, 0, [
    [0, '#5fcf8f'],
    [0.45, '#a9f2c6'],
    [1, '#3faa70'],
  ]);
  roundRect(ctx, tx, 4, trunkW, h - 4, trunkW / 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,90,50,0.45)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  if (h > 60) {
    roundRect(ctx, 2, h * 0.35, tx + 4, 12, 6);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, 2, h * 0.18, 12, h * 0.28, 6);
    ctx.fill();
    ctx.stroke();
  }
  ellipse(ctx, tx + trunkW * 0.3, h * 0.3, 3, h * 0.16);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
  ctx.fillStyle = '#ff9fcf';
  flower(ctx, w / 2, 8, 6, '#ff9fcf');
  return canvas;
}
