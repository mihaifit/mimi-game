import Phaser from 'phaser';
import { Store, safeLocalStorage } from './store';

/** Estado compartido entre escenas Phaser y la UI DOM. */
export const store = new Store(safeLocalStorage());

export interface HopOver {
  score: number;
  coins: number;
  best: number;
  newBest: boolean;
}

/** Bus de eventos: 'hop-score' (n), 'hop-over' (HopOver), 'hop-ready', 'scene' ('room'|'hop'). */
export const bus = new Phaser.Events.EventEmitter();

/** Límites de la zona libre (px) que deja la UI DOM; la UI los actualiza. */
export const layout = { top: 120, bottom: 96 };
