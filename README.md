# Web Grand Prix — carreras de F1 en 3D

Juego de Fórmula 1 para un jugador contra la IA, en el navegador, sobre circuitos de 6 a 8 km.
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

## Dificultad y parrilla

Cuatro niveles (`race-setup/domain/race-settings.ts`): Fácil, Media, Difícil y **Extrema**. Los bots de Difícil ya conducen al límite del coche estándar, así que los de Extrema, además, tienen un coche mejor (agarre, motor y velocidad punta), conducen más limpio, frenan más tarde, se defienden casi siempre y, si el jugador se escapa, reciben un empuje extra para recortar la distancia. Son de media un 3-4 % más rápidos por vuelta que un piloto perfecto con el coche estándar. La parrilla admite hasta 19 rivales (20 coches) con pilotos de F1, y hay un box para cada uno.

Todos los circuitos, el fijo y los generados, se dibujan al doble de tamaño (`TRACK_SCALE` en `circuit-layout.ts`): unos 6 a 8 km por vuelta.

## Clima, neumáticos y boxes

**Clima.** Cada carrera tiene un clima aleatorio (no depende de la seed) que lo decide el tipo de circuito (`weather/domain/weather.ts`). Casi siempre hace buen tiempo, y lo malo cambia según el tema: lluvia y tormenta en bosque, ciudad y volcán; nieve y ventisca en hielo; tormenta de arena en el desierto; lluvia de ceniza en el volcán. El clima evoluciona durante la carrera con una cadena de transiciones, y el menú muestra la tendencia con sus probabilidades. La pista acumula agua o una capa de nieve, arena o ceniza mientras dura, y se seca después.

**Neumáticos.** Seis compuestos: blanda, media, dura, intermedia, lluvia y nieve (`tyres/domain/tyre.ts`). Su agarre depende del agua y la cobertura de la pista, de la temperatura (el tema la cambia: el volcán quema las blandas, el hielo castiga a las duras) y del desgaste, que además tiene un "precipicio" cerca del final. Los pintan en las ruedas y en la torre de tiempos. En el menú puedes elegir con qué salir, o "Auto" para el recomendado.

**Boxes.** Hay una calle de boxes junto a la recta de salida, con carril rápido a 80 km/h, un cajón por coche, garajes y un semáforo de salida (`pit-stop/`). Pulsa `B` para pedir parada: al final de la vuelta el coche pasa a piloto automático, entra, se detiene en su box y allí eliges el neumático (teclas `1`-`6` o clic; si no eliges en 8 s, monta el recomendado). Mientras tanto ves a los mecánicos de tu equipo cambiar las ruedas con el coche elevado, y al terminar el hombre de la piruleta pasa de rojo a verde.

- **Señal de boxes:** cuando compensa parar (cambia el clima, neumáticos gastados o falta la parada obligatoria), el muro de boxes te saca el panel "BOX · BOX" con el neumático que recomienda y el motivo, y un aviso de radio. Pulsa `B` para aceptar.
- **Regla de dos compuestos:** como en F1, en una carrera seca de 3 o más vueltas hay que usar dos compuestos distintos (opcional en el menú); si no, +20 s de penalización. La regla se anula si la pista se moja o se cubre. Por eso todos los bots paran, cada uno en la vuelta que elige.
- **Bots:** deciden solos cuándo parar y qué montar (`ai-driver/domain/tyre-strategy.ts`), comparando el agarre que ganarían con el tiempo que pierden, y reaccionan al clima con un pequeño retraso. En la torre de tiempos se ve quién está en boxes ("PIT").
- **Tráfico en boxes:** los coches guardan distancia entre sí, no salen del box si el carril está ocupado, y el semáforo de salida se pone en rojo cuando un coche de pista está a punto de pasar por la incorporación.

## Rebufo (slipstream)

Un coche que va justo detrás de otro sufre menos resistencia aerodinámica (`race-car/domain/slipstream.ts`): hasta un 35 % menos a corta distancia, que se desvanece con la distancia y solo funciona si va alineado con la estela. A 300 km/h eso son 10-15 km/h de punta. El precio es el aire sucio, que le quita hasta un 10 % de agarre en curva. El HUD muestra una barra "REBUFO" mientras el jugador lo aprovecha.

Los bots también lo usan: se meten en la estela del coche de delante y salen a adelantar cuando están cerca. Y si notan a alguien pegado a su cola, tienen un 85 % de probabilidad de apartarse de su línea para romper el rebufo, con las reglas de F1: un solo movimiento por recta, nunca al frenar ni en una curva (`ai-driver/domain/bot-driver.ts`).

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
├── ai-driver/domain/        Pilotos IA: persecución pura, perfil de velocidad, adelantamientos, rebufo y defensa
├── race/                    La carrera
│   ├── domain/              Parrilla, vueltas, clasificación, diferencias, colisiones, semáforo
│   ├── application/         RaceSession (máquina de estados y bucle), puertos, DTO de UI
│   ├── infrastructure/      Vista three.js, cámaras, bucle de animación, raíz de composición
│   └── presentation/        <RaceGame/>, menú de pausa, hook de estado
├── weather/                 Clima aleatorio por tema, estado de la pista, lluvia/nieve/arena/ceniza en 3D
├── tyres/                   Compuestos, agarre según pista y clima, desgaste, recomendación
├── pit-stop/                Calle de boxes, piloto automático de entrada/salida, mecánicos, menú de neumáticos
├── race-setup/              Ajustes de carrera (vueltas, rivales, dificultad, salida, neumáticos) + menú principal
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
