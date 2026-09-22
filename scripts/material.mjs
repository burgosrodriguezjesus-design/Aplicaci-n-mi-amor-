#!/usr/bin/env node
/**
 * Convierte un PDF en material de estudio y lo deja en un solo fichero HTML.
 *
 *   npm start &                                  # la aplicación, en local
 *   node scripts/material.mjs mi-libro.pdf
 *
 * Produce dos ficheros junto al PDF:
 *   · «<titulo>.html» — resumen, esquema y audio en una página que se abre
 *     con doble clic o desde el móvil. No necesita servidor ni conexión.
 *   · «<titulo>.md»   — el resumen en texto, para imprimir o editar.
 *
 * Existe para cuando alguien solo quiere su material y no quiere desplegar
 * nada: se procesa aquí y se entrega el resultado.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.APP_URL || "http://localhost:3000";
const entrada = process.argv[2];
const NIVEL = process.env.NIVEL || "FP";
const DETALLE = process.env.DETALLE || "DETALLADO";

if (!entrada) {
  console.error("Uso: node scripts/material.mjs <fichero.pdf>");
  process.exit(1);
}

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

const pdf = await readFile(entrada);
const nombre = path.basename(entrada);
const titulo = nombre.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "Material";

console.log(`\nProcesando «${titulo}» (${(pdf.length / 1024 / 1024).toFixed(1)} MB)…\n`);

const alta = await call("/api/auth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Material de estudio",
    email: `material-${Date.now()}@estudia.local`,
    password: "contrasena-de-proceso",
    educationLevel: NIVEL,
  }),
});
if (alta.status !== 201) {
  console.error("No se ha podido preparar la sesión:", JSON.stringify(alta.body).slice(0, 300));
  process.exit(1);
}

const formulario = new FormData();
formulario.append("file", new Blob([pdf], { type: "application/pdf" }), nombre);
formulario.append("title", titulo);
formulario.append("summaryDepth", DETALLE);

const subida = await call("/api/documents", { method: "POST", body: formulario });
if (subida.status !== 201) {
  console.error("No se ha podido subir:", JSON.stringify(subida.body).slice(0, 300));
  process.exit(1);
}
const id = subida.body.document.id;

const inicio = Date.now();
let estado = {};
let ultimo = "";
for (;;) {
  const rebanada = await call("/api/jobs/tick", { method: "POST" });
  estado = (await call(`/api/documents/${id}/status`)).body?.document ?? {};
  if (estado.statusMessage && estado.statusMessage !== ultimo) {
    ultimo = estado.statusMessage;
    console.log(`  ${((Date.now() - inicio) / 1000).toFixed(0)}s · ${ultimo}`);
  }
  if (estado.status === "READY" || estado.status === "FAILED") break;
  if (!rebanada.body?.pending) await new Promise((r) => setTimeout(r, 700));
}

if (estado.status !== "READY") {
  console.error("\nNo ha salido bien:", estado.errorMessage ?? estado.status);
  process.exit(1);
}

const detalle = (await call(`/api/documents/${id}`)).body;
const pistas = [];
for (const pista of detalle.tracks ?? []) {
  const completa = (await call(`/api/audio/${pista.id}`)).body?.track;
  if (completa) pistas.push(completa);
}

const markdown = (await call(`/api/documents/${id}/export`)).body;
const salidaMd = path.join(path.dirname(entrada), `${titulo}.md`);
await writeFile(salidaMd, typeof markdown === "string" ? markdown : "");

const { construirPagina } = await import("./material-pagina.mjs");
const html = construirPagina({
  titulo,
  paginas: estado.pageCount,
  usedOcr: estado.usedOcr,
  secciones: detalle.summary?.sections ?? [],
  esquema: detalle.outline?.tree ?? null,
  pistas,
});
const salidaHtml = path.join(path.dirname(entrada), `${titulo}.html`);
await writeFile(salidaHtml, html);

await call(`/api/documents/${id}`, { method: "DELETE" });

const segundos = (Date.now() - inicio) / 1000;
console.log(
  `\nListo en ${segundos.toFixed(1)} s · ${estado.pageCount} páginas · ` +
    `${detalle.summary?.sections?.length ?? 0} apartados` +
    (estado.usedOcr ? " · texto reconocido" : ""),
);
console.log(`  ${salidaHtml}`);
console.log(`  ${salidaMd}\n`);
