# mimi-game

MIMI: mascota de gelatina lavanda y minijuego MIMI HOP. Phaser, TypeScript y Vite.

MVP web/móvil jugable: cuida a Mimi en su habitación, gana monedas en **MIMI HOP** y cómpralas en accesorios.
Todo funciona en el navegador: sin backend, sin pagos, sin anuncios, sin IA externa y sin activos de terceros
(Mimi, la habitación, los accesorios y los obstáculos se dibujan con Canvas 2D propio en `src/art/art.ts`).

## Pila

| Pieza | Versión |
| --- | --- |
| Phaser | `4.2.1` (exacta, fijada en `package.json` y `package-lock.json`) |
| TypeScript | `~5.9.3` |
| Vite | `^8.3.4` (`base: './'`, rutas relativas) |
| Vitest | `^5.0.5` |
| Node | `>= 22.12` |

## Comandos

```bash
npm ci            # instalar exactamente lo del lockfile
npm run dev       # servidor de desarrollo
npm test          # pruebas de estado, economía, persistencia y MIMI HOP
npm run typecheck # tsc --noEmit
npm run build     # typecheck + build de producción en dist/
npm run preview   # sirve dist/
```

## Controles

**Habitación**
- Botones **Alimentar**, **Limpiar**, **Dormir/Despertar** y **Caricias**.
- Tocar o hacer clic sobre Mimi = caricias.
- Las pestañas se recorren con `←` `→` `Inicio` `Fin`; todo es accesible con teclado y lector de pantalla
  (barras de necesidades con `role="progressbar"`, avisos en región `aria-live`).

**MIMI HOP**
- Saltar: tocar la escena, `Espacio`, `↑`, `W` o el botón **Saltar**.
- El primer salto empieza la partida. Al chocar aparece el resumen con **Reintentar** / **Volver a la habitación**.

## Reglas y límites (verificados por pruebas)

**Necesidades** (0–100): Saciedad, Limpieza, Energía y Cariño.
- Bajan con el tiempo real (por minuto: saciedad 1,2 · limpieza 0,8 · energía 0,9 · cariño 1,0, ajustado por personalidad).
- El tiempo acumulado con la app cerrada se **limita a 4 horas**; si el reloj del dispositivo retrocede no se aplica nada.
  Nunca bajan de 0 ni suben de 100. Mimi no enferma ni muere.
- Dormida: energía +5/min y el resto baja a la mitad; se despierta sola al llegar a 100. No come ni se baña dormida.
- Cuidar una necesidad que estaba por debajo de 40 da **+1 moneda**.

**Personalidades** (se eligen al empezar; se pueden cambiar en Ajustes):
- **Juguetona**: pide cariño un 40 % más rápido, caricias +50 %, MIMI HOP +25 % de monedas.
- **Dormilona**: se cansa un 40 % más rápido, dormir recupera +60 %, se ensucia un 20 % más despacio.
- **Glotona**: hambre un 40 % más rápida, comer sacia +30 % y da +8 de cariño.

**Monedas y tienda**
- Se empieza con 20 monedas. Máximo 999 999.
- 7 accesorios (15–60 monedas) en 3 zonas: cabeza, cara, cuello. Uno por zona.
- Comprar sin saldo suficiente se rechaza y dice cuántas monedas faltan: **el saldo nunca es negativo**.
- Lo comprado se equipa automáticamente; volver a pulsar lo quita / lo pone.

**MIMI HOP**
- Cada obstáculo superado = 1 punto. La velocidad sube con los puntos (300 → 640 px/s, tope).
- Recompensa al terminar: `1 + floor(puntos / 2)` monedas, **máximo 40** (×1,25 si es juguetona, redondeo hacia abajo).
- La recompensa se cobra **una sola vez por partida** (cada partida tiene un identificador; repetir el cobro no suma).
- Récord local guardado en el dispositivo. No hay clasificaciones online.
- Cada partida gasta 6 de energía y da 6 de cariño. Con energía < 10 o dormida no se puede jugar.

**Guardado local**
- `localStorage` clave `mimi-game.save`, formato `{ version: 1, savedAt, state }`.
- Al cargar se valida y normaliza todo (rangos, tipos, accesorios inexistentes, equipados sin comprar, fechas futuras).
- JSON dañado → partida nueva y copia del original en `mimi-game.save.backup`.
- Guardado de una versión más nueva → no se sobrescribe.
- Sin almacenamiento (modo privado, bloqueado, cuota llena) → se juega igual y se avisa de que no se guardará.

## Estructura

```
src/
  state/   model, care (necesidades, cuidados, recompensas), personality, shop, storage, store
  hop/     hopLogic.ts — física, obstáculos, colisiones y puntuación (pura, sin Phaser)
  art/     art.ts — dibujo procedural de Mimi, accesorios, habitación y escenario
  scenes/  RoomScene, HopScene, MimiRig (capas: respiración, parpadeo, squash/stretch, mirada)
  ui/      ui.ts — interfaz DOM en español
tests/     pruebas Vitest
```

## Despliegue

`.github/workflows/ci.yml` ejecuta typecheck, pruebas y build en cada PR y push. Solo en `main`
(es decir, tras hacer merge) sube `dist/` y lo despliega con GitHub Pages (Source: GitHub Actions).
Gracias a `base: './'` funciona bajo `https://<usuario>.github.io/mimi-game/`.

## Limitaciones conocidas

- Sin sonido.
- El bundle de Phaser pesa ~1,4 MB (≈ 373 kB gzip); no se ha optimizado la carga.
- El progreso vive solo en el navegador del dispositivo: no se sincroniza entre dispositivos.
