import * as Phaser from 'phaser';
import {
  drawAccessory,
  drawBody,
  drawBubble,
  drawEyes,
  drawFood,
  drawHeart,
  drawMouth,
  drawShadow,
  drawSparkle,
  type AccessoryArt,
} from '../art/art';
import { SHOP_ITEMS } from '../state/shop';

export const accessoryArt = new Map<string, AccessoryArt>();

function add(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): void {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
}

/** Genera (una sola vez por juego) las texturas compartidas de Mimi y efectos. */
export function ensureMimiTextures(scene: Phaser.Scene): void {
  add(scene, 'mimi-body', drawBody());
  add(scene, 'mimi-shadow', drawShadow());
  for (const k of ['open', 'closed', 'happy'] as const) add(scene, `mimi-eyes-${k}`, drawEyes(k));
  for (const k of ['smile', 'neutral', 'sad', 'open'] as const) add(scene, `mimi-mouth-${k}`, drawMouth(k));
  add(scene, 'fx-heart', drawHeart());
  add(scene, 'fx-bubble', drawBubble());
  add(scene, 'fx-food', drawFood());
  add(scene, 'fx-sparkle', drawSparkle());
  for (const item of SHOP_ITEMS) {
    if (scene.textures.exists(`acc-${item.id}`)) continue;
    const art = drawAccessory(item.id);
    if (!art) continue;
    accessoryArt.set(item.id, art);
    add(scene, `acc-${item.id}`, art.canvas);
  }
}
