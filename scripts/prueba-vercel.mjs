#!/usr/bin/env node
/**
 * Prueba con los limites de Vercel.
 *
 * Vercel corta cualquier peticion o respuesta de mas de 4,5 MB antes de que
 * llegue a la aplicacion, y contesta en texto plano. En el ordenador eso no
 * pasa, asi que un PDF escaneado grande funcionaba aqui y fallaba publicado
 * ("Respuesta inesperada del servidor").
 *
 * Este script pone delante de la aplicacion un intermediario que aplica esos
 * mismos limites y hace el recorrido completo con un PDF escaneado de mas de
 * 4,5 MB: subirlo (por trozos, como la interfaz), procesarlo con OCR y
 * volver a descargarlo (por tramos, como el visor).
 *
 *   BASE_URL=http://localhost:3000 node scripts/prueba-vercel.mjs [pdf]
 *
 * Prueba la lectura de escaneados en el SERVIDOR. Con VERCEL=1 el servidor no
 * lee (lo hace el dispositivo), así que arráncalo con OCR_EN_SERVIDOR=1.
 * La lectura en el dispositivo se prueba con un navegador de verdad.
 */
import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DESTINO = new URL(process.env.BASE_URL ?? "http://localhost:3000");
const LIMITE = 4.5 * 1024 * 1024;
const FICHERO = process.argv[2] ?? "tests/fixtures/escaneado-largo.pdf";

