#!/usr/bin/env node
/**
 * Cada cuenta ve solo lo suyo. Ana sube un documento y crea una asignatura;
 * Bea, con su propia sesión, intenta leerlo, descargarlo, regenerarlo,
 * borrarlo, colgar cosas en la asignatura de Ana… y nada de eso puede
 * funcionar. Sin sesión, tampoco. Al final se comprueba que lo de Ana sigue
 * intacto.
 *
 *   APP_URL=http://localhost:3000 node tests/e2e/aislamiento.mjs
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.APP_URL || "http://localhost:3000";

let fallos = 0;
function comprobar(titulo, ok, detalle = "") {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo + (!ok && detalle ? ` — ${detalle}` : ""));
  if (!ok) fallos += 1;
}

function cliente() {
  let cookie = "";
  return async function call(ruta, opciones = {}) {
    const res = await fetch(BASE + ruta, {
      ...opciones,
      headers: {
        ...(opciones.json ? { "content-type": "application/json" } : {}),
        ...(opciones.headers ?? {}),
        ...(cookie ? { cookie } : {}),
      },
      body: opciones.json ? JSON.stringify(opciones.json) : opciones.body,
      redirect: "manual",
    });
    const galleta = res.headers.get("set-cookie");
    if (galleta) cookie = galleta.split(";")[0];
    const texto = await res.text();
    let body = {};
    try {
      body = texto ? JSON.parse(texto) : {};
    } catch {
      body = { raw: texto.slice(0, 200) };
    }
    return { status: res.status, body, texto };
  };
}

async function cuenta(nombre) {
  const call = cliente();
  const r = await call("/api/auth/register", {
    method: "POST",
    json: { name: nombre, email: `${nombre.toLowerCase()}-${randomUUID().slice(0, 8)}@estudia.test`, password: "clave-de-prueba-1", educationLevel: "FP" },
  });
  if (r.status !== 201) throw new Error(`No se pudo crear la cuenta de ${nombre}: ${r.status}`);
  return call;
}

const ana = await cuenta("Ana");
const bea = await cuenta("Bea");
const anonimo = cliente();

console.log("\n1. Ana prepara su material");
const form = new FormData();
form.append("file", new Blob([await readFile(path.join(raiz, "tests/fixtures/apuntes-demo.pdf"))], { type: "application/pdf" }), "privado.pdf");
const subida = await ana("/api/documents", { method: "POST", body: form });
const docId = subida.body?.document?.id;
comprobar("Ana sube un documento", Boolean(docId), `${subida.status}`);
const limite = Date.now() + 240_000;
let estado = null;
while (Date.now() < limite) {
  await ana("/api/jobs/tick", { method: "POST" });
  estado = (await ana(`/api/documents/${docId}/status`)).body?.document;
  if (estado?.status === "READY" || estado?.status === "FAILED") break;
  await new Promise((r) => setTimeout(r, 800));
}
comprobar("el documento de Ana queda listo", estado?.status === "READY", estado?.status);
const detalle = (await ana(`/api/documents/${docId}`)).body;
const pistaId = detalle?.tracks?.[0]?.id;
const seccionId = detalle?.summary?.sections?.[0]?.id;
const asignatura = (await ana("/api/subjects", { method: "POST", json: { name: "Privada", emoji: "📘", color: "#6a5cff" } })).body;
const asignaturaId = asignatura?.subject?.id ?? asignatura?.id;
comprobar("Ana crea una asignatura", Boolean(asignaturaId), JSON.stringify(asignatura).slice(0, 120));
const tema = (await ana(`/api/subjects/${asignaturaId}/topics`, { method: "POST", json: { name: "Tema secreto" } })).body;
const temaId = tema?.topic?.id ?? tema?.id;

const bloqueado = (r) => r.status === 401 || r.status === 403 || r.status === 404;

for (const [quien, call] of [["Bea (otra cuenta)", bea], ["sin sesión", anonimo]]) {
  console.log(`\n2. ${quien} intenta tocar lo de Ana`);
  const intentos = [
    ["ver el documento", `/api/documents/${docId}`, {}],
    ["ver su estado", `/api/documents/${docId}/status`, {}],
    ["descargar el resumen", `/api/documents/${docId}/export`, {}],
    ["descargar el PDF", `/api/documents/${docId}/file`, {}],
    ["cambiarle el título", `/api/documents/${docId}`, { method: "PATCH", json: { title: "robado" } }],
    ["regenerarlo", `/api/documents/${docId}/regenerate`, { method: "POST", json: { target: "summary" } }],
    ["regenerar un apartado", `/api/documents/${docId}/regenerate`, { method: "POST", json: { target: "section", sectionId: seccionId } }],
    ["releerlo", `/api/documents/${docId}/releer`, { method: "POST", json: {} }],
    ["mandarle páginas", `/api/documents/${docId}/paginas`, { method: "POST", json: { paginas: [{ numero: 1, texto: "x" }] } }],
    ["pedirle OCR", `/api/documents/${docId}/ocr`, { method: "POST", json: {} }],
    ["prepararle audio", `/api/documents/${docId}/tracks`, { method: "POST", json: { source: "DOCUMENT" } }],
    ["apuntar progreso en él", "/api/progress", { method: "POST", json: { documentId: docId, completedSectionId: seccionId, readSeconds: 5 } }],
    ["escuchar su audio", `/api/audio/${pistaId}`, {}],
    ["escuchar su audio en streaming", `/api/audio/${pistaId}/stream`, {}],
    ["renombrar su asignatura", `/api/subjects/${asignaturaId}`, { method: "PATCH", json: { name: "robada" } }],
    ["crear un tema en su asignatura", `/api/subjects/${asignaturaId}/topics`, { method: "POST", json: { name: "intruso" } }],
    ["renombrar su tema", `/api/topics/${temaId}`, { method: "PATCH", json: { name: "robado" } }],
    ["borrar su tema", `/api/topics/${temaId}`, { method: "DELETE" }],
    ["borrar su asignatura", `/api/subjects/${asignaturaId}`, { method: "DELETE" }],
    ["borrar el documento", `/api/documents/${docId}`, { method: "DELETE" }],
  ];
  for (const [que, ruta, opciones] of intentos) {
    const r = await call(ruta, opciones);
    comprobar(`no puede ${que}`, bloqueado(r), `${r.status} ${r.texto.slice(0, 80)}`);
  }
  const lista = await call("/api/documents");
  const ids = (lista.body?.documents ?? []).map((d) => d.id);
  comprobar("en su lista no aparece lo de Ana", !ids.includes(docId));
  const asignaturas = await call("/api/subjects");
  comprobar("ni sus asignaturas", !JSON.stringify(asignaturas.body).includes(asignaturaId));
}

console.log("\n3. Bea no puede colgar su documento en la asignatura de Ana");
{
  const f = new FormData();
  f.append("file", new Blob([await readFile(path.join(raiz, "tests/fixtures/apuntes-demo.pdf"))], { type: "application/pdf" }), "bea.pdf");
  f.append("subjectId", asignaturaId);
  f.append("topicId", temaId);
  const r = await bea("/api/documents", { method: "POST", body: f });
  const suyo = r.body?.document;
  comprobar(
    "no acaba dentro de la asignatura ajena",
    !suyo || (suyo.subjectId !== asignaturaId && suyo.subject?.id !== asignaturaId),
    JSON.stringify(suyo ?? r.body).slice(0, 160),
  );
  if (suyo?.id) {
    const p = await bea(`/api/documents/${suyo.id}`, { method: "PATCH", json: { subjectId: asignaturaId, topicId: temaId } });
    const despues = (await bea(`/api/documents/${suyo.id}`)).body?.document;
    comprobar("ni moviéndolo después", p.status >= 400 || despues?.subject?.id !== asignaturaId, `${p.status}`);
    await bea(`/api/documents/${suyo.id}`, { method: "DELETE" });
  }
}

console.log("\n4. Lo de Ana sigue intacto");
{
  const d = await ana(`/api/documents/${docId}`);
  comprobar("el documento sigue ahí", d.status === 200);
  comprobar("con su título", d.body?.document?.title === detalle?.document?.title);
  comprobar("y su resumen", (d.body?.summary?.sections?.length ?? 0) === (detalle?.summary?.sections?.length ?? -1));
  const a = await ana("/api/subjects");
  const texto = JSON.stringify(a.body);
  comprobar("la asignatura se llama igual", texto.includes("Privada") && !texto.includes("robada"));
  comprobar("el tema sigue y sin intrusos", texto.includes("Tema secreto") && !texto.includes("intruso"));
  await ana(`/api/documents/${docId}`, { method: "DELETE" });
  await ana(`/api/subjects/${asignaturaId}`, { method: "DELETE" });
}

console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nCada cuenta ve solo lo suyo");
process.exit(fallos ? 1 : 0);
