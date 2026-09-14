# POKENO Online v2

Web multijugador en tiempo real para POKENO/Bingo.

## Funciones incluidas

- Crear sesiones con código de 6 caracteres.
- Enlace de invitación `/?room=ABC123`.
- QR de la sala.
- Sala de espera.
- Nombre + avatar emoji por jugador.
- 20 tablas 5×5 equilibradas.
- Reserva de una tabla por jugador.
- Botón "Estoy listo".
- Sorteo sincronizado para todos usando Socket.IO.
- Marcado automático de cartas.
- 4 modalidades:
  - Más aciertos en los primeros 10.
  - Línea horizontal, vertical o diagonal.
  - 4 esquinas.
  - Tabla llena.
- Detección y anuncio automático de ganadores.
- Historial del sorteo.
- Reconexión automática de host y jugadores durante 5 minutos.
- La tabla del jugador queda reservada durante la ventana de reconexión.
- Diseño responsive para móvil.
- Endpoint `/health`.

## Probar en tu PC

Necesitas Node.js 18 o superior.

```bash
npm install
npm start
```

Abre `http://localhost:3000`.

## Publicar con Railway

1. Descomprime este proyecto.
2. Súbelo a un repositorio de GitHub.
3. En Railway crea un proyecto nuevo.
4. Selecciona **Deploy from GitHub repo**.
5. Elige el repositorio.
6. Railway detectará Node.js y ejecutará `npm start`.
7. En **Settings → Networking**, genera un dominio público.
8. Abre el dominio y crea una sala.
9. Los jugadores pueden escanear el QR o abrir el enlace.

No necesitas configurar `PORT`; Railway lo inyecta automáticamente y el servidor ya utiliza `process.env.PORT`.

## Nota sobre persistencia

Las salas se guardan en memoria del servidor. Esto está bien para un MVP, pero si el proceso se reinicia o el proveedor reinicia el contenedor, las salas activas desaparecen.

Para una versión de producción real, el siguiente paso sería usar Redis/PostgreSQL para persistir:
- salas activas,
- jugadores,
- tablas,
- historial,
- reconexiones entre reinicios del servidor.

## Estructura

- `server.js`: servidor Express + Socket.IO y lógica de sesiones.
- `public/index.html`: interfaz.
- `public/styles.css`: diseño.
- `public/app.js`: cliente multijugador.
