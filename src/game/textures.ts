import Phaser from 'phaser';

/** Todas las texturas se dibujan aquí con Canvas 2D: sin imágenes externas. */
export const RES = 2; // dibujamos al doble para que se vea nítido en pantallas retina

type Ctx = CanvasRenderingContext2D;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx, w: number, h: number) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w * RES, h * RES);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.scale(RES, RES);
  draw(ctx, w, h);
  tex.refresh();
}

const LAV = {
  light: '#f3ebff',
  mid: '#c4a8f5',
  base: '#a585e8',
  deep: '#7c5cc9',
  rim: '#5e3fa8',
};

/** Silueta de gelatina: base ancha y cúpula suave. */
function blobPath(ctx: Ctx, w: number, h: number) {
  const cx = w / 2;
  ctx.beginPath();
  ctx.moveTo(cx, 6);
  ctx.bezierCurveTo(cx + w * 0.36, 6, cx + w * 0.47, h * 0.42, cx + w * 0.47, h * 0.7);
  ctx.bezierCurveTo(cx + w * 0.47, h * 0.92, cx + w * 0.3, h - 4, cx, h - 4);
  ctx.bezierCurveTo(cx - w * 0.3, h - 4, cx - w * 0.47, h * 0.92, cx - w * 0.47, h * 0.7);
  ctx.bezierCurveTo(cx - w * 0.47, h * 0.42, cx - w * 0.36, 6, cx, 6);
  ctx.closePath();
}

function jellyFill(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const g = ctx.createRadialGradient(x + w * 0.36, y + h * 0.3, 4, x + w * 0.5, y + h * 0.55, Math.max(w, h) * 0.72);
  g.addColorStop(0, LAV.light);
  g.addColorStop(0.35, LAV.mid);
  g.addColorStop(0.75, LAV.base);
  g.addColorStop(1, LAV.deep);
  return g;
}

export const BODY_W = 200;
export const BODY_H = 172;

