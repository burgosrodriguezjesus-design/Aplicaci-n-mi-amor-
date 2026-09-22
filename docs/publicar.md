# Convertir EstudIA en una aplicación

El objetivo: **un icono en la pantalla de inicio de tu móvil** que abra EstudIA
a pantalla completa, con tu cuenta, tu biblioteca y tu progreso, estés donde
estés. Sin tienda de aplicaciones y sin esperar a que nadie la apruebe.

Esta guía monta la versión **gratuita**. Son tres cuentas gratuitas (base de
datos, ficheros y servidor) y unos veinte minutos, y se puede hacer **entero
desde el móvil**, sin instalar nada.

## Por qué hacen falta tres cosas y no una

Ningún alojamiento gratuito —aquí ni en ningún otro sitio— da un disco que
sobreviva a los reinicios: cuando el servidor se reinicia, todo lo que hubiera
guardado dentro desaparece. Así que la aplicación no guarda nada en sí misma:

| Qué | Dónde | Gratis |
| --- | --- | --- |
| La aplicación | Render | Sí, con el servicio durmiendo cuando no se usa |
| La base de datos | Neon (PostgreSQL) | Sí, 0,5 GB |
| Los PDF y el audio | Cloudflare R2 | Sí, 10 GB |

Si prefieres pagar y tenerlo todo en un sitio, al final de esta guía está la
versión de pago: un solo servicio con disco, unos 7 $/mes.

---

## Paso 1 · La base de datos (Neon)

