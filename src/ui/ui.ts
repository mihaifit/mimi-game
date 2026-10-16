import type * as Phaser from 'phaser';
import { drawAccessory } from '../art/art';
import type { SoundName, Sfx } from '../audio/sfx';
import {
  canPlayHop,
  choosePersonality,
  claimHopReward,
  clean,
  feed,
  pet,
  startHopRun,
  toggleSleep,
  type HopReward,
} from '../state/care';
import {
  MAX_NAME_LENGTH,
  MISSION_IDS,
  MOOD_LABELS,
  NEED_KEYS,
  NEED_LABELS,
  PERSONALITY_IDS,
  cloneState,
  createInitialState,
  lowestNeed,
  moodOf,
  type GameState,
  type MissionId,
  type NeedKey,
  type PersonalityId,
} from '../state/model';
import {
  MOVE_CHALLENGES,
  MOVE_COINS,
  MOVE_DAILY_LIMIT,
  MOVE_XP,
  cancelMove,
  confirmMove,
  dismissMove,
  formatClock,
  idleTimer,
  pauseMove,
  resumeMove,
  startMove,
  tickMove,
  type MoveTimer,
} from '../state/movement';
import { PERSONALITIES } from '../state/personality';
import { savePrefs } from '../state/prefs';
import {
  ACHIEVEMENTS,
  MISSIONS,
  SCARF_PAUSES,
  SPORT_ITEM_LEVEL,
  claimMission,
  levelProgress,
  missionProgress,
  missionStatus,
  type ProgressEvent,
} from '../state/progress';
import { SHOP_ITEMS, SLOT_LABELS, buyItem, findItem, toggleEquip } from '../state/shop';
import { clearSave, type StorageLike } from '../state/storage';
import type { Store, StoreEvent } from '../state/store';
import { mimiLine, type VoiceEvent } from '../state/voice';
import { HOP_EVENTS } from '../scenes/HopScene';

type Tab = 'room' | 'missions' | 'shop' | 'hop' | 'move' | 'settings';
const TABS: Tab[] = ['room', 'missions', 'shop', 'hop', 'move', 'settings'];

/** Eventos de la pausa activa hacia la escena (Mimi se mueve contigo). */
export const MOVE_EVENTS = { state: 'move:state', celebrate: 'move:celebrate' } as const;

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

const MOVE_TIPS = [
  'Estírate hacia arriba, como una gelatina alta.',
  'Camina un poco por donde estés.',
  'Mueve los hombros en círculos, con suavidad.',
  'Respira tranquila y suelta los brazos.',
  'Balancéate de un lado a otro al ritmo que quieras.',
  'Baila un poquito tu canción favorita.',
];

const CARE_SOUND: Record<string, SoundName | undefined> = { feed: 'feed', clean: 'clean', pet: 'pet', sleep: 'sleep' };

export class UI {
  private tab: Tab = 'room';
  private toastTimer = 0;
  private toastQueue: { text: string; ok: boolean; at: number }[] = [];
  private toastBusyUntil = 0;
  private hopRunId = 0;
  private hopActive = false;
  private needEls = new Map<NeedKey, { li: HTMLElement; bar: HTMLElement; fill: HTMLElement; val: HTMLElement }>();
  private shopRendered = '';
  private missionsRendered = '';
  private speechTimer = 0;
  private lastSpeech = 0;
  private celebrateTimer = 0;
  private moveTimer: MoveTimer = idleTimer();
  private moveMinutes = 1;
  private moveInterval = 0;
  private moveTipIndex = 0;

