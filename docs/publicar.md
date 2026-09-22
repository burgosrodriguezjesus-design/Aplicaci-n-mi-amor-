# Convertir EstudIA en una aplicación

El objetivo: **un icono en la pantalla de inicio de tu móvil** que abra EstudIA
a pantalla completa, con tu cuenta, tu biblioteca y tu progreso, estés donde
estés. No hace falta tienda de aplicaciones ni esperar a que nadie la apruebe.

Son dos pasos: publicar el servidor una vez, e instalarla en el móvil.

---

## Paso 1 · Publicar el servidor (una sola vez)

Se puede hacer **entero desde el móvil**, sin instalar nada.

1. Entra en **[render.com](https://render.com)** y crea la cuenta con GitHub.
   Autoriza el acceso al repositorio `Aplicaci-n-mi-amor-`.
2. En el panel: **New → Blueprint**.
3. Elige este repositorio y la rama donde esté el código
   (`claude/pdf-study-app-tjq3ok`, o `main` si ya la has fusionado).
4. Render lee el fichero [`render.yaml`](../render.yaml) del repositorio y te
   enseña lo que va a crear: un servicio web y un disco de 5 GB. Pulsa **Apply**.
5. Espera a que termine de construir. La primera vez tarda unos 10 minutos
   porque compila la aplicación entera.
6. Cuando ponga **Live**, arriba tienes la dirección:
   `https://estudia-algo.onrender.com`. Ábrela.
7. Crea tu cuenta desde la propia aplicación. La primera que se registra es la
   tuya; nadie más puede ver tus documentos.

Eso es todo. A partir de ahí, cada vez que se suba código al repositorio, Render
vuelve a desplegar solo.

### Lo que cuesta y por qué

El disco es lo que hace que tus PDF y tu progreso **sigan ahí** después de cada
despliegue, y Render solo ofrece discos en los planes de pago: unos **7 $/mes**
el más pequeño (`starter`, 512 MB de memoria). Es suficiente para temarios
normales.

Si vas a reconocer libros escaneados enteros de 400 páginas, el plan `standard`
(2 GB de memoria, unos 25 $/mes) va bastante mejor. Se cambia desde el panel de
Render, o en `render.yaml`:

```yaml
plan: standard
# y con más memoria puedes acelerar el reconocimiento:
- key: OCR_CONCURRENCY
  value: "3"
- key: OCR_SCALE
  value: "1.6"
```

### Resúmenes reescritos con IA (opcional)

Sin clave, la aplicación funciona con el motor extractivo: frases literales del
PDF, sin inventar nada. Si quieres que los resúmenes se **reescriban y expliquen**
adaptados a tu nivel:

1. Saca una clave en [console.anthropic.com](https://console.anthropic.com).
2. En Render: tu servicio → **Environment** → **Add Environment Variable** →
   `ANTHROPIC_API_KEY` con el valor de la clave.
3. Guarda. Render reinicia solo.

La clave vive únicamente en el servidor: **nunca llega al navegador**. Se cobra
por uso a tu cuenta de Anthropic.

---

## Paso 2 · Instalarla en el móvil

Abre la dirección de tu aplicación en el móvil y entra con tu cuenta. Aparecerá
un aviso abajo ofreciéndote instalarla. Si lo has cerrado:

**iPhone y iPad (Safari).** Toca **Compartir** (el cuadrado con la flecha) →
**Añadir a pantalla de inicio** → **Añadir**. Tiene que ser Safari: desde Chrome
en iOS no se puede.

**Android (Chrome).** Toca los tres puntos → **Instalar aplicación** (o **Añadir
a pantalla de inicio**).

**Ordenador (Chrome o Edge).** El icono de instalar aparece a la derecha de la
barra de direcciones.

Queda como cualquier otra aplicación: icono propio, pantalla completa, sin barra
del navegador, y arranca al instante porque la interfaz se guarda en el
dispositivo.

### Qué funciona sin conexión

- La aplicación **abre** aunque no haya red, con lo último que hayas visto.
- El **audio que hayas descargado** suena sin conexión.
- Subir un PDF, procesarlo y guardar progreso **necesitan conexión**: el trabajo
  pesado lo hace el servidor.

---

## Otras formas de tenerla

### En tu propio ordenador

Sin servidores ni costes, pero solo accesible desde casa:

```bash
docker compose up
```

Y abre `http://localhost:3000`. Los datos quedan en un volumen de Docker, así
que no se pierden al reiniciar.

### En otro alojamiento

Sirve cualquier sitio que ejecute contenedores con un disco persistente
(Railway, Fly.io, un VPS con Docker). Lo único imprescindible:

| Necesita | Por qué |
| --- | --- |
| Un disco persistente en `/data` | Ahí viven la base de datos y los PDF. |
| Al menos 512 MB de memoria | El reconocimiento de texto rasteriza páginas. |
| Procesos largos, no *serverless* | Un libro entero tarda minutos, no segundos. |
| `AUTH_SECRET` fijo | Si cambia, se cierran todas las sesiones. |

**Vercel no sirve** para esta aplicación: sus funciones se cortan a los pocos
segundos y no tienen disco, y aquí el procesado de un temario dura minutos.

### Aplicación nativa de la App Store

Es posible envolver la web en una app nativa con Capacitor, pero conviene saber
lo que implica: sigue haciendo falta el servidor publicado, una cuenta de
desarrollador de Apple (99 €/año), un Mac para compilar para iOS y pasar la
revisión de Apple cada vez. Para lo que esta aplicación hace, la instalación
desde el navegador da exactamente el mismo resultado en el móvil, hoy y gratis.
