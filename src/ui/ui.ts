import type Phaser from 'phaser';
import { canPlay } from '../core/actions';
import { CATALOG, SLOT_NAMES } from '../core/economy';
import { STAT_KEYS, needMessage } from '../core/needs';
import { PERSONALITIES, PERSONALITY_IDS } from '../core/personalities';
import type { SaveData } from '../core/types';
import { bus, layout, store, type HopOver } from '../game/context';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Falta el elemento ${sel}`);
  return el;
};

export function setupUI(game: Phaser.Game) {
  const hud = $('#hud');
  const actions = $('#actions');
  const hopHud = $('#hop-hud');
  const toastEl = $('#toast');
  const dlgGuide = $<HTMLDialogElement>('#dlg-guide');
  const dlgShop = $<HTMLDialogElement>('#dlg-shop');
  const dlgOver = $<HTMLDialogElement>('#dlg-over');
  let scene: 'room' | 'hop' = 'room';

  // ---------- Toast ----------
  let toastTimer = 0;
  const toast = (msg: string) => {
    if (!msg) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2200);
  };
  bus.on('toast', toast);

  // ---------- Medidas de la zona libre para colocar a MIMI ----------
  const measure = () => {
    const H = window.innerHeight;
    layout.top = hud.getBoundingClientRect().bottom + 8;
    layout.bottom = H - actions.getBoundingClientRect().top + 8;
    bus.emit('layout');
  };
  new ResizeObserver(measure).observe(hud);
  window.addEventListener('resize', measure);

  // ---------- Render de estado ----------
  const meters = STAT_KEYS.map((k) => document.querySelector<HTMLElement>(`.meter[data-stat="${k}"]`)!);
  const render = (s: SaveData) => {
    STAT_KEYS.forEach((k, i) => {
      const v = Math.round(s.stats[k]);
      const m = meters[i];
      m.setAttribute('aria-valuenow', String(v));
      m.setAttribute('aria-valuetext', `${v} %`);
      (m.firstElementChild as HTMLElement).style.width = `${v}%`;
      m.classList.toggle('low', v < 25);
      m.classList.toggle('mid', v >= 25 && v < 50);
    });
    $('#coins').textContent = String(s.coins);
    $('#shop-coins').textContent = String(s.coins);
    const p = PERSONALITIES[s.personality];
    $('#personality-badge').textContent = `${p.emoji} ${p.name}`;
    $('#need').textContent = needMessage(s);
    $('#btn-sleep').querySelector('em')!.textContent = s.sleeping ? 'Despertar' : 'Dormir';
    $('#hop-best').textContent = String(s.hop.best);
    if (dlgShop.open) renderShop();
  };
  store.subscribe(render);

  // ---------- Acciones ----------
  const doAction = (a: string) => {
    if (scene !== 'room' || anyDialogOpen()) return;
    switch (a) {
      case 'feed':
        toast(store.feed().message);
        break;
      case 'wash':
        toast(store.wash().message);
        break;
      case 'sleep':
        toast(store.toggleSleep().message);
        break;
      case 'pet':
        toast(store.pet().message);
        break;
      case 'play': {
        const c = canPlay(store.save);
        if (!c.ok) return toast(c.message);
        game.scene.stop('room');
        game.scene.start('hop');
        break;
      }
      case 'shop':
        openShop();
        break;
    }
  };
  actions.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (btn) doAction(btn.dataset.action!);
  });
  const keys: Record<string, string> = { c: 'feed', b: 'wash', d: 'sleep', m: 'pet', j: 'play', t: 'shop' };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (scene === 'room' && keys[k]) doAction(keys[k]);
    if (scene === 'room' && k === '?' && !anyDialogOpen()) openGuide();
  });
  const anyDialogOpen = () => dlgGuide.open || dlgShop.open || dlgOver.open;

  // ---------- Guía y personalidad ----------
  const choices = $('#personalities');
  const renderChoices = () => {
    choices.innerHTML = '';
    for (const id of PERSONALITY_IDS) {
      const p = PERSONALITIES[id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(store.save.personality === id));
      b.innerHTML = `<span class="em" aria-hidden="true">${p.emoji}</span><b>${p.name}</b><small>${p.description}</small>`;
      b.addEventListener('click', () => {
        store.choosePersonality(id);
        renderChoices();
      });
      choices.append(b);
    }
  };
  const openGuide = () => {
    renderChoices();
    dlgGuide.showModal();
  };
  $('#btn-help').addEventListener('click', openGuide);
  $('#btn-guide-ok').addEventListener('click', () => {
    if (!store.save.onboarded) store.choosePersonality(store.save.personality);
    dlgGuide.close();
  });
  dlgGuide.addEventListener('close', () => {
    if (!store.save.onboarded) store.choosePersonality(store.save.personality);
  });
  $('#btn-reset').addEventListener('click', () => {
    if (window.confirm('¿Seguro? Se borrarán monedas, accesorios y récord de este navegador.')) {
      store.reset();
      window.location.reload();
    }
  });

  // ---------- Tienda ----------
  const thumbCache = new Map<string, string>();
  const thumb = (id: string) => {
    if (!thumbCache.has(id)) {
      try {
        const src = game.textures.get(`acc-${id}`).getSourceImage() as HTMLCanvasElement;
        thumbCache.set(id, src.toDataURL());
      } catch {
        thumbCache.set(id, '');
      }
    }
    return thumbCache.get(id)!;
  };
  const shopList = $('#shop-list');
  const shopMsg = $('#shop-msg');
  const renderShop = () => {
    const s = store.save;
    const focusedId = (document.activeElement as HTMLElement | null)?.dataset?.item;
    shopList.innerHTML = '';
    for (const item of CATALOG) {
      const owned = s.owned.includes(item.id);
      const on = s.equipped[item.slot] === item.id;
      const li = document.createElement('li');
      const img = document.createElement('img');
      img.className = 'thumb';
      img.alt = '';
      img.src = thumb(item.id);
      const info = document.createElement('div');
      info.className = 'info';
      info.innerHTML = `<b>${item.name}</b><small>${SLOT_NAMES[item.slot]}${owned ? ' · Comprado' : ` · 🪙 ${item.price}`}</small>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.item = item.id;
      if (!owned) {
        btn.className = 'buy';
        btn.textContent = 'Comprar';
        btn.setAttribute('aria-label', `Comprar ${item.name} por ${item.price} monedas`);
        if (s.coins < item.price) btn.setAttribute('aria-disabled', 'true');
      } else {
        btn.className = on ? 'on' : '';
        btn.textContent = on ? 'Quitar' : 'Poner';
        btn.setAttribute('aria-pressed', String(on));
        btn.setAttribute('aria-label', `${on ? 'Quitar' : 'Poner'} ${item.name}`);
      }
      btn.addEventListener('click', () => {
        const r = owned ? store.equip(item.id) : store.buy(item.id);
        shopMsg.textContent = r.ok ? (owned ? (on ? 'Quitado.' : '¡Puesto!') : `¡${item.name} comprado y puesto!`) : r.reason;
        renderShop();
      });
      li.append(img, info, btn);
      shopList.append(li);
    }
    if (focusedId) shopList.querySelector<HTMLElement>(`[data-item="${focusedId}"]`)?.focus();
  };
  const openShop = () => {
    shopMsg.textContent = '';
    renderShop();
    dlgShop.showModal();
  };
  $('#btn-shop-close').addEventListener('click', () => dlgShop.close());

  // ---------- MIMI HOP ----------
  bus.on('scene', (s: 'room' | 'hop') => {
    scene = s;
    hud.hidden = actions.hidden = s !== 'room';
    hopHud.hidden = s !== 'hop';
    if (s === 'room') requestAnimationFrame(measure);
  });
  bus.on('hop-score', (n: number) => {
    $('#hop-score').textContent = String(n);
  });
  bus.on('hop-over', (r: HopOver) => {
    $('#over-score').textContent = String(r.score);
    $('#over-best').textContent = r.newBest ? '🏆 ¡Nuevo récord local!' : `Récord local: ${r.best}`;
    $('#over-coins').textContent = r.coins > 0 ? `+${r.coins} 🪙 monedas` : 'Salta al menos un bloque para ganar monedas.';
    window.setTimeout(() => {
      if (scene === 'hop' && !dlgOver.open) dlgOver.showModal();
    }, 450);
  });
  const backToRoom = () => {
    if (dlgOver.open) dlgOver.close();
    game.scene.stop('hop');
    game.scene.start('room');
  };
  $('#btn-hop-back').addEventListener('click', () => {
    bus.emit('hop-quit');
    if (!dlgOver.open) backToRoom();
  });
  $('#btn-over-room').addEventListener('click', backToRoom);
  $('#btn-over-retry').addEventListener('click', () => {
    dlgOver.close();
    const c = canPlay(store.save);
    if (!c.ok) {
      backToRoom();
      toast(c.message);
      return;
    }
    game.scene.getScene('hop')?.scene.restart();
  });
  dlgOver.addEventListener('cancel', (e) => {
    e.preventDefault();
    backToRoom();
  });

  // ---------- Primera visita ----------
  if (!store.save.onboarded) openGuide();
  else if (store.loadSource === 'backup') toast('Se recuperó tu partida desde la copia de seguridad.');
  if (store.loadSource === 'corrupt-reset') toast('La partida guardada estaba dañada; empezamos de nuevo.');
  measure();
}
