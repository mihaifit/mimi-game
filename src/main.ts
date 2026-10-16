import Phaser from 'phaser';
import './style.css';
import { store } from './game/context';
import { HopScene } from './game/HopScene';
import { RoomScene } from './game/RoomScene';
import { setupUI } from './ui/ui';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#f1dcff',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  render: { antialias: true },
  scene: [RoomScene, HopScene],
  banner: false,
});

setupUI(game);

// El tiempo avanza cada segundo; se guarda cada 10 s y al ocultar la pestaña.
window.setInterval(() => store.tick(), 1000);
window.setInterval(() => store.flushIfDirty(), 10_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.persist();
  else store.tick();
});
window.addEventListener('pagehide', () => store.persist());

// Acceso de depuración para pruebas automáticas (smoke test).
(window as unknown as { __mimi: unknown }).__mimi = { game, store };
