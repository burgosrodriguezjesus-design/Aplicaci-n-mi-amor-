#!/usr/bin/env node
/**
 * Comprueba que el procesado se puede partir en rebanadas y acabar igual.
 *
 * Es lo que hace posible publicarla donde cada petición se corta a los 60
 * segundos (Vercel y parecidos): ninguna rebanada termina el trabajo, pero
 * entre todas sí, y el material final tiene que ser el mismo que si se
 * hubiera hecho de una tirada.
 *
 * Necesita la aplicación levantada con rebanadas cortas:
 *   JOB_SLICE_SECONDS=2 npm start
 *   node tests/unit/rebanadas.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const base = process.env.APP_URL || "http://localhost:3000";
const PDF = process.env.REBANADAS_PDF || "tests/fixtures/escaneado-largo.pdf";

let fallos = 0;
const comprobar = (titulo, ok, detalle) => {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo);
  if (!ok) {
    fallos += 1;
    if (detalle) console.log("      " + detalle);
  }
};

const galletas = [];
async function call(ruta, init = {}) {
  const respuesta = await fetch(base + ruta, {
    ...init,
    headers: { ...(init.headers || {}), cookie: galletas.join("; ") },
  });
  for (const galleta of respuesta.headers.getSetCookie?.() ?? []) {
    galletas.push(galleta.split(";")[0]);
  }
  const tipo = respuesta.headers.get("content-type") ?? "";
  return {
    status: respuesta.status,
    body: tipo.includes("json") ? await respuesta.json() : await respuesta.text(),
  };
}

await call("/api/auth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Prueba Rebanadas",
    email: `rebanadas-${Date.now()}@prueba.local`,
    password: "contrasena-de-prueba",
    educationLevel: "FP",
  }),
});

const pdf = await readFile(path.join(raiz, PDF));
const formulario = new FormData();
formulario.append("file", new Blob([pdf], { type: "application/pdf" }), path.basename(PDF));
formulario.append("title", "Prueba de rebanadas");

const subida = await call("/api/documents", { method: "POST", body: formulario });
comprobar("se acepta el PDF", subida.status === 201, JSON.stringify(subida.body).slice(0, 200));
if (subida.status !== 201) process.exit(1);
const id = subida.body.document.id;

// Aquí está la gracia: cada llamada empuja el trabajo un poco, como haría la
// aplicación en el navegador, y se cuenta cuántas han hecho falta.
const inicio = Date.now();
let rebanadas = 0;
let continuaron = 0;
let estado;

for (;;) {
  const tick = await call("/api/jobs/tick", { method: "POST" });
  rebanadas += 1;
  if (tick.body?.pending) continuaron += 1;

  estado = (await call(`/api/documents/${id}/status`)).body?.document ?? {};
  if (estado.status === "READY" || estado.status === "FAILED") break;
  if (Date.now() - inicio > 300000) break;
  if (!tick.body?.pending) await new Promise((r) => setTimeout(r, 300));
}

const segundos = (Date.now() - inicio) / 1000;
console.log(`\n  ${rebanadas} rebanadas · ${segundos.toFixed(1)} s · ${estado.pageCount} páginas`);

comprobar("el documento acaba listo", estado.status === "READY", estado.errorMessage ?? "");
comprobar("ha hecho falta más de una rebanada", rebanadas > 1, `rebanadas: ${rebanadas}`);
comprobar("alguna rebanada pidió continuar", continuaron > 0);

// El detalle devuelve document, summary, outline y tracks al mismo nivel.
const detalle = (await call(`/api/documents/${id}`)).body ?? {};
comprobar("hay resumen", Boolean(detalle.summary?.sections?.length));
comprobar("hay esquema", Boolean(detalle.outline));
comprobar("hay audio", (detalle.tracks?.length ?? 0) > 0);
comprobar("se ha reconocido el texto", estado.usedOcr === true);

const texto = (detalle.summary?.sections ?? []).map((s) => s.markdown).join("\n");
for (const clave of ["tension", "amperios", "IMPORTANTE"]) {
  comprobar(`el resumen conserva «${clave}»`, texto.toLowerCase().includes(clave.toLowerCase()));
}

await call(`/api/documents/${id}`, { method: "DELETE" });
console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nEl troceado funciona");
process.exit(fallos ? 1 : 0);
