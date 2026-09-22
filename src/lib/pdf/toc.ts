/**
 * Lectura del indice del propio documento.
 *
 * Un temario casi siempre empieza por su indice, y ese indice ya dice los
 * temas, los apartados y en que pagina esta cada uno. Leerlo es, con
 * diferencia, la forma mas fiable de entender la estructura: evita adivinarla
 * a partir de mayusculas y tamanos de letra, que es donde se equivocaba antes.
 */
import "server-only";
import type { PageLine } from "./extract";

export type TocEntry = {
  title: string;
  /** Nivel dentro del indice: 1 para los temas, 2 para sus apartados. */
  level: number;
  /** Pagina impresa en el papel, tal y como la escribe el indice. */
  printedPage: number;
  /** Pagina real del PDF, una vez corregido el desfase. */
  pdfPage: number;
};

export type Toc = {
  entries: TocEntry[];
  /** Paginas ocupadas por el indice: no son contenido. */
  pages: Set<number>;
  /** Diferencia entre la numeracion impresa y la del PDF. */
  offset: number;
  /** Cuantas entradas se han podido localizar de verdad en el cuerpo. */
  matched: number;
};

export type StructureContext = {
  toc: Toc | null;
  /** Altura de letra tipica del cuerpo del texto. */
  bodyHeight: number | null;
  /** Titulo normalizado -> nivel, segun el indice. */
  confirmed: Map<string, number>;
  /** Paginas del indice, para saltarlas. */
  tocPages: Set<number>;
  /** El documento habla de "temas" o "unidades": la numeracion va un nivel por debajo. */
  hasChapters: boolean;
};

export type StructurePage = { pageNumber: number; text: string; lines?: PageLine[] };

const TOC_TITLE_RE =
  /^\s*(í|i)ndice\b|^\s*contenidos?\s*$|^\s*sumario\s*$|^\s*tabla\s+de\s+contenidos?/i;
/** "1.2 La ley de Ohm ............ 17" */
const TOC_LINE_RE = /^(.{3,150}?)[\s.·•…_–—-]{2,}(\d{1,4})\s*$/;
/** "La ley de Ohm    17" */
const TOC_LINE_SPACES_RE = /^(.{3,150}?)\s{2,}(\d{1,4})\s*$/;
const NUMBER_PREFIX_RE = /^(\d{1,2}(?:\.\d{1,2}){0,4})[.)\-–—]?\s+/;

export const CHAPTER_WORD_RE =
  /^(tema|capitulo|capítulo|unidad|bloque|parte|leccion|lección|anexo|apendice|apéndice)\s*[.:\-–—]?\s*(\d{1,3}|[ivxlc]{1,6})\b/i;

/** Minusculas, sin tildes y sin puntuacion: para comparar titulos. */
export function normalize(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Quita los puntos de relleno del final de una entrada. */
export function cleanEntry(title: string): string {
  return title.replace(/[\s.·•…_–—-]+$/, "").replace(/\s{2,}/g, " ").trim();
}

function parseEntry(text: string, totalPages: number): { title: string; printedPage: number } | null {
  const line = text.trim();
  if (line.length < 5 || line.length > 160) return null;

  const match = TOC_LINE_RE.exec(line) ?? TOC_LINE_SPACES_RE.exec(line);
  if (!match) return null;

  const title = cleanEntry(match[1]);
  const printedPage = Number.parseInt(match[2], 10);
  if (!title || title.length < 3) return null;
  // Una linea que solo son numeros es una tabla, no un indice.
  if (normalize(title).replace(/[\d ]/g, "").length < 3) return null;
  if (!printedPage || printedPage > totalPages + 40) return null;

  return { title, printedPage };
}

function entryLevel(title: string): number {
  if (CHAPTER_WORD_RE.test(title)) return 1;
  const numbered = NUMBER_PREFIX_RE.exec(title);
  if (numbered) return Math.min(numbered[1].split(".").length, 4);
  return 0;
}

/**
 * Busca el indice en las primeras paginas, o en cualquier pagina titulada
 * "Indice". Solo acepta un bloque seguido: mas adelante, una pagina con muchos
 * numeros suele ser una tabla de datos.
 */
function findToc(pages: StructurePage[]): { pages: Set<number>; entries: TocEntry[] } | null {
  const total = pages.length;
  const window = Math.min(total, Math.max(14, Math.ceil(total * 0.12)));
  const candidates: { pageNumber: number; entries: { title: string; printedPage: number }[] }[] = [];

  for (const page of pages) {
    const declared =
      page.pageNumber <= window ||
      page.text.split("\n").slice(0, 3).some((line) => TOC_TITLE_RE.test(line));
    if (!declared) continue;

    const lines = page.text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 4) continue;

    const entries = lines
      .map((line) => parseEntry(line, total))
      .filter((entry): entry is { title: string; printedPage: number } => entry !== null);

    if (entries.length >= 4 && entries.length / lines.length >= 0.45) {
      candidates.push({ pageNumber: page.pageNumber, entries });
    }
  }

  if (candidates.length === 0) return null;

  const block = [candidates[0]];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].pageNumber - block[block.length - 1].pageNumber <= 2) block.push(candidates[i]);
    else break;
  }

  const raw = block.flatMap((c) => c.entries);
  if (raw.length < 4) return null;

  const levelled = raw.map((entry) => ({ ...entry, level: entryLevel(entry.title) }));
  const hasTopLevel = levelled.some((entry) => entry.level === 1);

  return {
    pages: new Set(block.map((c) => c.pageNumber)),
    entries: levelled.map((entry) => ({
      title: entry.title,
      level: entry.level === 0 ? (hasTopLevel ? 2 : 1) : entry.level,
      printedPage: entry.printedPage,
      pdfPage: entry.printedPage,
    })),
  };
}

