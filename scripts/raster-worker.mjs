/**
 * Rasteriza páginas de un PDF a PNG.
 *
 * Se ejecuta como proceso independiente a propósito: la librería nativa de
 * dibujo puede caerse con ciertos PDF (imágenes JPEG poco habituales, fuentes
 * corruptas) y un fallo así mataría el servidor entero. Aislado aquí, lo peor
 * que ocurre es que esa página se quede sin reconocer.
 *
 * Uso:  node scripts/raster-worker.mjs <pdf> <directorio> <escala> <1,2,3>
 * Salida: una línea JSON con las páginas generadas y las que fallaron.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [, , pdfPath, outDir, scaleArg, pagesArg] = process.argv;
const scale = Number(scaleArg) || 2;
const pageNumbers = String(pagesArg || "")
  .split(",")
  .map((value) => Number.parseInt(value, 10))
  .filter((value) => Number.isFinite(value) && value > 0);

const canvasLib = await import("@napi-rs/canvas");
// pdfjs espera encontrar estas clases del navegador para dibujar.
globalThis.Path2D ??= canvasLib.Path2D;
globalThis.DOMMatrix ??= canvasLib.DOMMatrix;
globalThis.ImageData ??= canvasLib.ImageData;

/** Fábrica de lienzos auxiliares que pdfjs usa para pintar imágenes. */
class NodeCanvasFactory {
  create(width, height) {
    const canvas = canvasLib.createCanvas(Math.max(1, width | 0), Math.max(1, height | 0));
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(cc, width, height) {
    cc.canvas.width = Math.max(1, width | 0);
    cc.canvas.height = Math.max(1, height | 0);
  }
  destroy(cc) {
    cc.canvas.width = 0;
    cc.canvas.height = 0;
    cc.canvas = null;
    cc.context = null;
  }
}

const { existsSync } = await import("node:fs");
function workerSrc() {
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth++) {
    const candidate = path.join(dir, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "";
}

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc();

const data = await readFile(pdfPath);
const factory = new NodeCanvasFactory();
const doc = await pdfjs.getDocument({
  data: new Uint8Array(data),
  isEvalSupported: false,
  verbosity: 0,
  canvasFactory: factory,
}).promise;

const done = [];
const failed = [];

for (const pageNumber of pageNumbers) {
  if (pageNumber > doc.numPages) { failed.push(pageNumber); continue; }
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const cc = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    cc.context.fillStyle = "#ffffff";
    cc.context.fillRect(0, 0, cc.canvas.width, cc.canvas.height);
    await page.render({ canvasContext: cc.context, viewport, canvas: cc.canvas }).promise;
    const file = path.join(outDir, `p${pageNumber}.png`);
    await writeFile(file, cc.canvas.toBuffer("image/png"));
    factory.destroy(cc);
    page.cleanup();
    done.push(pageNumber);
  } catch {
    failed.push(pageNumber);
  }
}

await doc.destroy();
process.stdout.write(JSON.stringify({ done, failed, pageCount: doc.numPages }));
