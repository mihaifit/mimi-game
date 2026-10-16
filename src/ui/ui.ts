import type * as Phaser from 'phaser';
import { drawAccessory } from '../art/art';
import {
  canPlayHop,
  choosePersonality,
  claimHopReward,
  clean,
  feed,
  pet,
  startHopRun,
  toggleSleep,
} from '../state/care';
import {
  MAX_NAME_LENGTH,
  MOOD_LABELS,
  NEED_KEYS,
  NEED_LABELS,
  PERSONALITY_IDS,
  cloneState,
  createInitialState,
  lowestNeed,
  moodOf,
  type GameState,
  type NeedKey,
  type PersonalityId,
} from '../state/model';
import { PERSONALITIES } from '../state/personality';
import { SHOP_ITEMS, SLOT_LABELS, buyItem, toggleEquip } from '../state/shop';
import { clearSave, type StorageLike } from '../state/storage';
import type { Store } from '../state/store';
import { HOP_EVENTS } from '../scenes/HopScene';

type Tab = 'room' | 'shop' | 'hop' | 'settings';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta #${id}`);
  return el;
}

const NEED_HINTS: Record<NeedKey, string> = {
  hunger: 'tiene hambre. ¡Dale de comer!',
  hygiene: 'necesita un baño de burbujas.',
  energy: 'tiene sueño. Llévala a dormir.',
  affection: 'quiere caricias.',
};

export class UI {
  private tab: Tab = 'room';
  private toastTimer = 0;
  private hopRunId = 0;
  private hopActive = false;
  private needEls = new Map<NeedKey, { li: HTMLElement; bar: HTMLElement; fill: HTMLElement; val: HTMLElement }>();
  private shopRendered = '';

  constructor(
    private store: Store,
    private game: Phaser.Game,
    private storage: StorageLike | null,
  ) {
    this.buildNeeds();
    this.bindTabs();
    this.bindActions();
    this.bindHop();
    this.bindSettings();
    this.renderPersonalities($('personality-list'), false);

    store.subscribe((s, e) => {
      if (e.type === 'state') this.render(s);
      else if (e.type === 'message') this.toast(e.text, e.ok);
    });
    this.render(store.state);
    this.renderStorageStatus();
    this.maybeOnboard();
  }

  /* ---------------- Render ---------------- */

  private buildNeeds(): void {
    const ul = $('needs');
    for (const k of NEED_KEYS) {
      const li = document.createElement('li');
      li.className = 'need';
      const label = document.createElement('span');
      label.id = `need-${k}`;
      label.textContent = NEED_LABELS[k];
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-labelledby', label.id);
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      const fill = document.createElement('span');
      bar.append(fill);
      const val = document.createElement('span');
      val.className = 'need-val';
      val.setAttribute('aria-hidden', 'true');
      li.append(label, bar, val);
      ul.append(li);
      this.needEls.set(k, { li, bar, fill, val });
    }
  }

  private render(s: GameState): void {
    for (const k of NEED_KEYS) {
      const el = this.needEls.get(k);
      if (!el) continue;
      const v = Math.round(s.needs[k]);
      el.fill.style.width = `${v}%`;
      el.val.textContent = String(v);
      el.bar.setAttribute('aria-valuenow', String(v));
      el.bar.setAttribute('aria-valuetext', `${v} de 100`);
      el.li.classList.toggle('low', v < 30);
    }
    const mood = moodOf(s.needs);
    const chip = $('mood-chip');
    chip.textContent = s.sleeping ? 'Durmiendo' : MOOD_LABELS[mood];
    chip.dataset.mood = s.sleeping ? 'tranquila' : mood;
    $('coins').textContent = String(s.coins);

    const low = lowestNeed(s.needs);
    let hint: string;
    if (s.sleeping) hint = `${s.name} duerme y recupera energía. Se despertará sola al llenarla.`;
    else if (s.needs[low] < 45) hint = `${s.name} ${NEED_HINTS[low]}`;
    else hint = `${s.name} está ${MOOD_LABELS[mood].toLowerCase()}. ¡Buen trabajo!`;
    $('hint').textContent = hint;

    const sleepBtn = document.querySelector<HTMLButtonElement>('[data-action="sleep"] .label');
    if (sleepBtn) sleepBtn.textContent = s.sleeping ? 'Despertar' : 'Dormir';

    $('stage').setAttribute(
      'aria-label',
      this.hopActive
        ? `Minijuego MIMI HOP con ${s.name}`
        : `${s.name} en su habitación. Estado: ${s.sleeping ? 'durmiendo' : MOOD_LABELS[mood].toLowerCase()}.`,
    );
    $('hop-best').textContent = String(s.hopBest);
    this.renderShop(s);
    this.renderPersonalities($('personality-list'), false);
    const nameInput = $('name-input') as HTMLInputElement;
    if (document.activeElement !== nameInput) nameInput.value = s.name;
  }

