/** Mide por separado el rasterizado y el reconocimiento. */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
const run = promisify(execFile);

const pdf = process.argv[2];
const pages = Array.from({ length: Number(process.argv[3] || 8) }, (_, i) => i + 1);

const t0 = Date.now();
const outDir = await mkdtemp(path.join(os.tmpdir(), "bench-"));
await run(process.execPath, ["scripts/raster-worker.mjs", pdf, outDir, "2", pages.join(",")], { timeout: 300000, maxBuffer: 1e6 });
const images = [];
for (const n of pages) {
  const f = path.join(outDir, `p${n}.png`);
  if (existsSync(f)) images.push(await readFile(f));
}
const tRaster = Date.now() - t0;
console.log(`rasterizado: ${pages.length} páginas en ${(tRaster/1000).toFixed(1)}s (${(tRaster/pages.length).toFixed(0)} ms/página)`);

const { createWorker } = await import("tesseract.js");
const langPath = path.join(process.cwd(), "node_modules/@tesseract.js-data/spa/4.0.0_best_int");
const t1 = Date.now();
const worker = await createWorker("spa", 1, { langPath, cachePath: langPath, logger: () => {} });
console.log(`arranque del motor: ${((Date.now()-t1)/1000).toFixed(1)}s`);

const t2 = Date.now();
for (const png of images) await worker.recognize(png);
const tOcr = Date.now() - t2;
console.log(`reconocimiento secuencial: ${images.length} páginas en ${(tOcr/1000).toFixed(1)}s (${(tOcr/images.length/1000).toFixed(1)} s/página)`);
await worker.terminate();
await rm(outDir, { recursive: true, force: true });
console.log(`→ estimación para 384 páginas, secuencial: ${Math.round((tRaster/pages.length + tOcr/images.length) * 384 / 60000)} min`);
