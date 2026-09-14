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

## v4.3
- BINGO ahora se solicita al host.
- El servidor valida cada solicitud automáticamente.
- Solicitudes inválidas se rechazan sin intervención del host.
- Solicitudes válidas quedan pendientes para que el host conceda o rechace.
- El host vuelve a validar en el momento de conceder.
- Autoplay se pausa con cada solicitud de BINGO.
- Ganadores concedidos aparecen por nombre y modalidad; admite empates/múltiples nombres.
- “10 primeras” siempre se valida usando exclusivamente las primeras 10 cartas sorteadas.
- Al recargar la página del host, la sesión termina y vuelve a Crear sesión.
- Jugadores y espectadores mantienen reconexión.
- Eliminado el texto de ejemplo del cantado.
- Corregido el estado fantasma de host que podía causar “Solo el host”.

## v4.4
- Jugador elige qué BINGO solicita: 10 primeras, línea, 4 esquinas o tabla llena.
- Anti-spam/doble solicitud por tabla y modalidad.
- Solicitar BINGO pausa toda la partida y el autoplay.
- Host ve un panel de revisión con nombres, tablas marcadas y cartas sorteadas.
- Varias solicitudes simultáneas aparecen juntas.
- Progreso de cada tabla visible al host.
- Velocidad de autoplay modificable durante la partida.
- Pausa/reanudación general.
- Indicador de conexión inestable tras reconexiones.
- Sonidos independientes para carta, solicitud y BINGO concedido.
- Modo pantalla completa para jugadores/espectadores con carta actual + tablero de 52.
- Botón cerrar sala.
- Confirmaciones reforzadas de Nueva ronda / Nueva sesión.