  private renderShop(s: GameState): void {
    const key = `${s.coins}|${s.owned.join(',')}|${Object.values(s.equipped).join(',')}`;
    if (key === this.shopRendered) return;
    this.shopRendered = key;
    const ul = $('shop');
    const focusedId = (document.activeElement as HTMLElement | null)?.dataset?.item;
    ul.replaceChildren();
    for (const item of SHOP_ITEMS) {
      const owned = s.owned.includes(item.id);
      const equipped = s.equipped[item.slot] === item.id;
      const li = document.createElement('li');
      li.className = `shop-item${equipped ? ' equipped' : ''}`;
      const thumb = document.createElement('div');
      thumb.className = 'shop-thumb';
      const art = drawAccessory(item.id);
      if (art) {
        art.canvas.setAttribute('aria-hidden', 'true');
        thumb.append(art.canvas);
      }
      const info = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'shop-name';
      name.textContent = item.name;
      const meta = document.createElement('div');
      meta.className = 'shop-meta';
      meta.textContent = `${SLOT_LABELS[item.slot]} · ${owned ? (equipped ? 'Puesto' : 'Tuyo') : `${item.price} monedas`}`;
      info.append(name, meta);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = owned ? 'btn' : 'btn primary';
      btn.dataset.item = item.id;
      if (owned) {
        btn.textContent = equipped ? 'Quitar' : 'Poner';
        btn.setAttribute('aria-label', `${equipped ? 'Quitar' : 'Poner'} ${item.name}`);
        btn.addEventListener('click', () => this.store.run((st) => toggleEquip(st, item.id)));
      } else {
        const affordable = s.coins >= item.price;
        btn.textContent = `Comprar · ${item.price}`;
        btn.setAttribute('aria-label', `Comprar ${item.name} por ${item.price} monedas`);
        // No se deshabilita: al pulsar explica cuántas monedas faltan.
        if (!affordable) btn.classList.remove('primary');
        btn.addEventListener('click', () => this.store.run((st) => buyItem(st, item.id)));
      }
      li.append(thumb, info, btn);
      ul.append(li);
    }
    if (focusedId) ul.querySelector<HTMLButtonElement>(`[data-item="${focusedId}"]`)?.focus();
  }

  private renderPersonalities(container: HTMLElement, onboarding: boolean): void {
    const current = this.store.state.personality;
    const key = `${current}`;
    if (!onboarding && container.dataset.rendered === key) return;
    container.dataset.rendered = key;
    container.replaceChildren();
    for (const id of PERSONALITY_IDS) {
      const p = PERSONALITIES[id];
      const btn = document.createElement('button');
      btn.type = onboarding ? 'submit' : 'button';
      btn.className = 'btn personality';
      if (!onboarding) btn.setAttribute('aria-pressed', String(current === id));
      const emoji = document.createElement('span');
      emoji.className = 'p-emoji';
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = p.emoji;
      const name = document.createElement('span');
      name.className = 'p-name';
      name.textContent = p.name;
      const desc = document.createElement('span');
      desc.className = 'p-desc';
      desc.textContent = p.description;
      const list = document.createElement('ul');
      for (const effect of p.effects) {
        const li = document.createElement('li');
        li.textContent = effect;
        list.append(li);
      }
      btn.append(emoji, name, desc, list);
      btn.addEventListener('click', () => this.pickPersonality(id));
      container.append(btn);
    }
  }

