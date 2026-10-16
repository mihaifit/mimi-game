import * as Phaser from 'phaser';
import { drawGround, drawHills, drawObstacle, drawSky } from '../art/art';
import { HOP, OBSTACLE_TYPES, createRun, pressJump, stepRun, type HopRun } from '../hop/hopLogic';
import type { Store } from '../state/store';
import { MimiRig } from './mimiRig';

/** Eventos emitidos en game.events. */
export const HOP_EVENTS = {
  begin: 'hop:begin',
  jump: 'hop:jumped',
  score: 'hop:score',
  over: 'hop:over',
} as const;

const GROUND_H = HOP.height - HOP.groundY;

interface Layer {
  images: Phaser.GameObjects.Image[];
  width: number;
  factor: number;
}

export class HopScene extends Phaser.Scene {
  private run!: HopRun;
  private mimi!: MimiRig;
  private layers: Layer[] = [];
  private obstacleImages: Phaser.GameObjects.Image[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private hintTween?: Phaser.Tweens.Tween;

  constructor() {
    super('hop');
  }

  create(): void {
    const store = this.registry.get('store') as Store;
    this.run = createRun();
    this.layers = [];
    this.obstacleImages = [];

    const tex = (key: string, make: () => HTMLCanvasElement) => {
      if (!this.textures.exists(key)) this.textures.addCanvas(key, make());
      return key;
    };
    this.add.image(0, 0, tex('hop-sky', () => drawSky(HOP.width, HOP.height))).setOrigin(0).setScale(0.5);
    this.addLayer(tex('hop-hills-far', () => drawHills(HOP.width, 260, '#d9c8ff', '#c3b0f5', 30, 2)), HOP.groundY - 230, 0.15);
    this.addLayer(tex('hop-hills-near', () => drawHills(HOP.width, 200, '#bfe9cf', '#9fd9b6', 22, 3)), HOP.groundY - 150, 0.4);
    this.addLayer(tex('hop-ground', () => drawGround(HOP.width, GROUND_H)), HOP.groundY - 6, 1);
    for (const t of OBSTACLE_TYPES) tex(`hop-obstacle-${t.kind}`, () => drawObstacle(t.kind, t.w, t.h));

    this.mimi = new MimiRig(this, HOP.playerX, HOP.groundY, 0.42);
    this.mimi.setAccessories(store.state.equipped);
    this.mimi.setExpression('open', 'smile');

    this.scoreText = this.add
      .text(HOP.width / 2, 40, '0', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '52px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#7a5cd3',
        strokeThickness: 8,
      })
      .setOrigin(0.5, 0)
      .setDepth(10);
    this.hint = this.add
      .text(HOP.width / 2, 200, 'Toca o pulsa Espacio para saltar', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#4b2f86',
        backgroundColor: 'rgba(255,255,255,0.75)',
        padding: { x: 18, y: 10 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.hintTween = this.tweens.add({ targets: this.hint, scale: 1.05, duration: 700, yoyo: true, repeat: -1 });

    this.input.on('pointerdown', () => this.jump());
    const kb = this.input.keyboard;
    if (kb) {
      // Sin captura global: así los botones de la interfaz siguen respondiendo a Espacio/Enter.
      kb.disableGlobalCapture();
      for (const code of ['SPACE', 'UP', 'W']) kb.on(`keydown-${code}`, () => this.jump());
    }
    this.game.events.on('hop:jump', this.jump, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('hop:jump', this.jump, this);
      this.mimi.destroy();
    });
  }

  private addLayer(key: string, y: number, factor: number): void {
    const width = HOP.width;
    const images = [0, 1].map((i) => this.add.image(i * width, y, key).setOrigin(0).setScale(0.5));
    this.layers.push({ images, width, factor });
  }

  private jump(): void {
    if (this.run.status === 'over') return;
    const wasReady = this.run.status === 'ready';
    pressJump(this.run);
    if (wasReady) {
      this.hintTween?.stop();
      this.tweens.add({ targets: this.hint, alpha: 0, duration: 200 });
      this.game.events.emit(HOP_EVENTS.begin);
    }
  }

  override update(_time: number, delta: number): void {
    const run = this.run;
    const ev = stepRun(run, delta / 1000);

    for (const layer of this.layers) {
      const off = (run.distance * layer.factor) % layer.width;
      layer.images[0].x = -off;
      layer.images[1].x = layer.width - off;
    }

    while (this.obstacleImages.length < run.obstacles.length) {
      this.obstacleImages.push(this.add.image(0, 0, 'hop-obstacle-0').setOrigin(0, 1).setScale(0.5).setDepth(3));
    }
    this.obstacleImages.forEach((img, i) => {
      const o = run.obstacles[i];
      img.setVisible(!!o);
      if (o) img.setTexture(`hop-obstacle-${o.kind}`).setPosition(o.x, HOP.groundY + 4);
    });

    const air = HOP.groundY - run.y;
    this.mimi.setAirHeight(air);
    if (!run.onGround) {
      const v = Phaser.Math.Clamp(run.vy / 1400, -1, 1);
      this.mimi.setStretch(1 - Math.abs(v) * 0.14, 1 + Math.abs(v) * 0.16);
    }
    if (ev.jumped) {
      this.mimi.flashMouth('open', 300, 'happy');
      this.game.events.emit(HOP_EVENTS.jump);
    }
    if (ev.landed) this.mimi.squash(0.6);
    if (ev.scored > 0) {
      this.scoreText.setText(String(run.score));
      this.tweens.add({ targets: this.scoreText, scale: { from: 1.25, to: 1 }, duration: 200 });
      this.game.events.emit(HOP_EVENTS.score, run.score);
    }
    if (ev.crashed) {
      this.mimi.setStretch(1, 1);
      this.mimi.squash(1.2);
      this.mimi.setExpression('closed', 'sad');
      this.cameras.main.shake(220, 0.01);
      this.game.events.emit(HOP_EVENTS.over, run.score);
    }
  }
}
