/**
 * OCR para páginas escaneadas.
 *
 * Flujo: la página se rasteriza a PNG y la imagen se transcribe. Hay dos
 * motores y se elige el mejor disponible:
 *
 *  1. `tesseract` — local y gratuito. Se usa por defecto si la dependencia
 *     opcional `tesseract.js` está instalada (lo está con `npm install`).
 *     La primera vez descarga los datos del idioma y los guarda en disco.
 *  2. `anthropic` — transcripción con modelo de visión. Mejor con escaneos
 *     malos o manuscritos, pero consume una llamada por página. Se usa si no
 *     hay tesseract, o si se fuerza con OCR_PROVIDER="anthropic".
 *
 * El rasterizado se ejecuta en un proceso aparte (scripts/raster-worker.mjs)
 * porque la librería nativa de dibujo puede caerse con algunos PDF, y un fallo
 * así tumbaría el servidor entero.
 */
import "server-only";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { cpus } from "node:os";
import { env } from "../env";

const run = promisify(execFile);

export type OcrResult = { pageNumber: number; text: string; engine: string };

export type OcrEngine = "tesseract" | "anthropic" | "none";

/** Páginas rasterizadas de una vez. Acota memoria y espacio en disco. */
const BATCH_SIZE = 4;
/** Margen de tiempo por lote (un escaneo grande tarda). */
const RASTER_TIMEOUT_MS = 120_000;

/**
 * Resolución del rasterizado. 1.6 da el mismo texto que 2 y tarda un 15 %
 * menos; con escaneos muy pobres puede convenir subirlo.
 */
function rasterScale() {
  const value = Number(process.env.OCR_SCALE);
  return Number.isFinite(value) && value >= 1 && value <= 4 ? value : 1.6;
}

/**
 * Páginas reconocidas en paralelo. El motor local es trabajo de CPU: tantas
 * como núcleos (hasta 4). El de visión son llamadas de red: menos, para no
 * chocar con los límites de la API.
 */
function ocrConcurrency(engine: OcrEngine) {
  const configured = Number(process.env.OCR_CONCURRENCY);
  if (Number.isFinite(configured) && configured >= 1) return Math.min(8, configured);
  if (engine === "anthropic") return 3;
  const cores = Math.max(1, cpus().length || 1);
  return Math.max(1, Math.min(4, cores));
}

