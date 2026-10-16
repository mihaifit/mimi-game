import Phaser from 'phaser';
import type { Equipped, Mood } from '../core/types';
import { BODY_H, BODY_W, RES } from './textures';

const S = 1 / RES;

const ACC_LAYOUT: Record<string, { x: number; y: number; slot: 'head' | 'face' | 'neck' }> = {
  lazo: { x: 44, y: -158, slot: 'head' },
  gorro: { x: 0, y: -150, slot: 'head' },
  corona: { x: 0, y: -160, slot: 'head' },
  gafas: { x: 0, y: -84, slot: 'face' },
  estrellas: { x: 0, y: -84, slot: 'face' },
  pajarita: { x: 0, y: -30, slot: 'neck' },
  bufanda: { x: 0, y: -34, slot: 'neck' },
};

/**
 * MIMI: gelatina lavanda compuesta por capas (sombra, orejas, cuerpo, brillo,
 * cara, accesorios). El origen del contenedor está en los "pies" para que el
 * squash & stretch se apoye en el suelo.
 */
export class Mimi extends Phaser.GameObjects.Container {
  readonly shadow: Phaser.GameObjects.Image;
  private breath: Phaser.GameObjects.Container;
  private jelly: Phaser.GameObjects.Container;
  private body_: Phaser.GameObjects.Image;
  private ears: Phaser.GameObjects.Image[];
  private eyes: Phaser.GameObjects.Image[];
  private closedEyes: Phaser.GameObjects.Image[];
  private mouth: Phaser.GameObjects.Graphics;
  private accLayer: Phaser.GameObjects.Container;
  private mood: Mood = 'neutral';
  private eating = false;
  private breathTween?: Phaser.Tweens.Tween;
  private blinkTimer?: Phaser.Time.TimerEvent;
  private reacting = false;
  animSpeed = 1;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.shadow = scene.add.image(0, 4, 'shadow').setScale(S * 1.05, S);
    this.add(this.shadow);
    this.breath = scene.add.container(0, 0);
    this.jelly = scene.add.container(0, 0);
    this.breath.add(this.jelly);
    this.add(this.breath);

    this.ears = [-1, 1].map((side) =>
      scene.add
        .image(side * 58, -132, 'mimi-ear')
        .setOrigin(0.5, 0.92)
        .setScale(S)
        .setRotation(side * 0.38),
    );
    this.body_ = scene.add.image(0, 0, 'mimi-body').setOrigin(0.5, 1).setScale(S);
    const shine = scene.add.image(-40, -122, 'mimi-shine').setScale(S);
    const cheeks = [-1, 1].map((side) => scene.add.image(side * 58, -60, 'mimi-cheek').setScale(S));
    this.eyes = [-1, 1].map((side) => scene.add.image(side * 34, -84, 'mimi-eye').setScale(S));
    this.closedEyes = [-1, 1].map((side) =>
      scene.add.image(side * 34, -80, 'mimi-eye-closed').setScale(S).setVisible(false),
    );
    this.mouth = scene.add.graphics({ x: 0, y: -58 });
    this.accLayer = scene.add.container(0, 0);
    this.jelly.add([...this.ears, this.body_, shine, ...cheeks, ...this.eyes, ...this.closedEyes, this.mouth, this.accLayer]);

