# EstudIA

Aplicación web que convierte un PDF de clase (temario, apuntes, un capítulo de
un libro) en tres recursos de estudio independientes:

| | | |
|---|---|---|
| 📚 **Resumen completo** | 🧠 **Esquema de estudio** | 🎧 **Audiolibro** |
| Sigue el orden del temario, conserva definiciones, fórmulas y datos, y cita la página original de cada apartado. | Árbol jerárquico con conceptos clave y fórmulas, expandible y contraíble. | Guion adaptado a lenguaje hablado, con reproductor persistente y texto sincronizado. |

La prioridad del proyecto, por este orden, es **fidelidad al PDF original**,
calidad del resumen, estructura del esquema, experiencia de audio, facilidad de
uso, rendimiento y diseño.

---

## Cómo probarla

### Opción A · con Node (la más rápida)

Requisitos: Node.js 20 o superior.

```bash
git clone -b claude/pdf-study-app-tjq3ok <url-del-repositorio> estudia
cd estudia

npm install                 # instala dependencias y genera el cliente Prisma
cp .env.example .env        # configura el entorno
npm run db:push             # crea la base de datos SQLite
npm run dev                 # http://localhost:3000
```

Abre <http://localhost:3000>, crea tu cuenta en `/registro` y sube un PDF.

Para no empezar con la pantalla vacía, con el servidor arrancado y en otra
terminal:

```bash
npm run demo
```

Crea la cuenta `demo@estudia.local` (contraseña `estudia1234`), la asignatura
«Electricidad» y deja un documento ya procesado para curiosear las cuatro
pestañas.

### Opción B · con Docker

```bash
docker compose up --build       # http://localhost:3000
```

