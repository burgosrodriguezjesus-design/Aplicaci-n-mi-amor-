# Pruebas sin servidor

Comprueban las piezas que más caro salen cuando fallan, sin tener que levantar
la aplicación entera.

```bash
npm run test:estructura      # el motor entiende el índice de un temario
npm run test:almacenamiento  # el guardado compatible con S3
npm run test:blob            # el guardado en Vercel Blob
npm run test:almacen-db      # el guardado dentro de la base de datos
```

| Prueba | Qué asegura |
| --- | --- |
| `estructura.mts` | Lee el índice del libro, pone los niveles buenos, cuadra las páginas impresas con las del PDF y no pierde datos con unidades. |
| `almacenamiento.mts` | El driver S3 firma bien. El servidor de prueba **verifica la firma con una librería independiente** (`aws4`) y contesta 403 si no cuadra, igual que haría Cloudflare R2: si la ida y vuelta funciona, la firma es correcta. |
| `reanudar-ocr.mts` | Un reconocimiento cortado a mitad se reanuda donde iba en vez de empezar de cero. Es lo que hace viable un libro escaneado en un alojamiento gratuito, que se duerme solo. |
| `rebanadas.mjs` | El procesado se puede partir en tandas cortas y el material final es el mismo. Es lo que permite publicarla donde cada petición se corta a los 60 segundos. |
| `almacen-db.mts` | Los ficheros se pueden guardar dentro de la propia base de datos, con un PDF de 3 MB de verdad: es lo que permite publicar la aplicación creando una sola cosa. |
| `blob.mts` | El almacenamiento de Vercel se usa como toca: rutas privadas, sin sufijos aleatorios, y borrar algo que ya no está no es un error. El servicio real no se puede levantar en local, así que el cliente se sustituye por uno que apunta con qué argumentos se le llama. |
| `sesiones.mjs` | Sin `AUTH_SECRET`, la aplicación se genera uno y lo guarda: la sesión sobrevive a un reinicio en vez de echar a todo el mundo en cada despliegue. |

## La prueba de reanudación

Necesita una base de datos PostgreSQL y un almacenamiento S3. Para tenerlos en
local, sin cuentas en ningún sitio:

```bash
# Un S3 que verifica firmas y guarda en disco
node tests/unit/s3-servidor.mjs 8978 /tmp/s3-local &

# Con PostgreSQL ya en marcha:
export DATABASE_URL="postgresql://usuario@127.0.0.1:5432/estudia"
export STORAGE_DRIVER=s3
export STORAGE_S3_ENDPOINT=http://127.0.0.1:8978
export STORAGE_S3_BUCKET=apuntes
export STORAGE_S3_ACCESS_KEY_ID=CLAVE_DE_PRUEBA
export STORAGE_S3_SECRET_ACCESS_KEY=secreto_de_prueba

npm run db:push
npm run test:reanudar
```

## La prueba de tandas

Simula un alojamiento sin servidor: tandas cortas y sin cola de fondo, igual que
en Vercel.

```bash
JOB_SLICE_SECONDS=8 JOB_BACKGROUND=false npm start &
npm run test:rebanadas
```

Comprueba que hace falta más de una tanda, que alguna pide continuar y que al
final hay resumen, esquema, audio y el texto reconocido intacto.

Esa misma configuración sirve para pasar la prueba de humo completa
(`npm run test:smoke`) sobre PostgreSQL y S3, que es exactamente lo que corre en
el alojamiento gratuito.

## La prueba de sesiones

Necesita reiniciar el servidor a mitad, así que va en dos fases:

```bash
npm start &                                   # sin AUTH_SECRET
SESION_FASE=abrir node tests/unit/sesiones.mjs
# reinicia el servidor
SESION_FASE=comprobar node tests/unit/sesiones.mjs
```
