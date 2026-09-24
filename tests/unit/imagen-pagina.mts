/**
 * El lector del servidor saca la imagen escaneada de cada página sin librería
 * gráfica ni procesos aparte, y el texto se lee igual de bien.
 *
 *   npx tsx tests/unit/imagen-pagina.mts [pdf]
 */
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
require_.cache[require_.resolve("server-only")] = { exports: {} } as never;

const { abrirParaImagenes, imagenDePagina } = await import("../../src/lib/pdf/imagen-pagina");
const { createWorker } = await import("tesseract.js");

const PDF = process.argv[2] ?? "tests/fixtures/escaneado-largo.pdf";
const MODELO = existsSync("public/ocr/rapido/spa.traineddata.gz") ? "public/ocr/rapido" : "node_modules/@tesseract.js-data/spa/4.0.0_best_int";
// Frases que salen en cada página del escaneado de prueba.
const ESPERADAS = ["instalaciones", "tension", "apartado"];

let fallos = 0;
function comprobar(titulo: string, ok: boolean, detalle = "") {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo + (!ok && detalle ? ` — ${detalle}` : ""));
  if (!ok) fallos += 1;
}

const doc = await abrirParaImagenes(new Uint8Array(readFileSync(PDF)));
const lector = await createWorker("spa", 1, { langPath: MODELO, cachePath: "/tmp/alicia-tess-prueba", gzip: true });
let tImagen = 0, tLeer = 0, paginas = 0;
for (const n of [1, 5, 9]) {
  let t = Date.now();
  const bmp = await imagenDePagina(doc, n);
  tImagen += Date.now() - t;
  comprobar(`página ${n}: se saca la imagen`, bmp !== null);
  if (!bmp) continue;
  t = Date.now();
  const { data } = await lector.recognize(bmp);
  tLeer += Date.now() - t;
  paginas++;
  const texto = data.text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  comprobar(`página ${n}: se lee el texto`, ESPERADAS.every((p) => texto.includes(p)), texto.slice(0, 80));
}
console.log(`\n  sacar imagen ${(tImagen / paginas / 1000).toFixed(2)} s/pág · leer ${(tLeer / paginas / 1000).toFixed(2)} s/pág`);
await lector.terminate();
await doc.destroy();
console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nEl lector del servidor funciona sin librería gráfica");
process.exit(fallos ? 1 : 0);