La base de datos, los PDFs y los audios quedan en un volumen, así que no se
pierden al reiniciar. Para usar IA o voz de servidor, exporta las claves antes
de levantar el contenedor:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
docker compose up --build
```

### Opción B2 · tenerla como aplicación en el móvil, gratis

Publicar el servidor una vez y añadirla a la pantalla de inicio: icono propio,
pantalla completa, con tu cuenta y tu biblioteca. Se puede hacer entero desde el
móvil, sin instalar nada, con el fichero [`render.yaml`](render.yaml) que ya
lleva el repositorio.

Son tres cuentas gratuitas, y hacen falta las tres porque **ningún alojamiento
gratuito da disco que sobreviva a un reinicio**: Render ejecuta la aplicación,
Neon guarda la base de datos y Cloudflare R2 los PDF. La aplicación no guarda
nada en sí misma, así que da igual cuántas veces se reinicie.

La forma más corta es **todo dentro de Vercel**, y solo hay que crear una cosa:
la base de datos. Los PDF se guardan dentro de ella, así que no hace falta
ningún almacén aparte, ni claves, ni variables, ni tarjeta. Hasta el secreto de
las sesiones se genera solo.

[**→ Publicar en Vercel**](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fburgosrodriguezjesus-design%2FAplicaci-n-mi-amor-&project-name=estudia&repository-name=estudia&stores=%5B%7B%22type%22%3A%22postgres%22%7D%5D)

El paso a paso, y las otras opciones (Render, tu propio ordenador), están en
**[`docs/publicar.md`](docs/publicar.md)**.

### Opción B3 · solo quiero mi material, sin publicar nada

Convierte un PDF en material de estudio y lo deja en **un solo fichero HTML**
que se abre con doble clic o desde el móvil, sin servidor y sin conexión:
resumen, esquema y audio con la voz del propio dispositivo.

```bash
npm start &                          # la aplicación, en local
npm run material -- mi-libro.pdf
```

Deja junto al PDF un `.html` con las tres pestañas y un `.md` con el resumen en
texto. Funciona igual con libros escaneados: el reconocimiento va incluido.

### Opción C · solo mirar, sin instalar nada

`demo/estudia-demo.html` es una página suelta que lleva el motor dentro y
funciona abriéndola con doble clic. Sirve para ver el producto en dos minutos.
Es una versión recortada: el resumen es extractivo, no hay cuenta y usa la voz
del dispositivo.

Los **apuntes escaneados** sí funcionan: la página trae su propio motor de
reconocimiento de texto (Tesseract en WebAssembly, unos 12 MB que genera
`node scripts/build-demo-assets.mjs`), así que lee las páginas en el propio
dispositivo aunque el visor no permita enviar imágenes a Claude. Cuando sí lo
permite, usa a Claude por ser más rápido, y si a mitad deja de poder, sigue solo
en el dispositivo. El detalle está en [`demo/README.md`](demo/README.md).

### Comprobar que todo funciona

```bash
npm run build && npm start          # en una terminal
npm run test:smoke                  # en otra (BASE_URL=http://localhost:3000)
```

La prueba de humo recorre el flujo completo contra el servidor real: registro,
rechazo de archivos falsos, subida de un PDF de ejemplo, procesamiento,
comprobación de que el resumen conserva fórmulas y datos numéricos, esquema
jerárquico, carga de segmentos de audio, progreso, regeneración de un apartado
suelto, descarga en Markdown, aislamiento entre cuentas y borrado.

Y dos pruebas más, que no necesitan servidor:

```bash
npm run test:estructura      # entiende el índice de un temario y lo trocea bien
npm run test:almacenamiento  # el guardado compatible con S3, firma incluida
npm run demo:assets          # motor de lectura local de la demo (una vez)
npm run test:demo            # la demo entera en un navegador real
```

`test:estructura` comprueba lo que más se nota en un libro de verdad: que el
índice se lee del propio PDF, que los temas y apartados quedan en su nivel, que
las páginas impresas se cuadran con las del fichero y que ningún dato con
unidades se pierde por el camino.

## Cómo entiende un temario

Antes de resumir nada, el motor lee la estructura del documento:

1. **Busca el índice del propio libro** en las primeras páginas y lo reconoce
   por la forma de sus líneas (título, puntos de relleno, número de página).
2. **Cuadra la numeración**: el índice numera el papel y el PDF numera hojas.
   Se busca dónde aparece de verdad cada título y se corrige el desfase, así que
   las citas «pág. 17» abren la página que toca.
3. **Aparta las hojas del índice**: son una lista, no contenido que resumir.
4. **Decide los títulos con varias señales a la vez** y en este orden: lo que
   confirma el índice, la palabra «tema», una numeración que continúa la serie
   del documento, el tamaño de la letra frente al cuerpo del texto y, ya como
   último recurso, las mayúsculas.
5. **Funde índice y cuerpo** para el esquema: el índice pone los temas y sus
   niveles, y los títulos hallados dentro aportan los subapartados que el índice
   no lista.
6. **Trocea por apartados**, no por temas enteros, y cada fragmento viaja a la IA
   con su tema delante («TEMA 2 - … · 2.3 …») para que sepa dónde está.

A la IA se le pide además que **se revise a sí misma** antes de responder:
recorrer el original comprobando que no falta ninguna definición, fórmula,
clasificación ni cifra, que no ha escrito nada que no esté en el texto, que las
listas siguen siendo listas y que las páginas citadas salen de las marcas reales
del documento.

## Temarios completos

La aplicación está pensada para documentos largos, no para dos folios:

| Documento | Fragmentos | Procesado sin IA | Payload al abrirlo |
|---|---|---|---|
| 3 páginas | 1 | 2 s | 40 KB |
| 56 páginas | 9 | 3 s | 200 KB |
| 393 páginas | 70 | 4 s | 816 KB |
| 40 páginas escaneadas | 2 | 15 s (con OCR) | — |

Cómo se consigue:

- **Un fragmento por tema.** Nunca se mezclan dos temas en el mismo apartado
  del resumen, así que el índice se lee igual que el temario original. Los
  temas muy largos se parten en «parte 2», «parte 3»…
- **Tamaño de fragmento adaptativo.** Los fragmentos crecen en documentos
  enormes para que el número de llamadas al modelo no se dispare.
- **Análisis en paralelo.** `AI_CONCURRENCY` (4 por defecto) reduce el tiempo
  de un temario de 400 páginas de media hora larga a unos minutos.
- **Procesado en segundo plano.** Puedes cerrar la pestaña: el trabajo sigue en
  el servidor y el documento aparece listo en la biblioteca.
- **Respuestas ligeras.** Al abrir un documento no se descargan ni los guiones
  ni las miles de frases del audio: cada capítulo pide las suyas al
  reproducirse.
- **Render perezoso.** Los apartados del resumen se pintan al acercarse a la
  pantalla, y hay un índice para saltar a cualquiera.
- **Topes configurables.** `MAX_PDF_PAGES` (1500) y `OCR_MAX_PAGES` (600) evitan
  que un escaneo gigante se coma el presupuesto sin avisar.

Con IA configurada, el tiempo depende del modelo y de la concurrencia. Como
referencia, un temario de 400 páginas son unos 70 fragmentos; con
`AI_CONCURRENCY=4` suele rondar los diez o quince minutos.

---

## Variables de entorno

Todas se leen **solo en el servidor** (`src/lib/env.ts`). Ninguna clave llega
nunca al navegador.

| Variable | Obligatoria | Para qué sirve |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a la base de datos. Por defecto SQLite (`file:./dev.db`). |
| `AUTH_SECRET` | Sí en producción | Firma las cookies de sesión. `openssl rand -base64 48`. |
| `ANTHROPIC_API_KEY` | No | Activa los resúmenes y esquemas generados con IA y el OCR por visión. Se obtiene en [console.anthropic.com](https://console.anthropic.com/settings/keys). |
| `AI_MODEL` | No | Modelo usado (por defecto `claude-opus-5`). Puedes bajar el coste con `claude-sonnet-5`. |
| `TTS_PROVIDER` | No | `none` (voz del dispositivo), `openai` o `elevenlabs`. |
| `OPENAI_API_KEY`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` | Si usas OpenAI | Síntesis de voz en el servidor. |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL` | Si usas ElevenLabs | Síntesis de voz en el servidor. |
| `STORAGE_DRIVER`, `STORAGE_DIR` | No | Dónde se guardan PDFs y audios (por defecto `./storage`, fuera de `public/`). |
| `AI_CONCURRENCY` | No | Fragmentos analizados en paralelo (4 por defecto). |
| `MAX_UPLOAD_MB`, `MAX_PDF_PAGES` | No | Límites de subida (80 MB y 1500 páginas por defecto). |
| `OCR_PROVIDER` | No | `tesseract` (local, sin claves), `anthropic` (visión) o `none`. Por defecto usa el local si está y si no la visión. |
| `OCR_LANGS`, `OCR_LANG_PATH` | No | Idiomas del OCR local (`spa` por defecto) y carpeta con sus datos. |
| `OCR_MAX_PAGES` | No | Tope de páginas escaneadas a las que se aplica OCR (600). |
| `OCR_CONCURRENCY`, `OCR_SCALE` | No | Páginas reconocidas en paralelo y resolución del rasterizado. |
| `OCR_PROVIDER` | No | `tesseract` para usar OCR local en vez de visión (requiere `npm i tesseract.js`). |

### Qué ocurre sin claves

La aplicación **funciona igual, con menos calidad**, y lo dice claramente en la
interfaz:

- **Sin `ANTHROPIC_API_KEY`** entra en *modo extractivo*: el resumen y el
  esquema se construyen seleccionando frases y títulos literales del propio PDF.
  No puede alucinar porque no escribe nada nuevo, pero tampoco reescribe ni
  simplifica las explicaciones.
- **El OCR no necesita claves.** `npm install` trae el motor local y los datos
  del español, así que unos apuntes escaneados con el móvil funcionan sin
  configurar nada. Reconoce varias páginas a la vez: un libro de 400 páginas
  ronda los dos o tres minutos en un equipo de cuatro núcleos. Con `ANTHROPIC_API_KEY` puedes cambiar a reconocimiento por
  visión (`OCR_PROVIDER="anthropic"`), que aguanta mejor los escaneos torcidos
  y la letra manuscrita.
- **Sin `TTS_PROVIDER`** el audio se reproduce con la voz integrada del
  dispositivo (Web Speech API). No requiere ninguna clave, pero no suena con la
  pantalla bloqueada. Con un proveedor configurado, el audio se sintetiza en el
  servidor, se guarda y permite reproducción en segundo plano y controles desde
  la pantalla de bloqueo.

---

## Cómo se procesa un PDF

```
subida → validación → almacenamiento → cola de trabajos
   ↓
