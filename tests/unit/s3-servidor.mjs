#!/usr/bin/env node
/**
 * Un S3 de mentira, pero que habla S3 de verdad: verifica cada firma con
 * `aws4` y guarda los objetos en disco. Sirve para probar la configuración
 * gratuita (PostgreSQL + almacenamiento S3) sin cuentas en ningún sitio.
 *
 *   node tests/unit/s3-servidor.mjs [puerto] [directorio]
 */
import { createServer } from "node:http";
import { mkdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import aws4 from "aws4";

const PUERTO = Number(process.argv[2] || 8978);
const RAIZ = path.resolve(process.argv[3] || "/tmp/s3-local");
const CLAVE = process.env.S3_FAKE_KEY || "CLAVE_DE_PRUEBA";
const SECRETO = process.env.S3_FAKE_SECRET || "secreto_de_prueba";

function firmaCorrecta(metodo, ruta, cabeceras) {
  const auth = String(cabeceras.authorization ?? "");
  const partes = /SignedHeaders=([^,]+), Signature=([0-9a-f]+)/.exec(auth);
  if (!partes) return false;

  const firmadas = {};
  for (const nombre of partes[1].split(";")) {
    if (nombre === "host") continue;
    const valor = cabeceras[nombre];
    if (typeof valor === "string") firmadas[nombre] = valor;
  }

  const esperada = aws4.sign(
    {
      host: `127.0.0.1:${PUERTO}`,
      method: metodo,
      path: ruta,
      service: "s3",
      region: "auto",
      headers: firmadas,
      body: undefined,
    },
    { accessKeyId: CLAVE, secretAccessKey: SECRETO },
  );
  return esperada.headers.Authorization === auth;
}

const rutaEnDisco = (url) =>
  path.join(RAIZ, decodeURIComponent(url).replace(/^\/+/, "").replace(/\.\./g, "_"));

const servidor = createServer((req, res) => {
  const trozos = [];
  req.on("data", (t) => trozos.push(t));
  req.on("end", async () => {
    if (!firmaCorrecta(req.method, req.url, req.headers)) {
      res.writeHead(403).end("SignatureDoesNotMatch");
      return;
    }
    const destino = rutaEnDisco(req.url);
    try {
      if (req.method === "PUT") {
        await mkdir(path.dirname(destino), { recursive: true });
        await writeFile(destino, Buffer.concat(trozos));
        res.writeHead(200).end();
      } else if (req.method === "DELETE") {
        await unlink(destino).catch(() => undefined);
        res.writeHead(204).end();
      } else if (req.method === "HEAD") {
        const info = await stat(destino);
        res.writeHead(200, { "content-length": String(info.size) }).end();
      } else {
        res.writeHead(200).end(await readFile(destino));
      }
    } catch {
      res.writeHead(404).end();
    }
  });
});

servidor.listen(PUERTO, "127.0.0.1", () => {
  console.log(`S3 de prueba en http://127.0.0.1:${PUERTO} → ${RAIZ}`);
});
