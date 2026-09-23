# Web Grand Prix — carreras de F1 en 3D

Juego de Fórmula 1 para un jugador contra la IA, en el navegador, sobre un circuito de 3,8 km.
Hecho con **Next.js 16** (App Router), **React 19**, **TypeScript**, **three.js** y **CSS** sin frameworks (CSS Modules + una hoja global).

## Scripts

```bash
npm install
npm run dev      # desarrollo en http://localhost:3000
npm run build    # export estático en ./out
npm run lint
npm run typecheck
```

`next.config.ts` usa `output: "export"`, así que `npm run build` genera archivos estáticos en `out/`. Se pueden servir con cualquier servidor estático, por ejemplo `npx serve out`.

## CI/CD (GitHub Actions)

- **`.github/workflows/ci.yml`**: en cada pull request y en cada push a ramas distintas de `main`, ejecuta `npm ci`, lint, typecheck (`next typegen && tsc`) y build.
- **`.github/workflows/deploy.yml`**: en cada push a `main` (o a mano desde la pestaña *Actions*), vuelve a ejecutar el CI completo, genera el export estático y lo publica en **GitHub Pages**.

La ruta base del sitio la calcula `actions/configure-pages` y llega a Next.js mediante `PAGES_BASE_PATH` (`basePath` en `next.config.ts`). Con dominio propio queda vacía; sin dominio sería `/<nombre-del-repo>`.

Requisito único en el repositorio: *Settings → Pages → Build and deployment → Source* = **GitHub Actions**.

La versión de Node está fijada en `.nvmrc`.

## Controles

| Acción | Teclado | Mando |
|---|---|---|
| Acelerar | `W` / `↑` | RT / A |
| Frenar / marcha atrás | `S` / `↓` / `Espacio` | LT / B |
| Girar | `A` `D` / `←` `→` | Stick izquierdo |
| Cambiar cámara | `C` | |
| Volver a poner el coche en pista | `R` | |
| Sonido on/off | `M` | |
| Pausa | `Esc` / `P` | |
| Empezar (desde el menú) | `Enter` | |

## Arquitectura: Screaming Architecture

Las carpetas de primer nivel de `src/` llevan el nombre de los conceptos del juego, no de roles técnicos. Cada una se divide en capas:

- **domain/**: reglas puras en TypeScript, sin three.js, React ni DOM. Son deterministas y se pueden probar en Node.
- **application/**: casos de uso y los puertos (interfaces) que necesitan del exterior.
- **infrastructure/**: adaptadores al navegador: three.js, Web Audio, teclado y mando.
- **presentation/**: componentes React y CSS Modules.

```
src/
├── app/                     Solo rutas de Next.js (layout, page, globals.css)
├── circuit/                 El circuito
│   ├── domain/              Spline, muestreo, proyección, muros, trazada ideal, generador por seed, temas, desniveles, túneles, terreno
│   ├── infrastructure/      Escenario 3D: terreno, asfalto, pianos, muros, gradas, túneles, edificios, props y horizonte por tema
│   └── presentation/        Dibujo del trazado (minimapa y vista previa del menú)
├── race-car/                El coche
│   ├── domain/              Física arcade, especificaciones, controles
│   └── infrastructure/      Modelo 3D procedural
├── ai-driver/domain/        Pilotos IA: persecución pura, perfil de velocidad, adelantamientos
├── race/                    La carrera
│   ├── domain/              Parrilla, vueltas, clasificación, diferencias, colisiones, semáforo
│   ├── application/         RaceSession (máquina de estados y bucle), puertos, DTO de UI
│   ├── infrastructure/      Vista three.js, cámaras, bucle de animación, raíz de composición
│   └── presentation/        <RaceGame/>, menú de pausa, hook de estado
├── race-setup/              Ajustes de carrera (vueltas, rivales, dificultad, salida) + menú principal
├── race-results/            Clasificación final + pantalla de resultados
├── hud/presentation/        Velocidad, posición, tiempos, torre de tiempos, minimapa, semáforo
├── player-controls/         Adaptador de teclado + mando (puerto PlayerControls)
├── engine-sound/            Adaptador de Web Audio (puerto EngineSound)
└── shared/                  Utilidades matemáticas, formato de tiempos, estilos de UI comunes
```

Las dependencias apuntan hacia dentro: `presentation → application → domain`, e `infrastructure` implementa los puertos que define `application`. La raíz de composición, que conecta todas las piezas, es `race/infrastructure/create-race-game.ts`.

Para cambiar el circuito fijo, edita `WEB_GP_CIRCUIT.controlPoints` en `src/circuit/domain/circuit-layout.ts`. Son puntos (x, z) en metros de un circuito cerrado, y el punto 0 es la línea de meta.

### Circuitos generados por seed

En el menú, "Circuito generado (seed)" crea un circuito a partir de un texto: la misma seed da siempre el mismo circuito, para compartirla o guardarla. `generateCircuitLayout(seed)` (`src/circuit/domain/circuit-generator.ts`) decide con esa seed:

- **El trazado**, validado (radio mínimo de curva, separación entre tramos, longitud) para que siempre sea jugable.
- **El tema** (`circuit-theme.ts`): bosque, hielo, desierto, volcán o ciudad. Cambia cielo, luz, niebla, terreno, colores, props y horizonte (`infrastructure/circuit-palette.ts`).
- **Los desniveles** (`elevation-profile.ts`): pendientes de hasta el 9 %, con la recta de salida siempre plana. Afectan a la física y a la IA.
- **Los túneles** (`circuit-features.ts`), solo en tramos rectos y lejos de la salida.

Un circuito fijo puede usar todo esto rellenando los campos opcionales `theme`, `seed`, `elevation` y `tunnels` de su `CircuitLayout`.
