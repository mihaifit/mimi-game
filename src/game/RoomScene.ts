import Phaser from 'phaser';
import { moodOf } from '../core/needs';
import { PERSONALITIES } from '../core/personalities';
import type { SaveData } from '../core/types';
import { bus, layout, store } from './context';
import { Mimi } from './Mimi';
import { RES, createTextures } from './textures';
import type { FxKind } from './store';

const S = 1 / RES;

export class RoomScene extends Phaser.Scene {
  private mimi!: Mimi;
  private wall!: Phaser.GameObjects.Graphics;
  private windowImg!: Phaser.GameObjects.Image;
  private plant!: Phaser.GameObjects.Image;
  private bed!: Phaser.GameObjects.Image;
  private rug!: Phaser.GameObjects.Image;
  private night!: Phaser.GameObjects.Rectangle;
  private zzzTimer?: Phaser.Time.TimerEvent;
  private unsub: Array<() => void> = [];
  private mimiScale = 1;
  private lastEquip = '';
  private lastSleeping: boolean | null = null;

  constructor() {
    super('room');
  }

  create() {
    createTextures(this);
    this.wall = this.add.graphics();
    this.windowImg = this.add.image(0, 0, 'room-window').setScale(S);
    this.bed = this.add.image(0, 0, 'room-bed').setScale(S);
    this.plant = this.add.image(0, 0, 'room-plant').setScale(S).setOrigin(0.5, 1);
    this.rug = this.add.image(0, 0, 'room-rug').setScale(S);
    this.mimi = new Mimi(this, 0, 0);
    this.mimi.enablePetting(() => this.handlePet());
    this.night = this.add.rectangle(0, 0, 10, 10, 0x1b1445, 0).setOrigin(0).setDepth(5);

    this.layoutScene();
    this.scale.on('resize', this.layoutScene, this);
    bus.on('layout', this.layoutScene, this);

    this.unsub.push(store.subscribe((s) => this.applyState(s)));
    this.unsub.push(store.onFx((fx) => this.playFx(fx)));
    this.events.once('shutdown', () => {
      this.unsub.forEach((u) => u());
      this.unsub = [];
      this.scale.off('resize', this.layoutScene, this);
      bus.off('layout', this.layoutScene, this);
    });
    bus.emit('scene', 'room');
  }

  private handlePet() {
    const r = store.pet();
    bus.emit('toast', r.message);
    if (!r.ok) this.mimi.sad();
  }

  private layoutScene() {
    const { width: W, height: H } = this.scale;
    const floorY = Math.round(H * 0.6);
    this.wall.clear();
    this.wall.fillGradientStyle(0xfbe9ff, 0xfbe9ff, 0xf1dcff, 0xf1dcff, 1);
    this.wall.fillRect(0, 0, W, floorY);
    // Papel pintado: lunares suaves.
    this.wall.fillStyle(0xffffff, 0.45);
    for (let y = 30; y < floorY - 10; y += 46) {
      for (let x = (y / 46) % 2 ? 23 : 0; x < W + 20; x += 46) this.wall.fillCircle(x, y, 4);
    }
    this.wall.fillGradientStyle(0xf6c9a8, 0xf6c9a8, 0xe9ad8a, 0xe9ad8a, 1);
    this.wall.fillRect(0, floorY, W, H - floorY);
    this.wall.fillStyle(0xffffff, 0.6);
    this.wall.fillRect(0, floorY - 6, W, 8);
    this.wall.fillStyle(0xd99a78, 0.35);
    for (let x = -40; x < W + 40; x += 70) this.wall.fillRect(x, floorY + 2, 3, H - floorY);

    const freeTop = layout.top;
    const freeBottom = H - layout.bottom;
    const freeH = Math.max(200, freeBottom - freeTop);
    this.mimiScale = Phaser.Math.Clamp(Math.min(W / 400, freeH / 330), 0.62, 1.35);
    const feetY = freeBottom - 34 * this.mimiScale;
    this.mimi.setPosition(W / 2, feetY).setScale(this.mimiScale);
    this.rug.setPosition(W / 2, feetY).setScale(S * this.mimiScale * 1.1);

    const deco = Phaser.Math.Clamp(W / 700, 0.55, 1.1);
    this.windowImg.setPosition(W * 0.22, Math.max(freeTop + 70 * deco, floorY * 0.45)).setScale(S * deco);
    this.windowImg.setVisible(floorY - freeTop > 100 * deco);
    this.plant.setPosition(W - 50 * deco, floorY + 30 * deco).setScale(S * deco);
    this.bed.setPosition(W * 0.78, floorY - 10 * deco).setScale(S * deco).setVisible(W > 560);
    this.night.setSize(W, H);
  }

