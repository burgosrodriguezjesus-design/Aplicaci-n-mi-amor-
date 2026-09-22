# Convertir EstudIA en una aplicación

El objetivo: **un icono en la pantalla de inicio de tu móvil** que abra EstudIA
a pantalla completa, con tu cuenta, tu biblioteca y tu progreso. Sin tienda de
aplicaciones y sin esperar a que nadie la apruebe.

La forma más corta es **todo dentro de Vercel**: una sola cuenta, sin tarjeta,
sin copiar claves de ningún sitio y **sin configurar ni una variable**.

---

## Todo en Vercel

Hace falta **una sola cosa**: la base de datos. Nada más. Ni almacén de
ficheros, ni claves que copiar, ni variables que configurar, ni tarjeta.

### El camino corto

[**→ Publicar en Vercel**](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fburgosrodriguezjesus-design%2FAplicaci-n-mi-amor-&project-name=estudia&repository-name=estudia&stores=%5B%7B%22type%22%3A%22postgres%22%7D%5D)

Ese enlace abre Vercel con el repositorio y la base de datos ya preparados.
Entras con GitHub, le das a **Deploy** y esperas unos minutos.

### Si prefieres hacerlo a mano

1. **[vercel.com](https://vercel.com)** → cuenta con GitHub → **Add New →
   Project** → eliges `Aplicaci-n-mi-amor-`.
2. Dentro del proyecto, pestaña **Storage** → **Create Database → Postgres**.
   Vercel la conecta sola.
3. **Deployments → Redeploy**.

Da igual el orden: si despliegas antes de crear la base de datos, la
construcción se para y te dice exactamente eso. Creas la base de datos, le das
a *Redeploy* y ya está.

### Comprobar que está bien

Abre `https://tu-proyecto.vercel.app/api/health`. Debe responder:

```json
{"ok":true,"database":{"ok":true},"storage":{"ok":true,"driver":"db"}}
```

`driver: "db"` significa que los PDF se guardan dentro de la propia base de
datos: por eso no hace falta crear un almacén aparte. No son accesibles desde
ninguna dirección pública; solo salen por la aplicación, con tu sesión.

Si algo dice `"ok":false`, el mensaje al lado dice qué falta.

### Entrar e instalarla

Abre `https://tu-proyecto.vercel.app` y **regístrate**: esa cuenta es tuya y
nadie más ve tus documentos. Aparecerá abajo un aviso para instalarla. Si lo
cierras:

**iPhone y iPad (Safari).** **Compartir** (el cuadrado con la flecha) →
**Añadir a pantalla de inicio** → **Añadir**. Tiene que ser Safari.

**Android (Chrome).** Tres puntos → **Instalar aplicación**.

**Ordenador (Chrome o Edge).** El icono de instalar, en la barra de direcciones.

### ¿Y si algún día subes muchísimos libros?

Guardar los PDF en la base de datos va de sobra para unos apuntes, pero ocupa
sitio (el plan gratuito da medio giga: unos ocho libros escaneados grandes). Si
te quedas corto, crea un **Blob** en la misma pestaña *Storage* y la aplicación
empieza a usarlo sola, sin tocar nada más.

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