1. Extracción de texto por páginas (pdfjs, reconstruyendo líneas y párrafos)
2. OCR de las páginas escaneadas (render + transcripción)
3. Detección de estructura: títulos, numeración, capítulos → fragmentos
4. Fase «map»: se resume cada fragmento por separado
5. Fase «reduce»: visión global a partir del índice de conceptos
6. Esquema jerárquico anclado a los títulos reales del PDF
7. Guiones de audio adaptados a lenguaje hablado, frase a frase
```

Cada fragmento conserva el rango de páginas del que procede, y el texto que se
envía al modelo lleva marcas `[[pag. N]]`. Por eso cada apartado del resumen
puede mostrar «pág. 17» y abrir esa página del PDF original con un toque.

Los documentos largos nunca se envían de una vez: se trocean, se analizan por
separado y después se sintetizan, que es lo que evita perder información.

### Contrato anti-alucinación

- El modelo solo puede usar el texto que se le entrega; el prompt se lo prohíbe
  explícitamente, y las reglas se repiten en cada llamada.
- Lo que el modelo añade de su cosecha va marcado como
  `> [!aclaracion]` y se pinta en la interfaz con una etiqueta visible
  («Aclaración añadida (no está en el PDF)»).
- Lo que no queda claro en el documento se marca como `> [!duda]`.
- Lo importante para un examen se marca como `> [!examen]`.
- El número de página citado se valida contra el número real de páginas antes de
  guardarse.
- Si una llamada al modelo falla, el fragmento se resuelve en modo extractivo en
  lugar de dejar el documento a medias.

---

## Arquitectura

```
src/
├── app/                        Rutas (Next.js App Router)
│   ├── (auth)/                 login y registro
│   ├── (app)/                  panel, biblioteca, subida, documento, ajustes
│   └── api/                    API REST (auth, documentos, audio, progreso…)
├── components/                 Interfaz (shell, reproductor, pestañas, markdown)
└── lib/
    ├── env.ts  db.ts  auth.ts  api.ts        configuración y sesión
    ├── storage/                              PDFs y audios (local o S3)
    ├── pdf/                                  extracción, OCR y estructura
    ├── ai/                                   prompts, IA y motor extractivo
    ├── tts/                                  voz, segmentación y duración
    ├── jobs/                                 cola y pipeline de procesamiento
    └── client/                               tipos, fetch y formateo
