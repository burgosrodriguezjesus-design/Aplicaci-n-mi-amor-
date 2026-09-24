#!/bin/sh
set -e

# Si no se ha indicado un secreto de sesión, se genera uno y se guarda en el
# volumen: así las sesiones sobreviven a los reinicios sin pedirte nada.
if [ -z "$AUTH_SECRET" ]; then
  SECRET_FILE=/data/.auth-secret
  if [ ! -f "$SECRET_FILE" ]; then
    node -e "console.log(require('crypto').randomBytes(48).toString('base64'))" > "$SECRET_FILE"
  fi
  AUTH_SECRET=$(cat "$SECRET_FILE")
  export AUTH_SECRET
fi

mkdir -p "${STORAGE_DIR:-/data/storage}"

# La imagen se construye sin saber que base de datos habra: en un alojamiento
# gratuito es PostgreSQL y en casa SQLite, y eso lo decide DATABASE_URL en el
# momento de arrancar. Por eso el esquema y el cliente se ajustan aqui, no al
# construir, y despues se crean o actualizan las tablas.
PRISMA_SCHEMA_QUIET=1 node scripts/prisma-schema.mjs
npx prisma generate --schema=prisma/schema.runtime.prisma >/dev/null
npx prisma db push --schema=prisma/schema.runtime.prisma --skip-generate >/dev/null

echo "alicIA listo en http://localhost:3000"
exec "$@"
