# Convertir EstudIA en una aplicación

El objetivo: **un icono en la pantalla de inicio de tu móvil** que abra EstudIA
a pantalla completa, con tu cuenta, tu biblioteca y tu progreso. Sin tienda de
aplicaciones y sin esperar a que nadie la apruebe.

La forma más corta es **todo dentro de Vercel**: una sola cuenta, sin tarjeta,
sin copiar claves de ningún sitio y **sin configurar ni una variable**.

---

## Todo en Vercel, paso a paso

Hace falta **una sola cosa**: la base de datos. Ni almacén de ficheros, ni
claves, ni variables, ni tarjeta. Son unos quince minutos y se puede hacer
entero desde el móvil.

Los nombres de los botones están en inglés porque Vercel está en inglés. Los
pongo tal cual los vas a ver.

### Paso 1 · Crear la cuenta de Vercel

1. Abre **[vercel.com](https://vercel.com)**.
2. Pulsa **Sign Up** (arriba a la derecha).
3. Elige **Continue with GitHub**.
4. Entra con tu usuario de GitHub y pulsa **Authorize Vercel** cuando GitHub te
   lo pida. Eso le da permiso a Vercel para leer tus repositorios.
5. Te preguntará tu nombre y para qué la usas. Contesta lo que quieras y elige
   el plan **Hobby**, que es el gratuito.

Acabarás en un panel vacío que pone algo como *Let's build something new*.

### Paso 2 · Traer el proyecto

1. Pulsa **Add New…** y luego **Project**.
2. Verás una lista, **Import Git Repository**. Busca
   **`Aplicaci-n-mi-amor-`** y pulsa **Import** a su derecha.

   *¿No aparece?* Pulsa **Adjust GitHub App Permissions** (o **Configure GitHub
   App**), y en la página de GitHub que se abre marca el repositorio para darle
   acceso. Vuelve atrás y ya estará en la lista.

3. Sale la pantalla **Configure Project**. **No toques nada**: el nombre, el
   *Framework Preset* (*Next.js*) y el resto ya vienen bien.
4. Pulsa **Deploy**.
5. Espera. La primera vez tarda entre tres y cinco minutos.

Cuando acabe verás una pantalla de felicitación con una captura del proyecto.

### Paso 3 · Abrirla y ver qué falta

1. Pulsa **Continue to Dashboard**.
2. Arriba tienes la dirección de tu aplicación, algo como
   **`estudia-xxxx.vercel.app`**. Ábrela.
3. Te va a decir: **«Ya está publicada. Solo falta la base de datos»**, con los
   pasos. Es lo normal: la base de datos se crea ahora.

### Paso 4 · Crear la base de datos

1. Vuelve a la pestaña de Vercel con el panel del proyecto.
2. Arriba hay una fila de pestañas: *Project, Deployments, Analytics,
   **Storage**, Settings*. Pulsa **Storage**.
3. Pulsa **Create Database**.
4. Elige **Postgres** (puede aparecer como *Neon Postgres* o *Serverless
   Postgres*: es la misma).
5. Te pedirá un **nombre** (vale cualquiera, por ejemplo `estudia`) y una
   **región**: elige la más cercana a ti, por ejemplo *Frankfurt*.
6. Pulsa **Create** y espera unos segundos.
7. Si te pregunta a qué proyecto conectarla, elige el tuyo y **Connect**.

No tienes que copiar ninguna clave a ningún sitio. Vercel la conecta sola.

### Paso 5 · Volver a desplegar

La aplicación ya tiene base de datos, pero se construyó antes de que existiera.
Hay que construirla otra vez:

1. Pestaña **Deployments**.
2. En el primero de la lista, pulsa el botón de **tres puntos (…)** a su
   derecha.
3. Elige **Redeploy** y confirma.
4. Espera otros dos o tres minutos.

### Paso 6 · Comprobar que está bien

Abre tu dirección seguida de `/api/health`, por ejemplo
`https://estudia-xxxx.vercel.app/api/health`. Tiene que salir:

```json
{"ok":true,"database":{"ok":true},"storage":{"ok":true,"driver":"db"}}
```

Si pone `"ok":false`, el texto de al lado dice qué falta.

`driver: "db"` significa que los PDF se guardan dentro de la propia base de
datos. Por eso no hace falta crear un almacén aparte, y por eso no son
accesibles desde ninguna dirección pública: solo salen por la aplicación, con
tu sesión iniciada.

### Paso 7 · Crear tu cuenta

1. Abre tu dirección `https://estudia-xxxx.vercel.app`.
2. Pulsa **Crear cuenta**.
3. Pon tu nombre, tu correo y una contraseña. Esa cuenta es tuya: nadie más ve
   tus documentos.

### Paso 8 · Ponerla en la pantalla de inicio

**iPhone o iPad.** Tiene que ser con **Safari** (desde Chrome en iOS no se
puede):

1. Con la aplicación abierta, pulsa el botón **Compartir**: el cuadrado con una
   flecha hacia arriba, abajo en el centro.
2. Baja en la lista hasta **Añadir a pantalla de inicio**.
3. Pulsa **Añadir**, arriba a la derecha.

**Android, con Chrome:** menú de tres puntos → **Instalar aplicación**.

**Ordenador, con Chrome o Edge:** el icono de instalar, a la derecha de la barra
de direcciones.

Ya tienes el icono. Al abrirlo se ve a pantalla completa, sin barra del
navegador.

### Paso 9 · Subir tu primer PDF

1. Abre la aplicación desde el icono.
2. Pulsa **Subir nuevo PDF** y elige el fichero.
3. Verás las fases: leyendo, extrayendo, detectando el temario, resumen,
   esquema y audio.
4. Con un libro escaneado largo, **deja la pantalla abierta**: en Vercel el
   trabajo avanza por tandas mientras la aplicación está delante. Si la
   cierras, se para donde iba; al volver a abrir el documento, sigue.

### ¿Y si algún día subes muchísimos libros?

Guardar los PDF en la base de datos va de sobra para unos apuntes, pero ocupa
sitio (el plan gratuito da medio giga: unos ocho libros escaneados grandes). Si
te quedas corto, entra en **Storage → Create → Blob** y la aplicación empieza a
usarlo sola, sin tocar nada más.

## Lo que tienes que saber

**No se duerme.** Abre siempre al instante.

**Los libros escaneados van por tandas.** En Vercel cada petición se corta a los
60 segundos, así que el procesado avanza a trozos que se encadenan solos. Con
números medidos: un temario de 402 páginas **con texto** se hace en 7,7
segundos, de una vez; un escaneado avanza a 0,4 s por página, así que 400
páginas escaneadas son unas cuatro tandas.

**Deja la pestaña abierta** mientras procesa un libro escaneado largo. Si la
cierras, el trabajo se para donde estuviera; al volver a abrir el documento
**sigue por donde iba**, sin repetir nada de lo reconocido.

**Los límites del plan gratuito** de Vercel (tiempo de ejecución y espacio de
almacenamiento) son de sobra para tus apuntes, pero existen: si algún día subes
muchos libros, el propio panel te avisa.

**Una advertencia honesta.** El reconocimiento de texto usa un binario nativo
para rasterizar páginas y 44 MB de motor WebAssembly, y **eso no lo he podido
probar en el entorno real de Vercel**. Los PDF con texto no dependen de nada de
eso y funcionan seguro. Si un escaneado falla allí, el registro de Vercel lo
dirá y se arregla.

### Resúmenes reescritos con IA (opcional)

Sin clave, la aplicación usa el motor extractivo: frases literales del PDF, sin
inventar nada. Si quieres que los resúmenes se **reescriban y expliquen**:

1. Saca una clave en [console.anthropic.com](https://console.anthropic.com).
2. En Vercel: **Settings → Environment Variables** → `ANTHROPIC_API_KEY`.
3. **Redeploy**.

La clave vive únicamente en el servidor: **nunca llega al navegador**. Se cobra
por uso a tu cuenta de Anthropic.

---

## Otras formas de tenerla

### En tu propio ordenador, sin cuentas ni costes

```bash
docker compose up
```

Y abre `http://localhost:3000`. Usa SQLite y el disco del ordenador: no hace
falta nada más. Solo accesible desde casa.

### En Render

Render no corta las peticiones, así que un libro escaneado entero se hace de
una tirada sin tandas. A cambio, en su plan gratuito **el servicio se duerme** y
tarda cerca de un minuto en despertar, y necesita igualmente una base de datos
y un almacenamiento externos (Neon y Cloudflare R2, los dos con plan gratuito;
R2 pide tarjeta para activarse aunque no cobre).

El repositorio trae [`render.yaml`](../render.yaml) listo: **New → Blueprint**,
eliges el repositorio, y te pide esos datos.

Con el plan de pago (`starter`, unos 7 $/mes) puedes montar un **disco**, y
entonces no hacen falta ni Neon ni R2: la base de datos y los PDF viven ahí.

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

### En otro alojamiento

Sirve cualquier sitio que ejecute contenedores. Lo imprescindible:

| Necesita | Por qué |
| --- | --- |
| Procesos largos, o tandas | Un libro entero tarda minutos; si el sitio corta las peticiones, pon `JOB_SLICE_SECONDS` |
| Al menos 512 MB de memoria | El reconocimiento rasteriza páginas |
| Disco persistente **o** PostgreSQL + almacenamiento | Los apuntes tienen que sobrevivir al reinicio |

La aplicación se adapta sola: mira qué hay configurado y elige base de datos
(SQLite o PostgreSQL) y almacenamiento (disco, Vercel Blob o cualquier servicio
compatible con S3). Si no le das un `AUTH_SECRET`, se genera uno y lo guarda en
la base de datos, para que las sesiones no se cierren en cada despliegue.

### Aplicación nativa de la App Store

Se puede envolver la web con Capacitor, pero conviene saber lo que implica:
sigue haciendo falta el servidor publicado, una cuenta de desarrollador de Apple
(99 €/año), un Mac para compilar para iOS y pasar la revisión de Apple cada vez.
Para lo que esta aplicación hace, instalarla desde el navegador da exactamente
el mismo resultado en el móvil, hoy y gratis.
