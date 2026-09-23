# Web Grand Prix — carreras de F1 en 3D

Juego de Fórmula 1 para un jugador contra la IA, en el navegador, sobre un circuito de 3,8 km.
Hecho con **Next.js 16** (App Router), **React 19**, **TypeScript**, **three.js** y **CSS** sin frameworks (CSS Modules + una hoja global).

## Scripts

```bash
npm install
npm run dev      # desarrollo en http://localhost:3000
npm run build    # export estático en ./out
npm run lint
```

`next.config.ts` usa `output: "export"`, así que `npm run build` genera archivos estáticos en `out/`. Se pueden servir con cualquier servidor estático, por ejemplo `npx serve out`.

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
│   ├── domain/              Spline, muestreo, proyección, muros, trazada ideal
│   └── infrastructure/      Escenario 3D: asfalto, pianos, muros, gradas, pórtico
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

Para cambiar el circuito, edita `WEB_GP_CIRCUIT.controlPoints` en `src/circuit/domain/circuit-layout.ts`. Son puntos (x, z) en metros de un circuito cerrado, y el punto 0 es la línea de meta.
