/**
 * Comprueba, sin levantar el servidor, que el motor entiende un temario:
 * encuentra su índice, le pone los niveles buenos y trocea por apartados.
 *
 *   npx tsx tests/unit/estructura.ts
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// `server-only` corta la importación fuera de Next: se neutraliza para probar.
const require = (await import("node:module")).createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = { exports: {} } as never;

const { extractPdf } = await import("../../src/lib/pdf/extract");
const { readStructure, mergeHeadings } = await import("../../src/lib/pdf/toc");
const { buildChunks, chunkOptionsFor, detectHeadings } = await import("../../src/lib/pdf/structure");

let fallos = 0;
function comprobar(titulo: string, condicion: boolean) {
  console.log((condicion ? "  ✓ " : "  ✗ ") + titulo);
  if (!condicion) fallos += 1;
}

const datos = await readFile(path.join(raiz, "tests/fixtures/temario-con-indice.pdf"));
const extraido = await extractPdf(datos);
const pages = extraido.pages.map((p) => ({
  pageNumber: p.pageNumber,
  text: p.text,
  lines: p.lines,
}));

const estructura = readStructure(pages);
console.log("\n— índice —");
console.log(estructura.toc
  ? estructura.toc.entries.map((e) => "  " + "  ".repeat(e.level - 1) + e.title +
      "  →  papel " + e.printedPage + " / pdf " + e.pdfPage).join("\n")
  : "  (ninguno)");

comprobar("se lee el índice del libro", estructura.toc !== null);
comprobar("con sus 12 entradas", estructura.toc?.entries.length === 12);
comprobar("tres temas en primer nivel",
  estructura.toc?.entries.filter((e) => e.level === 1).length === 3);
comprobar("nueve apartados en segundo nivel",
  estructura.toc?.entries.filter((e) => e.level === 2).length === 9);
comprobar("la página del índice se aparta del contenido", estructura.tocPages.size >= 1);
comprobar("se detecta que el libro usa «TEMA n»", estructura.hasChapters);
comprobar("hay señales de tamaño de letra", estructura.bodyHeight !== null);

const totalChars = pages.reduce((n, p) => n + p.text.length, 0);
const chunks = buildChunks(pages, chunkOptionsFor(totalChars), estructura);
console.log("\n— fragmentos —\n" + chunks.map((c) => "  " + c.title).join("\n"));
comprobar("un fragmento por apartado", chunks.length === 9);
comprobar("cada fragmento lleva su tema delante",
  chunks.every((c) => c.title.includes(" · ")));

const headings = detectHeadings(pages, estructura);
const fundidos = mergeHeadings(headings, estructura.toc);
comprobar("el esquema fundido no pierde ningún apartado del índice",
  estructura.toc!.entries.every((e) =>
    fundidos.some((h) => h.title.includes(e.title.slice(0, 20)))));

const texto = chunks.map((c) => c.content).join("\n");
for (const clave of ["mayorista", "albaran", "FIFO", "PMP", "21 %", "25 m2"]) {
  comprobar(`el contenido conserva «${clave}»`, texto.includes(clave));
}

console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nTodo correcto");
process.exit(fallos ? 1 : 0);
