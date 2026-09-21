/**
 * Extraccion de texto del PDF pagina a pagina con pdfjs-dist.
 *
 * Se reconstruyen los saltos de linea a partir de las coordenadas de cada
 * fragmento de texto, lo que conserva titulos, listas y numeraciones mucho
 * mejor que concatenar los items en crudo.
 */
import "server-only";
import { loadPdfjs } from "./pdfjs";

export type PageExtraction = {
  pageNumber: number;
  text: string;
  charCount: number;
  source: "TEXT" | "OCR" | "EMPTY";
};

export type PdfExtraction = {
  pageCount: number;
  pages: PageExtraction[];
  /** Porcentaje de paginas con texto util. */
  textCoverage: number;
  /** Paginas que parecen escaneadas (sin texto embebido). */
  scannedPages: number[];
  info: { title?: string; author?: string; encrypted: boolean };
};

export class PdfProtectedError extends Error {
  code = "PDF_PROTECTED";
  constructor() {
    super("El PDF parece estar protegido con contrasena.");
  }
}

export class PdfInvalidError extends Error {
  code = "PDF_INVALID";
  constructor(message = "El archivo no es un PDF valido o esta danado.") {
    super(message);
  }
}

/** Una pagina con menos caracteres que esto se considera "sin texto util". */
const MIN_CHARS_PER_PAGE = 40;

type TextItem = {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
};

type Line = { y: number; height: number; parts: { x: number; width: number; str: string }[] };

/**
 * Reconstruye el texto de una pagina agrupando los fragmentos por linea
 * (coordenada Y) y separando parrafos cuando el salto vertical es mayor de
 * lo normal. Asi se conservan titulos, listas y numeracion.
 */
function itemsToText(items: TextItem[]): string {
  const lines: Line[] = [];
  const tolerance = 2.5;

  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const height = item.height && item.height > 0 ? item.height : 10;
    let line = lines.find((l) => Math.abs(l.y - y) <= tolerance);
    if (!line) {
      line = { y, height, parts: [] };
      lines.push(line);
    }
    line.height = Math.max(line.height, height);
    line.parts.push({ x, width: item.width ?? item.str.length * 4, str: item.str });
  }

  if (lines.length === 0) return "";

  lines.sort((a, b) => b.y - a.y);

  // Altura de linea tipica: mediana de los saltos verticales consecutivos.
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y);
  const sorted = [...gaps].sort((a, b) => a - b);
  const medianGap = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 14;

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    line.parts.sort((a, b) => a.x - b.x);

    let rendered = "";
    let prevEnd = -Infinity;
    for (const part of line.parts) {
      const needsSpace =
        rendered !== "" &&
        part.x - prevEnd > 1 &&
        !rendered.endsWith(" ") &&
        !part.str.startsWith(" ");
      if (needsSpace) rendered += " ";
      rendered += part.str;
      prevEnd = part.x + part.width;
    }

    rendered = rendered.replace(/\s+/g, " ").trim();
    if (!rendered) continue;

    if (i > 0) {
      const gap = lines[i - 1].y - line.y;
      // Un salto claramente mayor que el interlineado indica parrafo nuevo.
      if (gap > medianGap * 1.6) out.push("");
    }
    out.push(rendered);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractPdf(data: Buffer): Promise<PdfExtraction> {
  const pdfjs = await loadPdfjs();

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(data),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
  } catch (error) {
    const name = (error as { name?: string })?.name ?? "";
    if (name === "PasswordException") throw new PdfProtectedError();
    throw new PdfInvalidError();
  }

  const pageCount = doc.numPages;
  const pages: PageExtraction[] = [];
  const scannedPages: number[] = [];

  let metadataInfo: { Title?: string; Author?: string } = {};
  try {
    const meta = await doc.getMetadata();
    metadataInfo = (meta.info ?? {}) as { Title?: string; Author?: string };
  } catch {
    /* los metadatos son opcionales */
  }

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    let text = "";
    try {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      text = itemsToText(content.items as unknown as TextItem[]);
      page.cleanup();
    } catch {
      text = "";
    }

    const charCount = text.replace(/\s/g, "").length;
    const usable = charCount >= MIN_CHARS_PER_PAGE;
    if (!usable) scannedPages.push(pageNumber);

    pages.push({
      pageNumber,
      text,
      charCount,
      source: usable ? "TEXT" : "EMPTY",
    });
  }

  await doc.destroy();

  const withText = pages.filter((p) => p.source === "TEXT").length;

  return {
    pageCount,
    pages,
    textCoverage: pageCount === 0 ? 0 : Math.round((withText / pageCount) * 100),
    scannedPages,
    info: {
      title: metadataInfo.Title,
      author: metadataInfo.Author,
      encrypted: false,
    },
  };
}

/** Comprueba la cabecera magica del fichero antes de procesarlo. */
export function looksLikePdf(data: Buffer): boolean {
  return data.subarray(0, 5).toString("latin1") === "%PDF-";
}

/**
 * Deteccion basica de contenido activo en el PDF (JavaScript embebido,
 * acciones de lanzamiento). No bloquea el procesado -nunca ejecutamos el
 * PDF- pero permite avisar al usuario.
 */
export function detectActiveContent(data: Buffer): string[] {
  const head = data.toString("latin1");
  const flags: string[] = [];
  if (/\/JavaScript|\/JS\b/.test(head)) flags.push("JavaScript embebido");
  if (/\/Launch\b/.test(head)) flags.push("acciones de lanzamiento");
  if (/\/EmbeddedFile/.test(head)) flags.push("ficheros adjuntos");
  return flags;
}
