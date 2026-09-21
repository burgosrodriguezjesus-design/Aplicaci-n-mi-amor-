# Arquitectura

Documento técnico: decisiones, modelo de datos y flujo de procesamiento.

## 1. Visión general

Una sola aplicación Next.js con el frontend y el backend claramente separados
por carpetas y por responsabilidades:

| Capa | Dónde vive | Responsabilidad |
|---|---|---|
| Interfaz | `src/app/(app)`, `src/components` | Pantallas, reproductor, render del material. |
| API | `src/app/api` | Validación, autorización y orquestación. Nada de lógica de negocio pesada. |
| Dominio | `src/lib/pdf`, `src/lib/ai`, `src/lib/tts` | Extracción, estructura, generación y voz. No conocen HTTP. |
| Trabajos | `src/lib/jobs` | Cola, reintentos y estados de procesamiento. |
| Datos | `src/lib/db.ts`, `prisma/schema.prisma` | Persistencia. |
| Ficheros | `src/lib/storage` | PDFs y audios, fuera del árbol público. |

Las capas de dominio no importan nada de Next: se podrían mover a un worker
independiente sin tocarlas.

## 2. Modelo de datos

```
User ─┬─ Subject ── Topic ──┐
      │                     │
      └─ Document ◄─────────┘
             ├─ DocumentPage        texto por página (fuente de las citas)
             ├─ DocumentSection     fragmento lógico + análisis intermedio
             ├─ Summary ── SummarySection   (versionado, con sourcePages)
             ├─ Outline             árbol serializado (versionado)
             ├─ AudioTrack ── AudioSegment  (guion + marcas de tiempo)
             ├─ ProcessingJob       cola y estado
             └─ StudyProgress / StudySession
```

Claves del diseño:

- **`DocumentPage` es la fuente de verdad.** Todo lo generado se ancla a un
  número de página real; sin esa tabla no habría citas ni salto al PDF.
- **`DocumentSection.analysis`** guarda el JSON intermedio de la fase «map». Al
  regenerar el esquema no hace falta volver a analizar el documento.
- **`Summary` y `Outline` se versionan** (`version`, `isCurrent`). Regenerar no
  destruye lo anterior.
- **`SummarySection.sourcePages`** conecta cada apartado del resumen con sus
  páginas; `AudioSegment.summarySectionId` conecta cada frase narrada con su
  apartado. Esa doble relación es la que permite resaltar el texto mientras
  suena el audio y saltar de un párrafo a la página original.
- Los campos JSON se guardan como texto para que el esquema funcione igual en
  SQLite y en PostgreSQL.

## 3. Flujo de procesamiento

### 3.1 Subida (`POST /api/documents`)

1. Se comprueba la sesión.
2. Se comprueban tamaño y cabecera `%PDF-` (el tipo declarado por el navegador
   no es de fiar).
3. Se detecta contenido activo (JavaScript embebido, acciones de lanzamiento) y
   se avisa. El PDF nunca se ejecuta: solo se lee su texto.
4. Se guarda con un nombre aleatorio bajo `storage/documents/<usuario>/`.
5. Se crea el `Document` y se encola `PROCESS_DOCUMENT`. La respuesta vuelve al
   instante: el procesado es asíncrono.

### 3.2 Extracción (`src/lib/pdf/extract.ts`)

pdfjs devuelve fragmentos sueltos con coordenadas. Se reconstruyen las líneas
agrupando por coordenada Y, se ordenan por X y se inserta un salto de párrafo
cuando el hueco vertical supera 1,6 veces el interlineado típico. Así
sobreviven títulos, listas y numeración.

Una página con menos de 40 caracteres útiles se marca como escaneada.

### 3.3 OCR (`src/lib/pdf/ocr.ts`)

Solo se aplica a las páginas marcadas. La página se rasteriza con
`@napi-rs/canvas` y se transcribe con un modelo de visión (prompt estricto de
«transcribe, no interpretes») o con `tesseract.js` si se prefiere local. Si no
hay ningún motor disponible, el documento continúa y se avisa al usuario con un
mensaje concreto.

### 3.4 Estructura y troceado (`src/lib/pdf/structure.ts`)

- Se eliminan las cabeceras y pies repetidos en la mayoría de páginas.
- Se detectan títulos por tres vías: palabra clave con número («TEMA 3»),
  numeración jerárquica («2.1 …») y líneas en mayúsculas. Ninguna línea que
  termine en punto o coma puede ser un título.
- Un título partido en dos líneas se recompone.
- Un título sin cuerpo propio (por ejemplo «TEMA 2» seguido de «1. Elementos de
  protección») se arrastra hasta la siguiente sección con contenido para no
  perderlo.
