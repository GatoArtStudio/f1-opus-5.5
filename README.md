# Web Grand Prix — carreras de F1 en 3D

Juego de carreras de Fórmula 1 para un jugador, hecho solo con archivos estáticos (HTML, CSS y JavaScript con módulos ES) y [three.js](https://threejs.org/) incluido en `vendor/`. Compites contra coches controlados por la IA en un circuito de 3,8 km.

## Cómo ejecutarlo

Los módulos ES no se cargan con `file://`, así que hay que servir la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```

(También vale `npx serve`, nginx, GitHub Pages, etc.)

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

## Qué incluye

- **HUD**: velocidad (km/h), marcha, arco de RPM con luces de cambio, posición (P x/N), vuelta actual/total, tiempo de vuelta actual, última y mejor, torre de tiempos con diferencias al líder, y **minimapa** con todos los coches.
- **Salida estilo F1**: cinco luces rojas (en el HUD y en el pórtico 3D) y un tiempo de espera aleatorio antes de que se apaguen.
- **IA**: los bots siguen una trazada precalculada, frenan según un perfil de velocidad, adelantan por el lado libre y se recuperan si se quedan atascados.
- **Física**: modelo arcade con agarre lateral, subviraje sobre la hierba, pianos, choques con los muros y entre coches.
- **Opciones**: número de vueltas, rivales (3–11), dificultad y posición de salida.
- **Tabla de resultados** al terminar: tiempos, diferencias, mejor vuelta y posición de salida.

## Estructura

```
index.html          HUD, menús y mapa de importación
css/styles.css      Estilos del HUD y de los menús
js/config.js        Ajustes: circuito, coche, dificultad, pilotos
js/track.js         Muestreo del circuito, proyección, trazada y perfil de velocidad
js/car.js           Física del coche y modelo 3D procedural
js/ai.js            Pilotos de la IA
js/scenery.js       Asfalto, pianos, muros, gradas, árboles, pórtico de salida
js/hud.js           HUD y minimapa
js/input.js         Teclado y mando
js/audio.js         Sonido de motor sintetizado (Web Audio)
js/main.js          Bucle del juego, estados de carrera, vueltas y cámaras
vendor/             three.js r170
```

Para cambiar el circuito, edita `TRACK.controlPoints` en `js/config.js`. Son puntos (x, z) en metros de una curva cerrada, y el punto 0 es la línea de meta.
