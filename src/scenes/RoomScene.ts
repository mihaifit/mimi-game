import * as Phaser from 'phaser';
import { drawRoom } from '../art/art';
import { moodOf, type GameState } from '../state/model';
import { pet } from '../state/care';
import type { Store, StoreEvent } from '../state/store';
import { MimiRig } from './mimiRig';

export const VIEW_W = 720;
export const VIEW_H = 540;

export class RoomScene extends Phaser.Scene {
  private mimi!: MimiRig;
  private night!: Phaser.GameObjects.Rectangle;
  private store!: Store;
  private unsubscribe?: () => void;
  private zTimer?: Phaser.Time.TimerEvent;
  private idleTimer?: Phaser.Time.TimerEvent;
  private sleeping = false;

  constructor() {
    super('room');
  }

  create(): void {
    this.store = this.registry.get('store') as Store;
    if (!this.textures.exists('room-bg')) this.textures.addCanvas('room-bg', drawRoom(VIEW_W, VIEW_H));
    this.add.image(0, 0, 'room-bg').setOrigin(0).setScale(0.5);

    this.mimi = new MimiRig(this, VIEW_W / 2, 468, 1.05);

    this.night = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x1b1440, 1).setOrigin(0).setAlpha(0).setDepth(5);

    // Zona táctil sobre Mimi: tocarla es darle caricias.
    const hit = this.add.zone(VIEW_W / 2, 468 - 95, 230, 200).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      this.store.run(pet, { type: 'care', kind: 'pet' });
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.mimi.lookAt(p.x, p.y));

    this.applyState(this.store.state, true);
    this.unsubscribe = this.store.subscribe((s, e) => this.onStore(s, e));
    this.idleTimer = this.time.addEvent({ delay: 7000, loop: true, callback: () => this.idleHop() });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.zTimer?.remove();
      this.idleTimer?.remove();
      this.mimi.destroy();
    });
  }

  private onStore(state: GameState, e: StoreEvent): void {
    if (e.type === 'state') this.applyState(state, false);
    else if (e.type === 'care') this.playCare(e.kind);
  }

  private applyState(state: GameState, instant: boolean): void {
    const mood = moodOf(state.needs);
    if (mood === 'feliz') this.mimi.setExpression('open', 'smile');
    else if (mood === 'tranquila') this.mimi.setExpression('open', 'smile');
    else if (mood === 'inquieta') this.mimi.setExpression('open', 'neutral');
    else this.mimi.setExpression('open', 'sad');
    this.mimi.setAccessories(state.equipped);

    if (state.sleeping !== this.sleeping || instant) {
      this.sleeping = state.sleeping;
      this.mimi.setSleeping(state.sleeping);
      this.tweens.add({ targets: this.night, alpha: state.sleeping ? 0.48 : 0, duration: instant ? 0 : 700 });
      this.zTimer?.remove();
      this.zTimer = undefined;
      if (state.sleeping) this.zTimer = this.time.addEvent({ delay: 1100, loop: true, callback: () => this.spawnZ() });
    }
  }

  private spawnZ(): void {
    const top = this.mimi.topWorld();
    const t = this.add
      .text(top.x + 50, top.y + 10, 'Z', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${Phaser.Math.Between(22, 34)}px`,
        fontStyle: 'bold',
        color: '#e9e0ff',
      })
      .setDepth(6)
      .setAlpha(0);
    this.tweens.add({
      targets: t,
      x: t.x + Phaser.Math.Between(30, 60),
      y: t.y - 90,
      alpha: { from: 1, to: 0 },
      duration: 2200,
      ease: 'Sine.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private idleHop(): void {
    const s = this.store.state;
    if (s.sleeping || moodOf(s.needs) === 'triste' || !this.sys.isActive()) return;
    this.mimi.squash(0.6);
    this.tweens.add({
      targets: this.mimi.root,
      y: this.mimi.root.y - 26,
      duration: 220,
      yoyo: true,
      ease: 'Quad.easeOut',
      delay: 90,
      onComplete: () => this.mimi.squash(0.5),
    });
  }

  private playCare(kind: 'feed' | 'clean' | 'pet' | 'sleep' | 'wake'): void {
    switch (kind) {
      case 'pet': {
        this.mimi.squash(1);
        if (!this.sleeping) this.mimi.flashMouth('smile', 900, 'happy');
        const top = this.mimi.topWorld();
        for (let i = 0; i < 4; i++) {
          const h = this.add
            .image(top.x + Phaser.Math.Between(-80, 80), top.y + 30, 'fx-heart')
            .setScale(0.5 * Phaser.Math.FloatBetween(0.6, 1))
            .setDepth(6);
          this.tweens.add({
            targets: h,
            y: h.y - Phaser.Math.Between(70, 120),
            alpha: { from: 1, to: 0 },
            duration: 1100,
            delay: i * 90,
            ease: 'Sine.easeOut',
            onComplete: () => h.destroy(),
          });
        }
        break;
      }
      case 'feed': {
        const m = this.mimi.mouthWorld();
        const food = this.add.image(m.x, -40, 'fx-food').setScale(0.6).setDepth(6);
        this.mimi.flashMouth('open', 650);
        this.tweens.add({
          targets: food,
          y: m.y - 4,
          duration: 520,
          ease: 'Back.easeIn',
          onComplete: () => {
            this.mimi.squash(0.9);
            this.mimi.flashMouth('smile', 900, 'happy');
            this.tweens.add({ targets: food, scale: 0, alpha: 0, duration: 160, onComplete: () => food.destroy() });
            this.sparkles(m.x, m.y, 5);
          },
        });
        break;
      }
      case 'clean': {
        const base = this.mimi.root;
        for (let i = 0; i < 14; i++) {
          const b = this.add
            .image(base.x + Phaser.Math.Between(-110, 110), base.y - Phaser.Math.Between(10, 150), 'fx-bubble')
            .setScale(0)
            .setDepth(6);
          this.tweens.add({
            targets: b,
            scale: 0.5 * Phaser.Math.FloatBetween(0.6, 1.4),
            y: b.y - Phaser.Math.Between(40, 110),
            alpha: { from: 1, to: 0 },
            duration: 1300,
            delay: i * 60,
            ease: 'Sine.easeOut',
            onComplete: () => b.destroy(),
          });
        }
        this.mimi.squash(0.7);
        this.time.delayedCall(700, () => this.sparkles(base.x, base.y - 120, 6));
        break;
      }
      case 'sleep':
        this.mimi.squash(0.4);
        break;
      case 'wake':
        this.mimi.squash(1);
        break;
    }
  }

  private sparkles(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const s = this.add.image(x, y, 'fx-sparkle').setScale(0.4).setDepth(6);
      const a = (i / n) * Math.PI * 2;
      this.tweens.add({
        targets: s,
        x: x + Math.cos(a) * 80,
        y: y + Math.sin(a) * 60,
        alpha: { from: 1, to: 0 },
        angle: 180,
        duration: 700,
        ease: 'Quad.easeOut',
        onComplete: () => s.destroy(),
      });
    }
  }
}