/**
 * Las paginas que dice el indice son las impresas en el papel, que casi nunca
 * coinciden con las del PDF (portada, creditos, el propio indice). Se busca de
 * verdad donde aparece cada titulo y se toma el desfase que mas se repita.
 */
function alignToc(found: { pages: Set<number>; entries: TocEntry[] }, pages: StructurePage[]): Toc {
  const body = pages
    .filter((page) => !found.pages.has(page.pageNumber))
    .map((page) => ({ pageNumber: page.pageNumber, text: normalize(page.text) }));

  const offsets: number[] = [];
  for (const entry of found.entries) {
    const key = normalize(entry.title).slice(0, 45);
    if (key.length < 10) continue;
    const hit = body.find((page) => page.text.includes(key));
    if (!hit) continue;
    entry.pdfPage = hit.pageNumber;
    offsets.push(hit.pageNumber - entry.printedPage);
  }

  let offset = 0;
  if (offsets.length > 0) {
    const sorted = offsets.slice().sort((a, b) => a - b);
    offset = sorted[Math.floor(sorted.length / 2)];
  }
  for (const entry of found.entries) {
    if (!offsets.length || entry.pdfPage === entry.printedPage) {
      entry.pdfPage = Math.min(pages.length, Math.max(1, entry.printedPage + offset));
    }
  }

  return { entries: found.entries, pages: found.pages, offset, matched: offsets.length };
}

/** Altura de letra tipica del cuerpo: la referencia contra la que medir titulos. */
function measureBody(pages: StructurePage[]): number | null {
  const heights: number[] = [];
  for (const page of pages) {
    for (const line of page.lines ?? []) {
      if (line.text && line.height > 0) heights.push(line.height);
    }
  }
  if (heights.length < 20) return null;
  heights.sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)];
}

/**
 * Reune todo lo que se sabe del documento antes de resumir nada: su indice, el
 * tamano del cuerpo de texto y los titulos que el indice confirma.
 */
export function readStructure(pages: StructurePage[]): StructureContext {
  const found = findToc(pages);
  const toc = found ? alignToc(found, pages) : null;
  const confirmed = new Map<string, number>();

  if (toc) {
    for (const entry of toc.entries) {
      const key = normalize(entry.title);
      if (key.length >= 6) confirmed.set(key, entry.level);
    }
  }

  const hasChapters =
    pages.some((page) =>
      page.text
        .split("\n")
        .some((line) => CHAPTER_WORD_RE.test(line.trim()) && line.trim().length <= 120),
    ) || (toc ? toc.entries.some((entry) => CHAPTER_WORD_RE.test(entry.title)) : false);

  return {
    toc,
    bodyHeight: measureBody(pages),
    confirmed,
    tocPages: toc ? toc.pages : new Set<number>(),
    hasChapters,
  };
}

/**
 * Funde lo que dice el indice del libro con los titulos hallados en el cuerpo.
 *
 * El indice da los niveles buenos pero casi nunca baja del segundo; el cuerpo
 * tiene los subapartados pero se equivoca de nivel. Juntos dan el esquema que
 * de verdad tiene el temario.
 */
export function mergeHeadings<T extends { title: string; level: number; pageNumber: number }>(
  headings: T[],
  toc: Toc | null,
): { title: string; level: number; pageNumber: number }[] {
  if (!toc || toc.entries.length < 4) return headings.slice();

  const fromToc = toc.entries
    .map((entry) => ({
      title: cleanEntry(entry.title),
      level: entry.level,
      pageNumber: entry.pdfPage || entry.printedPage,
    }))
    .sort((a, b) => a.pageNumber - b.pageNumber);

  const seen = new Set(fromToc.map((heading) => normalize(heading.title)));
  const tocDepth = Math.max(...fromToc.map((heading) => heading.level));
  const merged: { title: string; level: number; pageNumber: number }[] = [];

  for (let i = 0; i < fromToc.length; i++) {
    const entry = fromToc[i];
    merged.push(entry);

    const until = fromToc[i + 1] ? fromToc[i + 1].pageNumber : Number.POSITIVE_INFINITY;
    // Subapartados que el indice no lista pero el libro si tiene.
    const inside = headings.filter(
      (heading) =>
        heading.pageNumber >= entry.pageNumber &&
        heading.pageNumber < until &&
        heading.level > entry.level &&
        !seen.has(normalize(heading.title)),
    );
    for (const child of inside.slice(0, 40)) {
      seen.add(normalize(child.title));
      merged.push({
        title: child.title,
        level: Math.max(child.level, tocDepth + 1),
        pageNumber: child.pageNumber,
      });
    }
  }

  return merged;
}
