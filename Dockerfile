# Imagen lista para probar alicIA con un solo comando.
# Usa Debian (no Alpine) porque el rasterizado de páginas escaneadas
# depende de un binario nativo compilado contra glibc.
FROM node:22-slim

WORKDIR /app

# Playwright solo se usa para las pruebas en un navegador real: aquí no debe
# descargarse ningún navegador, que son cientos de megas y alargan el despliegue.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=0

# Dependencias primero, para aprovechar la caché de capas.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --fund=false

COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# La base de datos y los ficheros viven en un volumen, para que no se pierdan
# al reconstruir la imagen.
ENV DATABASE_URL="file:/data/estudia.db"
ENV STORAGE_DIR="/data/storage"

RUN npm run build

RUN mkdir -p /data/storage
VOLUME ["/data"]
EXPOSE 3000

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["npm", "start"]