  constructor(
    private store: Store,
    private game: Phaser.Game,
    private storage: StorageLike | null,
    private sfx: Sfx,
  ) {
    this.buildNeeds();
    this.bindTabs();
    this.bindActions();
    this.bindHop();
    this.bindMove();
    this.bindSound();
    this.bindSettings();
    this.renderPersonalities($('personality-list'), false);

    store.subscribe((s, e) => this.onStore(s, e));
    this.render(store.state);
    this.renderMove();
    this.renderStorageStatus();
    this.maybeOnboard();
    // Premios que una partida guardada ya cumplía (p. ej. al migrar desde la 0.1).
    window.setTimeout(() => {
      for (const e of store.takePendingEvents()) this.onProgress(e);
    }, 900);
    // Comentarios espontáneos de Mimi, solo en la habitación y sin agobiar.
    window.setInterval(() => {
      if ((this.tab === 'room' || this.tab === 'missions') && Date.now() - this.lastSpeech > 25_000) this.say('idle');
    }, 6000);
  }

  /* ---------------- Eventos del estado ---------------- */

  private onStore(s: GameState, e: StoreEvent): void {
    switch (e.type) {
      case 'state':
        this.render(s);
        break;
      case 'message':
        this.toast(e.text, e.ok);
        if (!e.ok) this.sfx.play('error');
        break;
      case 'care': {
        const sound = CARE_SOUND[e.kind];
        if (sound) this.sfx.play(sound);
        this.say(e.kind);
        break;
      }
      case 'levelup':
      case 'achievement':
        this.onProgress(e);
        break;
    }
  }

  private onProgress(e: ProgressEvent): void {
    if (e.type === 'levelup') {
      this.sfx.play('levelup');
      const gift = e.gift ? findItem(e.gift) : undefined;
      const text = `+${e.coins} monedas${gift ? ` · ¡${gift.name} desbloqueada!` : ''}`;
      this.celebrate(`¡Nivel ${e.level} de vínculo!`, text);
      this.toast(`¡${this.store.state.name} sube a nivel ${e.level}! ${text}`);
    } else {
      this.sfx.play('claim');
      const gift = e.gift ? findItem(e.gift) : undefined;
      this.toast(`Logro «${e.title}»: +${e.coins} monedas.${gift ? ` ¡${gift.name} desbloqueado!` : ''}`);
      if (gift) this.celebrate('¡Regalo MihaiFIT!', `${gift.name} · +${e.coins} monedas`);
    }
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

    const lp = levelProgress(s.xp);
    $('level').textContent = String(lp.level);
    $('level-top').textContent = String(lp.level);
    $('level-chip').setAttribute('aria-label', `Nivel de vínculo ${lp.level}`);
    const xpBar = $('xp-bar');
    (xpBar.firstElementChild as HTMLElement).style.width = `${Math.round(lp.ratio * 100)}%`;
    xpBar.setAttribute('aria-valuemax', String(lp.needed || 1));
    xpBar.setAttribute('aria-valuenow', String(lp.needed ? lp.into : 1));
    xpBar.setAttribute('aria-valuetext', lp.needed ? `${lp.into} de ${lp.needed} XP` : 'Nivel máximo');
    $('xp-text').textContent = lp.needed ? `${lp.into} / ${lp.needed} XP` : 'Nivel máximo';
    $('bond-next').textContent =
      lp.level < SPORT_ITEM_LEVEL
        ? `Regalo en el nivel ${SPORT_ITEM_LEVEL}: Cinta MihaiFIT. Cada nivel da monedas.`
        : lp.needed
          ? `Faltan ${lp.needed - lp.into} XP para el nivel ${lp.level + 1} (+${10 + (lp.level + 1) * 2} monedas).`
          : '¡Vínculo máximo!';

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
    this.renderMissions(s);
    this.renderMoveStatus(s);
    this.renderPersonalities($('personality-list'), false);
    const nameInput = $('name-input') as HTMLInputElement;
    if (document.activeElement !== nameInput) nameInput.value = s.name;
  }