1. Entra en **[neon.tech](https://neon.tech)** y crea la cuenta (sirve GitHub).
2. **Create project**. Nombre: `estudia`. Región: la más cercana, por ejemplo
   *Europe (Frankfurt)*.
3. Al terminar te enseña una **connection string** que empieza por
   `postgresql://`. Cópiala entera y guárdala; la necesitas en el paso 3.

No hay que crear ninguna tabla: la aplicación las crea sola al arrancar.

## Paso 2 · Los ficheros (Cloudflare R2)

1. Entra en **[dash.cloudflare.com](https://dash.cloudflare.com)** y crea la
   cuenta. En el menú lateral: **R2**.
2. La primera vez pide añadir una tarjeta para activar R2. **No se cobra nada**
   dentro de los 10 GB gratuitos; es una verificación.
3. **Create bucket**. Nombre: `estudia`. Ubicación: automática.
4. Vuelve a **R2 → Manage R2 API Tokens → Create API Token**.
   Permisos: **Object Read & Write**, limitado al bucket `estudia`.
5. Te enseña **una sola vez** tres datos. Cópialos ya:
   - **Access Key ID**
   - **Secret Access Key**
   - el **endpoint**, con la forma
     `https://<id-de-cuenta>.r2.cloudflarestorage.com`

## Paso 3 · La aplicación (Render)

1. Entra en **[render.com](https://render.com)** y crea la cuenta con GitHub,
   autorizando el repositorio `Aplicaci-n-mi-amor-`.
2. **New → Blueprint** y elige el repositorio y la rama donde esté el código
   (`claude/pdf-study-app-tjq3ok`, o `main` si ya la has fusionado).
3. Render lee [`render.yaml`](../render.yaml) y te pide los cinco datos de
   antes:

   | Campo | Qué pegar |
   | --- | --- |
   | `DATABASE_URL` | La cadena de Neon (paso 1) |
   | `STORAGE_S3_ENDPOINT` | El endpoint de R2 (paso 2) |
   | `STORAGE_S3_BUCKET` | `estudia` |
   | `STORAGE_S3_ACCESS_KEY_ID` | El Access Key ID de R2 |
   | `STORAGE_S3_SECRET_ACCESS_KEY` | El Secret Access Key de R2 |

4. **Apply**. La primera construcción tarda unos diez minutos porque compila la
   aplicación entera.
5. Cuando ponga **Live**, arriba tienes la dirección
   `https://estudia-algo.onrender.com`. Ábrela y **crea tu cuenta** desde la
   propia aplicación. Nadie más puede ver tus documentos.

A partir de ahí, cada vez que se suba código al repositorio Render vuelve a
desplegar solo.

## Paso 4 · Instalarla en el móvil

Abre la dirección en el móvil y entra con tu cuenta. Aparecerá un aviso abajo
ofreciéndote instalarla. Si lo cierras:

**iPhone y iPad (Safari).** Toca **Compartir** (el cuadrado con la flecha) →
**Añadir a pantalla de inicio** → **Añadir**. Tiene que ser Safari: desde Chrome
en iOS no se puede.

**Android (Chrome).** Tres puntos → **Instalar aplicación**.

**Ordenador (Chrome o Edge).** El icono de instalar, a la derecha de la barra de
direcciones.

Queda como cualquier otra aplicación: icono propio, pantalla completa, sin barra
del navegador, y arranca al instante porque la interfaz se guarda en el
dispositivo.

---

## Lo que hay que saber del plan gratuito

**Se duerme.** Si nadie la usa durante quince minutos, Render apaga el servicio.
La siguiente vez que la abras tardará **cerca de un minuto** en arrancar. A
partir de ahí va normal.

**Un libro escaneado puede necesitar varias vueltas.** Si se duerme mientras
está reconociendo texto, el trabajo se corta. No pasa nada: **lo reconocido se
guarda página a página**, y al volver a procesar el documento sigue por donde
iba en lugar de empezar de cero. En el plan gratuito se reconocen 150 páginas
por pasada (`OCR_MAX_PAGES`), así que un libro de 400 son tres vueltas.

**Es una máquina pequeña.** 512 MB de memoria, así que reconoce una página a la
vez y a menos resolución. Lee igual de bien; tarda más.

**Para que no se duerma mientras trabajas**, deja la pestaña abierta: la
aplicación consulta el estado del documento cada pocos segundos y eso la
mantiene despierta.

### Resúmenes reescritos con IA (opcional)

Sin clave, la aplicación usa el motor extractivo: frases literales del PDF, sin
inventar nada. Si quieres que los resúmenes se **reescriban y expliquen**:

1. Saca una clave en [console.anthropic.com](https://console.anthropic.com).
2. En Render: tu servicio → **Environment** → **Add Environment Variable** →
   `ANTHROPIC_API_KEY`.
3. Guarda. Render reinicia solo.

La clave vive únicamente en el servidor: **nunca llega al navegador**. Se cobra
por uso a tu cuenta de Anthropic.

---

## Otras formas de tenerla

### En tu propio ordenador, sin cuentas ni costes

```bash
docker compose up
```

Y abre `http://localhost:3000`. Usa SQLite y el disco del ordenador, así que no
hace falta ni Neon ni R2. Solo accesible desde casa.

### La versión de pago (no se duerme, todo en un sitio)

El plan `starter` de Render (unos 7 $/mes) permite montar un **disco**, y con
disco no hacen falta ni Neon ni R2: la base de datos y los PDF viven ahí. En
`render.yaml`, cambia el plan y sustituye las variables de almacenamiento:

```yaml
plan: starter
disk:
  name: datos
  mountPath: /data
  sizeGB: 5
envVars:
  - key: DATABASE_URL
    value: file:/data/estudia.db
  - key: STORAGE_DRIVER
    value: local
  - key: STORAGE_DIR
    value: /data/storage
```

Con `standard` (2 GB de memoria, unos 25 $/mes) puedes subir `OCR_CONCURRENCY` a
3 y `OCR_SCALE` a 1.6, y los libros escaneados van bastante más rápido.

### En otro alojamiento

Sirve cualquier sitio que ejecute contenedores. Lo imprescindible:

| Necesita | Por qué |
| --- | --- |
| Procesos largos, no *serverless* | Un libro entero tarda minutos, no segundos |
| Al menos 512 MB de memoria | El reconocimiento rasteriza páginas |
| Disco persistente **o** PostgreSQL + S3 | Los apuntes tienen que sobrevivir al reinicio |
| `AUTH_SECRET` fijo | Si cambia, se cierran todas las sesiones |

**Vercel no sirve** para esta aplicación: sus funciones se cortan a los pocos
segundos y no tienen disco, y aquí procesar un temario dura minutos.

### Aplicación nativa de la App Store

Se puede envolver la web con Capacitor, pero conviene saber lo que implica:
sigue haciendo falta el servidor publicado, una cuenta de desarrollador de Apple
(99 €/año), un Mac para compilar para iOS y pasar la revisión de Apple cada vez.
Para lo que esta aplicación hace, instalarla desde el navegador da exactamente
el mismo resultado en el móvil, hoy y gratis.