function moduleAvailable(name: string) {
  try {
    // require.resolve no sobrevive al empaquetado: se busca en node_modules.
    let dir = process.cwd();
    for (let depth = 0; depth < 6; depth++) {
      if (existsSync(path.join(dir, "node_modules", name, "package.json"))) return true;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* sin acceso al sistema de ficheros */
  }
  return false;
}

let cachedEngine: OcrEngine | null = null;

/** Motor de OCR que se va a usar realmente. */
export function ocrEngine(): OcrEngine {
  if (cachedEngine) return cachedEngine;

  const forced = (process.env.OCR_PROVIDER || "").toLowerCase();
  if (forced === "none") return (cachedEngine = "none");
  if (forced === "anthropic" && env.ai.enabled) return (cachedEngine = "anthropic");
  if (forced === "tesseract") return (cachedEngine = "tesseract");

  if (moduleAvailable("tesseract.js")) return (cachedEngine = "tesseract");
  if (env.ai.enabled) return (cachedEngine = "anthropic");
  return (cachedEngine = "none");
}

export function ocrAvailable(): boolean {
  return ocrEngine() !== "none";
}

/** Nombre legible del motor, para los mensajes de la interfaz. */
export function ocrEngineLabel(): string {
  const engine = ocrEngine();
  if (engine === "tesseract") return "reconocimiento local";
  if (engine === "anthropic") return "reconocimiento con IA";
  return "sin reconocimiento";
}

const rasterScript = () => path.join(process.cwd(), "scripts", "raster-worker.mjs");

/**
 * Rasteriza un grupo de páginas en un proceso aparte.
 * Devuelve un mapa de número de página a PNG; las páginas que fallen no salen.
 */
async function rasterizeBatch(
  pdfPath: string,
  pageNumbers: number[],
  scale: number,
): Promise<Map<number, Buffer>> {
  const images = new Map<number, Buffer>();
  const script = rasterScript();
  if (!existsSync(script)) return images;

  const outDir = await mkdtemp(path.join(os.tmpdir(), "estudia-raster-"));
  try {
    await run(
      process.execPath,
      [script, pdfPath, outDir, String(scale), pageNumbers.join(",")],
      { timeout: RASTER_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
    );
    for (const pageNumber of pageNumbers) {
      const file = path.join(outDir, `p${pageNumber}.png`);
      if (existsSync(file)) images.set(pageNumber, await readFile(file));
    }
  } catch {
    // El proceso se cayó o agotó el tiempo: estas páginas se quedan sin OCR.
  } finally {
    await rm(outDir, { recursive: true, force: true }).catch(() => undefined);
  }
  return images;
}

/** Rasteriza una única página. Devuelve null si no se ha podido. */
export async function renderPageToPng(
  pdfPath: string,
  pageNumber: number,
  scale = 2,
): Promise<Buffer | null> {
  const images = await rasterizeBatch(pdfPath, [pageNumber], scale);
  return images.get(pageNumber) ?? null;
}

/* ── Motor local ────────────────────────────────────────────── */

type TesseractWorker = {
  recognize: (image: Buffer) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
};

/** Tiempo máximo para preparar el motor y para reconocer una página. */
const WORKER_TIMEOUT_MS = 90_000;
const RECOGNIZE_TIMEOUT_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Se ha agotado el tiempo: ${label}`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function findPackageDir(name: string): string | null {
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth++) {
    const candidate = path.join(dir, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Deja los datos del idioma en una carpeta local y la devuelve.
 *
 * Se gestiona aquí a propósito: tesseract.js lanza el fallo de descarga fuera
 * de la promesa, lo que dejaba el trabajo colgado para siempre. Haciéndolo
 * nosotros, un problema de red es un error normal y manejable.
 */
async function ensureLanguageData(lang: string): Promise<string | null> {
  if (process.env.OCR_LANG_PATH) return process.env.OCR_LANG_PATH;

  const file = `${lang}.traineddata.gz`;

  // 1. Paquete de datos instalado (`npm install` lo trae para el español).
  const pkg = findPackageDir(`@tesseract.js-data/${lang}`);
  if (pkg) {
    for (const variant of ["4.0.0_best_int", "4.0.0"]) {
      if (existsSync(path.join(pkg, variant, file))) return path.join(pkg, variant);
    }
  }

  // 2. Copia ya descargada en el almacenamiento.
  const cacheDir = path.resolve(process.cwd(), env.storage.dir, "tessdata");
  if (existsSync(path.join(cacheDir, file))) return cacheDir;

  // 3. Descarga única, con tiempo máximo y errores manejables.
  try {
    const url = `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int/${file}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1000) return null;
    await mkdir(cacheDir, { recursive: true });
    await writeFile(path.join(cacheDir, file), bytes);
    return cacheDir;
  } catch {
    return null;
  }
}

async function createTesseractWorker(): Promise<TesseractWorker | null> {
  try {
    const lang = process.env.OCR_LANGS || "spa";
    const langPath = await ensureLanguageData(lang);
    if (!langPath) return null;

    const mod = (await import(/* webpackIgnore: true */ "tesseract.js" as string)) as {
      createWorker?: (
        langs: string,
        oem?: number,
        options?: Record<string, unknown>,
      ) => Promise<TesseractWorker>;
      default?: {
        createWorker?: (
          langs: string,
          oem?: number,
          options?: Record<string, unknown>,
        ) => Promise<TesseractWorker>;
      };
    };
    const createWorker = mod.createWorker ?? mod.default?.createWorker;
    if (!createWorker) return null;

    return await withTimeout(
      createWorker(lang, 1, {
        langPath,
        cachePath: langPath,
        logger: () => undefined,
      }),
      WORKER_TIMEOUT_MS,
      "preparando el reconocimiento de texto",
    );
  } catch {
    return null;
  }
}

