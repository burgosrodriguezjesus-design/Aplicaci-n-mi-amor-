#!/usr/bin/env node
/**
 * Recorrido completo de la aplicación en un navegador de verdad, como lo haría
 * una persona: portada, cuenta, subida, las cuatro pestañas del documento,
 * biblioteca, asignaturas, ajustes, borrado y salida.
 *
 * En cada pantalla vigila además lo que no se ve a simple vista:
 *  - errores en la consola del navegador y excepciones de la página;
 *  - peticiones a la propia app que devuelven 5xx (o 4xx inesperados);
 *  - contenido que se sale por los lados (scroll horizontal) en móvil,
 *    tableta y ordenador, en claro y en oscuro;
 *  - botones sin nombre (inaccesibles para un lector de pantalla).
 *
 *   APP_URL=http://localhost:3000 node tests/e2e/recorrido.mjs
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.APP_URL || "http://localhost:3000";
const PDF_TEXTO = path.join(raiz, "tests/fixtures/apuntes-demo.pdf");
const PDF_ESCANEADO = path.join(raiz, "tests/fixtures/libro-realista.pdf");
const LENTO = 600_000;

let fallos = 0;
const problemas = [];
function comprobar(titulo, ok, detalle = "") {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo + (!ok && detalle ? ` — ${detalle}` : ""));
  if (!ok) fallos += 1;
}
function seccion(titulo) {
  console.log(`\n${titulo}`);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
});

/** Página vigilada: apunta errores de consola, de página y de red. */
async function nuevaPagina(opciones = {}) {
  const contexto = await browser.newContext(opciones);
  const page = await contexto.newPage();
  const donde = () => new URL(page.url()).pathname;
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const texto = msg.text();
    // Recursos externos que el entorno de pruebas no alcanza.
    if (/ERR_TUNNEL|ERR_PROXY|net::ERR_(NAME|CONNECTION)|google|gstatic/i.test(texto)) return;
    // Respuestas esperadas: sesión sin entrar (401), la página inexistente
    // que se prueba (404) y el correo repetido (409).
    if (/Failed to load resource/.test(texto) && /\b(401|404|409)\b/.test(texto)) return;
    problemas.push(`[consola ${donde()}] ${texto.slice(0, 220)}`);
  });
  page.on("pageerror", (error) => problemas.push(`[excepción ${donde()}] ${String(error).slice(0, 300)}`));
  page.on("response", (res) => {
    const url = new URL(res.url());
    if (url.origin !== new URL(BASE).origin) return;
    if (res.status() >= 500) problemas.push(`[red ${donde()}] ${res.status()} ${url.pathname}`);
  });
  return { contexto, page };
}

async function sinDesborde(page, etiqueta) {
  // Se compara con el ancho real de la pantalla: en modo móvil, si algo se
  // sale, el navegador ensancha la página entera (y innerWidth con ella).
  const pantalla = page.viewportSize()?.width ?? 0;
  const ancho = await page.evaluate((pantalla) => {
    const doc = document.documentElement;
    const sobrante = Math.max(doc.scrollWidth, window.innerWidth) - pantalla;
    let culpable = "";
    if (sobrante > 1) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > pantalla + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed") {
          culpable = `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} (${Math.round(r.right)}px)`;
          break;
        }
      }
    }
    return { sobrante, culpable };
  }, pantalla);
  comprobar(`${etiqueta}: nada se sale por los lados`, ancho.sobrante <= 1, `${ancho.sobrante}px · ${ancho.culpable}`);
}

async function botonesConNombre(page, etiqueta) {
  const sinNombre = await page.evaluate(() =>
    [...document.querySelectorAll("button, a[href]")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const nombre = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
        return !nombre;
      })
      .map((el) => el.outerHTML.slice(0, 120)),
  );
  comprobar(`${etiqueta}: todos los botones tienen nombre`, sinNombre.length === 0, sinNombre.slice(0, 2).join(" | "));
}

