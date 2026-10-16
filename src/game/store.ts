import * as Actions from '../core/actions';
import { buyItem, claimRunReward, startRun, toggleEquip, type RewardResult } from '../core/economy';
import { applyElapsed } from '../core/needs';
import { loadSave, writeSave, type LoadSource, type StorageLike } from '../core/save';
import type { PersonalityId, SaveData } from '../core/types';

type Listener = (save: SaveData) => void;
export type FxKind = 'feed' | 'wash' | 'sleep' | 'wake' | 'pet' | 'buy' | 'equip';

/** Estado del juego con persistencia local. Toda la lógica vive en src/core. */
export class Store {
  save: SaveData;
  readonly loadSource: LoadSource;
  private listeners = new Set<Listener>();
  private fxListeners = new Set<(fx: FxKind) => void>();
  private dirty = false;

  constructor(
    private storage: StorageLike | null,
    private now: () => number = Date.now,
  ) {
    const { save, source } = loadSave(storage, now());
    this.loadSource = source;
    this.save = applyElapsed(save, now());
    this.persist();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.save);
    return () => this.listeners.delete(fn);
  }

  onFx(fn: (fx: FxKind) => void): () => void {
    this.fxListeners.add(fn);
    return () => this.fxListeners.delete(fn);
  }

  private set(save: SaveData, fx?: FxKind) {
    this.save = save;
    this.dirty = true;
    this.listeners.forEach((l) => l(save));
    if (fx) this.fxListeners.forEach((l) => l(fx));
  }

  /** Aplica el paso del tiempo (se llama cada segundo). */
  tick() {
    this.set(applyElapsed(this.save, this.now()));
  }

  persist(): boolean {
    this.dirty = false;
    return writeSave(this.storage, this.save);
  }

  flushIfDirty() {
    if (this.dirty) this.persist();
  }

  private act(r: Actions.ActionResult, fx: FxKind): Actions.ActionResult {
    if (r.ok) {
      this.set(r.save, fx);
      this.persist();
    }
    return r;
  }

  feed() {
    return this.act(Actions.feed(applyElapsed(this.save, this.now())), 'feed');
  }
  wash() {
    return this.act(Actions.wash(applyElapsed(this.save, this.now())), 'wash');
  }
  pet() {
    return this.act(Actions.pet(applyElapsed(this.save, this.now())), 'pet');
  }
  toggleSleep() {
    const wasSleeping = this.save.sleeping;
    return this.act(Actions.toggleSleep(applyElapsed(this.save, this.now())), wasSleeping ? 'wake' : 'sleep');
  }

  buy(id: string) {
    const r = buyItem(this.save, id);
    if (r.ok) {
      // Al comprar, se equipa directamente.
      const eq = toggleEquip(r.save, id);
      this.set(eq.save, 'buy');
      this.persist();
    }
    return r;
  }

  equip(id: string) {
    const r = toggleEquip(this.save, id);
    if (r.ok) {
      this.set(r.save, 'equip');
      this.persist();
    }
    return r;
  }

  choosePersonality(p: PersonalityId) {
    this.set({ ...this.save, personality: p, onboarded: true });
    this.persist();
  }

  startRun(): number {
    const { save, runId } = startRun(applyElapsed(this.save, this.now()));
    this.set(save);
    this.persist();
    return runId;
  }

  finishRun(runId: number, score: number): RewardResult {
    const r = claimRunReward(this.save, runId, score);
    if (!r.duplicate) {
      this.set(r.save);
      this.persist();
    }
    return r;
  }

  reset() {
    try {
      this.storage?.removeItem('mimi.save');
      this.storage?.removeItem('mimi.save.backup');
    } catch {
      /* almacenamiento no disponible */
    }
  }
}

export function safeLocalStorage(): StorageLike | null {
  try {
    const k = '__mimi_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return null;
  }
}
