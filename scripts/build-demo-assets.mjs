#!/usr/bin/env node
/**
 * Prepara los ficheros que la demo publicada sirve junto a la página para
 * reconocer texto (OCR) dentro del propio navegador, sin depender de que el
 * visor pueda enviar imágenes a Claude ni de ninguna CDN externa.
 *
 *   node scripts/build-demo-assets.mjs
 *
 * Deja todo en demo/assets/ (no se versiona: se regenera con este script).
 */
import { mkdir, copyFile, writeFile, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "demo", "assets", "tess");

/** Idioma del OCR local. tessdata_fast es el modelo rápido de Tesseract. */
const LANG = "spa";
const LANG_URL =
  `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${LANG}.traineddata`;

const tesseractDist = path.dirname(require.resolve("tesseract.js/package.json")) + "/dist";
const coreDir = path.dirname(require.resolve("tesseract.js-core/package.json"));

/** El motor wasm: el propio Tesseract elige el que soporte el dispositivo. */
const CORES = [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
];

async function size(file) {
  const info = await stat(file);
  return (info.size / 1024 / 1024).toFixed(2) + " MB";
}

async function main() {
  await mkdir(path.join(out, "core"), { recursive: true });

  await copyFile(path.join(tesseractDist, "tesseract.min.js"), path.join(out, "tesseract.min.js"));
  console.log("·", "tesseract.min.js", await size(path.join(out, "tesseract.min.js")));

  for (const file of CORES) {
    await copyFile(path.join(coreDir, file), path.join(out, "core", file));
    console.log("·", "core/" + file, await size(path.join(out, "core", file)));
  }

  // El idioma viaja dentro del propio worker.
  //
  // Los sitios que publican esta demo solo sirven tipos de fichero web
  // conocidos, y `.traineddata(.gz)` no es uno. Así que el obrero de
  // Tesseract se publica con los datos del idioma incrustados en base64 y
  // con `fetch` interceptado: cuando Tesseract pide el idioma, lo recibe de
  // su propia memoria en lugar de la red. Sin CDN y sin descarga aparte.
  const response = await fetch(LANG_URL);
  if (!response.ok) {
    throw new Error(`No se ha podido descargar ${LANG_URL}: ${response.status}`);
  }
  const { gzipSync } = await import("node:zlib");
  const datos = gzipSync(Buffer.from(await response.arrayBuffer()), { level: 9 })
    .toString("base64");

  const prologo = `/* Obrero de Tesseract con el idioma ${LANG} incrustado (EstudIA).
   Generado por scripts/build-demo-assets.mjs — no editar a mano. */
self.__ESTUDIA_LANG_${LANG.toUpperCase()} = "${datos}";
(function () {
  var red = self.fetch;
  self.fetch = function (entrada) {
    var url = String(entrada && entrada.url ? entrada.url : entrada);
    if (/${LANG}\\.traineddata(\\.gz)?$/.test(url)) {
      var b64 = self.__ESTUDIA_LANG_${LANG.toUpperCase()};
      var texto = atob(b64);
      var bytes = new Uint8Array(texto.length);
      for (var i = 0; i < texto.length; i += 1) bytes[i] = texto.charCodeAt(i);
      return Promise.resolve(new Response(bytes, { status: 200 }));
    }
    return red.apply(self, arguments);
  };
})();
`;

  const obrero = await readFile(path.join(tesseractDist, "worker.min.js"), "utf8");
  const destino = path.join(out, "worker-estudia.js");
  await writeFile(destino, prologo + "\n" + obrero);
  console.log("·", "worker-estudia.js", await size(destino), `(incluye ${LANG}.traineddata)`);

  console.log("\nListo en", path.relative(root, out));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
