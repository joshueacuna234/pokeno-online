# POKENO Online v4

## Mejoras de hosteo
- Nueva ronda = reinicio limpio: conserva jugadores y tablas, limpia sorteo, ganadores y marcas manuales.
- Nueva sesión = genera otro código y cierra la sala anterior.
- Código siempre visible para el host.
- Cuenta regresiva configurable (0/3/5 s).
- Modalidades seleccionables antes de crear la sesión.
- Los 4 modos pueden correr simultáneamente.
- Host decide marcado: automático, manual o libre elección por jugador.
- Jugadores confirman tablas; el host ve quién confirmó.
- Host puede exigir "Estoy listo".
- Después de iniciar, cada jugador ve solo sus propias tablas.
- Marcado manual interactivo cuando está permitido.
- Detección automática de ganadores activable/desactivable.
- Voz corregida: “9 de brillo”, “K de rojo”, “7 de negro”, “as de trébol”, etc.
- 20 tablas fijas permanentes.
- Hasta 1, 2 o 3 tablas por jugador, configurable.
- Cantador físico independiente sin sesión.

## Actualizar
Reemplaza en GitHub:
- package.json
- server.js
- README.md
- public/index.html
- public/styles.css
- public/app.js

Haz Commit changes. Railway con Auto Deploy actualizará la web.

## v4.1
- Botón BINGO por cada tabla activa del jugador.
- El servidor valida el reclamo: no basta con pulsar el botón.
- El host ve reclamos válidos e inválidos.
- Historial de ganadores por modalidad y carta en la que se consiguió.
- Se registra si el ganador fue detectado automáticamente o reclamado.
- Desde la cuenta regresiva ya no se puede cambiar tablas, confirmación o marcado.
- Nueva ronda limpia también el historial de ganadores/reclamos de esa ronda.

## v4.2
- Modo espectador.
- Contraseña opcional para la sala.
- El host puede expulsar jugadores y espectadores.
- Autoplay configurable: 2, 3, 4, 5, 7 o 10 segundos.
- Iniciar/pausar autoplay.
- Opción de pausar automáticamente al aparecer un ganador.
- Espectadores pueden entrar con la partida ya iniciada.
- Reconexión de espectadores.
