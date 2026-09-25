# Pruebas de extremo a extremo

Necesitan la aplicación en marcha (`npm start`, o `npm run dev`).

```bash
APP_URL=http://localhost:3000 npm run test:recorrido     # la app entera, como una persona
APP_URL=http://localhost:3000 npm run test:aislamiento   # cada cuenta ve solo lo suyo
```

| Prueba | Qué asegura |
| --- | --- |
| `recorrido.mjs` | Portada, registro, error de contraseña, subida (y rechazo de lo que no es PDF), las cuatro pestañas del documento (marcar estudiado, índice, referencias de página, regenerar, esquema, audio y velocidad), Inicio, biblioteca y asignaturas, ajustes y tema oscuro, un libro escaneado entero, borrar y cerrar sesión. En cada pantalla vigila errores de consola, excepciones, fallos del servidor, contenido que se sale por los lados (320, 390, 768 y 1440 px, en claro y oscuro) y botones sin nombre. |
| `aislamiento.mjs` | Otra cuenta, o alguien sin sesión, no puede ver, descargar, regenerar, borrar ni colgar nada en el material de otra persona. |