let fallos = 0;
function comprobar(titulo, ok, detalle = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${titulo}${!ok && detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
}

/* ── Intermediario con los limites de Vercel ─────────────────── */

const intermediario = http.createServer((entrada, salida) => {
  const trozos = [];
  let tamano = 0;
  entrada.on("data", (trozo) => {
    tamano += trozo.length;
    trozos.push(trozo);
  });
  entrada.on("end", () => {
    if (tamano > LIMITE) {
      salida.writeHead(413, { "content-type": "text/plain" });
      salida.end("Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE");
      return;
    }
    const peticion = http.request(
      {
        host: DESTINO.hostname,
        port: DESTINO.port,
        path: entrada.url,
        method: entrada.method,
        headers: { ...entrada.headers, host: DESTINO.host },
      },
      (respuesta) => {
        const partes = [];
        respuesta.on("data", (parte) => partes.push(parte));
        respuesta.on("end", () => {
          const cuerpo = Buffer.concat(partes);
          if (cuerpo.length > LIMITE) {
            salida.writeHead(500, { "content-type": "text/plain" });
            salida.end("FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE");
            return;
          }
          const cabeceras = { ...respuesta.headers };
          delete cabeceras["transfer-encoding"];
          cabeceras["content-length"] = String(cuerpo.length);
          salida.writeHead(respuesta.statusCode ?? 502, cabeceras);
          salida.end(cuerpo);
        });
      },
    );
    peticion.on("error", (error) => {
      salida.writeHead(502, { "content-type": "text/plain" });
      salida.end(String(error));
    });
    peticion.end(Buffer.concat(trozos));
  });
});

await new Promise((listo) => intermediario.listen(0, "127.0.0.1", listo));
const BASE = `http://127.0.0.1:${intermediario.address().port}`;

/* ── Cliente ─────────────────────────────────────────────────── */

let cookie = "";
async function llamar(ruta, opciones = {}) {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { ...(opciones.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  const galleta = respuesta.headers.get("set-cookie");
  if (galleta) cookie = galleta.split(";")[0];
  return respuesta;
}
async function json(ruta, opciones = {}) {
  const respuesta = await llamar(ruta, opciones);
  const texto = await respuesta.text();
  let cuerpo;
  try {
    cuerpo = texto ? JSON.parse(texto) : {};
  } catch {
    cuerpo = { texto };
  }
  return { status: respuesta.status, body: cuerpo };
}
const huella = (datos) => createHash("sha256").update(datos).digest("hex");

try {
  const pdf = await readFile(FICHERO);
  console.log(
    `\nPrueba con los límites de Vercel (4,5 MB) · ${path.basename(FICHERO)} · ` +
      `${(pdf.length / 1024 / 1024).toFixed(1)} MB\n`,
  );

  const registro = await json("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Prueba Vercel",
      email: `vercel-${randomUUID().slice(0, 8)}@estudia.test`,
      password: "contrasena-de-prueba",
      educationLevel: "UNIVERSIDAD",
    }),
  });
  comprobar("se crea la cuenta", registro.status === 201, JSON.stringify(registro.body));

  console.log("\n1. El fallo que se veía");
  const formulario = new FormData();
  formulario.append("file", new Blob([pdf], { type: "application/pdf" }), "escaneado.pdf");
  const deUnaVez = await llamar("/api/documents", { method: "POST", body: formulario });
  const textoDeUnaVez = await deUnaVez.text();
  let esJson = true;
  try {
    JSON.parse(textoDeUnaVez);
  } catch {
    esJson = false;
  }
  comprobar(
    "de una sola vez, Vercel lo rechaza sin JSON (por eso «Respuesta inesperada»)",
    pdf.length <= LIMITE || (deUnaVez.status === 413 && !esJson),
    `status ${deUnaVez.status}`,
  );

  console.log("\n2. Subida por trozos, como la interfaz");
  const inicio = await json("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Apuntes escaneados.pdf", size: pdf.length }),
  });
  comprobar("se abre la subida", inicio.status === 200, JSON.stringify(inicio.body));
  const { uploadId, chunkBytes, parts } = inicio.body;
  comprobar("en varios trozos por debajo del límite", parts > 1 && chunkBytes < LIMITE);

  let todosBien = true;
  for (let parte = 0; parte < parts; parte++) {
    const trozo = pdf.subarray(parte * chunkBytes, (parte + 1) * chunkBytes);
    const r = await json(`/api/uploads/${uploadId}/${parte}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: trozo,
    });
    if (r.status !== 200) {
      todosBien = false;
      comprobar(`trozo ${parte + 1}`, false, `${r.status} ${JSON.stringify(r.body)}`);
    }
  }
  comprobar(`llegan los ${parts} trozos`, todosBien);

  const ajeno = await json(`/api/uploads/${uploadId}/999999`, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: Buffer.from("x"),
  });
  comprobar("se rechaza un trozo fuera de rango", ajeno.status === 400);

  const fin = await json(`/api/uploads/${uploadId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Apuntes escaneados.pdf",
      parts,
      summaryDepth: "DETALLADO",
      educationLevel: "UNIVERSIDAD",
    }),
  });
  comprobar("se crea el documento", fin.status === 201, JSON.stringify(fin.body));
  const id = fin.body?.document?.id;
  if (!id) throw new Error("sin documento no se puede seguir");

  const repetida = await json(`/api/uploads/${uploadId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "x.pdf", parts }),
  });
  comprobar("los trozos se borran al terminar", repetida.status === 409);

  console.log("\n3. Procesado con reconocimiento de texto");
  // Como la aplicacion: si hay paginas escaneadas, ayudantes en paralelo.
  const AYUDANTES = Number(process.env.AYUDANTES ?? 3);
  let ayudando = 0;
  const ayudar = async () => {
    ayudando += 1;
    try {
      for (;;) {
        const t0 = Date.now();
        const r = await json("/api/jobs/ocr", { method: "POST" });
        if (process.env.DEPURAR) console.log(`    ayudante: ${r.status} ${JSON.stringify(r.body)} ${Date.now() - t0} ms`);
        if (r.status !== 200 || !r.body?.pending) return;
      }
    } finally {
      ayudando -= 1;
    }
  };
  let procesando = true;
  const vigia = (async () => {
    while (procesando && AYUDANTES > 0) {
      if (ayudando === 0) {
        const r = await json("/api/jobs/ocr", { method: "POST" });
        if (r.body?.pending) {
          while (ayudando < AYUDANTES) void ayudar();
          continue;
        }
      }
      await new Promise((listo) => setTimeout(listo, 4000));
    }
  })();
  const inicioProcesado = Date.now();
  const limite = Date.now() + 30 * 60_000;
  let estado = null;
  let ultimoMensaje = "";
  while (Date.now() < limite) {
    const t1 = Date.now();
    const rebanada = await json("/api/jobs/tick", { method: "POST" });
    if (process.env.DEPURAR) console.log(`    rebanada: ${JSON.stringify(rebanada.body)} ${Date.now() - t1} ms`);
    if (rebanada.body?.ocr) while (ayudando < AYUDANTES) void ayudar();
    estado = (await json(`/api/documents/${id}/status`)).body?.document ?? null;
    if (!estado || estado.status === "READY" || estado.status === "FAILED") break;
    if (estado.statusMessage && estado.statusMessage !== ultimoMensaje) {
      ultimoMensaje = estado.statusMessage;
      console.log(`    · ${ultimoMensaje}`);
    }
    if (!rebanada.body?.pending) await new Promise((listo) => setTimeout(listo, 800));
  }
  procesando = false;
  await vigia;
  console.log(`    (${Math.round((Date.now() - inicioProcesado) / 1000)} s con ${AYUDANTES} ayudantes)`);
  comprobar("termina bien", estado?.status === "READY", estado?.errorMessage ?? estado?.status);
  comprobar("todas las páginas con texto", estado?.textCoverage === 100, `${estado?.textCoverage}%`);

  const detalle = (await json(`/api/documents/${id}`)).body;
  const resumen = (detalle?.summary?.sections ?? []).map((s) => s.markdown).join("\n");
  comprobar("hay resumen", resumen.length > 500, `${resumen.length} caracteres`);

  console.log("\n4. El visor, por tramos");
  const trozos = [];
  let recibidos = 0;
  let total = Infinity;
  let maximo = 0;
  while (recibidos < total) {
    const r = await llamar(`/api/documents/${id}/file`, {
      headers: { Range: `bytes=${recibidos}-${recibidos + 3 * 1024 * 1024 - 1}` },
    });
    if (r.status !== 206) {
      comprobar("responde por tramos", false, `status ${r.status}`);
      break;
    }
    total = Number(/\/(\d+)$/.exec(r.headers.get("content-range") ?? "")?.[1]);
    const datos = Buffer.from(await r.arrayBuffer());
    maximo = Math.max(maximo, datos.length);
    trozos.push(datos);
    recibidos += datos.length;
  }
  comprobar("ningún tramo pasa del límite", maximo > 0 && maximo < LIMITE);
  comprobar("el PDF descargado es idéntico al subido", huella(Buffer.concat(trozos)) === huella(pdf));

  const entero = await llamar(`/api/documents/${id}/file`);
  comprobar(
    "pedido entero, Vercel lo cortaría (por eso el visor va por tramos)",
    pdf.length <= LIMITE || entero.status === 500,
    `status ${entero.status}`,
  );

  await llamar(`/api/documents/${id}`, { method: "DELETE" });
} catch (error) {
  comprobar("la prueba se ha podido completar", false, String(error?.stack ?? error));
} finally {
  intermediario.close();
}

console.log(fallos ? `\n${fallos} comprobación(es) con fallos\n` : "\nTodo bien con los límites de Vercel\n");
process.exit(fallos ? 1 : 0);