  private pickPersonality(id: PersonalityId): void {
    if (this.store.state.personality === id) return;
    this.store.run((s) => choosePersonality(s, id));
  }

  private maybeOnboard(): void {
    if (this.store.state.personality) return;
    const dialog = $('onboarding') as HTMLDialogElement;
    this.renderPersonalities($('onboarding-list'), true);
    if (typeof dialog.showModal === 'function') {
      dialog.addEventListener('cancel', (e) => {
        // Si se cierra sin elegir, se asigna "juguetona" para no bloquear el juego.
        e.preventDefault();
        this.pickPersonality('juguetona');
        dialog.close();
      });
      dialog.showModal();
    } else {
      this.pickPersonality('juguetona');
    }
  }

  private renderStorageStatus(): void {
    const el = $('storage-status');
    const status = this.store.loadStatus;
    let text = 'Tu progreso se guarda automáticamente en este navegador.';
    let ok = true;
    if (status === 'unavailable') {
      text = 'El almacenamiento del navegador no está disponible (modo privado o bloqueado). Puedes jugar, pero el progreso se perderá al cerrar.';
      ok = false;
    } else if (status === 'corrupt') {
      text = 'El guardado anterior estaba dañado. Se ha empezado una partida nueva y se ha conservado una copia del archivo dañado.';
      ok = false;
    } else if (status === 'unsupported-version') {
      text = 'Hay un guardado de una versión más nueva de MIMI. No se sobrescribirá; esta sesión no se guardará.';
      ok = false;
    }
    el.textContent = text;
    el.classList.toggle('ok', ok);
    if (!ok) window.setTimeout(() => this.toast(text, false), 600);
  }

