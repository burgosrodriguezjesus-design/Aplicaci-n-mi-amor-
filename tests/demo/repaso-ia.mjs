/** El repaso con Claude reescribe cada apartado sin perder el PDF de vista. */
import { abrir, comprobar, salir, fixture } from "./_util.mjs";

const { browser, page, errores } = await abrir(() => {
  window.__prompts = [];
  const sample = Object.assign(
    async (prompt) => {
      window.__prompts.push(prompt);
      const apartado = (prompt.match(/Apartado: «(.+?)»/) || ["", "?"])[1];
      return {
        text: "Explicación reescrita de " + apartado + ".\n\n" +
          "- Dato conservado: 21 %\n\n> [!examen] Esto cae seguro.",
      };
    },
    {
      json: async () => ({ correcta: true, problemas: [], sugerencia: "" }),
      limits: async () => ({ maxInputBytes: 1e6 }),
    },
  );
  window.claude = { use: async (n) => (n === "sample" ? sample : null) };
});

await page.setInputFiles("#file", fixture("temario-con-indice.pdf"));
await page.waitForSelector("#doc:not(.hidden)", { timeout: 180000 });
await page.waitForSelector("#aiCard:not(.hidden)", { timeout: 30000 });
comprobar("se ofrece el repaso cuando hay puente con Claude", true);

const antes = await page.evaluate(() => state.analyses.length);
await page.click("#aiRun");
await page.waitForSelector("#aiBadge:not(.hidden)", { timeout: 120000 });

const info = await page.evaluate(() => ({
  total: state.analyses.length,
  mejorados: state.analyses.filter((a) => a.mejorado).length,
  portada: state.analyses[0].markdown,
  muestra: state.analyses[1].markdown,
  capitulos: state.chapters.length,
  reglas: window.__prompts[0],
}));

comprobar("no se pierde ningún apartado", info.total === antes);
comprobar("se reescriben los nueve apartados", info.mejorados === 9);
comprobar("cada apartado conserva su título",
  info.muestra.startsWith("### TEMA 1 - LA ACTIVIDAD COMERCIAL · 1.1"));
comprobar("el texto reescrito sustituye al extractivo",
  info.muestra.includes("Explicación reescrita"));
comprobar("la portada dice que lo ha repasado Claude",
  info.portada.includes("Claude ha repasado el temario entero"));
comprobar("la portada ya no se anuncia como extractiva",
  !info.portada.includes("Resumen extractivo"));
comprobar("el audio se rehace con el texto nuevo", info.capitulos === info.total);
comprobar("el aviso de no inventar viaja en el prompt",
  info.reglas.includes("No inventes NADA"));
comprobar("se le manda el texto literal del PDF",
  info.reglas.includes("TEXTO LITERAL DE LOS APUNTES"));
comprobar("sin errores de página", errores.length === 0);
if (errores.length) console.log(errores.join("\n"));
await browser.close();
salir();
