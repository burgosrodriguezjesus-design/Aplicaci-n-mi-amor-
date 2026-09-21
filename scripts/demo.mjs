/**
 * Prepara una cuenta de prueba con material ya procesado.
 *
 *   node scripts/demo.mjs                  (servidor en http://localhost:3000)
 *   BASE_URL=http://localhost:3210 node scripts/demo.mjs
 *
 * Crea la cuenta demo@estudia.local, sube el PDF de ejemplo y espera a que el
 * material esté listo. Después solo hay que entrar y mirar.
 */

import { readFile } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = "demo@estudia.local";
const PASSWORD = "estudia1234";

let cookie = "";

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

const json = { "content-type": "application/json" };

console.log(`\nPreparando la demo en ${BASE}\n`);

const register = await call("/api/auth/register", {
  method: "POST",
  headers: json,
  body: JSON.stringify({
    name: "Estudiante de prueba",
    email: EMAIL,
    password: PASSWORD,
    educationLevel: "FP",
  }),
});

if (register.status === 409) {
  const login = await call("/api/auth/login", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (login.status !== 200) {
    console.error("La cuenta ya existe pero la contraseña no coincide.");
    process.exit(1);
  }
  console.log("· Cuenta de demostración reutilizada");
} else if (register.status === 201) {
  console.log("· Cuenta de demostración creada");
} else {
  console.error("No se ha podido crear la cuenta:", register.body);
  process.exit(1);
}

const subject = await call("/api/subjects", {
  method: "POST",
  headers: json,
  body: JSON.stringify({ name: "Electricidad", emoji: "⚡", color: "#f59e0b" }),
});
const subjectId = subject.body?.subject?.id;
if (subjectId) {
  await call(`/api/subjects/${subjectId}/topics`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ name: "Tema 1" }),
  });
  console.log("· Asignatura «Electricidad» lista");
}

const pdf = await readFile("tests/fixtures/apuntes-demo.pdf");
const form = new FormData();
form.append("file", new Blob([pdf], { type: "application/pdf" }), "Fundamentos eléctricos.pdf");
form.append("title", "Fundamentos eléctricos");
form.append("summaryDepth", "DETALLADO");
form.append("educationLevel", "FP");
if (subjectId) form.append("subjectId", subjectId);

const upload = await call("/api/documents", { method: "POST", body: form });
const documentId = upload.body?.document?.id;
if (!documentId) {
  console.error("No se ha podido subir el PDF:", upload.body);
  process.exit(1);
}

process.stdout.write("· Procesando el PDF");
const deadline = Date.now() + 300_000;
let status = null;
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  process.stdout.write(".");
  status = (await call(`/api/documents/${documentId}/status`)).body?.document;
  if (status?.status === "READY" || status?.status === "FAILED") break;
}
console.log("");

if (status?.status !== "READY") {
  console.error("El procesamiento no ha terminado bien:", status?.errorMessage ?? status?.status);
  process.exit(1);
}

console.log(`
✅ Demo lista.

   Entra en   ${BASE}/login
   Correo     ${EMAIL}
   Contraseña ${PASSWORD}

   El documento está en ${BASE}/documento/${documentId}
   Prueba las cuatro pestañas: PDF original, Resumen, Esquema y Audio.
`);