const email = `recorrido-${randomUUID().slice(0, 8)}@estudia.test`;
const clave = "clave-de-prueba-123";

/* ── 1. Sin cuenta ─────────────────────────────────────────────── */
seccion("1. Portada y acceso sin cuenta");
{
  const { contexto, page } = await nuevaPagina({ viewport: { width: 390, height: 844 }, isMobile: true });
  const r = await page.goto(BASE + "/");
  comprobar("la portada carga", r?.status() === 200);
  comprobar("la portada tiene su titular", await page.getByRole("heading", { level: 1 }).isVisible());
  await sinDesborde(page, "portada (móvil)");
  await botonesConNombre(page, "portada");

  await page.getByRole("link", { name: /Empezar gratis/ }).first().click();
  await page.waitForURL(/\/registro/);
  comprobar("«Empezar gratis» lleva al registro", page.url().includes("/registro"));

  await page.goto(BASE + "/inicio");
  await page.waitForURL(/\/login/);
  comprobar("sin sesión, /inicio manda a entrar", page.url().includes("/login"));

  await page.fill('input[type="email"]', "nadie@estudia.test");
  await page.fill('input[type="password"]', "incorrecta");
  await page.getByRole("button", { name: /^Entrar/ }).click();
  const error = page.locator("form p").filter({ hasText: /./ });
  await error.first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  comprobar("con una contraseña mala se explica el error", await error.first().isVisible().catch(() => false));

  await page.getByRole("button", { name: /Mostrar contraseña/ }).click();
  comprobar("el ojo muestra la contraseña", (await page.getAttribute('input[autocomplete="current-password"]', "type")) === "text");

  const noExiste = await page.goto(BASE + "/esto-no-existe");
  comprobar("una ruta que no existe da 404", noExiste?.status() === 404);
  await contexto.close();

  for (const [ancho, alto] of [[320, 640], [768, 1024], [1440, 900]]) {
    for (const esquema of ["light", "dark"]) {
      const v = await nuevaPagina({ viewport: { width: ancho, height: alto }, isMobile: ancho < 700, colorScheme: esquema });
      for (const ruta of ["/", "/login", "/registro"]) {
        await v.page.goto(BASE + ruta);
        await v.page.waitForTimeout(400);
        await sinDesborde(v.page, `${ruta} · ${ancho}px ${esquema === "dark" ? "oscuro" : "claro"}`);
      }
      await v.contexto.close();
    }
  }
}

/* ── 2. Registro y primera visita ──────────────────────────────── */
seccion("2. Crear cuenta y primera visita");
const { contexto, page } = await nuevaPagina({ viewport: { width: 1280, height: 860 } });
{
  await page.goto(BASE + "/registro");
  await page.fill('input[autocomplete="name"]', "Alicia Prueba");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', clave);
  await page.selectOption("select", "FP");
  await page.getByRole("button", { name: /Crear cuenta/ }).click();
  await page.waitForURL(/\/inicio/, { timeout: 20_000 });
  comprobar("al crear la cuenta se entra en Inicio", page.url().includes("/inicio"));
  await page.getByText(/Alicia/).first().waitFor();
  comprobar("saluda por el nombre", await page.getByRole("heading", { level: 1 }).filter({ hasText: "Alicia" }).isVisible());
  const invita = await page.getByRole("link", { name: /Subir mi primer PDF/ }).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  comprobar("sin documentos, invita a subir el primero", invita);
  await botonesConNombre(page, "inicio vacío");

  // Un registro repetido se explica.
  const otro = await nuevaPagina();
  await otro.page.goto(BASE + "/registro");
  await otro.page.fill('input[autocomplete="name"]', "Otra");
  await otro.page.fill('input[type="email"]', email);
  await otro.page.fill('input[type="password"]', clave);
  await otro.page.getByRole("button", { name: /Crear cuenta/ }).click();
  await otro.page.waitForTimeout(1500);
  comprobar("un correo ya usado no crea otra cuenta", otro.page.url().includes("/registro"));
  await otro.contexto.close();
}

