import * as Phaser from 'phaser';
import './styles.css';
import { HopScene } from './scenes/HopScene';
import { RoomScene, VIEW_H, VIEW_W } from './scenes/RoomScene';
import { detectStorage } from './state/storage';
import { Store } from './state/store';
import { UI } from './ui/ui';

const storage = detectStorage();
const store = new Store(storage);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'stage',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#efe2ff',
  banner: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  audio: { noAudio: true },
  callbacks: {
    preBoot: (g) => g.registry.set('store', store),
  },
  scene: [RoomScene, HopScene],
});

game.events.once(Phaser.Core.Events.READY, () => {
  const ui = new UI(store, game, storage);
  // Exposición mínima para pruebas manuales/automatizadas.
  (window as unknown as { __mimi?: unknown }).__mimi = { store, game, ui };
});

// Evolución de necesidades en tiempo real.
window.setInterval(() => store.tick(), 1000);
const flush = () => store.persist();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
  else store.tick();
});
window.addEventListener('pagehide', flush);
