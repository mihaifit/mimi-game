// Prueba de humo en navegador real (Chromium + WebGL) para MIMI 0.2.
//
// Uso (ver README, sección "Prueba de humo"):
//   npm run build
//   npx vite preview --port 4173 &            # o cualquier servidor estático
//   NODE_PATH="$(npm root -g)" node scripts/smoke.mjs http://localhost:4173/
//
// Opcional: V1_URL=<url de un build 0.1.0 en el MISMO origen> para probar la migración
// con un guardado creado por la versión 0.1 real (si no, se usa un guardado v1 sintético
// con el formato exacto de la 0.1). SHOTS=<carpeta> para las capturas (por defecto smoke-shots/).
//
// Playwright NO es dependencia del proyecto: usa el instalado globalmente
// (NODE_PATH) o `npm i --no-save playwright`.

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const URL = process.argv[2] ?? 'http://localhost:4173/';
const V1_URL = process.env.V1_URL ?? '';
const SHOTS = process.env.SHOTS ?? 'smoke-shots';
const EXEC = process.env.CHROMIUM_PATH || undefined;
mkdirSync(SHOTS, { recursive: true });

const results = [];
let failures = 0;
function check(name, ok, detail = '') {
  results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

function watchErrors(page, label) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label} console: ${m.text()}`);
  });
  return errors;
}

const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__mimi.store.state)));
const ready = (page) => page.waitForFunction(() => !!window.__mimi?.ui, null, { timeout: 20_000 });
const tab = (page, id) => page.click(`#tab-${id}`);
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

/** Prepara una condición de prueba (necesidades bajas) a través del Store público. */
const setNeeds = (page, needs) =>
  page.evaluate((n) => window.__mimi.store.update((s) => ({ ...s, needs: { ...s.needs, ...n } })), needs);

/* ------------------------------------------------------------ móvil */
const mobile = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 360, height: 780 } });
const page = await mobile.newPage();
const errors = watchErrors(page, 'móvil');

// 1) Guardado v1: real (V1_URL) o sintético.
let v1 = null;
if (V1_URL) {
  await page.goto(V1_URL);
  await page.waitForFunction(() => !!window.__mimi?.ui, null, { timeout: 20_000 });
  await page.click('#onboarding .personality >> nth=2'); // glotona
  await tab(page, 'settings');
  await page.fill('#name-input', 'Gelatina');
  await page.click('#name-form button[type=submit]');
  await tab(page, 'shop');
  await page.click('[data-item="lazo"]');
  await tab(page, 'room');
  await page.waitForTimeout(500);
  v1 = await page.evaluate(() => JSON.parse(localStorage.getItem('mimi-game.save')));
  check('0.1 real crea guardado v1', v1?.version === 1, JSON.stringify(v1?.state?.owned));
} else {
  const t = Date.now() - 60_000;
  v1 = {
    version: 1,
    savedAt: t,
    state: {
      name: 'Gelatina',
      personality: 'glotona',
      needs: { hunger: 60, hygiene: 70, energy: 80, affection: 60 },
      coins: 25,
      owned: ['lazo'],
      equipped: { head: 'lazo', face: null, neck: null },
      sleeping: false,
      lastTick: t,
      hopBest: 4,
      hopRuns: 2,
      hopLastRewardedRun: 2,
    },
  };
  // Se inyecta desde un recurso del mismo origen sin la app: si la app estuviera abierta,
  // su guardado al salir (pagehide) pisaría el v1 inyectado.
  await page.goto(new globalThis.URL('favicon.svg', URL).href);
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem('mimi-game.save', JSON.stringify(s));
  }, v1);
}

