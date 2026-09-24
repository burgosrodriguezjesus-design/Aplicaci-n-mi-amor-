#!/usr/bin/env node
/**
 * Deja en public/ocr/ lo que el navegador necesita para leer páginas
 * escaneadas en el propio dispositivo: el motor de lectura, los modelos de
 * español y el dibujante de PDF. Se sirven como ficheros estáticos (desde la
 * CDN en Vercel), así que no cuentan para el tamaño de las funciones.
 *
 * Se ejecuta al construir (npm run build) y al arrancar en desarrollo.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, "public", "ocr");
const nm = (...partes) => path.join(raiz, "node_modules", ...partes);

const ficheros = [
  [nm("tesseract.js", "dist", "tesseract.min.js"), "tesseract.min.js"],
  [nm("tesseract.js", "dist", "worker.min.js"), "worker.min.js"],
  // Solo las variantes LSTM: es el modo que se usa (oem 1).
  [nm("tesseract.js-core", "tesseract-core-lstm.wasm.js"), "core/tesseract-core-lstm.wasm.js"],
  [nm("tesseract.js-core", "tesseract-core-simd-lstm.wasm.js"), "core/tesseract-core-simd-lstm.wasm.js"],
  [
    nm("tesseract.js-core", "tesseract-core-relaxedsimd-lstm.wasm.js"),
    "core/tesseract-core-relaxedsimd-lstm.wasm.js",
  ],
  [path.join(raiz, "assets", "ocr", "rapido", "spa.traineddata.gz"), "rapido/spa.traineddata.gz"],
  [
    nm("@tesseract.js-data", "spa", "4.0.0_best_int", "spa.traineddata.gz"),
    "preciso/spa.traineddata.gz",
  ],
  [nm("pdfjs-dist", "legacy", "build", "pdf.min.mjs"), "pdf.min.mjs"],
  [nm("pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs"), "pdf.worker.min.mjs"],
];

let faltan = 0;
for (const [origen, relativo] of ficheros) {
  if (!existsSync(origen)) {
    console.warn(`  (falta ${path.relative(raiz, origen)}: la lectura en el dispositivo no estará)`);
    faltan += 1;
    continue;
  }
  const final = path.join(destino, relativo);
  await mkdir(path.dirname(final), { recursive: true });
  await copyFile(origen, final);
}

if (!process.env.OCR_NAVEGADOR_SILENCIO) {
  console.log(
    faltan
      ? `Lectura en el dispositivo: faltan ${faltan} ficheros.`
      : "Lectura en el dispositivo preparada → public/ocr/",
  );
}