export function createTextures(scene: Phaser.Scene) {
  make(scene, 'mimi-body', BODY_W, BODY_H, (ctx, w, h) => {
    blobPath(ctx, w, h);
    ctx.fillStyle = jellyFill(ctx, 0, 0, w, h);
    ctx.fill();
    // Sombra interior inferior (volumen).
    ctx.save();
    blobPath(ctx, w, h);
    ctx.clip();
    const lower = ctx.createLinearGradient(0, h * 0.55, 0, h);
    lower.addColorStop(0, 'rgba(94,63,168,0)');
    lower.addColorStop(1, 'rgba(70,40,140,0.45)');
    ctx.fillStyle = lower;
    ctx.fillRect(0, 0, w, h);
    // Luz de rebote en el borde inferior (translucidez de gelatina).
    const bounce = ctx.createRadialGradient(w * 0.5, h * 1.02, 4, w * 0.5, h * 1.02, w * 0.4);
    bounce.addColorStop(0, 'rgba(255,220,255,0.55)');
    bounce.addColorStop(1, 'rgba(255,220,255,0)');
    ctx.fillStyle = bounce;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    // Contorno suave.
    blobPath(ctx, w, h);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(94,63,168,0.55)';
    ctx.stroke();
  });

  make(scene, 'mimi-shine', 80, 60, (ctx) => {
    ctx.save();
    ctx.translate(40, 30);
    ctx.rotate(-0.5);
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 30);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(62, 44, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });

  make(scene, 'mimi-ear', 54, 74, (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w / 2, 4);
    ctx.bezierCurveTo(w - 2, 10, w - 4, h * 0.7, w / 2, h - 2);
    ctx.bezierCurveTo(4, h * 0.7, 2, 10, w / 2, 4);
    ctx.closePath();
    ctx.fillStyle = jellyFill(ctx, 0, 0, w, h);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(94,63,168,0.5)';
    ctx.stroke();
    // Interior rosado.
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.42, w * 0.18, h * 0.26, 0, 0, Math.PI * 2);
    const inner = ctx.createRadialGradient(w / 2, h * 0.4, 1, w / 2, h * 0.42, h * 0.28);
    inner.addColorStop(0, 'rgba(255,170,215,0.9)');
    inner.addColorStop(1, 'rgba(255,170,215,0.1)');
    ctx.fillStyle = inner;
    ctx.fill();
  });

  make(scene, 'mimi-eye', 30, 36, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3b2a63');
    g.addColorStop(1, '#1d1433');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(w * 0.62, h * 0.32, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(w * 0.36, h * 0.7, 2.4, 0, Math.PI * 2);
    ctx.fill();
  });

  make(scene, 'mimi-eye-closed', 30, 16, (ctx, w) => {
    ctx.strokeStyle = '#2a1d47';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(w / 2, 2, 11, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  });

  make(scene, 'mimi-cheek', 34, 20, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,140,190,0.75)');
    g.addColorStop(1, 'rgba(255,140,190,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  make(scene, 'shadow', 200, 40, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(60,30,90,0.42)');
    g.addColorStop(0.6, 'rgba(60,30,90,0.16)');
    g.addColorStop(1, 'rgba(60,30,90,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.scale(1, h / w);
    ctx.beginPath();
    ctx.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  make(scene, 'heart', 32, 30, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(16, 27);
    ctx.bezierCurveTo(-6, 12, 6, -4, 16, 8);
    ctx.bezierCurveTo(26, -4, 38, 12, 16, 27);
    const g = ctx.createLinearGradient(0, 0, 0, 30);
    g.addColorStop(0, '#ff9fd0');
    g.addColorStop(1, '#e95aa6');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(10, 9, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  make(scene, 'bubble', 36, 36, (ctx) => {
    const g = ctx.createRadialGradient(13, 12, 1, 18, 18, 17);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(190,230,255,0.25)');
    g.addColorStop(1, 'rgba(150,200,255,0.55)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(18, 18, 16, 0, Math.PI * 2);
    ctx.fill();
  });

  make(scene, 'berry', 44, 48, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(22, 46);
    ctx.bezierCurveTo(2, 34, 2, 12, 22, 12);
    ctx.bezierCurveTo(42, 12, 42, 34, 22, 46);
    const g = ctx.createRadialGradient(16, 20, 2, 22, 28, 24);
    g.addColorStop(0, '#ff8fa3');
    g.addColorStop(1, '#d93355');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = '#ffe7a8';
    for (const [x, y] of [[15, 22], [26, 20], [20, 30], [30, 30], [14, 33], [24, 38]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, 1.3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#4fbf7a';
    ctx.beginPath();
    ctx.ellipse(16, 12, 8, 4, -0.4, 0, Math.PI * 2);
    ctx.ellipse(28, 12, 8, 4, 0.4, 0, Math.PI * 2);
    ctx.fill();
  });

  make(scene, 'zzz', 30, 30, (ctx) => {
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#7c5cc9';
    ctx.lineWidth = 4;
    ctx.strokeText('z', 7, 24);
    ctx.fillText('z', 7, 24);
  });

  make(scene, 'sparkle', 24, 24, (ctx) => {
    ctx.fillStyle = '#fff6c2';
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.quadraticCurveTo(13, 11, 24, 12);
    ctx.quadraticCurveTo(13, 13, 12, 24);
    ctx.quadraticCurveTo(11, 13, 0, 12);
    ctx.quadraticCurveTo(11, 11, 12, 0);
    ctx.fill();
  });

  createAccessoryTextures(scene);
  createRoomTextures(scene);
  createHopTextures(scene);
}

function createAccessoryTextures(scene: Phaser.Scene) {
  make(scene, 'acc-lazo', 70, 44, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 44);
    g.addColorStop(0, '#ffb3d6');
    g.addColorStop(1, '#e8619f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(35, 22);
    ctx.bezierCurveTo(14, -4, 0, 6, 4, 22);
    ctx.bezierCurveTo(0, 38, 14, 48, 35, 22);
    ctx.bezierCurveTo(56, 48, 70, 38, 66, 22);
    ctx.bezierCurveTo(70, 6, 56, -4, 35, 22);
    ctx.fill();
    ctx.fillStyle = '#d04d8a';
    ctx.beginPath();
    ctx.ellipse(35, 22, 8, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(16, 14, 6, 3, -0.5, 0, Math.PI * 2);
    ctx.fill();
  });

  make(scene, 'acc-gorro', 120, 76, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 76);
    g.addColorStop(0, '#ffcf7a');
    g.addColorStop(1, '#f29a4a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(14, 62);
    ctx.bezierCurveTo(10, 14, 110, 14, 106, 62);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff1d6';
    ctx.beginPath();
    ctx.roundRect(8, 54, 104, 18, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,110,40,0.35)';
    ctx.lineWidth = 3;
    for (let x = 30; x < 100; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 50);
      ctx.lineTo(x + 3, 26);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff1d6';
    ctx.beginPath();
    ctx.arc(60, 14, 12, 0, Math.PI * 2);
    ctx.fill();
  });

  make(scene, 'acc-corona', 96, 60, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 60);
    g.addColorStop(0, '#fff3a1');
    g.addColorStop(1, '#f2b632');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(8, 54);
    ctx.lineTo(4, 14);
    ctx.lineTo(28, 34);
    ctx.lineTo(48, 4);
    ctx.lineTo(68, 34);
    ctx.lineTo(92, 14);
    ctx.lineTo(88, 54);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c98a14';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (const [x, y, c] of [[48, 40, '#ff6fa8'], [26, 44, '#6fd3ff'], [70, 44, '#8cf0a8']] as const) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const glasses = (ctx: Ctx, star: boolean) => {
    ctx.strokeStyle = star ? '#ff5fa2' : '#3b2a63';
    ctx.lineWidth = 4;
    ctx.fillStyle = star ? 'rgba(255,200,230,0.35)' : 'rgba(200,230,255,0.3)';
    for (const cx of [32, 88]) {
      ctx.beginPath();
      if (star) {
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 24 : 11;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          ctx.lineTo(cx + Math.cos(a) * r, 28 + Math.sin(a) * r);
        }
        ctx.closePath();
      } else {
        ctx.arc(cx, 28, 20, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(52, 26);
    ctx.quadraticCurveTo(60, 20, 68, 26);
    ctx.stroke();
  };
  make(scene, 'acc-gafas', 120, 56, (ctx) => glasses(ctx, false));
  make(scene, 'acc-estrellas', 120, 56, (ctx) => glasses(ctx, true));

  make(scene, 'acc-pajarita', 70, 36, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 36);
    g.addColorStop(0, '#7fd6ff');
    g.addColorStop(1, '#3a8fd6');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(35, 18);
    ctx.lineTo(4, 2);
    ctx.quadraticCurveTo(0, 18, 4, 34);
    ctx.closePath();
    ctx.moveTo(35, 18);
    ctx.lineTo(66, 2);
    ctx.quadraticCurveTo(70, 18, 66, 34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2f75b5';
    ctx.beginPath();
    ctx.roundRect(28, 10, 14, 16, 5);
    ctx.fill();
  });

  make(scene, 'acc-bufanda', 170, 64, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 40);
    g.addColorStop(0, '#9ff0d0');
    g.addColorStop(1, '#4fc79c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(6, 10);
    ctx.quadraticCurveTo(85, 34, 164, 10);
    ctx.lineTo(164, 28);
    ctx.quadraticCurveTo(85, 52, 6, 28);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(112, 26, 22, 36, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    for (const y of [36, 46, 56]) {
      ctx.beginPath();
      ctx.moveTo(114, y);
      ctx.lineTo(132, y);
      ctx.stroke();
    }
  });
}

function createRoomTextures(scene: Phaser.Scene) {
  make(scene, 'room-window', 180, 150, (ctx, w, h) => {
    ctx.fillStyle = '#fff4f9';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 26);
    ctx.fill();
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#9fd3ff');
    sky.addColorStop(1, '#ffd9ef');
    ctx.fillStyle = sky;
    ctx.beginPath();
    ctx.roundRect(12, 12, w - 24, h - 24, 18);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [x, y, r] of [[50, 60, 16], [70, 54, 20], [92, 62, 14], [120, 96, 12], [136, 92, 15]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff4f9';
    ctx.fillRect(w / 2 - 4, 12, 8, h - 24);
    ctx.fillRect(12, h / 2 - 4, w - 24, 8);
  });

  make(scene, 'room-plant', 90, 150, (ctx) => {
    ctx.fillStyle = '#62c48f';
    for (const [x, y, rx, ry, rot] of [
      [45, 50, 14, 34, 0],
      [26, 66, 12, 30, -0.6],
      [64, 66, 12, 30, 0.6],
      [34, 40, 10, 26, -0.25],
      [56, 40, 10, 26, 0.25],
    ]) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
    }
    const pot = ctx.createLinearGradient(0, 96, 0, 150);
    pot.addColorStop(0, '#ffb38a');
    pot.addColorStop(1, '#e8845c');
    ctx.fillStyle = pot;
    ctx.beginPath();
    ctx.moveTo(18, 96);
    ctx.lineTo(72, 96);
    ctx.lineTo(64, 148);
    ctx.lineTo(26, 148);
    ctx.closePath();
    ctx.fill();
  });

  make(scene, 'room-rug', 320, 90, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#ffe3f1');
    g.addColorStop(0.7, '#ffc6e2');
    g.addColorStop(1, '#f7a8cf');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2 - 16, h / 2 - 12, 0, 0, Math.PI * 2);
    ctx.stroke();
  });

  make(scene, 'room-bed', 220, 90, (ctx) => {
    ctx.fillStyle = '#b9a2ef';
    ctx.beginPath();
    ctx.roundRect(4, 30, 212, 56, 26);
    ctx.fill();
    ctx.fillStyle = '#e9e0ff';
    ctx.beginPath();
    ctx.roundRect(14, 20, 192, 44, 22);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(54, 34, 34, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function createHopTextures(scene: Phaser.Scene) {
  make(scene, 'hop-block', 64, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#ffd1e6');
    g.addColorStop(0.5, '#ff8fc0');
    g.addColorStop(1, '#e05596');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, h - 4, 14);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.roundRect(10, 8, w * 0.45, 8, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,40,100,0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, h - 4, 14);
    ctx.stroke();
  });

  make(scene, 'hop-hill', 400, 140, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#c9b3ff');
    g.addColorStop(1, '#a98be8');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.bezierCurveTo(60, 10, 160, 10, 210, 80);
    ctx.bezierCurveTo(250, 30, 340, 30, w, h);
    ctx.closePath();
    ctx.fill();
  });

  make(scene, 'hop-cloud', 140, 60, (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const [x, y, r] of [[40, 38, 22], [70, 28, 28], [100, 38, 22], [70, 44, 20]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}
