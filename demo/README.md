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
pide permiso la primera vez.

Puede con un libro entero. Para que sea viable envía **cuatro páginas por
consulta** y mantiene **dos consultas en vuelo**, así que un libro de 400
páginas son unas cien consultas en lugar de cuatrocientas. Muestra cuántas
lleva y el tiempo que queda, se puede parar en cualquier momento y continuar
después sin perder lo reconocido, y si se agota el límite de la cuenta lo dice
y espera.

La aplicación instalada sigue siendo más rápida y sin coste por página: lo hace
en el servidor con un motor local.

Qué **no** hace, por vivir en el navegador:

- no reescribe el resumen con IA (es extractivo: frases literales del PDF),
- el reconocimiento gasta consultas de la cuenta de quien la abre,
- no guarda biblioteca, progreso ni cuentas,
- usa la voz del dispositivo, que no suena con la pantalla bloqueada.

Para todo eso está la aplicación completa de la raíz del repositorio.