  private renderShop(s: GameState): void {
    const level = levelProgress(s.xp).level;
    const key = `${s.coins}|${s.owned.join(',')}|${Object.values(s.equipped).join(',')}|${level}`;
    if (key === this.shopRendered) return;
    this.shopRendered = key;
    const ul = $('shop');
    const focusedId = (document.activeElement as HTMLElement | null)?.dataset?.item;
    ul.replaceChildren();
    for (const item of SHOP_ITEMS) {
      const owned = s.owned.includes(item.id);
      const equipped = s.equipped[item.slot] === item.id;
      const giftOnly = !!item.unlockLevel || !!item.unlockAchievement;
      const locked = !owned && giftOnly;
      const li = document.createElement('li');
      li.className = `shop-item${equipped ? ' equipped' : ''}${locked ? ' locked' : ''}${giftOnly ? ' gift' : ''}`;
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
      const price = item.unlockLevel
        ? `Regalo del nivel ${item.unlockLevel}`
        : item.unlockAchievement
          ? `Regalo: ${SCARF_PAUSES} retos MihaiFIT (${Math.min(s.stats.movePauses, SCARF_PAUSES)}/${SCARF_PAUSES})`
          : `${item.price} monedas`;
      meta.textContent = `${SLOT_LABELS[item.slot]} · ${owned ? (equipped ? 'Puesto' : 'Tuyo') : price}`;
      info.append(name, meta);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = owned ? 'btn' : 'btn primary';
      btn.dataset.item = item.id;
      if (owned) {
        btn.textContent = equipped ? 'Quitar' : 'Poner';
        btn.setAttribute('aria-label', `${equipped ? 'Quitar' : 'Poner'} ${item.name}`);
        btn.addEventListener('click', () => {
          const r = this.store.run((st) => toggleEquip(st, item.id));
          if (r.ok) this.sfx.play('tap');
        });
      } else if (locked) {
        btn.className = 'btn';
        btn.textContent = item.unlockLevel ? `🔒 Nivel ${item.unlockLevel}` : `🔒 ${SCARF_PAUSES} retos`;
        btn.setAttribute(
          'aria-label',
          item.unlockLevel
            ? `${item.name}: se desbloquea en el nivel ${item.unlockLevel} (tu nivel: ${level})`
            : `${item.name}: se desbloquea al confirmar ${SCARF_PAUSES} retos MihaiFIT (llevas ${s.stats.movePauses})`,
        );
        btn.addEventListener('click', () => this.store.run((st) => buyItem(st, item.id)));
      } else {
        const affordable = s.coins >= item.price;
        btn.textContent = `Comprar · ${item.price}`;
        btn.setAttribute('aria-label', `Comprar ${item.name} por ${item.price} monedas`);
        // No se deshabilita: al pulsar explica cuántas monedas faltan.
        if (!affordable) btn.classList.remove('primary');
        btn.addEventListener('click', () => {
          const r = this.store.run((st) => buyItem(st, item.id));
          if (r.ok) {
            this.sfx.play('buy');
            this.say('buy');
          }
        });
      }
      li.append(thumb, info, btn);
      ul.append(li);
    }
    if (focusedId) ul.querySelector<HTMLButtonElement>(`[data-item="${focusedId}"]`)?.focus();
  }

  private renderMissions(s: GameState): void {
    const ready = MISSION_IDS.filter((id) => missionStatus(s, id) === 'ready').length;
    const badge = $('missions-badge');
    badge.hidden = ready === 0;
    badge.textContent = String(ready);
    badge.setAttribute('aria-label', `${ready} por reclamar`);

    const key = JSON.stringify([s.daily, s.achievements, s.stats, s.hopBest, s.owned.length, levelProgress(s.xp).level]);
    if (key === this.missionsRendered) return;
    this.missionsRendered = key;
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.mission;

    const ul = $('missions');
    ul.replaceChildren();
    for (const id of MISSION_IDS) {
      const def = MISSIONS[id];
      const status = missionStatus(s, id);
      const have = missionProgress(s, id);
      const li = document.createElement('li');
      li.className = `mission ${status}`;
      const head = document.createElement('div');
      head.className = 'mission-head';
      const title = document.createElement('strong');
      title.textContent = def.title;
      const count = document.createElement('span');
      count.className = 'mission-count';
      count.textContent = `${have}/${def.goal}`;
      head.append(title, count);
      const desc = document.createElement('p');
      desc.className = 'mission-desc';
      desc.textContent = def.description;
      const bar = document.createElement('div');
      bar.className = 'bar mini';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', `Progreso de ${def.title}`);
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(def.goal));
      bar.setAttribute('aria-valuenow', String(have));
      const fill = document.createElement('span');
      fill.style.width = `${(have / def.goal) * 100}%`;
      bar.append(fill);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.mission = id;
      btn.className = status === 'ready' ? 'btn primary' : 'btn';
      btn.disabled = status !== 'ready';
      btn.textContent =
        status === 'claimed' ? '✓ Reclamada' : `${status === 'ready' ? 'Reclamar' : 'Premio'}: +${def.coins} monedas · +${def.xp} XP`;
      btn.addEventListener('click', () => this.claim(id));
      li.append(head, desc, bar, btn);
      ul.append(li);
    }
    if (focused) ul.querySelector<HTMLButtonElement>(`[data-mission="${focused}"]`)?.focus();