/* ── 3. Subida ─────────────────────────────────────────────────── */
seccion("3. Subir PDF");
let docId = "";
{
  await page.getByRole("link", { name: /Subir mi primer PDF/ }).click();
  await page.waitForURL(/\/subir/);

  // Un archivo que no es un PDF se rechaza con una explicación.
  await page.setInputFiles('input[type="file"]', { name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("hola") });
  await page.waitForTimeout(400);
  comprobar("un archivo que no es PDF se rechaza", await page.getByText(/No podemos usar ese archivo/).isVisible());

  // Un nombre larguísimo y sin espacios no puede romper ninguna pantalla.
  await page.setInputFiles('input[type="file"]', {
    name: "ApuntesDeContabilidadFinancieraYFiscalSegundoCursoVersionDefinitiva.pdf",
    mimeType: "application/pdf",
    buffer: readFileSync(PDF_TEXTO),
  });
  comprobar("al elegir el PDF se ven las opciones", await page.getByRole("button", { name: /Analizar documento/ }).isVisible());
  await page.getByRole("button", { name: /Rápido/ }).click();
  comprobar("el nivel elegido queda marcado", (await page.getByRole("button", { name: /Rápido/ }).getAttribute("aria-pressed")) === "true");
  await botonesConNombre(page, "subir");
  await page.getByRole("button", { name: /Analizar documento/ }).click();
  await page.getByText(/material de estudio está listo|No hemos podido/).first().waitFor({ timeout: LENTO });
  comprobar("el PDF se procesa hasta el final", await page.getByText(/material de estudio está listo/).first().isVisible());
  await page.getByRole("button", { name: /^Resumen$/ }).click();
  await page.waitForURL(/\/documento\//);
  docId = page.url().split("/documento/")[1].split("?")[0];
  comprobar("«Resumen» abre el documento", Boolean(docId));
}

/* ── 4. Documento ──────────────────────────────────────────────── */
seccion("4. Documento: resumen, esquema, audio y PDF");
{
  await page.locator("section[id^=seccion-]").first().waitFor();
  const secciones = await page.locator("section[id^=seccion-]").count();
  comprobar("el resumen tiene apartados", secciones > 0, `${secciones}`);
  await botonesConNombre(page, "resumen");

  // Marcar como estudiado, y que se guarde.
  const primera = page.locator("section[id^=seccion-]").first();
  await primera.getByRole("button", { name: /Marcar como estudiado/ }).click();
  await primera.getByRole("button", { name: /Estudiado/ }).waitFor({ timeout: 10_000 });
  comprobar("se marca un apartado como estudiado", true);
  await page.waitForTimeout(800);
  await page.reload();
  await page.locator("section[id^=seccion-]").first().waitFor();
  comprobar(
    "tras recargar sigue marcado",
    await page.locator("section[id^=seccion-]").first().getByRole("button", { name: /Estudiado/ }).isVisible(),
  );
  comprobar("el progreso lo cuenta", await page.getByText(/^1 de \d+ apartados$/).filter({ visible: true }).first().isVisible());

  // Descargar.
  const href = await page.getByRole("link", { name: /Descargar/ }).first().getAttribute("href");
  const descarga = await page.request.get(BASE + href);
  comprobar("«Descargar» devuelve el resumen", descarga.ok() && (await descarga.text()).length > 50);

  // Índice lateral.
  const enlace = page.locator('nav[aria-label="Índice del resumen"] a').nth(1);
  await enlace.click();
  await page.waitForTimeout(500);
  comprobar("el índice lleva al apartado", page.url().includes("#seccion-"));

  // Referencia de página → PDF.
  const ref = page.locator("section[id^=seccion-] .page-ref").first();
  if (await ref.count()) {
    await ref.click();
    await page.waitForURL(/tab=pdf/);
    comprobar("la referencia de página abre el PDF", page.url().includes("tab=pdf"));
    await page.locator('iframe[title="PDF original"]').waitFor();
    await page.waitForTimeout(2500);
    comprobar("el visor del PDF aparece", await page.locator('iframe[title="PDF original"]').isVisible());
    const siguiente = page.getByRole("button", { name: "Página siguiente" });
    if (await siguiente.isEnabled()) {
      await siguiente.click();
      comprobar("se puede pasar de página", true);
    }
  }

  // Regenerar un apartado.
  await page.getByRole("tab", { name: /Resumen/ }).click();
  await page.locator("section[id^=seccion-]").first().waitFor();
  await page.locator("section[id^=seccion-]").nth(1).getByRole("button", { name: /^Regenerar / }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.waitFor();
  comprobar("se abre el diálogo de regenerar", await dialogo.isVisible());
  await botonesConNombre(page, "diálogo de regenerar");
  await dialogo.getByRole("button", { name: /^Regenerar$/ }).click();
  await page.getByText(/regenerado|Regeneración en marcha|No hemos podido/).first().waitFor({ timeout: 60_000 });
  comprobar("regenerar un apartado termina bien", await page.getByText(/regenerado/).first().isVisible().catch(() => false));

  // Esquema.
  await page.getByRole("tab", { name: /Esquema/ }).click();
  await page.waitForURL(/tab=outline/);
  // Cuadro (por defecto) y mapa conceptual: dibujados, con ramas que se abren.
  for (const vista of ["Cuadro", "Mapa conceptual"]) {
    await page.getByRole("radio", { name: vista }).click();
    const nodos = page.locator("[data-nodo]");
    await nodos.first().waitFor({ timeout: 10_000 });
    await page.waitForTimeout(600);
    const todos = await nodos.count();
    comprobar(`«${vista}» dibuja el esquema`, todos > 3, `${todos} recuadros`);
    const solapes = await page.evaluate(() => {
      const cajas = [...document.querySelectorAll("[data-diagrama]")].flatMap((d) =>
        [...d.querySelectorAll("[data-nodo]")].map((n) => ({ d, r: n.getBoundingClientRect() })),
      );
      let malos = 0;
      for (let i = 0; i < cajas.length; i++)
        for (let j = i + 1; j < cajas.length; j++) {
          const a = cajas[i];
          const b = cajas[j];
          if (a.d !== b.d) continue;
          if (a.r.left < b.r.right - 1 && b.r.left < a.r.right - 1 && a.r.top < b.r.bottom - 1 && b.r.top < a.r.bottom - 1) malos++;
        }
      return malos;
    });
    comprobar(`«${vista}»: ningún recuadro pisa a otro`, solapes === 0, `${solapes} solapes`);
    await page.getByRole("button", { name: /Contraer todo/ }).click();
    await page.waitForTimeout(400);
    const contraidos = await nodos.count();
    await page.getByRole("button", { name: /Expandir todo/ }).click();
    await page.waitForTimeout(400);
    comprobar(`«${vista}» se contrae y se expande`, contraidos < todos && (await nodos.count()) === todos, `${todos} → ${contraidos}`);
    const conRamas = page.locator('[data-nodo][aria-expanded="true"]').nth(1);
    await conRamas.click();
    await page.waitForTimeout(300);
    comprobar(`«${vista}»: tocar un recuadro cierra sus ramas`, (await nodos.count()) < todos);
    await conRamas.click();
    await botonesConNombre(page, `esquema ${vista}`);
  }
  await page.getByRole("button", { name: "Pantalla completa" }).first().click();
  const completa = page.getByRole("dialog", { name: /^Esquema/ });
  await completa.waitFor({ timeout: 5000 });
  comprobar("el esquema se abre en pantalla completa", await completa.isVisible());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  comprobar("y se cierra con Escape", !(await completa.isVisible().catch(() => false)));

  // Lista.
  await page.getByRole("radio", { name: "Lista" }).click();
  await page.getByRole("button", { name: /Expandir todo/ }).click();
  const abiertos = await page.locator("main li").count();
  await page.getByRole("button", { name: /Contraer todo/ }).click();
  const cerrados = await page.locator("main li").count();
  comprobar("la lista se expande y se contrae", abiertos > cerrados, `${abiertos} → ${cerrados}`);
  await botonesConNombre(page, "esquema en lista");
  await page.getByRole("radio", { name: "Cuadro" }).click();

  // Audio.
  await page.getByRole("tab", { name: /Audio/ }).click();
  await page.waitForURL(/tab=audio/);
  await page.getByRole("button", { name: /Escuchar todo/ }).waitFor();
  comprobar("el audio tiene capítulos", (await page.locator("main ol > li").count()) > 0);
  await page.getByRole("button", { name: /Escuchar todo/ }).click();
  await page.waitForTimeout(1500);
  comprobar("al escuchar aparece el reproductor", await page.getByRole("region", { name: "Reproductor" }).isVisible().catch(() => false));
  const velocidad = page.getByRole("button", { name: "1,25×" });
  if (await velocidad.count()) {
    await velocidad.click();
    comprobar("se cambia la velocidad", (await velocidad.getAttribute("data-active")) === "true");
  }
  await botonesConNombre(page, "audio");
  const pausa = page.getByRole("region", { name: "Reproductor" }).getByRole("button", { name: /Pausar|Reproducir/ });
  if (await pausa.count()) await pausa.first().click();
}

/* ── 4b. Reproductor en el móvil ───────────────────────────────── */
seccion("4b. El reproductor no tapa nada en el móvil");
{
  const m = await nuevaPagina({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    storageState: await contexto.storageState(),
  });
  await m.page.goto(`${BASE}/documento/${docId}?tab=audio`);
  await m.page.getByRole("button", { name: /Escuchar todo/ }).click();
  const reproductor = m.page.getByRole("region", { name: "Reproductor" });
  await reproductor.waitFor({ timeout: 10_000 });
  // Se navega tocando la barra inferior (recargar la página pararía el audio).
  for (const [ruta, ir] of [
    ["documento", async () => {}],
    ["/inicio", () => m.page.getByRole("navigation", { name: "Principal" }).last().getByRole("link", { name: "Inicio" }).click()],
    ["/biblioteca", () => m.page.getByRole("navigation", { name: "Principal" }).last().getByRole("link", { name: "Biblioteca" }).click()],
  ]) {
    await ir();
    await m.page.waitForTimeout(1200);
    await reproductor.waitFor({ timeout: 10_000 });
    const a = await reproductor.boundingBox();
    const b = await m.page.getByRole("link", { name: "Subir PDF" }).last().boundingBox();
    const tocan = a && b && a.y + a.height > b.y && b.y + b.height > a.y && a.x + a.width > b.x && b.x + b.width > a.x;
    comprobar(`${ruta}: el reproductor no tapa el botón «Subir»`, Boolean(a && b) && !tocan, JSON.stringify({ a, b }));
  }
  await m.contexto.close();
}

/* ── 5. Inicio con documento ───────────────────────────────────── */
seccion("5. Inicio con documento");
{
  await page.goto(BASE + "/inicio");
  await page.getByText(/Continúa donde lo dejaste|Listo para estudiar/).first().waitFor({ timeout: 15_000 });
  comprobar("Inicio propone seguir estudiando", true);
  await page.getByRole("link", { name: /Seguir estudiando|Empezar a estudiar/ }).click();
  await page.waitForURL(/\/documento\//);
  comprobar("el botón lleva al documento", page.url().includes(docId));
}

/* ── 6. Biblioteca y asignaturas ───────────────────────────────── */
seccion("6. Biblioteca y asignaturas");
{
  await page.goto(BASE + "/biblioteca");
  await page.locator("article").first().waitFor();
  comprobar("la biblioteca muestra el documento", (await page.locator("article").count()) >= 1);
  await page.fill('input[aria-label="Buscar documentos"]', "zzzz-no-existe");
  const sinResultados = await page.getByText("Sin resultados").waitFor({ timeout: 5000 }).then(() => true, () => false);
  comprobar("buscar algo que no está da «Sin resultados»", sinResultados);
  await page.fill('input[aria-label="Buscar documentos"]', "");
  await botonesConNombre(page, "biblioteca");

  await page.getByRole("button", { name: /Asignaturas/ }).click();
  await page.fill('input[placeholder^="Electricidad"]', "Economía");
  await page.getByRole("button", { name: /^Crear$/ }).click();
  await page.getByRole("heading", { name: "Economía" }).waitFor({ timeout: 10_000 });
  comprobar("se crea una asignatura", true);
  await page.fill('input[placeholder^="Nuevo tema"]', "Tema 1");
  await page.getByRole("button", { name: /^Tema$/ }).click();
  await page.getByText("Tema 1", { exact: true }).waitFor({ timeout: 10_000 });
  comprobar("se crea un tema dentro", true);
  await botonesConNombre(page, "asignaturas");

  await page.getByRole("button", { name: /Documentos/ }).click();
  comprobar("aparece el filtro de la asignatura", await page.getByRole("button", { name: /Economía/ }).isVisible());
}

/* ── 7. Ajustes ────────────────────────────────────────────────── */
seccion("7. Ajustes");
{
  await page.goto(BASE + "/ajustes");
  await page.getByRole("button", { name: /Nivel avanzado/ }).click();
  await page.getByRole("button", { name: /Guardar preferencias/ }).click();
  await page.getByText("Preferencias guardadas").waitFor({ timeout: 10_000 });
  comprobar("se guardan las preferencias", true);
  await page.reload();
  await page.getByRole("button", { name: /Nivel avanzado/ }).waitFor();
  comprobar(
    "tras recargar se conserva lo elegido",
    (await page.getByRole("button", { name: /Nivel avanzado/ }).getAttribute("aria-pressed")) === "true",
  );
  await page.getByRole("button", { name: /Oscuro/ }).click();
  comprobar("el modo oscuro se activa", (await page.getAttribute("html", "data-theme")) === "dark");
  await sinDesborde(page, "ajustes (oscuro)");
  await page.getByRole("button", { name: /Claro/ }).click();
  comprobar("y se vuelve al claro", (await page.getAttribute("html", "data-theme")) === "light");
  await botonesConNombre(page, "ajustes");
}

/* ── 8. Tamaños de pantalla y modo oscuro ──────────────────────── */
seccion("8. Todas las pantallas en móvil pequeño, móvil, tableta y ordenador, en claro y oscuro");
{
  const estado = await contexto.storageState();
  const rutas = ["/inicio", "/biblioteca", "/subir", "/ajustes", `/documento/${docId}?tab=summary`, `/documento/${docId}?tab=outline`, `/documento/${docId}?tab=audio`, `/documento/${docId}?tab=pdf`];
  for (const [nombre, ancho, alto] of [["320", 320, 640], ["390", 390, 844], ["768", 768, 1024], ["1440", 1440, 900]]) {
    for (const esquema of ["light", "dark"]) {
      const v = await nuevaPagina({ viewport: { width: ancho, height: alto }, isMobile: ancho < 700, colorScheme: esquema, storageState: estado });
      for (const ruta of rutas) {
        await v.page.goto(BASE + ruta);
        await v.page.waitForLoadState("networkidle").catch(() => undefined);
        await v.page.waitForTimeout(500);
        await sinDesborde(v.page, `${ruta.split("?")[0].replace(docId, "…")}${ruta.includes("tab=") ? " " + ruta.split("tab=")[1] : ""} · ${nombre}px ${esquema === "dark" ? "oscuro" : "claro"}`);
      }
      await v.contexto.close();
    }
  }
}

/* ── 9. Libro escaneado ────────────────────────────────────────── */
seccion("9. Libro escaneado de principio a fin");
{
  await page.goto(BASE + "/subir");
  await page.setInputFiles('input[type="file"]', PDF_ESCANEADO);
  await page.getByRole("button", { name: /Detallado/ }).first().click();
  await page.getByRole("button", { name: /Analizar documento/ }).click();
  await page.getByText(/material de estudio está listo|No hemos podido/).first().waitFor({ timeout: LENTO });
  comprobar("el escaneado se procesa", await page.getByText(/material de estudio está listo/).first().isVisible());
  await page.getByRole("button", { name: /^Resumen$/ }).click();
  await page.locator("section[id^=seccion-]").first().waitFor();
  const texto = await page.locator("main").innerText();
  comprobar("los ejemplos salen marcados aparte", /EJEMPLO · NO ES TEORÍA/i.test(texto));
  comprobar("las actividades se señalan", /PARA PRACTICAR/i.test(texto));
  comprobar("sin créditos ni editorial", !/Shutterstock|ISBN|Ediciones Didácticas/.test(texto));
  comprobar(
    "sin portada, presentación ni objetivos de la unidad",
    !/Ciclo Formativo|Grado Medio|Depósito legal|Este libro está dirigido|En esta unidad aprenderás|Objetivos|OFERTAS|= =/.test(texto),
  );
  await page.getByRole("tab", { name: /Esquema/ }).click();
  await page.locator("[data-nodo]").first().waitFor({ timeout: 10_000 });
  const esquema = await page.locator("main").innerText();
  comprobar(
    "el esquema es solo temario",
    !/Ciclo Formativo|Presentación|Objetivos|En esta unidad|OFERTAS|Actividades|Muebles Ortega/.test(esquema),
  );
}

/* ── 10. Borrar y salir ────────────────────────────────────────── */
seccion("10. Borrar documentos y cerrar sesión");
{
  await page.goto(BASE + "/biblioteca");
  await page.locator("article").first().waitFor();
  const antes = await page.locator("article").count();
  await page.locator("article").first().getByRole("button", { name: /^Eliminar / }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Eliminar$/ }).click();
  await page.getByText("Documento eliminado").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);
  comprobar("se elimina un documento", (await page.locator("article").count()) === antes - 1);

  await page.goto(BASE + "/ajustes");
  await page.getByRole("button", { name: /Cerrar sesión/ }).first().click();
  await page.waitForURL(/\/login/);
  comprobar("«Cerrar sesión» sale de la cuenta", page.url().includes("/login"));
  await page.goto(BASE + "/biblioteca");
  await page.waitForURL(/\/login/);
  comprobar("después ya no se ve la biblioteca", page.url().includes("/login"));

  // Volver a entrar con la cuenta creada.
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', clave);
  await page.getByRole("button", { name: /^Entrar/ }).click();
  await page.waitForURL(/\/inicio/, { timeout: 20_000 });
  comprobar("se vuelve a entrar con la misma cuenta", page.url().includes("/inicio"));
}

await contexto.close();
await browser.close();

seccion("Errores vigilados durante todo el recorrido");
const unicos = [...new Set(problemas)];
comprobar("sin errores de consola, excepciones ni fallos del servidor", unicos.length === 0, `${unicos.length}`);
for (const p of unicos.slice(0, 30)) console.log("    · " + p);
if (process.env.RECORRIDO_INFORME) writeFileSync(process.env.RECORRIDO_INFORME, unicos.join("\n"));

console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nRecorrido completo sin fallos");
process.exit(fallos ? 1 : 0);
