/** El índice del libro manda: temas, apartados, niveles y páginas. */
import { abrir, comprobar, salir, fixture } from "./_util.mjs";

const { browser, page, errores } = await abrir();
await page.setInputFiles("#file", fixture("temario-con-indice.pdf"));
await page.waitForSelector("#doc:not(.hidden)", { timeout: 180000 });

const info = await page.evaluate(() => ({
  indice: state.indice ? state.indice.entradas.map((e) => ({
    t: e.titulo, n: e.nivel, p: e.pagina, pdf: e.paginaPdf,
  })) : null,
  desfase: state.indice ? state.indice.desfase : null,
  paginasIndice: state.indice ? [...state.indice.paginas] : [],
  titulos: state.headings.map((h) => h.level + "·" + h.title + " [" + h.origen + "]"),
  esquema: (function recorrer(nodos, prof) {
    return (nodos || []).flatMap((n) =>
      ["  ".repeat(prof) + n.kind + " · " + n.label].concat(recorrer(n.children, prof + 1)));
  })(state.outline.nodes, 0),
  apartados: state.analyses.map((a) => a.title),
  revision: state.revision,
}));

console.log("— índice detectado —");
console.log(info.indice ? info.indice.map((e) => "  " + "  ".repeat(e.n - 1) + e.t + "  →  papel " + e.p + " / pdf " + e.pdf).join("\n") : "  (ninguno)");
console.log("  desfase papel→pdf:", info.desfase, "| páginas de índice:", info.paginasIndice.join(","));
console.log("\n— esquema —\n" + info.esquema.map((l) => "  " + l).join("\n"));
console.log("\n— apartados del resumen —\n  " + info.apartados.join("\n  "));
console.log("\n— revisión —", JSON.stringify(info.revision, null, 1));

comprobar("se detecta el índice del libro", Boolean(info.indice));
comprobar("tiene las 12 entradas (3 temas + 9 apartados)", info.indice && info.indice.length === 12);
comprobar("los temas quedan en nivel 1",
  info.indice && info.indice.filter((e) => e.n === 1).length === 3);
comprobar("los apartados quedan en nivel 2",
  info.indice && info.indice.filter((e) => e.n === 2).length === 9);
comprobar("la página del índice no se trata como contenido", info.paginasIndice.length >= 1);
comprobar("el esquema tiene tres temas",
  info.esquema.filter((l) => l.trim().startsWith("chapter")).length === 3);
comprobar("el esquema tiene los nueve apartados",
  info.esquema.filter((l) => l.trim().startsWith("section")).length === 9);
comprobar("la revisión no encuentra apartados perdidos",
  info.revision && !info.revision.aviso.some((a) => a.includes("del índice")));

// El resumen se pinta en perezoso, así que se mira el material, no el DOM.
const texto = (await page.evaluate(() => state.analyses.map((a) => a.markdown).join("\n")))
  .replace(/\s+/g, " ");
for (const clave of ["mayorista", "albaran", "FIFO", "PMP", "21 %", "25 m2"]) {
  comprobar(`el resumen conserva «${clave}»`, texto.includes(clave));
}
comprobar("sin errores de página", errores.length === 0);
if (errores.length) console.log(errores.join("\n"));
await browser.close();
salir();
