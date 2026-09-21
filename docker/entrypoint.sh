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

# Crea o actualiza las tablas antes de arrancar.
npx prisma db push --skip-generate >/dev/null

echo "EstudIA listo en http://localhost:3000"
exec "$@"
