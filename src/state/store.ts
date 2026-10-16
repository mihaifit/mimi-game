import { advance, type ActionResult } from './care';
import type { GameState } from './model';
import { ensureDay, settle, type ProgressEvent } from './progress';
import { loadGame, saveGame, type LoadStatus, type StorageLike } from './storage';

export type CareEventKind = 'feed' | 'clean' | 'pet' | 'sleep' | 'wake';

export type StoreEvent =
  | { type: 'state' }
  | { type: 'message'; text: string; ok: boolean }
  | { type: 'care'; kind: CareEventKind; xp: number }
  | ProgressEvent;

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
    // Al cargar se entregan premios pendientes (p. ej. logros que una partida v1 ya cumplía).
    const settled = settle(ensureDay(advance(loaded.state, now()), now()));
    this.current = settled.state;
    this.pending = settled.events;
    // Se fija ya la migración (con copia v1 hecha) y los premios entregados al cargar.
    if (loaded.status === 'migrated' || settled.events.length > 0) this.persist();
  }

  /** Eventos de progreso surgidos al cargar; la interfaz los muestra al arrancar. */
  private pending: ProgressEvent[] = [];

  takePendingEvents(): ProgressEvent[] {
    const e = this.pending;
    this.pending = [];
    return e;
  }

  /** Estado al día: tiempo aplicado y misiones renovadas si cambió la fecha. */
  private fresh(): GameState {
    const t = this.now();
    return ensureDay(advance(this.current, t), t);
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
  run(action: (s: GameState) => ActionResult, care?: CareEventKind): ActionResult {
    const before = this.fresh();
    const result = action(before);
    const settled = settle(result.state);
    this.current = settled.state;
    this.persist();
    this.emit({ type: 'state' });
    if (result.ok && care) this.emit({ type: 'care', kind: care, xp: Math.max(0, result.state.xp - before.xp) });
    if (result.message) this.emit({ type: 'message', text: result.message, ok: result.ok });
    for (const e of settled.events) this.emit(e);
    return { ...result, state: this.current };
  }

  /**
   * Aplica una transformación calculada fuera (p. ej. cobrar MIMI HOP) sobre el estado
   * al día y entrega niveles/logros resultantes.
   */
  update(fn: (s: GameState) => GameState): GameState {
    const settled = settle(fn(this.fresh()));
    this.current = settled.state;
    this.persist();
    this.emit({ type: 'state' });
    for (const e of settled.events) this.emit(e);
    return this.current;
  }

  /** Sustituye el estado por completo (empezar de cero). */
  set(next: GameState): void {
    this.current = next;
    this.persist();
    this.emit({ type: 'state' });
  }

  tick(): void {
    const wasSleeping = this.current.sleeping;
    const dayBefore = this.current.daily.day;
    this.current = this.fresh();
    if (this.current.daily.day !== dayBefore) this.persist();
    this.emit({ type: 'state' });
    if (wasSleeping && !this.current.sleeping) {
      this.persist();
      this.emit({ type: 'care', kind: 'wake', xp: 0 });
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
