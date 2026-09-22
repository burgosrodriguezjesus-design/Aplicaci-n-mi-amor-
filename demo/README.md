# Demo en el navegador

`estudia-demo.html` es una página autónoma con el motor de EstudIA dentro:
lee el PDF, detecta el temario, hace el resumen, monta el esquema y narra el
audio **sin servidor, sin cuenta y sin que el PDF salga del dispositivo**.

Ábrela con doble clic o súbela a cualquier alojamiento estático, junto a la
carpeta `assets/` que genera `scripts/build-demo-assets.mjs`.

Incluye un temario de ejemplo de 56 páginas y necesita conexión la primera vez
para cargar el lector de PDF desde un CDN.

```bash
node scripts/build-demo-assets.mjs   # motor de lectura local (~12 MB, una vez)
node tests/demo/run.mjs              # pruebas en un navegador real
```

## Nada se queda parado en silencio

Un vigilante comprueba que el proceso avance. Si una fase deja de dar señales
(45 segundos en lo normal, 3 minutos mientras reconoce texto), la página lo
dice, nombra la fase y ofrece reintentar, ver el ejemplo o cambiar de PDF. Los
estados que no son progreso real («En espera», «No disponible», «Detenido») se
muestran con esa palabra en lugar de un porcentaje quieto, que parece un cuelgue.

## Apuntes escaneados

Si el PDF son fotos y no lleva texto, la página lo reconoce. Hay **dos motores**
y nunca se queda sin ninguno:

**Este dispositivo.** Tesseract compilado a WebAssembly, servido junto a la
página. No necesita cuenta, no gasta consultas, no habla con ningún servidor y,
una vez cargado, funciona sin conexión. Es el motor por defecto cuando el visor
no deja enviar imágenes a Claude —que es justo lo que ocurre dentro de algunas
aplicaciones—, y se puede elegir a mano siempre. Ritmo medido: **0,7 s por
página** con dos páginas en paralelo en un portátil corriente; en un móvil,
entre uno y tres segundos.

**Claude.** Rasteriza cada página y se la pasa como imagen usando la capacidad
`sample` del visor de Artifacts, es decir, **con la cuenta de quien mira la
página**: pide permiso la primera vez. Es más rápido y acierta más con tablas y
manuscritos, así que se elige solo cuando está disponible. Envía **ocho páginas
por consulta** y mantiene **cuatro consultas en vuelo**: un libro de 400 páginas
son unas cincuenta consultas en lugar de cuatrocientas. La casilla «más preciso»
baja a cuatro páginas por consulta y al modelo normal.

Si se empieza con Claude y el visor rechaza las imágenes a mitad, **el trabajo
sigue solo en el dispositivo**, sin perder lo reconocido y sin pedir nada.

En los dos casos se ve cuántas páginas lleva y cuánto queda, se puede parar y
continuar, y al terminar repasa las páginas que hayan quedado incompletas. Si la
cuenta de Claude topa con su límite, baja el ritmo y reintenta en vez de
rendirse.

### Cómo viaja el idioma

Los sitios que publican la demo solo sirven tipos de fichero web conocidos, y
`spa.traineddata` no es uno. Por eso `scripts/build-demo-assets.mjs` genera
`worker-estudia.js`: el obrero de Tesseract con los datos del español dentro, en
base64, y `fetch` interceptado para servírselos desde su propia memoria. Un
fichero, ninguna descarga suelta, ninguna CDN.

La aplicación instalada sigue siendo más rápida con libros largos: hace lo mismo
en el servidor, con varios procesos a la vez.

Qué **no** hace, por vivir en el navegador:

- no reescribe el resumen con IA (es extractivo: frases literales del PDF),
- el reconocimiento con Claude gasta consultas de la cuenta de quien la abre
  (el del dispositivo no gasta ninguna),
- no guarda biblioteca, progreso ni cuentas,
- usa la voz del dispositivo, que no suena con la pantalla bloqueada.

Para todo eso está la aplicación completa de la raíz del repositorio.
