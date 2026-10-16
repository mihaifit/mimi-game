import * as Phaser from 'phaser';
import { BODY, RES, type EyesKind, type MouthKind } from '../art/art';
import type { Equipped } from '../state/model';
import { SLOTS } from '../state/model';
import { accessoryArt, ensureMimiTextures } from './textures';

const S = 1 / RES;

/**
 * Mascota MIMI montada con capas:
 *  root (posición y escala base) → squash (aplastar/estirar) → breath (respiración) → imágenes.
 * El origen de todo es el centro de la base, así aplastar mantiene los "pies" en el suelo.
 */
export class MimiRig {
  readonly root: Phaser.GameObjects.Container;
  private squashC: Phaser.GameObjects.Container;
  private breathC: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Image;
  private body: Phaser.GameObjects.Image;
  private eyes: Phaser.GameObjects.Image;
  private mouth: Phaser.GameObjects.Image;
  private accBack: Phaser.GameObjects.Container;
  private accFront: Phaser.GameObjects.Container;
  private breathTween?: Phaser.Tweens.Tween;
  private squashTween?: Phaser.Tweens.Tween;
  private blinkTimer?: Phaser.Time.TimerEvent;
  private eyesKind: EyesKind = 'open';
  private mouthKind: MouthKind = 'smile';
  private blinking = false;
  private sleeping = false;
  private overrideMouth: MouthKind | null = null;
  private lookX = 0;
  private lookY = 0;
  private accessoryKey = '';

  constructor(
    private scene: Phaser.Scene,
    x: number,
    y: number,
    scale: number,
  ) {
    ensureMimiTextures(scene);
    this.root = scene.add.container(x, y).setScale(scale);
    this.shadow = scene.add.image(0, 4, 'mimi-shadow').setScale(S).setAlpha(0.9);
    this.squashC = scene.add.container(0, 0);
    this.breathC = scene.add.container(0, 0);
    this.body = scene.add.image(0, 0, 'mimi-body').setOrigin(0.5, BODY.baseY / BODY.h).setScale(S);
    this.accBack = scene.add.container(0, 0);
    this.eyes = scene.add.image(0, BODY.eyesY - BODY.baseY, 'mimi-eyes-open').setScale(S);
    this.mouth = scene.add.image(0, BODY.mouthY - BODY.baseY, 'mimi-mouth-smile').setScale(S);
    this.accFront = scene.add.container(0, 0);
    this.breathC.add([this.body, this.accBack, this.eyes, this.mouth, this.accFront]);
    this.squashC.add(this.breathC);
    this.root.add([this.shadow, this.squashC]);

    this.startBreathing(1600);
    this.scheduleBlink();
  }

  get x(): number {
    return this.root.x;
  }

  setPosition(x: number, y: number): void {
    this.root.setPosition(x, y);
  }

