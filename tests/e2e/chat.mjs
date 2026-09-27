#!/usr/bin/env node
/**
 * «Pregúntale a alicIA» de principio a fin, sin gastar en IA: se levanta un
 * servidor que imita la API de Anthropic (respuestas en streaming) y la app
 * se arranca apuntando a él. Comprueba que la respuesta aparece mientras se
 * escribe, que se manda el documento como contexto, la búsqueda web, el
 * reintento sin extras, los errores y que nadie pregunta por documentos
 * ajenos.
 *
 *   (con la app ya construida)  node tests/e2e/chat.mjs
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PUERTO_IA = 3399;
const PUERTO_APP = Number(process.env.PUERTO_APP || 3340);
const BASE = `http://localhost:${PUERTO_APP}`;

let fallos = 0;
function comprobar(titulo, ok, detalle = "") {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo + (!ok && detalle ? ` — ${detalle}` : ""));
  if (!ok) fallos += 1;
}

/* ── La IA de mentira ───────────────────────────────────────────── */
const peticiones = [];
const ia = createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", async () => {
    const datos = JSON.parse(cuerpo || "{}");
    peticiones.push({ cabeceras: req.headers, datos });
    const sistema = (datos.system ?? []).map((b) => b.text).join("\n");
    const ultima = [...(datos.messages ?? [])].reverse().find((m) => m.role === "user");
    const pregunta = typeof ultima?.content === "string" ? ultima.content : JSON.stringify(ultima?.content ?? "");

    if (pregunta.includes("PRUEBA_500")) {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "fallo" } }));
    }
    if (pregunta.includes("PRUEBA_400") && datos.tools) {
      res.writeHead(400, { "content-type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "web search not enabled" } }));
    }

    const esChat = sistema.includes("Eres alicIA");
    const texto = esChat
      ? `Hola, respuesta a: ${pregunta.slice(0, 60)}. **Contexto del documento:** ${sistema.includes("<documento") ? "sí" : "no"}. Historial: ${datos.messages.length} mensajes.`
      : "## Resumen\n\n- El **IVA** es un impuesto indirecto que grava el consumo.";
    const trozos = texto.match(/.{1,12}/gs) ?? [texto];

    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const evento = (tipo, dato) => res.write(`event: ${tipo}\ndata: ${JSON.stringify({ type: tipo, ...dato })}\n\n`);
    evento("message_start", {
      message: { id: `msg_${randomUUID()}`, type: "message", role: "assistant", model: datos.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } },
    });
    evento("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    for (const t of trozos) {
      evento("content_block_delta", { index: 0, delta: { type: "text_delta", text: t } });
      await new Promise((r) => setTimeout(r, esChat ? 90 : 0));
    }
    evento("content_block_stop", { index: 0 });
    evento("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: trozos.length } });
    evento("message_stop", {});
    res.end();
  });
});
await new Promise((r) => ia.listen(PUERTO_IA, "127.0.0.1", r));

