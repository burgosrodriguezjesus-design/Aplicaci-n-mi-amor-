#!/usr/bin/env node
/**
 * Prepara una copia servible de la demo y pasa las pruebas de navegador.
 * Requiere haber ejecutado antes `node scripts/build-demo-assets.mjs`.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdir, cp, writeFile, access } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const web = path.join(root, ".tmp-demo-web");
const PORT = Number(process.env.DEMO_PORT || 8811);

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".pdf": "application/pdf", ".gz": "application/gzip", ".png": "image/png",
};

async function existe(p) { try { await access(p); return true; } catch { return false; } }

async function preparar() {
  const assets = path.join(root, "demo/assets/tess");
  if (!await existe(assets)) {
    throw new Error("Falta demo/assets: ejecuta antes `node scripts/build-demo-assets.mjs`");
  }
  await mkdir(path.join(web, "pdfjs"), { recursive: true });
  await cp(path.join(root, "demo/assets"), path.join(web, "assets"), { recursive: true });

  // pdf.js servido en local: el entorno de pruebas no siempre alcanza la CDN.
  const vendor = path.join(root, ".tmp-demo-web/pdfjs");
  if (!await existe(path.join(vendor, "pdf.min.js"))) {
    console.log("Descargando pdf.js 3.11.174 para las pruebas…");
    await new Promise((r, reject) => {
      spawn("npm", ["pack", "pdfjs-dist@3.11.174", "--pack-destination", web],
        { stdio: "ignore" }).on("exit", (c) => (c === 0 ? r() : reject(new Error("npm pack falló"))));
    });
    await new Promise((r, reject) => {
      spawn("tar", ["xzf", path.join(web, "pdfjs-dist-3.11.174.tgz"), "-C", web,
        "package/build/pdf.min.js", "package/build/pdf.worker.min.js"],
        { stdio: "ignore" }).on("exit", (c) => (c === 0 ? r() : reject(new Error("tar falló"))));
    });
    for (const f of ["pdf.min.js", "pdf.worker.min.js"]) {
      await cp(path.join(web, "package/build", f), path.join(vendor, f));
    }
  }

  const html = (await readFile(path.join(root, "demo/estudia-demo.html"), "utf8"))
    .replace("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", "pdfjs/pdf.min.js")
    .replace("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js", "pdfjs/pdf.worker.min.js");
  await writeFile(path.join(web, "index.html"), html);
  for (const f of ["apuntes-escaneados.pdf", "escaneado-largo.pdf"]) {
    const origen = path.join(root, "tests/fixtures", f);
    if (await existe(origen)) await cp(origen, path.join(web, f));
  }
}

function servir() {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const file = path.join(web, rel);
    if (!file.startsWith(web)) { res.writeHead(403).end(); return; }
    res.setHeader("Content-Type", TIPOS[path.extname(file)] || "application/octet-stream");
    createReadStream(file).on("error", () => res.writeHead(404).end()).pipe(res);
  });
  return new Promise((r) => server.listen(PORT, "127.0.0.1", () => r(server)));
}

const pruebas = ["ocr-local.mjs", "ocr-fallback.mjs", "ocr-claude.mjs", "ocr-libro.mjs"];

await preparar();
const server = await servir();
let fallos = 0;
for (const prueba of pruebas) {
  console.log("\n══ " + prueba + " ".padEnd(40, "═"));
  const code = await new Promise((r) => {
    spawn(process.execPath, [path.join(root, "tests/demo", prueba)],
      { stdio: "inherit", env: { ...process.env, DEMO_URL: `http://127.0.0.1:${PORT}/index.html` } })
      .on("exit", r);
  });
  if (code !== 0) fallos += 1;
}
server.close();
console.log(fallos ? `\n${fallos} prueba(s) con fallos` : "\nTodas las pruebas de la demo han pasado");
process.exit(fallos ? 1 : 0);
