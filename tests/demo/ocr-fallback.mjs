/** El visor dice admitir imágenes pero las rechaza: se pasa al motor local solo. */
import { abrir, subir, comprobar, salir, ESCANEADO } from "./_util.mjs";

const { browser, page, errores } = await abrir(() => {
  const fallar = () => {
    const e = new Error("images_unavailable");
    e.code = "images_unavailable";
    return Promise.reject(e);
  };
  const sample = Object.assign(fallar, {
    json: fallar,
    limits: async () => ({ maxInputBytes: 1e6, images: { maxCount: 4, mediaTypes: ["image/jpeg"] } }),
  });
  window.claude = { use: async (n) => (n === "sample" ? sample : null) };
});

await subir(page, ESCANEADO);
comprobar("se parte de Claude",
  (await page.getAttribute("#ocrEngineClaude", "class")).includes("primary"));

await page.click("#ocrAll");
const listo = await page.waitForSelector("#doc:not(.hidden)", { timeout: 300000 })
  .then(() => true).catch(() => false);
comprobar("el material queda montado pese al rechazo", listo);
comprobar("se ha cambiado al motor local", (await page.evaluate(() => state.ocrEngine)) === "local");
const texto = await page.evaluate(() => state.pages.map((p) => p.text).join(" "));
comprobar("el texto viene del motor local", texto.toLowerCase().includes("voltio"));
comprobar("sin errores de página", errores.length === 0);
await browser.close();
salir();