```

Cada capa está separada a propósito: cambiar de base de datos, de
almacenamiento, de modelo o de proveedor de voz no obliga a tocar el resto.
El detalle está en [`docs/arquitectura.md`](docs/arquitectura.md).

### Seguridad

- Contraseñas con bcrypt; sesión en cookie `httpOnly` + `sameSite=lax` firmada
  con JWT.
- Los PDFs se validan por su contenido (cabecera `%PDF-`), no por la extensión
  ni por el tipo declarado, y se avisa si contienen JavaScript embebido.
- Ni los PDFs ni los audios viven en `public/`: se sirven por rutas que
  comprueban la sesión y la propiedad del documento.
- Las claves de almacenamiento se validan para impedir salir del directorio.
- Todas las rutas de API validan la entrada con Zod y devuelven errores con
  mensaje en castellano.

---

## Funcionalidades

- **Subida**: arrastrar y soltar o seleccionar, progreso real de subida,
  cancelación, estados de cada fase y borrado.
- **Resumen**: cuatro niveles (Rápido, Normal, Detallado, Muy detallado),
  adaptación al nivel educativo (ESO, Bachillerato, FP, Universidad) y al estilo
  («desde cero», normal, avanzado).
- **Esquema**: árbol expandible con conceptos, fórmulas y referencias de página.
- **Audio**: reproductor tipo audiolibro con ±10 s, capítulo anterior/siguiente,
  velocidades de 0,75× a 2×, mini-reproductor persistente, controles del sistema
  y texto sincronizado con salto a cualquier párrafo. Se puede escuchar el
  resumen, un capítulo, un apartado suelto o **el PDF completo** adaptado a voz.
- **Biblioteca**: asignaturas → temas → documentos, buscador y ordenación por
  fecha, nombre, asignatura o progreso.
- **Progreso**: apartados completados, tiempo leyendo y escuchando, porcentaje
  por documento y estadísticas semanales. Al guardarse en el servidor, se
  sincroniza entre dispositivos.
- **Regeneración**: de todo el resumen, solo del esquema o **de un único
  apartado** (sin reprocesar el documento entero), con instrucciones libres.
- **PWA**: instalable, con service worker y caché preparada para escuchar audio
  descargado sin conexión.
- **Diseño**: modo claro y oscuro, mobile first, skeleton loaders y
  microanimaciones.

---

## Producción

- **Base de datos**: cambia `provider` a `postgresql` en
  `prisma/schema.prisma` y ajusta `DATABASE_URL`. El modelo no cambia.
- **Almacenamiento**: `src/lib/storage/index.ts` define la interfaz
  `StorageDriver`; añadir S3/R2 es implementarla y cambiar el export.
- **Cola**: `src/lib/jobs/queue.ts` es un worker en proceso respaldado por la
  tabla `ProcessingJob`. Para varias instancias, sustituye `runQueue` por un
  consumidor de Redis/SQS: el resto del código no cambia.
- **Dónde desplegar**: necesita un proceso Node de larga vida (Docker, Railway,
  Render, Fly o un VPS). En plataformas puramente *serverless* el procesado en
  segundo plano se corta al devolver la respuesta HTTP.
- **OCR**: usa las dependencias opcionales `@napi-rs/canvas` (rasterizado),
  `tesseract.js` y `@tesseract.js-data/spa`, que `npm install` trae solas. El
  rasterizado corre en un proceso aparte (`scripts/raster-worker.mjs`): la
  librería nativa de dibujo puede caerse con ciertos PDF y así un fallo no
  tumba el servidor.

## Licencia

Proyecto privado.
