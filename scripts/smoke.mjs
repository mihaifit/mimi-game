// Smoke test de navegador (móvil 360×740 y escritorio 1280×800) sobre el build de dist/.
// Uso: npm run build && npm run smoke   (CHROMIUM_PATH para indicar otro Chromium)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const DIST = new URL('../dist/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`${cond ? '✔' : '✘'} ${msg}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(name, viewport, isMobile) {
  console.log(`\n== ${name} ${viewport.width}×${viewport.height}`);
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, deviceScaleFactor: isMobile ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(() => window.__mimi?.game?.scene?.isActive('room'));
  await sleep(600);
  const st = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__mimi.store.save)));

  check(await page.locator('#dlg-guide').evaluate((d) => d.open), 'la guía aparece en la primera visita');
  await page.getByRole('radio', { name: /Glotona/ }).click();
  await page.locator('#btn-guide-ok').click();
  check((await st()).personality === 'glotona', 'se elige personalidad');
  await page.screenshot({ path: `smoke-${name}-room.png` });

  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check(noHScroll, 'sin scroll horizontal');

  const before = (await st()).stats.hunger;
  await page.getByRole('button', { name: /Comer/ }).click();
  check((await st()).stats.hunger > before, 'Comer sube la comida');
  await page.getByRole('button', { name: /Bañar/ }).click();

  // Caricia tocando el centro de MIMI en el canvas.
  const hap = (await st()).stats.happiness;
  const pos = await page.evaluate(() => {
    const r = window.__mimi.game.scene.getScene('room');
    return { x: r.mimi.x, y: r.mimi.y - 80 * r.mimi.scaleY };
  });
  if (isMobile) await page.touchscreen.tap(pos.x, pos.y);
  else await page.mouse.click(pos.x, pos.y);
  await sleep(150);
  check((await st()).stats.happiness > hap, 'acariciar a MIMI en el canvas sube la felicidad');

  // Tienda.
  await page.getByRole('button', { name: /Tienda/ }).click();
  await page.getByRole('button', { name: /Comprar Corona/ }).click({ force: true });
  check(/faltan/i.test(await page.locator('#shop-msg').textContent()), 'la tienda rechaza saldo insuficiente');
  await page.getByRole('button', { name: /Comprar Lazo rosa/ }).click();
  const s1 = await st();
  check(s1.owned.includes('lazo') && s1.equipped.head === 'lazo' && s1.coins === 10, 'comprar y equipar el lazo');
  await page.screenshot({ path: `smoke-${name}-shop.png` });
  await page.locator('#btn-shop-close').click();

  // MIMI HOP.
  await page.getByRole('button', { name: /Jugar/ }).click();
  await page.waitForFunction(() => window.__mimi.game.scene.isActive('hop'));
  await sleep(300);
  await page.keyboard.press('Space');
  // Piloto automático: salta cuando se acerca un bloque, durante ~8 s.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const hop = window.__mimi.game.scene.getScene('hop');
        const t0 = performance.now();
        const loop = () => {
          const s = hop.sim;
          const o = s.obstacles.find((o) => o.x + o.w > 82);
          if (o && s.grounded && o.x - 138 < s.speed * 0.16) document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, bubbles: true }));
          if (performance.now() - t0 < 8000 && s.alive) requestAnimationFrame(loop);
          else resolve();
        };
        loop();
      }),
  );
  const scored = await page.evaluate(() => window.__mimi.game.scene.getScene('hop').sim.score);
  check(scored > 0, `MIMI HOP puntúa (${scored} puntos)`);
  await page.screenshot({ path: `smoke-${name}-hop.png` });
  // Dejar que choque.
  await page.waitForFunction(() => document.querySelector('#dlg-over').open, null, { timeout: 30000 });
  const s2 = await st();
  check(s2.hop.lastRewardedRun === 1 && s2.coins > s1.coins, `game over cobra monedas (+${s2.coins - s1.coins})`);
  await page.screenshot({ path: `smoke-${name}-over.png` });
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await sleep(300);
  check(await page.evaluate(() => window.__mimi.game.scene.isActive('hop') && !document.querySelector('#dlg-over').open), 'Reintentar reinicia');
  await page.getByRole('button', { name: /Volver/ }).click();
  await page.waitForFunction(() => window.__mimi.game.scene.isActive('room'));
  check((await st()).coins === s2.coins, 'volver sin saltar no da monedas extra');

  // Persistencia tras recargar.
  await page.evaluate(() => window.__mimi.store.persist());
  await page.reload();
  await page.waitForFunction(() => window.__mimi?.game?.scene?.isActive('room'));
  const s3 = await st();
  check(s3.coins === s2.coins && s3.equipped.head === 'lazo' && s3.hop.best >= 1, 'la partida sobrevive a la recarga');
  check(!(await page.locator('#dlg-guide').evaluate((d) => d.open)), 'la guía no reaparece');
  check(errors.length === 0, `sin errores de consola${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

try {
  await run('movil', { width: 360, height: 740 }, true);
  await run('escritorio', { width: 1280, height: 800 }, false);
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.error(`\n${failures.length} comprobación(es) fallida(s)`);
  process.exit(1);
}
console.log('\nSmoke test OK');