- Las secciones cortas se fusionan hasta llegar a un tamaño aprovechable y las
  muy largas se parten por párrafos. En ambos casos los títulos interiores se
  conservan como encabezados Markdown.
- El contenido lleva marcas `[[pag. N]]` en cada cambio de página.

### 3.5 Generación (`src/lib/ai/`)

- **map**: una llamada por fragmento que devuelve JSON con el Markdown del
  apartado, conceptos clave, páginas y fórmulas. Se guarda en
  `DocumentSection.analysis`.
- **reduce**: una única llamada que solo ve el índice de títulos y conceptos
  (no el texto completo) y escribe la visión general. Es barata y no puede
  contradecir el contenido.
- **esquema**: recibe los títulos reales detectados en el PDF como esqueleto
  obligatorio, además del índice de conceptos.
- **narración**: convierte cada apartado en un guion hablado. Después pasa
  siempre por `speakify()` como red de seguridad.

El prompt de sistema se cachea entre llamadas del mismo documento. La
profundidad del resumen controla tanto la longitud objetivo como el esfuerzo de
razonamiento del modelo.

**Modo extractivo** (`src/lib/ai/extractive.ts`): sin clave de IA, las frases se
puntúan por densidad de términos frecuentes, presencia de definiciones,
fórmulas, cifras y marcadores de importancia; se conserva un porcentaje según la
profundidad elegida y se respetan todos los títulos. Los conceptos clave salen
de los títulos del propio documento y de las frases con estructura de
definición. El esquema se construye con el árbol de títulos reales.

### 3.6 Audio (`src/lib/tts/`)

`speakify()` convierte Markdown en habla: quita la sintaxis, narra las tablas
como enumeraciones, expande abreviaturas y unidades (`230 V` → «doscientos
treinta voltios»), y traduce fórmulas (`V = I × R` → «El voltaje es igual a la
intensidad multiplicada por la resistencia», con concordancia de género).

El guion se parte en frases con marcas de tiempo proporcionales a su longitud.
Cuando el servidor sintetiza el audio, se lee la duración real de las tramas
MP3 y las marcas se reescalan, de modo que el resaltado coincide con la voz.

El audiolibro del **PDF completo** (`source: DOCUMENT`) se genera bajo demanda
desde la pestaña de audio, a partir del texto literal de cada apartado. Al usar
solo el adaptador determinista, no consume IA.

La síntesis es **perezosa**: se genera la primera vez que se pide una pista y se
guarda. La ruta admite peticiones por rangos (`Range`), necesarias para poder
buscar dentro del audio.

### 3.7 Cola (`src/lib/jobs/queue.ts`)

Worker en proceso respaldado por `ProcessingJob`. Reintenta hasta tres veces
salvo errores definitivos (PDF protegido, PDF inválido, documento sin texto), y
recupera trabajos que quedaran colgados tras un reinicio. Cada fase actualiza
`Document.status`, `statusMessage` y `progress`, que es lo que sondea la
interfaz.

## 4. Reproductor

Vive en el layout de la aplicación, por lo que **no se desmonta al navegar**.
Dos motores:

| | Servidor (`openai`/`elevenlabs`) | Dispositivo (Web Speech) |
|---|---|---|
| Claves | Sí | No |
| Segundo plano / pantalla bloqueada | Sí | No |
| Búsqueda dentro de una frase | Sí | No (salta de frase en frase) |
| Controles del sistema | Sí (Media Session) | Parciales |

Si la síntesis del servidor falla, se degrada solo al motor del dispositivo y se
avisa. El reloj virtual del motor del dispositivo avanza con `performance.now()`
y reanuda la locución cuando el navegador la suspende.

## 5. Decisiones y alternativas

- **Renderizador de Markdown propio** en lugar de una librería: hace falta
  convertir «(pág. 17)» en un botón, dar formato propio a los avisos del
  contrato anti-alucinación y no inyectar nunca HTML generado por un modelo.
- **SQLite por defecto**: cero configuración para empezar; el esquema es
  compatible con PostgreSQL cambiando una línea.
- **Cola en proceso**: suficiente para una instancia y sin infraestructura
  extra; el estado vive en la base de datos, así que migrar a Redis/SQS es
  sustituir el consumidor.
- **Síntesis de audio perezosa**: generar todo el audiolibro al subir el PDF
  multiplicaría el coste de documentos que quizá nadie escuche.
- **Degradación en cascada**: sin IA hay modo extractivo; sin TTS hay voz del
  dispositivo; si el OCR no está disponible, se avisa y se procesa el resto.
  El usuario nunca se queda ante una pantalla bloqueada sin explicación.
