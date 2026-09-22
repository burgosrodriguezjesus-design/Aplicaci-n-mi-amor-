/** Utilidades compartidas por las pruebas de navegador de la demo. */
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const URL_DEMO = process.env.DEMO_URL || "http://127.0.0.1:8811/index.html";
export const ESCANEADO = "apuntes-escaneados.pdf";
export const ESCANEADO_LARGO = "escaneado-largo.pdf";

export function fixture(nombre) {
  return path.join(root, "tests/fixtures", nombre);
}

/** Abre la demo con un puente de Claude a medida (o sin ninguno). */
/** Chromium: el que diga el entorno, el preinstalado, o el de Playwright. */
export function navegador() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  return existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
}

export async function abrir(puente) {
  const browser = await chromium.launch({ executablePath: navegador() });
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.addInitScript(puente || (() => { delete window.claude; }));
  await page.goto(URL_DEMO, { waitUntil: "load" });
  return { browser, page, errores };
}

/** Sube un PDF y espera al panel de reconocimiento. */
export async function subir(page, nombre) {
  await page.setInputFiles("#file", fixture(nombre));
  await page.waitForSelector("#ocrPanel:not(.hidden)", { timeout: 90000 });
}

let fallos = 0;
export function comprobar(titulo, condicion) {
  console.log((condicion ? "  ✓ " : "  ✗ ") + titulo);
  if (!condicion) fallos += 1;
}
export function salir() {
  process.exit(fallos ? 1 : 0);
}