  private startBreathing(duration: number): void {
    this.breathTween?.stop();
    this.breathC.setScale(1, 1);
    this.breathTween = this.scene.tweens.add({
      targets: this.breathC,
      scaleY: 1.035,
      scaleX: 0.982,
      duration,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private scheduleBlink(): void {
    this.blinkTimer = this.scene.time.addEvent({
      delay: Phaser.Math.Between(1800, 4800),
      callback: () => {
        if (!this.sleeping && this.eyesKind === 'open') {
          this.blinking = true;
          this.refreshFace();
          this.scene.time.delayedCall(130, () => {
            this.blinking = false;
            this.refreshFace();
          });
        }
        this.scheduleBlink();
      },
    });
  }

  private refreshFace(): void {
    const eyes: EyesKind = this.sleeping || this.blinking ? 'closed' : this.eyesKind;
    this.eyes.setTexture(`mimi-eyes-${eyes}`);
    this.mouth.setTexture(`mimi-mouth-${this.overrideMouth ?? this.mouthKind}`);
    const lx = eyes === 'open' ? this.lookX : 0;
    const ly = eyes === 'open' ? this.lookY : 0;
    this.eyes.setPosition(lx, BODY.eyesY - BODY.baseY + ly);
  }

  setExpression(eyes: EyesKind, mouth: MouthKind): void {
    this.eyesKind = eyes;
    this.mouthKind = mouth;
    this.refreshFace();
  }

  /** Cambia la boca temporalmente (p. ej. al comer). */
  flashMouth(mouth: MouthKind, ms: number, eyes?: EyesKind): void {
    this.overrideMouth = mouth;
    const prevEyes = this.eyesKind;
    if (eyes) this.eyesKind = eyes;
    this.refreshFace();
    this.scene.time.delayedCall(ms, () => {
      this.overrideMouth = null;
      if (eyes) this.eyesKind = prevEyes;
      this.refreshFace();
    });
  }

  setSleeping(sleeping: boolean): void {
    if (this.sleeping === sleeping) return;
    this.sleeping = sleeping;
    this.startBreathing(sleeping ? 2600 : 1600);
    this.refreshFace();
  }

  /** Mira hacia un punto (coordenadas de la escena). */
  lookAt(px: number, py: number): void {
    const dx = px - this.root.x;
    const dy = py - (this.root.y - 90 * this.root.scaleY);
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, len / 200);
    this.lookX = (dx / len) * 5 * k;
    this.lookY = (dy / len) * 3.5 * k;
    this.refreshFace();
  }

  setAccessories(equipped: Equipped): void {
    const key = SLOTS.map((s) => equipped[s] ?? '-').join('|');
    if (key === this.accessoryKey) return;
    this.accessoryKey = key;
    this.accBack.removeAll(true);
    this.accFront.removeAll(true);
    for (const slot of SLOTS) {
      const id = equipped[slot];
      if (!id) continue;
      const art = accessoryArt.get(id);
      if (!art) continue;
      const img = this.scene.add.image(art.x, art.y, `acc-${id}`).setOrigin(art.originX, art.originY).setScale(S);
      (art.behindFace ? this.accBack : this.accFront).add(img);
    }
  }

  /** Aplastar y rebotar como gelatina. */
  squash(strength = 1): void {
    this.squashTween?.stop();
    this.squashC.setScale(1, 1);
    this.squashTween = this.scene.tweens.chain({
      targets: this.squashC,
      tweens: [
        { scaleX: 1 + 0.22 * strength, scaleY: 1 - 0.2 * strength, duration: 90, ease: 'Quad.easeOut' },
        { scaleX: 1 - 0.1 * strength, scaleY: 1 + 0.14 * strength, duration: 130, ease: 'Quad.easeOut' },
        { scaleX: 1 + 0.04 * strength, scaleY: 1 - 0.04 * strength, duration: 120, ease: 'Sine.easeInOut' },
        { scaleX: 1, scaleY: 1, duration: 160, ease: 'Sine.easeOut' },
      ],
    }) as unknown as Phaser.Tweens.Tween;
    this.scene.tweens.add({
      targets: this.shadow,
      scaleX: { from: S * (1 + 0.2 * strength), to: S },
      duration: 400,
      ease: 'Sine.easeOut',
    });
  }

  /** Estiramiento continuo para saltos (sx, sy cerca de 1). */
  setStretch(sx: number, sy: number): void {
    this.squashTween?.stop();
    this.squashC.setScale(sx, sy);
  }

  /** Altura sobre el suelo (para la sombra en MIMI HOP). */
  setAirHeight(h: number): void {
    this.squashC.y = -h;
    const k = Math.max(0.35, 1 - h / 260);
    this.shadow.setScale(S * k).setAlpha(0.9 * k);
  }

  /** Coordenadas aproximadas de la boca en la escena. */
  mouthWorld(): { x: number; y: number } {
    return { x: this.root.x, y: this.root.y + (BODY.mouthY - BODY.baseY) * this.root.scaleY };
  }

  topWorld(): { x: number; y: number } {
    return { x: this.root.x, y: this.root.y + (BODY.topY - BODY.baseY) * this.root.scaleY };
  }

  destroy(): void {
    this.blinkTimer?.remove();
    this.breathTween?.stop();
    this.root.destroy();
  }
}
