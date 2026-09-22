/** Cuando el visor sí admite imágenes se usa esa vía, más rápida. */
import { abrir, subir, comprobar, salir, ESCANEADO } from "./_util.mjs";

const { browser, page, errores } = await abrir(() => {
  window.__llamadas = 0;
  const texto = (n) => "TEMA 1 - FUNDAMENTOS\n1. Tension electrica\nPagina " + n + " leida por Claude.";
  const sample = Object.assign(
    async () => { window.__llamadas += 1; return { text: texto(1) }; },
    {
      json: async (prompt) => {
        window.__llamadas += 1;
        const lista = (prompt.match(/páginas ([\d, ]+), en ese orden/) || ["", "1"])[1]
          .split(",").map((s) => Number(s.trim())).filter(Boolean);
        return lista.map((n) => ({ pagina: n, texto: texto(n) }));
      },
      limits: async () => ({ maxInputBytes: 1e6, images: { maxCount: 4, mediaTypes: ["image/jpeg"] } }),
    },
  );
  window.claude = { use: async (n) => (n === "sample" ? sample : null) };
});

await subir(page, ESCANEADO);
comprobar("Claude queda elegido",
  (await page.getAttribute("#ocrEngineClaude", "class")).includes("primary"));

await page.click("#ocrAll");
const listo = await page.waitForSelector("#doc:not(.hidden)", { timeout: 120000 })
  .then(() => true).catch(() => false);
comprobar("el material queda montado", listo);
comprobar("se agrupan páginas en una sola consulta",
  (await page.evaluate(() => window.__llamadas)) === 1);
comprobar("no se cambia de motor", (await page.evaluate(() => state.ocrEngine)) === "claude");
comprobar("sin errores de página", errores.length === 0);
await browser.close();
salir();
