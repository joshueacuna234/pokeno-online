# POKENO Online v3

## Incluye
- 20 tablas fijas y permanentes.
- Cada tabla tiene 25 cartas distintas.
- Equilibrio global óptimo: 32 cartas aparecen 10 veces y 20 cartas aparecen 9 veces entre las 500 casillas.
- Sorteo nuevo con `crypto.randomInt()` en cada ronda.
- Hasta 3 tablas por jugador.
- Los 4 modos se juegan simultáneamente.
- Host sin vista de todas las tablas.
- Tablero de 52 cartas, no salidas opacas.
- Carta gigante al salir.
- Voz: ♦ brillo, ♠ negro, ♥ rojo, ♣ trébol.
- A = "as"; J/Q/K = letra + palo.
- Modo cantador sin sesión para tablas físicas.

## Para actualizar GitHub
Reemplaza:
- package.json
- server.js
- README.md
- public/index.html
- public/styles.css
- public/app.js

Haz **Commit changes**. Railway debería desplegar automáticamente.

## Verificación de equilibrio
Frecuencias globales: 20 cartas aparecen 9 veces; 32 cartas aparecen 10 veces.