  private applyState(s: SaveData) {
    const mood = moodOf(s);
    this.mimi.setMood(mood);
    const equipKey = JSON.stringify(s.equipped);
    if (equipKey !== this.lastEquip) {
      this.lastEquip = equipKey;
      this.mimi.setAccessories(s.equipped);
    }
    this.mimi.setAnimSpeed(PERSONALITIES[s.personality].animSpeed);
    const sleeping = s.sleeping;
    if (sleeping === this.lastSleeping) return;
    this.lastSleeping = sleeping;
    this.tweens.add({ targets: this.night, fillAlpha: sleeping ? 0.45 : 0, duration: 600 });
    if (sleeping && !this.zzzTimer) {
      this.zzzTimer = this.time.addEvent({ delay: 1100, loop: true, callback: () => this.floatZ() });
    } else if (!sleeping && this.zzzTimer) {
      this.zzzTimer.remove();
      this.zzzTimer = undefined;
    }
  }

  private headPoint() {
    return { x: this.mimi.x, y: this.mimi.y - 150 * this.mimiScale };
  }

  private floatZ() {
    const p = this.headPoint();
    const z = this.add.image(p.x + 50 * this.mimiScale, p.y, 'zzz').setScale(S * 0.6 * this.mimiScale).setDepth(6);
    this.tweens.add({
      targets: z,
      x: z.x + 40,
      y: z.y - 70,
      scale: S * 1.1 * this.mimiScale,
      alpha: 0,
      duration: 2200,
      onComplete: () => z.destroy(),
    });
  }

  private playFx(fx: FxKind) {
    const p = this.headPoint();
    const k = this.mimiScale;
    switch (fx) {
      case 'pet':
        this.mimi.boing(1);
        for (let i = 0; i < 4; i++) {
          const h = this.add.image(p.x + Phaser.Math.Between(-60, 60) * k, p.y + 30 * k, 'heart').setScale(S * 0.6 * k).setDepth(6);
          this.tweens.add({
            targets: h,
            y: h.y - Phaser.Math.Between(70, 120) * k,
            scale: S * k,
            alpha: 0,
            delay: i * 90,
            duration: 1000,
            ease: 'Sine.easeOut',
            onComplete: () => h.destroy(),
          });
        }
        break;
      case 'feed': {
        const mouthY = this.mimi.y - 58 * k;
        const b = this.add.image(this.mimi.x, mouthY - 220 * k, 'berry').setScale(S * k).setDepth(6);
        this.tweens.add({
          targets: b,
          y: mouthY,
          scale: S * 0.5 * k,
          duration: 520,
          ease: 'Quad.easeIn',
          onComplete: () => {
            b.destroy();
            this.mimi.eat();
          },
        });
        break;
      }
      case 'wash':
        this.mimi.boing(0.6);
        for (let i = 0; i < 12; i++) {
          const bx = this.mimi.x + Phaser.Math.Between(-100, 100) * k;
          const bub = this.add.image(bx, this.mimi.y - Phaser.Math.Between(0, 60) * k, 'bubble').setScale(S * Phaser.Math.FloatBetween(0.4, 1) * k).setDepth(6);
          this.tweens.add({
            targets: bub,
            y: bub.y - Phaser.Math.Between(120, 220) * k,
            x: bx + Phaser.Math.Between(-30, 30),
            alpha: 0,
            delay: i * 60,
            duration: 1300,
            onComplete: () => bub.destroy(),
          });
        }
        break;
      case 'buy':
      case 'equip':
        this.mimi.boing(0.9);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const sp = this.add.image(p.x, p.y + 40 * k, 'sparkle').setScale(S * k).setDepth(6);
          this.tweens.add({
            targets: sp,
            x: p.x + Math.cos(a) * 120 * k,
            y: p.y + 40 * k + Math.sin(a) * 90 * k,
            alpha: 0,
            angle: 180,
            duration: 800,
            onComplete: () => sp.destroy(),
          });
        }
        break;
      case 'sleep':
      case 'wake':
        this.mimi.boing(0.5);
        break;
    }
  }
}
