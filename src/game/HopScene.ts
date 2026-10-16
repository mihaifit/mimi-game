import Phaser from 'phaser';
import { HOP, createHop, queueJump, stepHop, type HopState } from '../core/hop';
import { PERSONALITIES } from '../core/personalities';
import { bus, store } from './context';
import { Mimi } from './Mimi';
import { RES, createTextures } from './textures';

const S = 1 / RES;
const MIMI_SCALE = 0.3;

type Phase = 'ready' | 'running' | 'over';

/** MIMI HOP: salta los bloques de gelatina con un toque o la barra espaciadora. */
export class HopScene extends Phaser.Scene {
  private sim!: HopState;
  private phase: Phase = 'ready';
  private runId = 0;
  private world = 1; // escala mundo → pantalla
  private groundY = 0;
  private mimi!: Mimi;
  private sky!: Phaser.GameObjects.Graphics;
  private hills: Phaser.GameObjects.Image[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private blocks = new Map<number, Phaser.GameObjects.Image>();
  private hint!: Phaser.GameObjects.Text;
  private lastScore = -1;

  constructor() {
    super('hop');
  }

  create() {
    createTextures(this);
    this.phase = 'ready';
    this.lastScore = -1;
    this.blocks.clear();
    const p = PERSONALITIES[store.save.personality];
    this.sim = createHop((Date.now() ^ 0x5eed) | 0, p.hopSpeedMul);

    this.sky = this.add.graphics();
    this.clouds = [0, 1, 2].map((i) => this.add.image(0, 0, 'hop-cloud').setScale(S).setData('i', i));
    this.hills = [0, 1, 2, 3].map(() => this.add.image(0, 0, 'hop-hill').setOrigin(0, 1).setScale(S));
    this.mimi = new Mimi(this, 0, 0);
    this.mimi.setAccessories(store.save.equipped);
    this.mimi.setMood('happy');
    this.mimi.setAnimSpeed(p.animSpeed);
    this.hint = this.add
      .text(0, 0, 'Toca la pantalla o pulsa Espacio para saltar', {
        fontFamily: 'Nunito, system-ui, sans-serif',
        fontSize: '20px',
        color: '#5e3fa8',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 300 },
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.layoutScene();
    this.scale.on('resize', this.layoutScene, this);

    this.input.on('pointerdown', () => this.jump());
    const kb = this.input.keyboard;
    if (kb) {
      kb.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.UP]);
      kb.on('keydown-SPACE', () => this.jump());
      kb.on('keydown-UP', () => this.jump());
      kb.on('keydown-W', () => this.jump());
    }
    bus.on('hop-quit', this.quit, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layoutScene, this);
      bus.off('hop-quit', this.quit, this);
    });
    bus.emit('scene', 'hop');
    bus.emit('hop-score', 0);
  }

  private layoutScene() {
    const { width: W, height: H } = this.scale;
    this.world = Phaser.Math.Clamp(H / 720, 0.75, 1.2);
    this.groundY = Math.round(H * 0.74);
    this.sky.clear();
    this.sky.fillGradientStyle(0xa9dcff, 0xa9dcff, 0xffe0f2, 0xffe0f2, 1);
    this.sky.fillRect(0, 0, W, this.groundY);
    this.sky.fillGradientStyle(0x9fe3c0, 0x9fe3c0, 0x6cc79b, 0x6cc79b, 1);
    this.sky.fillRect(0, this.groundY, W, H - this.groundY);
    this.sky.fillStyle(0xffffff, 0.5);
    this.sky.fillRect(0, this.groundY, W, 5);
    this.hills.forEach((h, i) => h.setPosition(i * 380 * this.world, this.groundY + 2).setScale(S * this.world));
    this.clouds.forEach((c, i) => c.setPosition(((i + 0.5) * W) / 3, this.groundY * (0.18 + 0.12 * i)).setScale(S * this.world));
    this.mimi.setPosition(HOP.playerX * this.world, this.groundY).setScale(MIMI_SCALE * this.world);
    this.hint.setPosition(W / 2, this.groundY * 0.42).setWordWrapWidth(Math.min(W - 40, 420));
  }

  private jump() {
    if (this.phase === 'over') return;
    // Evita que la barra espaciadora pulse un botón DOM enfocado.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (this.phase === 'ready') {
      this.phase = 'running';
      this.runId = store.startRun();
      this.tweens.add({ targets: this.hint, alpha: 0, duration: 300 });
    }
    queueJump(this.sim);
  }

  /** Salir a mitad de partida cuenta como fin de partida (cobra lo conseguido). */
  private quit() {
    if (this.phase === 'running') this.finish();
  }

  private finish() {
    this.phase = 'over';
    this.mimi.setMood('sad');
    this.mimi.sad();
    this.cameras.main.shake(180, 0.006);
    const r = store.finishRun(this.runId, this.sim.score);
    bus.emit('hop-over', { score: this.sim.score, coins: r.coins, best: r.save.hop.best, newBest: r.newBest });
  }

  update(_t: number, deltaMs: number) {
    const W = this.scale.width;
    const dt = deltaMs / 1000;
    const scroll = this.phase === 'running' ? this.sim.speed * dt * this.world : this.phase === 'ready' ? 30 * dt : 0;
    // Parallax.
    for (const h of this.hills) {
      h.x -= scroll * 0.35;
      if (h.x < -400 * this.world) h.x += 4 * 380 * this.world;
    }
    for (const c of this.clouds) {
      c.x -= scroll * 0.12 + 6 * dt;
      if (c.x < -100) c.x = W + 100;
    }
    if (this.phase !== 'running') return;

    stepHop(this.sim, dt, W / this.world);
    for (const e of this.sim.events) {
      if (e === 'jump') this.mimi.stretch('jump');
      if (e === 'land') this.mimi.stretch('land');
    }
    this.mimi.setHop(this.sim.y / MIMI_SCALE);

    // Sincroniza bloques.
    const alive = new Set<number>();
    for (const o of this.sim.obstacles) {
      alive.add(o.id);
      let img = this.blocks.get(o.id);
      if (!img) {
        img = this.add.image(0, 0, 'hop-block').setOrigin(0, 1);
        this.blocks.set(o.id, img);
      }
      img.setPosition(o.x * this.world, this.groundY + 2).setDisplaySize(o.w * this.world, o.h * this.world);
    }
    for (const [id, img] of this.blocks) {
      if (!alive.has(id)) {
        img.destroy();
        this.blocks.delete(id);
      }
    }
    if (this.sim.score !== this.lastScore) {
      this.lastScore = this.sim.score;
      bus.emit('hop-score', this.sim.score);
    }
    if (!this.sim.alive) this.finish();
  }
}
