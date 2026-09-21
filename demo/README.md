# Demo en el navegador

`estudia-demo.html` es una página autónoma con el motor de EstudIA dentro:
lee el PDF, detecta el temario, hace el resumen, monta el esquema y narra el
audio **sin servidor, sin cuenta y sin que el PDF salga del dispositivo**.

Ábrela con doble clic o súbela a cualquier alojamiento estático.

Incluye un temario de ejemplo de 56 páginas y necesita conexión la primera vez
para cargar el lector de PDF desde un CDN.

Qué **no** hace, por vivir en el navegador:

- no reescribe el resumen con IA (es extractivo: frases literales del PDF),
- no reconoce páginas escaneadas (el OCR necesita el motor del servidor),
- no guarda biblioteca, progreso ni cuentas,
- usa la voz del dispositivo, que no suena con la pantalla bloqueada.

Para todo eso está la aplicación completa de la raíz del repositorio.
