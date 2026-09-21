/**
 * Carga de pdfjs en el servidor.
 *
 * pdfjs necesita saber dónde está el módulo del "worker". En un servidor
 * empaquetado no se puede usar `require.resolve` (el empaquetador lo
 * reescribe), así que se localiza el fichero recorriendo los `node_modules`
 * y se le pasa como URL de fichero.
 */
import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WORKER_RELATIVE = "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs";

let cachedWorkerSrc: string | null = null;

function resolveWorkerSrc(): string {
  if (cachedWorkerSrc) return cachedWorkerSrc;

  const candidates: string[] = [];
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth++) {
    candidates.push(path.join(dir, WORKER_RELATIVE));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedWorkerSrc = pathToFileURL(candidate).href;
      return cachedWorkerSrc;
    }
  }

  throw new Error(
    "No encontramos el worker de pdfjs. Comprueba que la dependencia pdfjs-dist está instalada.",
  );
}

export type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let cachedModule: Promise<PdfJs> | null = null;

/** Devuelve pdfjs listo para usar (una sola vez por proceso). */
export function loadPdfjs(): Promise<PdfJs> {
  if (!cachedModule) {
    cachedModule = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = resolveWorkerSrc();
      return pdfjs;
    });
  }
  return cachedModule;
}