    const al = $('achievements');
    al.replaceChildren();
    for (const a of ACHIEVEMENTS) {
      const done = s.achievements.includes(a.id);
      const [have, goal] = a.progress(s);
      const li = document.createElement('li');
      li.className = `achievement${done ? ' done' : ''}`;
      const icon = document.createElement('span');
      icon.className = 'ach-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = done ? '🏅' : '○';
      const body = document.createElement('div');
      const t = document.createElement('strong');
      t.textContent = a.title;
      const d = document.createElement('span');
      d.className = 'ach-desc';
      d.textContent = done ? `${a.description} Conseguido (+${a.coins} monedas).` : `${a.description} ${Math.min(have, goal)}/${goal} · +${a.coins} monedas`;
      body.append(t, d);
      li.append(icon, body);
      al.append(li);
    }
  }

  private claim(id: MissionId): void {
    let result: ReturnType<typeof claimMission> | null = null;
    this.store.update((s) => {
      result = claimMission(s, id, Date.now());
      return result.state;
    });
    const r = result as ReturnType<typeof claimMission> | null;
    if (!r) return;
    this.toast(r.message, r.ok);
    if (r.ok) {
      this.sfx.play('claim');
      this.say('claim');
    } else this.sfx.play('error');
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
    if (status === 'migrated') {
      text = 'Tu partida de MIMI 0.1 se ha actualizado a la 0.2 conservando nombre, personalidad, monedas, accesorios y récord. Se guarda automáticamente en este navegador.';
      window.setTimeout(() => this.toast('¡Partida actualizada a MIMI 0.2! Todo tu progreso sigue aquí.'), 600);
    } else if (status === 'unavailable') {
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

  /** Avisos breves en cola: no se pisan entre sí (nivel + logro + mensaje). */
  toast(text: string, ok = true): void {
    const now = Date.now();
    // Nada de avisos viejos ni repetidos: con toques rápidos solo importa el último.
    this.toastQueue = this.toastQueue.filter((t) => now - t.at < 2500 && t.text !== text).slice(-2);
    this.toastQueue.push({ text, ok, at: now });
    this.pumpToast();
  }

  private pumpToast(): void {
    const now = Date.now();
    if (now < this.toastBusyUntil) {
      window.setTimeout(() => this.pumpToast(), this.toastBusyUntil - now + 10);
      return;
    }
    this.toastQueue = this.toastQueue.filter((t) => now - t.at < 4000);
    const next = this.toastQueue.shift();
    if (!next) return;
    const el = $('toast');
    el.textContent = next.text;
    el.classList.toggle('bad', !next.ok);
    el.classList.add('show');
    // Si hay más en cola, cada aviso dura al menos 1,4 s; el último, 2,8 s.
    this.toastBusyUntil = now + 1400;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 2800);
  }

  /** Bocadillo con una frase de Mimi (decorativo; lo importante va en el aviso accesible). */
  private say(event: VoiceEvent): void {
    if (this.hopActive || !$('celebrate').hidden) return;
    const el = $('speech');
    el.textContent = mimiLine(this.store.state, event);
    el.classList.remove('show');
    void el.offsetWidth; // reinicia la animación
    el.classList.add('show');
    this.lastSpeech = Date.now();
    window.clearTimeout(this.speechTimer);
    this.speechTimer = window.setTimeout(() => el.classList.remove('show'), 3200);
  }

  private celebrate(title: string, text: string): void {
    window.clearTimeout(this.speechTimer);
    $('speech').classList.remove('show');
    this.lastSpeech = Date.now();
    $('celebrate-title').textContent = title;
    $('celebrate-text').textContent = text;
    const el = $('celebrate');
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    window.clearTimeout(this.celebrateTimer);
    this.celebrateTimer = window.setTimeout(() => {
      el.hidden = true;
      this.say('levelup');
    }, 3800);
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
    const prev = this.tab;
    this.tab = tab;
    for (const t of TABS) {
      const btn = $(`tab-${t}`);
      const selected = t === tab;
      btn.setAttribute('aria-selected', String(selected));
      btn.tabIndex = selected ? 0 : -1;
      $(`panel-${t}`).hidden = !selected;
    }
    // Salir de Moverse con la pausa en marcha la detiene (no cuenta sin mirar).
    if (prev === 'move' && this.moveTimer.status === 'running') this.setMoveTimer(pauseMove(this.moveTimer, Date.now(), true));
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
    this.emitMoveState();
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
    $('speech').classList.remove('show');
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
      this.store.update((s) => {
        const r = startHopRun(s);
        this.hopRunId = r.runId;
        return r.state;
      });
    });
    events.on(HOP_EVENTS.jump, () => this.sfx.play('jump'));
    events.on(HOP_EVENTS.score, (score: number) => {
      $('hop-live').textContent = String(score);
      this.sfx.play('point');
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
    this.sfx.play('hit');
    const before = this.store.state.hopBest;
    let reward: HopReward | null = null;
    this.store.update((s) => {
      reward = claimHopReward(s, this.hopRunId, score);
      return reward.state;
    });
    const r = reward as HopReward | null;
    if (!r) return;
    $('hop-final').textContent = String(score);
    const parts: string[] = [];
    parts.push(
      r.alreadyClaimed ? 'Recompensa ya cobrada.' : `+${r.coins} ${r.coins === 1 ? 'moneda' : 'monedas'} y +${r.xp} XP.`,
    );
    parts.push(r.newRecord ? `¡Nuevo récord! (antes ${before})` : `Récord: ${this.store.state.hopBest}`);
    if (!r.alreadyClaimed) {
      const left = MISSIONS.hop.goal - missionProgress(this.store.state, 'hop');
      if (missionStatus(this.store.state, 'hop') === 'ready') parts.push('Misión de saltos lista para reclamar.');
      else if (left > 0 && missionStatus(this.store.state, 'hop') === 'pending') parts.push(`Misión: faltan ${left} obstáculos.`);
    }
    $('hop-summary').textContent = parts.join(' ');
    $('hop-over').hidden = false;
    ($('hop-jump') as HTMLButtonElement).disabled = true;
    window.setTimeout(() => ($('hop-retry') as HTMLButtonElement).focus(), 50);
    this.toast(`Fin de la partida: ${score} puntos. ${parts[0]}`);
  }

  /* ---------------- Movimiento ---------------- */

  private bindMove(): void {
    document.querySelectorAll<HTMLButtonElement>('.duration').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.moveTimer.status !== 'idle') return;
        this.moveMinutes = Number(btn.dataset.minutes) === 2 ? 2 : 1;
        this.sfx.play('tap');
        this.renderMove();
      });
    });
    $('move-start').addEventListener('click', () => {
      if (this.moveTimer.status !== 'idle') return;
      let timer: MoveTimer | null = null;
      this.store.update((s) => {
        const r = startMove(s, this.moveMinutes, Date.now());
        timer = r.timer;
        return r.state;
      });
      if (!timer) return;
      this.moveTipIndex = Math.floor(Math.random() * MOVE_TIPS.length);
      this.setMoveTimer(timer);
      this.sfx.play('move');
      this.say('move');
    });
    $('move-pause').addEventListener('click', () => {
      const now = Date.now();
      if (this.moveTimer.status === 'running') this.setMoveTimer(pauseMove(this.moveTimer, now));
      else if (this.moveTimer.status === 'paused') this.setMoveTimer(resumeMove(this.moveTimer, now));
      this.sfx.play('tap');
    });
    $('move-cancel').addEventListener('click', () => {
      this.store.update((s) => dismissMove(s, this.moveTimer));
      this.setMoveTimer(cancelMove());
      this.toast('Reto cancelado. Puedes empezar otro cuando quieras.');
    });
    $('move-yes').addEventListener('click', () => {
      let claim: ReturnType<typeof confirmMove> | null = null;
      this.store.update((s) => {
        claim = confirmMove(s, this.moveTimer, Date.now());
        return claim.state;
      });
      const c = claim as ReturnType<typeof confirmMove> | null;
      if (!c) return;
      this.toast(c.message, c.ok);
      if (c.ok) {
        this.sfx.play(c.rewarded ? 'claim' : 'move');
        this.say('moveDone');
        this.game.events.emit(MOVE_EVENTS.celebrate);
      }
      this.setMoveTimer(cancelMove());
    });
    $('move-no').addEventListener('click', () => {
      this.store.update((s) => dismissMove(s, this.moveTimer));
      this.setMoveTimer(cancelMove());
      this.toast('Vale, sin registrar. ¡Otra vez será!');
    });
  }

  private setMoveTimer(t: MoveTimer): void {
    const wasDone = this.moveTimer.status === 'done';
    this.moveTimer = t;
    window.clearInterval(this.moveInterval);
    if (t.status === 'running') {
      this.moveInterval = window.setInterval(() => {
        const prev = this.moveTimer;
        const next = tickMove(prev, Date.now());
        // Cambio de consejo cada 20 s.
        if (Math.floor(prev.remainingMs / 20_000) !== Math.floor(next.remainingMs / 20_000)) this.moveTipIndex++;
        this.setMoveTimer(next);
      }, 250);
    }
    if (t.status === 'done' && !wasDone) {
      this.sfx.play('move');
      this.toast('¡Tiempo! Confirma si has hecho tu reto.');
      window.setTimeout(() => ($('move-yes') as HTMLButtonElement).focus(), 50);
    }
    this.renderMove();
    this.emitMoveState();
  }

  private emitMoveState(): void {
    this.game.events.emit(MOVE_EVENTS.state, this.tab === 'move' ? this.moveTimer.status : 'idle');
  }

  /** La app pasa a segundo plano: la pausa se detiene (nunca se completa sola). */
  onHidden(): void {
    if (this.moveTimer.status === 'running') this.setMoveTimer(pauseMove(this.moveTimer, Date.now(), true));
  }

  private renderMove(): void {
    const t = this.moveTimer;
    const idle = t.status === 'idle';
    document.querySelectorAll<HTMLButtonElement>('.duration').forEach((btn) => {
      const m = Number(btn.dataset.minutes);
      btn.setAttribute('aria-checked', String(m === this.moveMinutes));
      btn.disabled = !idle;
    });
    const remaining = idle ? this.moveMinutes * 60_000 : t.remainingMs;
    $('move-clock').textContent = formatClock(remaining);
    const ratio = idle || !t.durationMs ? 0 : 1 - t.remainingMs / t.durationMs;
    $('move-ring').style.setProperty('--p', `${Math.round(ratio * 360)}deg`);
    $('move-ring').dataset.status = t.status;

    let tip = `Elige un reto y pulsa Empezar. «${MOVE_CHALLENGES[this.moveMinutes === 2 ? 2 : 1]}» dura ${this.moveMinutes} ${this.moveMinutes === 1 ? 'minuto' : 'minutos'}.`;
    if (t.status === 'running') tip = MOVE_TIPS[this.moveTipIndex % MOVE_TIPS.length];
    else if (t.status === 'paused')
      tip = t.autoPaused ? 'Pausada porque saliste de la pantalla. Pulsa Continuar cuando vuelvas.' : 'En pausa. Pulsa Continuar cuando quieras.';
    else if (t.status === 'done') tip = '¡Lo has conseguido! Solo cuenta si de verdad hiciste el reto.';
    const tipEl = $('move-tip');
    if (tipEl.textContent !== tip) tipEl.textContent = tip;

    ($('move-start') as HTMLButtonElement).hidden = !idle;
    const pauseBtn = $('move-pause') as HTMLButtonElement;
    pauseBtn.hidden = !(t.status === 'running' || t.status === 'paused');
    pauseBtn.textContent = t.status === 'paused' ? 'Continuar' : 'Pausar';
    ($('move-cancel') as HTMLButtonElement).hidden = !(t.status === 'running' || t.status === 'paused');
    $('move-confirm').hidden = t.status !== 'done';
  }

  private renderMoveStatus(s: GameState): void {
    const done = Math.min(MOVE_DAILY_LIMIT, s.daily.move);
    $('move-status').textContent =
      done >= MOVE_DAILY_LIMIT
        ? `Hoy ya tienes los ${MOVE_DAILY_LIMIT} retos con premio. Puedes seguir haciendo retos sin premio.`
        : `Hoy: ${done}/${MOVE_DAILY_LIMIT} retos con premio (+${MOVE_COINS} monedas y +${MOVE_XP} XP cada uno). Pañuelo MihaiFIT: ${Math.min(s.stats.movePauses, SCARF_PAUSES)}/${SCARF_PAUSES} retos.`;
  }

  /* ---------------- Sonido ---------------- */

  private bindSound(): void {
    const toggle = $('sound-toggle');
    const check = $('sound-check') as HTMLInputElement;
    const volume = $('volume') as HTMLInputElement;
    const sync = () => {
      const on = this.sfx.enabled;
      toggle.setAttribute('aria-pressed', String(on));
      toggle.setAttribute('aria-label', on ? 'Sonido activado. Pulsa para silenciar' : 'Sonido silenciado. Pulsa para activar');
      toggle.title = on ? 'Silenciar' : 'Activar sonido';
      (toggle.firstElementChild as HTMLElement).textContent = on ? '🔊' : '🔇';
      check.checked = on;
      volume.value = String(Math.round(this.sfx.volume * 100));
      volume.disabled = !on;
    };
    const persist = () => savePrefs(this.storage, { sound: this.sfx.enabled, volume: this.sfx.volume });
    const set = (on: boolean) => {
      this.sfx.setEnabled(on);
      if (on) {
        this.sfx.unlock();
        this.sfx.play('tap');
      }
      persist();
      sync();
    };
    toggle.addEventListener('click', () => set(!this.sfx.enabled));
    check.addEventListener('change', () => set(check.checked));
    volume.addEventListener('input', () => {
      this.sfx.setVolume(Number(volume.value) / 100);
      persist();
    });
    volume.addEventListener('change', () => this.sfx.play('tap'));
    sync();
  }

  /* ---------------- Acciones y ajustes ---------------- */

  private bindActions(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'feed') this.store.run(feed, 'feed');
        else if (action === 'clean') this.store.run(clean, 'clean');
        else if (action === 'pet') this.store.run(pet, 'pet');
        else if (action === 'sleep') {
          const wasSleeping = this.store.state.sleeping;
          this.store.run(toggleSleep, wasSleeping ? 'wake' : 'sleep');
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
      if (
        !window.confirm(
          '¿Seguro que quieres empezar de cero? Se borrarán monedas, accesorios, récord, nivel, misiones y logros.',
        )
      )
        return;
      clearSave(this.storage);
      this.setMoveTimer(cancelMove());
      this.store.set(createInitialState(Date.now()));
      this.toast('Partida nueva creada.');
      this.maybeOnboard();
    });
  }
}