// 2) Abrir 0.2: migración.
await page.goto(URL);
await ready(page);
const migrated = await state(page);
const status = await page.evaluate(() => window.__mimi.store.loadStatus);
check('migración v1 → v2', status === 'migrated', status);
check(
  'v1 conserva nombre/personalidad/monedas/accesorios/récord',
  migrated.name === v1.state.name &&
    migrated.personality === v1.state.personality &&
    migrated.coins >= v1.state.coins &&
    JSON.stringify(migrated.owned) === JSON.stringify(v1.state.owned) &&
    migrated.equipped.head === v1.state.equipped.head &&
    migrated.hopBest === v1.state.hopBest,
  `${migrated.name} ${migrated.personality} ${migrated.coins} ${migrated.owned} récord ${migrated.hopBest}`,
);
check(
  'copia intacta del v1',
  (await page.evaluate(() => localStorage.getItem('mimi-game.save.v1'))) !== null,
);
const renderer = await page.evaluate(() => window.__mimi.game.renderer.type);
check('Phaser usa WebGL', renderer === 2, `renderer.type=${renderer}`);
await page.waitForTimeout(800);
await shot(page, '01-habitacion-movil');

// 3) Audio: activar tras gesto y silenciar.
await page.click('#tab-room'); // primer gesto (no cambia nada)
const audio1 = await page.evaluate(() => ({ state: window.__mimi.sfx.ctx?.state ?? 'none', on: window.__mimi.sfx.enabled }));
check('AudioContext creado tras gesto', audio1.state === 'running' || audio1.state === 'suspended', JSON.stringify(audio1));
const played = await page.evaluate(() => window.__mimi.sfx.play('tap'));
check('suena un efecto con el contexto activo', played === true || audio1.state !== 'running');
await page.click('#sound-toggle');
const muted = await page.evaluate(() => ({ on: window.__mimi.sfx.enabled, played: window.__mimi.sfx.play('pet') }));
check('silenciar al instante', muted.on === false && muted.played === false);
await page.click('#sound-toggle');
check('reactivar sonido', await page.evaluate(() => window.__mimi.sfx.enabled));

// 4) Cuidado útil y XP con anti-spam.
const xp0 = (await state(page)).xp;
await setNeeds(page, { affection: 10 });
for (let i = 0; i < 6; i++) await page.click('[data-action="pet"]');
const afterPets = await state(page);
check('caricias útiles dan XP una sola vez (enfriamiento)', afterPets.xp - xp0 === 5, `+${afterPets.xp - xp0} XP`);
await setNeeds(page, { hunger: 20, hygiene: 20 });
await page.click('[data-action="feed"]');
await page.click('[data-action="clean"]');
const afterCare = await state(page);
check('misión de cuidado completa (3 cuidados útiles)', afterCare.daily.care >= 3, `care=${afterCare.daily.care}`);
const xpText = await page.textContent('#xp-text');
check('barra de vínculo visible', /XP/.test(xpText ?? ''), xpText);
await page.waitForTimeout(400);
await shot(page, '02-cuidados-xp');

// 5) Reclamar misión (una sola vez).
await tab(page, 'missions');
const coinsBefore = (await state(page)).coins;
await page.click('[data-mission="care"]');
const claimed = await state(page);
check('reclamar misión suma +8 monedas', claimed.coins - coinsBefore >= 8, `${coinsBefore} → ${claimed.coins}`);
check('botón de misión reclamada deshabilitado', await page.isDisabled('[data-mission="care"]'));
await page.click('[data-mission="care"]', { force: true }).catch(() => undefined);
check('no se puede reclamar dos veces', (await state(page)).coins === claimed.coins);
await shot(page, '03-misiones');

