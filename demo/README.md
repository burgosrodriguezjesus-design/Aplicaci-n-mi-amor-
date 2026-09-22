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

## Entiende el temario antes de resumirlo

Un libro de texto ya trae su estructura escrita: el índice. La página lo busca
en las primeras hojas (o en cualquiera titulada «Índice»), lo reconoce por la
forma de sus líneas —título, puntos de relleno, número de página— y lo usa como
verdad:

- **Los temas y apartados salen del propio libro**, con sus niveles, en vez de
  adivinarse por mayúsculas.
- **Las páginas se cuadran.** El índice numera el papel, no el PDF; se busca
  dónde aparece de verdad cada título y se corrige el desfase, así que «pág. 17»
  abre la página 17 del temario, no la 17 del fichero.
- **Las hojas del índice no se resumen**: son una lista, no contenido.

Si el libro no trae índice, se decide con lo demás, por este orden: la palabra
«tema», una numeración que *continúa la serie* (así «2.5 mm de sección» deja de
ascender a título), el tamaño de la letra respecto al cuerpo del texto y, ya como
último recurso, las mayúsculas.

El esquema funde las dos cosas: el índice pone los temas y sus niveles, y los
títulos hallados en el cuerpo aportan los subapartados que el índice no lista.
Cada hoja del esquema se queda con las fórmulas y los conceptos de *sus* páginas.

## El resumen conserva lo que se estudia

El motor extractivo elige frases por su carga de información, pero hay cosas que
entran siempre, puntúen lo que puntúen: definiciones, fórmulas, clasificaciones
(«se dividen en», «tipos de», «consta de»), avisos («importante», «recuerda») y
cualquier dato con unidad o porcentaje. Las listas se conservan como listas —si
se deshacen en prosa se pierde justo lo que se memoriza— y las frases repetidas
se descartan una sola vez.

El resumen se ordena **por apartados**, no por temas enteros, y cada tarjeta
lleva su tema delante: «TEMA 2 · 2.3 Documentos mercantiles».

## Revisión final

Antes de dar el material por bueno se compara con el documento: que estén todos
los apartados del índice, que no quede ninguna página sin leer, que las fórmulas
hayan sobrevivido al resumen y que ningún apartado haya quedado sospechosamente
corto. Lo que falle se dice en la portada, con nombres y números; no se esconde.

## Repaso con Claude

Cuando el visor deja hablar con Claude —basta con texto, no hacen falta
imágenes—, aparece **«Revisar el temario»**. Comprueba la estructura y reescribe
cada apartado a partir del texto literal del PDF, con reglas duras: nada que no
esté en el documento, lo añadido marcado como añadido, todas las cifras y listas
conservadas, las páginas citadas como vienen y una línea «lo que cae en el
examen» cuando el texto lo deja claro. Se puede parar y continuar, respeta el
nivel de resumen elegido y, si un apartado falla, se queda el extractivo.

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
aplicaciones—, y se puede elegir a mano siempre. Ritmo medido: **0,5 s por
página** con tres páginas en paralelo en un portátil corriente; en un móvil,
entre uno y dos segundos.

Los obreros se levantan **una sola vez** por reconocimiento (arrancar el motor
wasm cuesta más que leer varias páginas) y las páginas se rasterizan **por
delante**, de modo que ningún obrero espera a que se dibuje la siguiente.

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
