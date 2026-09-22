/** Sin puente con Claude: el dispositivo lee el PDF escaneado él solo. */
import { abrir, subir, comprobar, salir, ESCANEADO } from "./_util.mjs";

const { browser, page, errores } = await abrir();
await subir(page, ESCANEADO);

comprobar("el motor local queda elegido",
  (await page.getAttribute("#ocrEngineLocal", "class")).includes("primary"));
comprobar("el botón de Claude queda desactivado", await page.isDisabled("#ocrEngineClaude"));

const t0 = Date.now();
await page.click("#ocrAll");
const listo = await page.waitForSelector("#doc:not(.hidden)", { timeout: 300000 })
  .then(() => true).catch(() => false);
comprobar("el material queda montado", listo);
console.log("    " + ((Date.now() - t0) / 1000).toFixed(1) + " s");

const texto = await page.evaluate(() => state.pages.map((p) => p.text).join(" "));
for (const clave of ["tensi", "Ohm", "voltio", "IMPORTANTE"]) {
  comprobar(`se reconoce «${clave}»`, texto.toLowerCase().includes(clave.toLowerCase()));
}
comprobar("sin errores de página", errores.length === 0);
if (errores.length) console.log("    " + errores.join("\n    "));
await browser.close();
salir();