// 6) Retos MihaiFIT: empezar, pausar, segundo plano, continuar, confirmar una vez.
await tab(page, 'move');
check('sección «Retos MihaiFIT»', /Retos MihaiFIT/.test((await page.textContent('#panel-move .section-title')) ?? ''));
const challengeNames = await page.$$eval('.duration .d-name', (els) => els.map((e) => e.textContent));
check('retos «Activa tu día» (1 min) y «Hoy toca moverse» (2 min)', challengeNames.join('|') === 'Activa tu día|Hoy toca moverse', challengeNames.join(' / '));
await page.click('.duration[data-minutes="2"]');
check('«Hoy toca moverse» = 2:00', (await page.textContent('#move-clock')) === '2:00');
await page.click('.duration[data-minutes="1"]');
check('«Activa tu día» = 1:00', (await page.textContent('#move-clock')) === '1:00');
// Condición de prueba: 2 retos ya confirmados antes; este será el 3.º (desbloquea el Pañuelo MihaiFIT).
await page.evaluate(() => window.__mimi.store.update((s) => ({ ...s, stats: { ...s.stats, movePauses: 2 } })));
check('pañuelo bloqueado antes del 3.er reto', !(await state(page)).owned.includes('panuelo-mihaifit'));
await shot(page, '04a-retos-mihaifit');
await page.click('#move-start');
await page.waitForTimeout(2200);
await page.click('#move-pause');
const pausedClock = await page.textContent('#move-clock');
await page.waitForTimeout(1500);
check('pausar detiene el reloj', (await page.textContent('#move-clock')) === pausedClock, pausedClock);
await page.click('#move-pause'); // continuar
await page.waitForTimeout(1200);
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
const hiddenClock = await page.textContent('#move-clock');
await page.waitForTimeout(1500);
const tipHidden = await page.textContent('#move-tip');
check(
  'segundo plano pausa (no completa)',
  (await page.textContent('#move-clock')) === hiddenClock && /saliste/.test(tipHidden ?? ''),
  `${hiddenClock} · ${tipHidden}`,
);
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
await shot(page, '04-movimiento-pausado');
await page.click('#move-pause'); // continuar
const left = await page.evaluate(() => window.__mimi.ui.moveTimer.remainingMs);
await page.waitForTimeout(left + 900);
check('al terminar pide confirmación', await page.isVisible('#move-confirm'));
await shot(page, '05-movimiento-confirmar');
const coinsMove = (await state(page)).coins;
await page.click('#move-yes');
const moved = await state(page);
// +5 de la pausa (+10 del logro «En marcha» la primera vez).
check(
  'confirmar pausa cobra una vez',
  moved.coins - coinsMove >= 5 && moved.daily.move === 1 && moved.moveLastRewarded === moved.moveSessions,
  `${coinsMove} → ${moved.coins}`,
);
check('confirmación oculta tras cobrar', !(await page.isVisible('#move-confirm')));
check(
  '3.er reto confirmado: Pañuelo MihaiFIT regalado una vez',
  moved.owned.filter((id) => id === 'panuelo-mihaifit').length === 1 && moved.achievements.includes('retos-3'),
  `pausas ${moved.stats.movePauses} · cuello ${moved.equipped.neck}`,
);
const fineprint = await page.textContent('#panel-move .fineprint');
check('aviso de registro manual/local visible', /manual y local/.test(fineprint ?? ''));
const href = await page.getAttribute('.mihaifit a', 'href');
const rel = await page.getAttribute('.mihaifit a', 'rel');
check('enlace a mihaifit.es sin rastreo', href === 'https://www.mihaifit.es/' && /noopener/.test(rel ?? '') && /noreferrer/.test(rel ?? ''));

// 7) Recargar: el guardado se mantiene y no se puede cobrar de nuevo.
await page.reload();
await ready(page);
const reloaded = await state(page);
check(
  'tras recargar se conservan XP, misión y pausa',
  reloaded.xp === moved.xp && reloaded.daily.claimed.includes('care') && reloaded.daily.move === 1 && reloaded.coins === moved.coins,
  `xp ${reloaded.xp} monedas ${reloaded.coins}`,
);
check('tras recargar ya no es "migrated"', (await page.evaluate(() => window.__mimi.store.loadStatus)) === 'loaded');

