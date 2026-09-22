# Pruebas sin servidor

Comprueban las piezas que más caro salen cuando fallan, sin tener que levantar
la aplicación entera.

```bash
npm run test:estructura      # el motor entiende el índice de un temario
npm run test:almacenamiento  # el guardado compatible con S3
```

| Prueba | Qué asegura |
| --- | --- |
| `estructura.mts` | Lee el índice del libro, pone los niveles buenos, cuadra las páginas impresas con las del PDF y no pierde datos con unidades. |
| `almacenamiento.mts` | El driver S3 firma bien. El servidor de prueba **verifica la firma con una librería independiente** (`aws4`) y contesta 403 si no cuadra, igual que haría Cloudflare R2: si la ida y vuelta funciona, la firma es correcta. |
| `reanudar-ocr.mts` | Un reconocimiento cortado a mitad se reanuda donde iba en vez de empezar de cero. Es lo que hace viable un libro escaneado en un alojamiento gratuito, que se duerme solo. |

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

Esa misma configuración sirve para pasar la prueba de humo completa
(`npm run test:smoke`) sobre PostgreSQL y S3, que es exactamente lo que corre en
el alojamiento gratuito.