/* ── La app, apuntando a esa IA ────────────────────────────────── */
const app = spawn(path.join(raiz, "node_modules/.bin/next"), ["start", "-p", String(PUERTO_APP)], {
  cwd: raiz,
  // El modelo por defecto (el .env local puede traer otro).
  env: { ...process.env, ANTHROPIC_API_KEY: "clave-de-prueba", ANTHROPIC_BASE_URL: `http://127.0.0.1:${PUERTO_IA}`, AI_MODEL: "claude-opus-5", AI_CHAT_MODEL: "" },
  stdio: "ignore",
  // En su propio grupo: al terminar se cierra el servidor entero, no solo el lanzador.
  detached: true,
});
const terminar = (codigo) => {
  try {
    process.kill(-app.pid, "SIGTERM");
  } catch {
    app.kill();
  }
  ia.close();
  process.exit(codigo);
};
for (let i = 0; i < 60; i++) {
  if (await fetch(BASE).then(() => true).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
});
try {
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await contexto.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));

  console.log("\n1. Pregunta general");
  const correo = `chat-${randomUUID().slice(0, 8)}@estudia.test`;
  await page.request.post(BASE + "/api/auth/register", { data: { name: "Lucía Pérez", email: correo, password: "clave-de-prueba-1", educationLevel: "FP" } });
  await page.goto(BASE + "/preguntar");
  await page.getByRole("heading", { name: "Pregúntale a alicIA" }).waitFor();
  comprobar("saluda por el nombre", await page.getByText("Hola, Lucía").isVisible());
  comprobar("propone preguntas de ejemplo", (await page.getByRole("button", { name: /ley de Ohm/ }).count()) === 1);
  comprobar("la navegación tiene «Preguntar»", (await page.getByRole("link", { name: "Preguntar" }).count()) > 0);

  await page.getByLabel("Tu pregunta").fill("¿Qué es la fotosíntesis?");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  // Mientras llega, el texto va creciendo (streaming): se mide varias veces.
  const burbuja = page.locator('[data-mensaje="asistente"]').last();
  const largos = new Set();
  for (let i = 0; i < 200; i++) {
    const t = (await burbuja.textContent().catch(() => "")) ?? "";
    if (t.includes("Hola")) largos.add(t.length);
    if (t.includes("Historial")) break;
    await page.waitForTimeout(40);
  }
  const completa = (await burbuja.textContent()) ?? "";
  comprobar("la respuesta aparece mientras se escribe", largos.size >= 3, `${largos.size} tamaños distintos`);
  comprobar("responde a lo preguntado", completa.includes("fotosíntesis"));
  comprobar("sin documento, no manda contexto", completa.includes("Contexto del documento: no"));
  comprobar("el formato (negritas) se ve bien", (await burbuja.locator("strong").count()) > 0);

  const chat = peticiones.filter((p) => (p.datos.system ?? []).some((b) => b.text.includes("Eres alicIA"))).at(-1);
  comprobar("usa el modelo configurado (Claude Opus 5 por defecto)", chat?.datos.model === "claude-opus-5", chat?.datos.model);
  comprobar("pide la respuesta en streaming", chat?.datos.stream === true);
  comprobar("puede buscar en internet", chat?.datos.tools?.[0]?.type === "web_search_20260209");
  comprobar("si el modelo rechaza, reintenta con otro (fallbacks)", chat?.datos.fallbacks === "default" && String(chat?.cabeceras["anthropic-beta"]).includes("server-side-fallback-2026-07-01"));
  comprobar("el prompt de sistema va en caché", chat?.datos.system?.[0]?.cache_control?.type === "ephemeral");
  comprobar("adapta las explicaciones a su nivel", chat?.datos.system?.[0]?.text.includes("FP"));
  comprobar("la clave nunca llega al navegador", !(await page.content()).includes("clave-de-prueba"));

  console.log("\n2. Conversación con memoria");
  await page.getByLabel("Tu pregunta").fill("¿Y en las plantas de interior?");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await page.locator('[data-mensaje="asistente"]').nth(1).getByText(/Historial: 3 mensajes/).waitFor({ timeout: 20_000 });
  comprobar("manda la conversación entera (recuerda lo anterior)", true);
  await page.reload();
  await page.locator('[data-mensaje="asistente"]').nth(1).waitFor();
  comprobar("la conversación se guarda al recargar", (await page.locator('[data-mensaje="usuario"]').count()) === 2);
  await page.getByRole("button", { name: /Nueva conversación/ }).click();
  comprobar("«Nueva conversación» la vacía", (await page.locator("[data-mensaje]").count()) === 0);

  console.log("\n3. Preguntar sobre un documento");
  const subida = await page.request.post(BASE + "/api/documents", { multipart: { file: { name: "IVA.pdf", mimeType: "application/pdf", buffer: await readFile(path.join(raiz, "tests/fixtures/apuntes-demo.pdf")) } } });
  const subido = await subida.json().catch(() => ({}));
  if (!subido.document) throw new Error(`No se pudo subir el documento: ${subida.status()} ${JSON.stringify(subido).slice(0, 200)}`);
  const docId = subido.document.id;
  for (let i = 0; i < 200; i++) {
    await page.request.post(BASE + "/api/jobs/tick");
    const s = await (await page.request.get(`${BASE}/api/documents/${docId}/status`)).json();
    if (s.document.status === "READY" || s.document.status === "FAILED") break;
    await page.waitForTimeout(800);
  }
  await page.goto(`${BASE}/documento/${docId}`);
  await page.getByRole("link", { name: /Preguntar a alicIA/ }).click();
  await page.waitForURL(/\/preguntar\?doc=/);
  await page.getByText(/Conozco el resumen de/).waitFor();
  comprobar("desde el documento se abre el chat con ese documento", true);
  await page.getByRole("button", { name: /5 ideas clave/ }).click();
  await page.locator('[data-mensaje="asistente"]').last().getByText(/Historial/).waitFor({ timeout: 20_000 });
  comprobar("manda el resumen del documento como contexto", (await page.locator('[data-mensaje="asistente"]').last().textContent()).includes("Contexto del documento: sí"));
  const conDoc = peticiones.at(-1);
  comprobar("el contexto es el resumen de SU documento", /<documento titulo="IVA">/.test(conDoc.datos.system[0].text) && conDoc.datos.system[0].text.includes("IVA"));
  await page.getByLabel("Tema de la conversación").selectOption("");
  await page.waitForURL(/\/preguntar$/);
  await page.waitForFunction(() => document.querySelectorAll("[data-mensaje]").length === 0, null, { timeout: 5000 }).catch(() => undefined);
  comprobar(
    "cada tema tiene su conversación",
    (await page.locator("[data-mensaje]").count()) === 0,
    `${await page.locator("[data-mensaje]").count()} mensajes; guardado: ${await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("alicia-chat")).map((k) => [k, JSON.parse(localStorage.getItem(k)).map((m) => m.content.slice(0, 30))]))))}`,
  );
  await page.getByLabel("Tema de la conversación").selectOption(docId);
  await page.locator('[data-mensaje="usuario"]').first().waitFor({ timeout: 5000 }).catch(() => undefined);
  comprobar("y al volver al documento, su conversación sigue ahí", (await page.locator('[data-mensaje="usuario"]').count()) === 1);
  await page.getByLabel("Tema de la conversación").selectOption("");
  await page.waitForURL(/\/preguntar$/);

  console.log("\n4. Reintentos y errores");
  const antes = peticiones.length;
  await page.getByLabel("Tu pregunta").fill("PRUEBA_400 ¿qué hora es?");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await page.locator('[data-mensaje="asistente"]').last().getByText(/Historial/).waitFor({ timeout: 20_000 });
  const reintento = peticiones.slice(antes);
  comprobar("si la cuenta no admite búsqueda web, contesta sin ella", reintento.length === 2 && reintento[0].datos.tools && !reintento[1].datos.tools, reintento.map((p) => Boolean(p.datos.tools)).join(","));
  await page.getByLabel("Tu pregunta").fill("PRUEBA_500 falla");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await page.getByText(/Ha habido un problema al responder/).waitFor({ timeout: 60_000 });
  comprobar("un error del servicio se explica, no se queda cargando", true);
  comprobar("y se puede volver a preguntar", await page.getByLabel("Tu pregunta").isEnabled());

  console.log("\n5. Seguridad");
  const otro = await browser.newContext();
  await otro.request.post(BASE + "/api/auth/register", { data: { name: "Otra", email: `otra-${randomUUID().slice(0, 8)}@estudia.test`, password: "clave-de-prueba-1", educationLevel: "FP" } });
  const ajeno = await otro.request.post(BASE + "/api/chat", { data: { mensajes: [{ role: "user", content: "hola" }], documentId: docId } });
  comprobar("nadie puede preguntar sobre un documento ajeno", ajeno.status() === 404, `${ajeno.status()}`);
  const anonimo = await (await browser.newContext()).request.post(BASE + "/api/chat", { data: { mensajes: [{ role: "user", content: "hola" }] } });
  comprobar("sin sesión, no hay chat", anonimo.status() === 401, `${anonimo.status()}`);
  const vacio = await page.request.post(BASE + "/api/chat", { data: { mensajes: [] } });
  comprobar("una petición vacía se rechaza", vacio.status() === 422, `${vacio.status()}`);
  await otro.close();

  await page.request.delete(`${BASE}/api/documents/${docId}`);
  comprobar("sin errores en la página", errores.length === 0, errores.join(" | "));
} catch (error) {
  console.error(error);
  fallos += 1;
} finally {
  await browser.close();
}

console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nEl asistente funciona de principio a fin");
terminar(fallos ? 1 : 0);