// 8) MIMI HOP.
await tab(page, 'hop');
await page.waitForTimeout(600);
const hopBefore = await state(page);
await page.click('#hop-jump');
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(650);
  await page.click('#hop-jump').catch(() => undefined);
}
await page.waitForSelector('#hop-over:not([hidden])', { timeout: 30_000 });
const hopAfter = await state(page);
check('partida de MIMI HOP termina y cobra una vez', hopAfter.hopRuns === hopBefore.hopRuns + 1 && hopAfter.hopLastRewardedRun === hopAfter.hopRuns);
check('MIMI HOP da XP', hopAfter.xp > hopBefore.xp, `+${hopAfter.xp - hopBefore.xp} XP`);
await shot(page, '06-hop-fin');
await page.click('#hop-exit');

// 9) Tienda: comprar y cinta bloqueada / regalada.
await tab(page, 'shop');
await page.evaluate(() => window.__mimi.store.update((s) => ({ ...s, coins: Math.max(s.coins, 30) })));
await page.click('[data-item="pajarita"]');
const bought = await state(page);
check('compra en tienda', bought.owned.includes('pajarita') && bought.equipped.neck === 'pajarita');
const level = await page.evaluate(() => Number(document.getElementById('level').textContent));
const cintaText = await page.textContent('[data-item="cinta"]');
check('cinta deportiva visible en tienda', level >= 3 ? /Poner|Quitar/.test(cintaText ?? '') : /Nivel 3/.test(cintaText ?? ''), cintaText);
await shot(page, '07-tienda');

// 10) Subida de nivel con celebración (XP de prueba hasta el nivel 3) y cinta.
await tab(page, 'room');
await page.evaluate(() => window.__mimi.store.update((s) => ({ ...s, xp: Math.max(s.xp, 80) })));
await page.waitForTimeout(500);
const lv = await state(page);
check('nivel 3: cinta regalada una vez', lv.owned.includes('cinta') && lv.levelRewarded >= 3);
check('celebración visible', await page.isVisible('#celebrate'));
await shot(page, '08-nivel-celebracion');
await page.evaluate(() =>
  window.__mimi.store.update((s) => ({ ...s, equipped: { ...s.equipped, head: 'cinta', neck: 'panuelo-mihaifit' } })),
);
await page.waitForTimeout(2500);
const worn = await state(page);
check('Cinta y Pañuelo MihaiFIT equipados a la vez', worn.equipped.head === 'cinta' && worn.equipped.neck === 'panuelo-mihaifit');
await shot(page, '09-accesorios-mihaifit');
await page.locator('#stage').screenshot({ path: join(SHOTS, '09b-accesorios-zoom.png') });
await tab(page, 'hop');
await page.waitForTimeout(900);
check('MIMI HOP activo con los accesorios', await page.evaluate(() => window.__mimi.game.scene.isActive('hop')));
await page.locator('#stage').screenshot({ path: join(SHOTS, '09c-hop-accesorios.png') });
await tab(page, 'move');
await page.locator('.mihaifit').scrollIntoViewIfNeeded();
await shot(page, '09d-capsula-mihaifit');

/* ------------------------------------------------------------ escritorio */
const desk = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const dpage = await desk.newPage();
const derrors = watchErrors(dpage, 'escritorio');
await dpage.goto(URL);
await ready(dpage);
await dpage.click('#onboarding .personality >> nth=0').catch(() => undefined);
check('escritorio: WebGL', (await dpage.evaluate(() => window.__mimi.game.renderer.type)) === 2);
await dpage.click('#sound-toggle');
check('escritorio: silenciar sin errores', (await dpage.evaluate(() => window.__mimi.sfx.enabled)) === false);
await dpage.waitForTimeout(800);
await shot(dpage, '10-escritorio');
await tab(dpage, 'move');
await dpage.waitForTimeout(300);
await shot(dpage, '11-escritorio-retos');

const allErrors = [...errors, ...derrors];
check('sin errores de consola ni de página', allErrors.length === 0, allErrors.slice(0, 5).join(' | '));

await browser.close();
console.log(results.join('\n'));
console.log(`\n${failures === 0 ? 'TODO OK' : `${failures} FALLOS`} · capturas en ${SHOTS}/`);
process.exit(failures === 0 ? 0 : 1);