/* ── Motor de visión ────────────────────────────────────────── */

async function transcribeWithAnthropic(png: Buffer): Promise<string> {
  const { getAnthropic } = await import("../ai/client");
  const client = getAnthropic();
  if (!client) throw new Error("Sin cliente de IA");

  const response = await client.messages.create({
    model: env.ai.model,
    max_tokens: 4000,
    system:
      "Eres un sistema de OCR. Transcribes literalmente el texto de una página escaneada. " +
      "No resumes, no interpretas, no añades nada. Conservas títulos, listas, numeración, " +
      "fórmulas y tablas (las tablas en formato Markdown). Si una zona es ilegible escribes [ilegible]. " +
      "Si la página no contiene texto respondes exactamente: [sin texto]",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: png.toString("base64") },
          },
          { type: "text", text: "Transcribe literalmente el texto de esta página." },
        ],
      },
    ],
  });

  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n")
    .trim();

  return text === "[sin texto]" ? "" : text;
}

/**
 * Aplica OCR a una lista de páginas del PDF indicado.
 * Tolerante a fallos: una página que no se pueda transcribir no interrumpe el
 * resto del documento.
 *
 * @param pdfPath ruta al PDF en disco (no el buffer: el rasterizado va aparte)
 */
export async function ocrPages(
  pdfPath: string,
  pageNumbers: number[],
  onProgress?: (done: number, total: number) => void | Promise<void>,
  /**
   * Se llama en cuanto una pagina queda reconocida, no al final. Permite
   * guardarla ya: si el proceso muere a mitad -un alojamiento gratuito se
   * duerme solo- no se pierde el trabajo hecho hasta ese momento.
   */
  onPage?: (result: OcrResult) => void | Promise<void>,
): Promise<OcrResult[]> {
  const engine = ocrEngine();
  if (engine === "none" || pageNumbers.length === 0) return [];

  const results: OcrResult[] = [];
  const scale = rasterScale();

  // Cola de lotes: cada hilo coge el siguiente que quede libre.
  const batches: number[][] = [];
  for (let start = 0; start < pageNumbers.length; start += BATCH_SIZE) {
    batches.push(pageNumbers.slice(start, start + BATCH_SIZE));
  }

  let cursor = 0;
  let done = 0;
  const workers: TesseractWorker[] = [];

  const runLane = async () => {
    // Cada hilo tiene su propio motor local: compartir uno los serializaría.
    let worker: TesseractWorker | null = null;
    if (engine === "tesseract") {
      worker = await createTesseractWorker();
      if (!worker) return;
      workers.push(worker);
    }

    for (;;) {
      const index = cursor++;
      const batch = batches[index];
      if (!batch) return;

      const images = await rasterizeBatch(pdfPath, batch, scale);

      for (const pageNumber of batch) {
        const png = images.get(pageNumber);
        if (png) {
          try {
            const text =
              engine === "tesseract" && worker
                ? (
                    await withTimeout(
                      worker.recognize(png),
                      RECOGNIZE_TIMEOUT_MS,
                      `reconociendo la página ${pageNumber}`,
                    )
                  ).data.text.trim()
                : await transcribeWithAnthropic(png);
            if (text) {
              const result: OcrResult = { pageNumber, text, engine };
              results.push(result);
              await onPage?.(result);
            }
          } catch {
            /* página no transcribible: se deja vacía */
          }
        }
        done += 1;
        await onProgress?.(done, pageNumbers.length);
      }
    }
  };

  const lanes = Math.min(ocrConcurrency(engine), batches.length);

  try {
    await Promise.all(Array.from({ length: lanes }, runLane));
  } finally {
    await Promise.all(workers.map((w) => w.terminate().catch(() => undefined)));
  }

  results.sort((a, b) => a.pageNumber - b.pageNumber);
  return results;
}