    this.setSize(BODY_W, BODY_H);
    scene.add.existing(this);
    this.drawMouth();
    this.startIdle();
    this.scheduleBlink();
  }

  /** Zona táctil elíptica sobre el cuerpo. */
  enablePetting(onPet: () => void) {
    const hit = new Phaser.Geom.Ellipse(BODY_W * RES * 0.5, BODY_H * RES * 0.5, BODY_W * RES * 0.95, BODY_H * RES);
    this.body_.setInteractive(hit, Phaser.Geom.Ellipse.Contains);
    if (this.body_.input) this.body_.input.cursor = 'pointer';
    let lastStroke = 0;
    this.body_.on('pointerdown', () => onPet());
    // Acariciar arrastrando el dedo por encima.
    this.body_.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const now = this.scene.time.now;
      if (now - lastStroke > 650) {
        lastStroke = now;
        onPet();
      }
    });
  }

  private startIdle() {
    this.breathTween?.remove();
    const sleeping = this.mood === 'sleeping';
    this.breathTween = this.scene.tweens.add({
      targets: this.breath,
      scaleY: sleeping ? 0.96 : 1.035,
      scaleX: sleeping ? 1.03 : 0.985,
      duration: (sleeping ? 1900 : 1200) / this.animSpeed,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    this.scene.tweens.add({
      targets: this.ears,
      angle: '+=6',
      duration: 1400 / this.animSpeed,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  setAnimSpeed(v: number) {
    if (v === this.animSpeed) return;
    this.animSpeed = v;
    this.breath.setScale(1);
    this.scene.tweens.killTweensOf(this.ears);
    this.ears.forEach((e, i) => e.setRotation((i === 0 ? -1 : 1) * 0.38));
    this.startIdle();
  }

  private scheduleBlink() {
    this.blinkTimer?.remove();
    this.blinkTimer = this.scene.time.delayedCall(Phaser.Math.Between(1800, 4800), () => {
      if (this.mood !== 'sleeping' && !this.eating) {
        this.scene.tweens.add({ targets: this.eyes, scaleY: S * 0.1, duration: 70, yoyo: true, ease: 'Quad.easeIn' });
      }
      this.scheduleBlink();
    });
  }

  setMood(mood: Mood) {
    if (mood === this.mood) return;
    const wasSleeping = this.mood === 'sleeping';
    this.mood = mood;
    const closed = mood === 'sleeping';
    this.eyes.forEach((e) => e.setVisible(!closed));
    this.closedEyes.forEach((e) => e.setVisible(closed));
    this.drawMouth();
    if (closed !== wasSleeping) {
      this.breath.setScale(1);
      this.startIdle();
    }
  }

  private drawMouth() {
    const g = this.mouth;
    g.clear();
    if (this.eating) {
      g.fillStyle(0x3b1d40, 1);
      g.fillEllipse(0, 2, 22, 18);
      g.fillStyle(0xff8fb5, 1);
      g.fillEllipse(0, 7, 12, 6);
      return;
    }
    g.lineStyle(4, 0x2a1d47, 1);
    g.beginPath();
    switch (this.mood) {
      case 'happy':
        g.fillStyle(0x3b1d40, 1);
        g.slice(0, -4, 13, Phaser.Math.DegToRad(10), Phaser.Math.DegToRad(170), false);
        g.fillPath();
        return;
      case 'sad':
        g.arc(0, 10, 10, Phaser.Math.DegToRad(205), Phaser.Math.DegToRad(335), false);
        break;
      case 'sleeping':
        g.fillStyle(0x3b1d40, 0.85);
        g.fillEllipse(0, 2, 8, 9);
        return;
      default:
        g.arc(0, -6, 10, Phaser.Math.DegToRad(30), Phaser.Math.DegToRad(150), false);
    }
    g.strokePath();
  }

  setAccessories(eq: Equipped) {
    this.accLayer.removeAll(true);
    for (const slot of ['neck', 'face', 'head'] as const) {
      const id = eq[slot];
      if (!id || !ACC_LAYOUT[id]) continue;
      const l = ACC_LAYOUT[id];
      const img = this.scene.add.image(l.x, l.y, `acc-${id}`).setScale(S);
      if (id === 'lazo') img.setRotation(0.25);
      this.accLayer.add(img);
    }
  }

  /** Squash & stretch elástico genérico. */
  boing(strength = 1) {
    if (this.reacting) return;
    this.reacting = true;
    this.scene.tweens.chain({
      targets: this.jelly,
      tweens: [
        { scaleX: 1 + 0.18 * strength, scaleY: 1 - 0.16 * strength, duration: 110, ease: 'Quad.easeOut' },
        { scaleX: 1 - 0.1 * strength, scaleY: 1 + 0.14 * strength, duration: 140, ease: 'Quad.easeOut' },
        { scaleX: 1, scaleY: 1, duration: 520, ease: 'Elastic.easeOut', easeParams: [1.2, 0.4] },
      ],
      onComplete: () => {
        this.reacting = false;
      },
    });
  }

  /** Para MIMI HOP: estira al saltar, aplasta al aterrizar. */
  stretch(kind: 'jump' | 'land') {
    this.scene.tweens.killTweensOf(this.jelly);
    this.reacting = false;
    const [sx, sy] = kind === 'jump' ? [0.82, 1.22] : [1.25, 0.78];
    this.jelly.setScale(sx, sy);
    this.scene.tweens.add({ targets: this.jelly, scaleX: 1, scaleY: 1, duration: 420, ease: 'Elastic.easeOut', easeParams: [1.1, 0.45] });
  }

  eat() {
    this.eating = true;
    this.drawMouth();
    this.scene.time.delayedCall(650, () => {
      this.eating = false;
      this.drawMouth();
      this.boing(0.8);
    });
  }

  sad() {
    this.scene.tweens.add({ targets: this.jelly, angle: { from: -6, to: 6 }, duration: 90, yoyo: true, repeat: 2, onComplete: () => this.jelly.setAngle(0) });
  }

  /** Altura del salto (en px) para separar el cuerpo de la sombra. */
  setHop(height: number) {
    this.breath.y = -height;
    const k = Math.max(0.35, 1 - height / 260);
    this.shadow.setScale(S * 1.05 * k, S * k).setAlpha(0.4 + 0.6 * k);
  }
}