  toast(text: string, ok = true): void {
    const el = $('toast');
    el.textContent = text;
    el.classList.toggle('bad', !ok);
    el.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 2800);
  }

  /* ---------------- Tabs ---------------- */

  private bindTabs(): void {
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => this.selectTab(t.id.replace('tab-', '') as Tab));
      t.addEventListener('keydown', (e) => {
        let next = -1;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next >= 0) {
          e.preventDefault();
          tabs[next].focus();
          this.selectTab(tabs[next].id.replace('tab-', '') as Tab);
        }
      });
    });
  }

  selectTab(tab: Tab): void {
    if (tab === this.tab) return;
    this.tab = tab;
    for (const t of ['room', 'shop', 'hop', 'settings'] as Tab[]) {
      const btn = $(`tab-${t}`);
      const selected = t === tab;
      btn.setAttribute('aria-selected', String(selected));
      btn.tabIndex = selected ? 0 : -1;
      $(`panel-${t}`).hidden = !selected;
    }
    if (tab === 'hop') this.enterHop();
    else this.showRoom();
  }

  /* ---------------- Escenas ---------------- */

  private showRoom(): void {
    $('hop-over').hidden = true;
    if (this.hopActive) {
      this.hopActive = false;
      this.game.scene.stop('hop');
    }
    if (!this.game.scene.isActive('room')) this.game.scene.start('room');
    this.render(this.store.state);
  }

  private enterHop(): void {
    const check = canPlayHop(this.store.state);
    const blocked = $('hop-blocked');
    const jumpBtn = $('hop-jump') as HTMLButtonElement;
    blocked.hidden = check.ok;
    blocked.textContent = check.message;
    jumpBtn.disabled = !check.ok;
    $('hop-over').hidden = true;
    $('hop-live').textContent = '0';
    if (!check.ok) {
      this.showRoomSceneOnly();
      return;
    }
    if (this.game.scene.isActive('room')) this.game.scene.stop('room');
    this.hopActive = true;
    this.hopRunId = 0;
    this.game.scene.start('hop');
    this.render(this.store.state);
  }

  private showRoomSceneOnly(): void {
    if (this.hopActive) {
      this.hopActive = false;
      this.game.scene.stop('hop');
    }
    if (!this.game.scene.isActive('room')) this.game.scene.start('room');
  }

  private bindHop(): void {
    const events = this.game.events;
    events.on(HOP_EVENTS.begin, () => {
      const { state, runId } = startHopRun(this.store.state);
      this.hopRunId = runId;
      this.store.set(state);
    });
    events.on(HOP_EVENTS.score, (score: number) => {
      $('hop-live').textContent = String(score);
    });
    events.on(HOP_EVENTS.over, (score: number) => this.finishHop(score));

    $('hop-jump').addEventListener('click', () => this.game.events.emit('hop:jump'));
    $('hop-retry').addEventListener('click', () => this.enterHop());
    $('hop-exit').addEventListener('click', () => {
      this.selectTab('room');
      $('tab-room').focus();
    });

    // Evita que Espacio desplace la página mientras se juega.
    window.addEventListener('keydown', (e) => {
      if (!this.hopActive || (e.key !== ' ' && e.key !== 'ArrowUp')) return;
      const t = e.target as HTMLElement | null;
      const interactive = t && t.closest('button, input, textarea, select, a, [role="tab"]');
      if (!interactive) e.preventDefault();
    });
  }

  private finishHop(score: number): void {
    const before = this.store.state.hopBest;
    const reward = claimHopReward(this.store.state, this.hopRunId, score);
    if (!reward.alreadyClaimed) this.store.set(reward.state);
    $('hop-final').textContent = String(score);
    const parts: string[] = [];
    parts.push(reward.alreadyClaimed ? 'Recompensa ya cobrada.' : `+${reward.coins} ${reward.coins === 1 ? 'moneda' : 'monedas'}.`);
    parts.push(reward.newRecord ? `¡Nuevo récord! (antes ${before})` : `Récord: ${this.store.state.hopBest}`);
    $('hop-summary').textContent = parts.join(' ');
    $('hop-over').hidden = false;
    ($('hop-jump') as HTMLButtonElement).disabled = true;
    window.setTimeout(() => ($('hop-retry') as HTMLButtonElement).focus(), 50);
    this.toast(`Fin de la partida: ${score} puntos. ${parts[0]}`);
  }

  /* ---------------- Acciones y ajustes ---------------- */

  private bindActions(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'feed') this.store.run(feed, { type: 'care', kind: 'feed' });
        else if (action === 'clean') this.store.run(clean, { type: 'care', kind: 'clean' });
        else if (action === 'pet') this.store.run(pet, { type: 'care', kind: 'pet' });
        else if (action === 'sleep') {
          const wasSleeping = this.store.state.sleeping;
          this.store.run(toggleSleep, { type: 'care', kind: wasSleeping ? 'wake' : 'sleep' });
        }
      });
    });
  }

  private bindSettings(): void {
    $('name-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('name-input') as HTMLInputElement;
      const name = input.value.trim().slice(0, MAX_NAME_LENGTH);
      if (!name) {
        this.toast('Escribe un nombre.', false);
        return;
      }
      this.store.run((s) => {
        const next = cloneState(s);
        next.name = name;
        return { state: next, ok: true, message: `Ahora se llama ${name}.` };
      });
    });
    $('reset').addEventListener('click', () => {
      if (!window.confirm('¿Seguro que quieres empezar de cero? Se borrarán monedas, accesorios y récord.')) return;
      clearSave(this.storage);
      this.store.set(createInitialState(Date.now()));
      this.toast('Partida nueva creada.');
      this.maybeOnboard();
    });
  }
}
