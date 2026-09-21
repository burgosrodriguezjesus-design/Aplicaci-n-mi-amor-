/**
 * OCR para paginas escaneadas.
 *
 * Flujo: la pagina se rasteriza con pdfjs + @napi-rs/canvas y la imagen se
 * transcribe. Dos motores posibles:
 *
 *  1. `anthropic` (por defecto si hay ANTHROPIC_API_KEY): transcripcion con
 *     modelo de vision. Prompt estricto de "transcribe, no interpretes".
 *  2. `tesseract`: motor local. Requiere instalar la dependencia opcional
 *     `tesseract.js` (`npm i tesseract.js`) y descarga los datos del idioma
 *     la primera vez.
 *
 * Si no hay ningun motor disponible el documento sigue adelante y las paginas
 * afectadas se marcan como vacias, avisando al usuario con un mensaje claro.
 */
import "server-only";
import { env } from "../env";
import { loadPdfjs } from "./pdfjs";

export type OcrResult = { pageNumber: number; text: string; engine: string };

let canvasModule: typeof import("@napi-rs/canvas") | null | undefined;

async function loadCanvas() {
  if (canvasModule !== undefined) return canvasModule;
  try {
    const mod = await import("@napi-rs/canvas");
    // pdfjs necesita estos globales del DOM para dibujar texto vectorial.
    const g = globalThis as Record<string, unknown>;
    g.Path2D ??= mod.Path2D;
    g.DOMMatrix ??= mod.DOMMatrix;
    g.ImageData ??= mod.ImageData;
    canvasModule = mod;
  } catch {
    canvasModule = null;
  }
  return canvasModule;
}

/** Rasteriza una pagina del PDF a PNG. Devuelve null si no hay rasterizador. */
export async function renderPageToPng(
  data: Buffer,
  pageNumber: number,
  scale = 2,
): Promise<Buffer | null> {
  const canvasLib = await loadCanvas();
  if (!canvasLib) return null;

  const pdfjs = await loadPdfjs();

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    verbosity: 0,
  }).promise;

  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = canvasLib.createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // @ts-expect-error los tipos de @napi-rs/canvas y pdfjs no coinciden exactamente
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const png = canvas.toBuffer("image/png");
    page.cleanup();
    return Buffer.from(png);
  } finally {
    await doc.destroy();
  }
}

async function transcribeWithAnthropic(png: Buffer): Promise<string> {
  const { getAnthropic } = await import("../ai/client");
  const client = getAnthropic();
  if (!client) throw new Error("Sin cliente de IA");

  const response = await client.messages.create({
    model: env.ai.model,
    max_tokens: 4000,
    system:
      "Eres un sistema de OCR. Transcribes literalmente el texto de una pagina escaneada. " +
      "No resumes, no interpretas, no anades nada. Conservas titulos, listas, numeracion, " +
      "formulas y tablas (las tablas en formato Markdown). Si una zona es ilegible escribes [ilegible]. " +
      "Si la pagina no contiene texto respondes exactamente: [sin texto]",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: png.toString("base64") },
          },
          { type: "text", text: "Transcribe literalmente el texto de esta pagina." },
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

async function transcribeWithTesseract(png: Buffer): Promise<string> {
  // Dependencia opcional: solo existe si el usuario la instala.
  const mod = (await import(
    /* webpackIgnore: true */ "tesseract.js" as string
  ).catch(() => null)) as {
    recognize?: (i: Buffer, l: string) => Promise<{ data: { text: string } }>;
  } | null;
  if (!mod?.recognize) throw new Error("tesseract.js no esta instalado");
  const result = await mod.recognize(png, "spa+eng");
  return result.data.text.trim();
}

export function ocrAvailable(): boolean {
  return env.ai.enabled || process.env.OCR_PROVIDER === "tesseract";
}

/**
 * Aplica OCR a una lista de paginas. Tolerante a fallos: una pagina que no se
 * puede transcribir no interrumpe el resto del documento.
 */
export async function ocrPages(
  data: Buffer,
  pageNumbers: number[],
  onProgress?: (done: number, total: number) => void | Promise<void>,
): Promise<OcrResult[]> {
  const results: OcrResult[] = [];
  const preferTesseract = process.env.OCR_PROVIDER === "tesseract";

  for (let i = 0; i < pageNumbers.length; i++) {
    const pageNumber = pageNumbers[i];
    try {
      const png = await renderPageToPng(data, pageNumber, 2);
      if (!png) break; // sin rasterizador no tiene sentido seguir

      let text = "";
      let engine = "";
      if (preferTesseract) {
        text = await transcribeWithTesseract(png);
        engine = "tesseract";
      } else if (env.ai.enabled) {
        text = await transcribeWithAnthropic(png);
        engine = "anthropic-vision";
      } else {
        break;
      }

      if (text) results.push({ pageNumber, text, engine });
    } catch {
      /* pagina no transcribible: se deja vacia y se avisa al usuario */
    }
    await onProgress?.(i + 1, pageNumbers.length);
  }

  return results;
}
