/** Muchas páginas seguidas: mide el ritmo real del motor local. */
import { existsSync } from "node:fs";
import { abrir, subir, comprobar, salir, fixture, ESCANEADO_LARGO } from "./_util.mjs";

if (!existsSync(fixture(ESCANEADO_LARGO))) {
  console.log("  – omitida: genera el PDF con " +
    "`python3 tests/fixtures/generar-escaneado-largo.py`");
  process.exit(0);
}

const { browser, page, errores } = await abrir();
await subir(page, ESCANEADO_LARGO);
const total = await page.evaluate(() => state.scannedPages.length);
console.log("    " + total + " páginas · " +
  (await page.evaluate(() => carrilesLocales())) + " en paralelo");

const t0 = Date.now();
await page.click("#ocrAll");
const listo = await page.waitForSelector("#doc:not(.hidden)", { timeout: 900000 })
  .then(() => true).catch(() => false);
const segundos = (Date.now() - t0) / 1000;
comprobar("el libro entero queda montado", listo);
console.log("    " + segundos.toFixed(1) + " s · " + (segundos / total).toFixed(2) + " s por página");

const conTexto = await page.evaluate(() =>
  state.pages.filter((p) => p.text.replace(/\s/g, "").length > 100).length);
comprobar("todas las páginas traen texto", conTexto === total);
comprobar("sin errores de página", errores.length === 0);
await browser.close();
salir();
