# MIMI 💜

MIMI es una mascota virtual de gelatina lavanda: dale de comer, báñala, llévala a dormir, acaríciala y juega con ella a **MIMI HOP** para ganar monedas y comprarle accesorios.

Hecho con **Phaser 4.2.1** (versión exacta), **TypeScript** y **Vite**. Todos los gráficos se dibujan por código (Canvas 2D y un favicon SVG): sin imágenes de pago ni IA externa. Sin cuentas, anuncios, pagos reales, APIs ni backend.

## Ejecutar

```bash
npm ci
npm run dev        # servidor local con recarga
npm test           # pruebas unitarias (Vitest)
npm run build      # typecheck + build en dist/
npm run preview    # sirve dist/
npm run smoke      # smoke test de navegador sobre dist/ (necesita Chromium; ver abajo)
```

`npm run smoke` usa `playwright-core` con el Chromium del sistema (`/opt/pw-browsers/chromium` por defecto, o la ruta en `CHROMIUM_PATH`). No descarga navegadores.

## Cómo se juega

| Acción | Táctil | Teclado |
| --- | --- | --- |
| Comer (+comida) | botón 🍓 Comer | `C` |
| Bañar (+limpieza) | botón 🫧 Bañar | `B` |
| Dormir / despertar (+energía) | botón 🌙 Dormir | `D` |
| Mimos (+felicidad) | tocar o acariciar a MIMI, o botón 💜 | `M` |
| MIMI HOP | botón 🐇 Jugar | `J` |
| Tienda | botón 🛍️ Tienda | `T` |
| Guía y personalidad | botón `?` | `?` |
| Saltar en MIMI HOP | tocar la pantalla | `Espacio`, `↑` o `W` |

Todos los botones son elementos DOM con nombres accesibles, foco visible y barras con `role="meter"`; los diálogos son `<dialog>` nativos (Esc para cerrar).

### Necesidades y tiempo

- Comida, limpieza, sueño (energía) y felicidad bajan con el tiempo real; dormida, la energía sube y lo demás baja más despacio. Se despierta sola con la energía llena.
- Al volver tras una ausencia solo se aplican como máximo **4 horas** y ninguna barra baja de 8 por desgaste. Si el reloj del dispositivo va hacia atrás, no se aplica nada.

### Personalidades (se eligen en la guía y se pueden cambiar)

- 🎈 **Juguetona**: se aburre un 40 % antes, las caricias valen un 50 % más y gana +25 % de monedas en MIMI HOP.
- 🍓 **Glotona**: le entra hambre un 40 % antes, la comida llena un 50 % más y la alegra más.
- 🌙 **Dormilona**: se cansa un 35 % antes, recupera energía un 60 % más rápido y MIMI HOP va un 10 % más lento.

También cambian la velocidad de las animaciones.

### MIMI HOP y economía

- Salta los bloques de gelatina; cada bloque superado suma 1 punto y la velocidad sube poco a poco. Al chocar: game over, con **Reintentar** o **Volver a casa**.
- Monedas por partida: `2 + puntos` (× personalidad), máximo 40, y 0 si no superas ningún bloque. Cada partida tiene un id; la recompensa se cobra **una sola vez** por id (ni doble toque, ni reintento, ni recarga duplican). Salir con «Volver» a mitad cuenta como fin de partida.
- Cada partida gasta algo de energía y comida; con energía menor que 15 o dormida no se puede jugar.
- El **récord es local** (este navegador). No hay clasificación online.
- Tienda: 7 accesorios en 3 ranuras (cabeza, cara, cuello). Se comprueba el saldo antes de comprar; lo comprado se equipa al momento y se pone o quita con un toque. Empiezas con 40 monedas, suficiente para un primer accesorio.

### Guardado

`localStorage` con clave `mimi.save`, formato versionado (`version: 2`, con migración desde v1) y copia de seguridad (`mimi.save.backup`) de la última partida válida. Al cargar se sanean todos los campos (rangos, ids de accesorios inexistentes, equipados no comprados, fechas futuras). Si el JSON está dañado se usa la copia; si también lo está, se empieza de cero con aviso. Si el almacenamiento está bloqueado (modo privado estricto), el juego funciona sin guardar. Se guarda tras cada acción, cada 10 s y al ocultar la pestaña.

## Estructura

```
src/core/     lógica pura y probada: necesidades, acciones, economía, guardado, simulación de MIMI HOP
src/game/     Phaser: texturas procedurales, MIMI (capas con squash & stretch), escenas Habitación y Hop, Store
src/ui/       interfaz DOM accesible sobre el canvas
tests/        pruebas Vitest
scripts/      smoke test de navegador
```

## Publicación (GitHub Pages)

`vite.config.ts` usa `base: './'`, así que el build funciona en `https://<usuario>.github.io/mimi-game/` y en cualquier subcarpeta. El workflow `.github/workflows/pages.yml` ejecuta `npm ci`, `npm test` y `npm run build` en cada PR, y en `main` además publica `dist/` en GitHub Pages (Settings → Pages → Source: GitHub Actions).

## Resultados reales de esta iteración

Ejecutado en la sesión de desarrollo (Node 22, Chromium 141 headless con SwiftShader):

- `npm run typecheck`: sin errores.
- `npm test`: 5 archivos, 30 pruebas superadas (guardado y migración, datos dañados, tiempo limitado, personalidades, tienda, recompensa única por partida, física, colisiones y jugabilidad de MIMI HOP con piloto automático sobre 5 semillas).
- `npm run build`: correcto (Phaser en un chunk aparte, ~381 kB gzip).
- `npm run smoke`: 14 comprobaciones en móvil 360×740 (táctil) y 14 en escritorio 1280×800, todas superadas: guía inicial, elegir personalidad, sin scroll horizontal, comer, caricia en el canvas, tienda rechaza saldo insuficiente, comprar y equipar, MIMI HOP puntúa, game over cobra monedas, reintentar, volver sin monedas extra, persistencia tras recargar y cero errores de consola.

## Límites del MVP

- Sin sonido ni música.
- Sin notificaciones cuando la app está cerrada; el tiempo se calcula al volver.
- Guardado solo local: borrar los datos del navegador borra a MIMI. No se sincroniza entre dispositivos.
- Un solo minijuego y 7 accesorios.
- El smoke test no corre en CI (necesita Chromium); en CI corren pruebas unitarias y build.
