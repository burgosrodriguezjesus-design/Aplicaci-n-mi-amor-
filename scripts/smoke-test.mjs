/**
 * Prueba de humo de extremo a extremo.
 *
 * Arranca contra un servidor ya en marcha (`npm run build && npm start`) y
 * recorre el flujo completo: registro → subida de un PDF real → procesamiento
 * → resumen, esquema y guiones de audio.
 *
 *   BASE_URL=http://localhost:3000 node scripts/smoke-test.mjs
 */

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const FIXTURE = "tests/fixtures/apuntes-demo.pdf";

let cookie = "";
let failures = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...(options.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: response.status, body };
}

console.log(`\nEstudIA · prueba de humo contra ${BASE}\n`);

// 1. Registro
const email = `smoke-${randomUUID().slice(0, 8)}@estudia.test`;
console.log("1. Cuenta");
const register = await call("/api/auth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Prueba Humo",
    email,
    password: "contrasena-de-prueba",
    educationLevel: "FP",
  }),
});
check("se crea la cuenta", register.status === 201, JSON.stringify(register.body));

// 2. Rechazo de ficheros que no son PDF
console.log("\n2. Validación de archivos");
const badForm = new FormData();
badForm.append("file", new Blob(["esto no es un pdf"], { type: "application/pdf" }), "falso.pdf");
const bad = await call("/api/documents", { method: "POST", body: badForm });
check("se rechaza un PDF falso", bad.status === 415, `status ${bad.status}`);

// 3. Subida real
console.log("\n3. Subida y procesamiento");
const pdf = await readFile(FIXTURE);
const form = new FormData();
form.append("file", new Blob([pdf], { type: "application/pdf" }), "apuntes-demo.pdf");
form.append("summaryDepth", "MUY_DETALLADO");
form.append("educationLevel", "FP");
const upload = await call("/api/documents", { method: "POST", body: form });
check("se acepta el PDF", upload.status === 201, JSON.stringify(upload.body));

const documentId = upload.body?.document?.id;
if (!documentId) {
  console.log("\nNo se ha podido continuar: la subida no devolvió un documento.\n");
  process.exit(1);
}

let status = null;
const deadline = Date.now() + 180_000;
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const poll = await call(`/api/documents/${documentId}/status`);
  status = poll.body?.document;
  if (!status) break;
  if (status.status === "READY" || status.status === "FAILED") break;
}
check(
  "el procesamiento termina correctamente",
  status?.status === "READY",
  status?.errorMessage ?? status?.status,
);
check("se detectan las páginas", status?.pageCount === 3, `páginas: ${status?.pageCount}`);
check("se extrae texto de todas las páginas", status?.textCoverage === 100);

// 4. Material generado
console.log("\n4. Material de estudio");
const detail = (await call(`/api/documents/${documentId}`)).body;
const summary = detail?.summary;
const outline = detail?.outline;
const tracks = detail?.tracks ?? [];

check("hay resumen", Boolean(summary?.markdown));
check("el resumen conserva la estructura del temario", /Ley de Ohm/i.test(summary?.markdown ?? ""));
check("se conservan las fórmulas", /V = I x R/i.test(summary?.markdown ?? ""));
check("se conservan los datos numéricos", /230 V/.test(summary?.markdown ?? ""));
check(
  "cada apartado referencia sus páginas",
  (summary?.sections ?? []).some((section) => section.sourcePages.length > 0),
);
check("hay esquema jerárquico", (outline?.tree?.nodes ?? []).length > 0);
check(
  "el esquema anida apartados",
  (outline?.tree?.nodes ?? []).some((node) => (node.children ?? []).length > 0),
);
check("hay pistas de audio", tracks.length > 0);
check(
  "las pistas tienen segmentos sincronizables",
  tracks.every((track) => track.segments.length > 0),
);
check(
  "las marcas de tiempo son crecientes",
  tracks.every((track) =>
    track.segments.every(
      (segment, index) => index === 0 || segment.startMs >= track.segments[index - 1].startMs,
    ),
  ),
);
check(
  "la narración traduce las fórmulas a lenguaje hablado",
  tracks.some((track) => /es igual a/i.test(track.script)),
);
check(
  "la narración no arrastra sintaxis Markdown",
  tracks.every((track) => !/[*#`]|\|/.test(track.script)),
);

// 5. Progreso
console.log("\n5. Progreso");
const firstSection = summary?.sections?.[1]?.id ?? summary?.sections?.[0]?.id;
const progress = await call("/api/progress", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ documentId, completedSectionId: firstSection, readSeconds: 30 }),
});
check("se guarda el progreso", progress.status === 200);
check("el porcentaje se calcula", (progress.body?.progress?.percent ?? 0) > 0);

const stats = await call("/api/stats");
check("el panel refleja el tiempo de estudio", (stats.body?.week?.readSeconds ?? 0) >= 30);

// 6. Regeneración de un solo apartado
console.log("\n6. Regeneración");
const regenerate = await call(`/api/documents/${documentId}/regenerate`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    target: "section",
    sectionId: firstSection,
    instructions: "Conserva más información del PDF.",
  }),
});
check("se regenera un único apartado", regenerate.status === 200, JSON.stringify(regenerate.body).slice(0, 160));

// 7. Aislamiento entre cuentas
console.log("\n7. Seguridad");
const otherCookie = cookie;
cookie = "";
const anonymous = await call(`/api/documents/${documentId}`);
check("sin sesión no se accede al documento", anonymous.status === 401);
const anonymousFile = await call(`/api/documents/${documentId}/file`);
check("sin sesión no se descarga el PDF", anonymousFile.status === 401);
cookie = otherCookie;

// 8. Limpieza
console.log("\n8. Limpieza");
const removed = await call(`/api/documents/${documentId}`, { method: "DELETE" });
check("se elimina el documento", removed.status === 200);

console.log(
  failures === 0
    ? "\n✅ Todas las comprobaciones han pasado.\n"
    : `\n❌ ${failures} comprobación(es) fallidas.\n`,
);
process.exit(failures === 0 ? 0 : 1);
