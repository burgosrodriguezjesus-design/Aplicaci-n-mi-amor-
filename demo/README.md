# Demo en el navegador

`estudia-demo.html` es una página autónoma con el motor de EstudIA dentro:
lee el PDF, detecta el temario, hace el resumen, monta el esquema y narra el
audio **sin servidor, sin cuenta y sin que el PDF salga del dispositivo**.

Ábrela con doble clic o súbela a cualquier alojamiento estático.

Incluye un temario de ejemplo de 56 páginas y necesita conexión la primera vez
para cargar el lector de PDF desde un CDN.

## Apuntes escaneados

Si el PDF son fotos y no lleva texto, la página ofrece reconocerlo. Rasteriza
cada página y se la pasa a Claude como imagen usando la capacidad `sample` del
propio visor de Artifacts, es decir, **con la cuenta de quien mira la página**:
pide permiso la primera vez y se procesan solo las páginas del rango elegido.
Por eso el rango viene acotado por defecto: un libro entero son cientos de
consultas.

Para reconocer un libro completo de una tirada está la aplicación instalada,
que lo hace en el servidor con un motor local y sin coste por página.

Qué **no** hace, por vivir en el navegador:

- no reescribe el resumen con IA (es extractivo: frases literales del PDF),
- no reconoce cientos de páginas de una vez (va por rangos),
- no guarda biblioteca, progreso ni cuentas,
- usa la voz del dispositivo, que no suena con la pantalla bloqueada.

Para todo eso está la aplicación completa de la raíz del repositorio.
