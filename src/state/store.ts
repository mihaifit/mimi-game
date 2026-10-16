import { advance, type ActionResult } from './care';
import type { GameState } from './model';
import { loadGame, saveGame, type LoadStatus, type StorageLike } from './storage';

export type StoreEvent =
  | { type: 'state' }
  | { type: 'message'; text: string; ok: boolean }
  | { type: 'care'; kind: 'feed' | 'clean' | 'pet' | 'sleep' | 'wake' };

type Listener = (state: GameState, event: StoreEvent) => void;

export class Store {
  private current: GameState;
  private listeners = new Set<Listener>();
  readonly loadStatus: LoadStatus;
  /** false si el último intento de guardar falló. */
  saveOk: boolean;

  constructor(
    private storage: StorageLike | null,
    private now: () => number = () => Date.now(),
  ) {
    const loaded = loadGame(storage, now());
    this.loadStatus = loaded.status;
    this.saveOk = storage !== null;
    this.current = advance(loaded.state, now());
  }

  get state(): GameState {
    return this.current;
  }

  get canPersist(): boolean {
    return this.storage !== null && this.loadStatus !== 'unsupported-version';
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(event: StoreEvent): void {
    for (const fn of this.listeners) fn(this.current, event);
  }

  /** Aplica el paso del tiempo y luego la acción. */
  run(action: (s: GameState) => ActionResult, care?: StoreEvent & { type: 'care' }): ActionResult {
    const result = action(advance(this.current, this.now()));
    this.current = result.state;
    this.persist();
    this.emit({ type: 'state' });
    if (result.ok && care) this.emit(care);
    if (result.message) this.emit({ type: 'message', text: result.message, ok: result.ok });
    return result;
  }

  /** Sustituye el estado (p. ej. tras cobrar una recompensa calculada fuera). */
  set(next: GameState): void {
    this.current = next;
    this.persist();
    this.emit({ type: 'state' });
  }

  tick(): void {
    const wasSleeping = this.current.sleeping;
    this.current = advance(this.current, this.now());
    this.emit({ type: 'state' });
    if (wasSleeping && !this.current.sleeping) {
      this.persist();
      this.emit({ type: 'care', kind: 'wake' });
      this.emit({ type: 'message', text: `${this.current.name} se ha despertado con la energía al máximo.`, ok: true });
    }
  }

  persist(): void {
    if (!this.canPersist) return;
    this.saveOk = saveGame(this.storage, this.current);
  }

  message(text: string, ok = true): void {
    this.emit({ type: 'message', text, ok });
  }
}
