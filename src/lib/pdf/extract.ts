/**
 * Extraccion de texto del PDF pagina a pagina con pdfjs-dist.
 *
 * Se reconstruyen los saltos de linea a partir de las coordenadas de cada
 * fragmento de texto, lo que conserva titulos, listas y numeraciones mucho
 * mejor que concatenar los items en crudo.
 */
import "server-only";
import { loadPdfjs } from "./pdfjs";
import { paginaDesdeItems, type PageLine, type TextItem } from "./lineas";

export type { PageLine } from "./lineas";

export type PageExtraction = {
  pageNumber: number;
  text: string;
  charCount: number;
  /** Lineas con sus senales tipograficas (vacio en paginas reconocidas por OCR). */
  lines?: PageLine[];
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
    let pagina: ReturnType<typeof paginaDesdeItems>;
    try {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      pagina = paginaDesdeItems(content.items as unknown as TextItem[]);
      page.cleanup();
    } catch {
      pagina = paginaDesdeItems([]);
    }

    if (pagina.source === "EMPTY") scannedPages.push(pageNumber);
    pages.push({ pageNumber, ...pagina });
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
