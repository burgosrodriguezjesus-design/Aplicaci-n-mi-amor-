/**
 * Deteccion de la estructura del documento y troceado para el analisis por IA.
 *
 * El objetivo es doble:
 *  1. Respetar la estructura original (temas, apartados, numeracion) para que
 *     el resumen y el esquema sigan el mismo orden que los apuntes.
 *  2. Trocear el texto en fragmentos manejables SIN perder la referencia a la
 *     pagina original, que es lo que permite las citas "pag. 17".
 */
import "server-only";

export type PageText = { pageNumber: number; text: string };

export type DetectedHeading = {
  title: string;
  level: number;
  pageNumber: number;
  /** Indice de linea global donde aparece. */
  index: number;
};

export type Chunk = {
  position: number;
  title: string;
  level: number;
  startPage: number;
  endPage: number;
  content: string;
  charCount: number;
};

/** Convierte titulos sin cuerpo en encabezados Markdown. */
function prefixMarkdown(prefix: { title: string; level: number }[]) {
  return prefix
    .map((item) => `${"#".repeat(Math.min(item.level + 1, 6))} ${item.title}`)
    .join("\n\n");
}

/** Tamano objetivo de cada fragmento enviado a la IA (en caracteres). */
const TARGET_CHUNK_CHARS = 9000;
const MAX_CHUNK_CHARS = 14000;
const MIN_CHUNK_CHARS = 1200;

/**
 * "TEMA 1", "Capitulo IV", "Unidad 3"… La palabra clave debe ir seguida de un
 * numero: sin esa condicion, una frase que empiece por "unidad de tiempo…"
 * se confundiria con un titulo.
 */
const CHAPTER_RE =
  /^(tema|capitulo|capítulo|unidad|bloque|parte|leccion|lección|anexo|apendice|apéndice)\s*[.:\-–—]?\s*(\d{1,3}|[ivxlc]{1,6})\b/i;
const NUMBERED_RE = /^(\d{1,2}(?:\.\d{1,2}){0,3})[.)\-–—]?\s+(.{2,110})$/;

function isMostlyUppercase(line: string) {
  const letters = line.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  return upper / letters.length > 0.75;
}

/** Filtra encabezados/pies de pagina repetidos y numeros de pagina sueltos. */
function isNoise(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^\d{1,4}$/.test(trimmed)) return true;
  if (/^p[aá]g(ina)?\.?\s*\d+/i.test(trimmed)) return true;
  if (/^[-–—_=·•.\s]+$/.test(trimmed)) return true;
  return false;
}

/**
 * Elimina las lineas que se repiten en casi todas las paginas
 * (cabeceras y pies de pagina del documento original).
 */
export function stripRepeatedHeaders(pages: PageText[]): PageText[] {
  if (pages.length < 4) return pages;

  const counts = new Map<string, number>();
  for (const page of pages) {
    const lines = page.text.split("\n").map((l) => l.trim());
    const candidates = [...lines.slice(0, 2), ...lines.slice(-2)];
    for (const line of new Set(candidates)) {
      if (line.length < 4 || line.length > 90) continue;
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }

  const threshold = Math.max(3, Math.floor(pages.length * 0.6));
  const repeated = new Set(
    [...counts.entries()].filter(([, n]) => n >= threshold).map(([line]) => line),
  );
  if (repeated.size === 0) return pages;

  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.text
      .split("\n")
      .filter((line) => !repeated.has(line.trim()))
      .join("\n")
      .trim(),
  }));
}

export type TaggedLine = { text: string; pageNumber: number; heading: number | null };

/** Convierte las paginas en lineas etiquetadas con su pagina y su nivel de titulo. */
export function tagLines(pages: PageText[]): TaggedLine[] {
  const out: TaggedLine[] = [];

  for (const page of pages) {
    for (const raw of page.text.split("\n")) {
      const line = raw.trim();
      if (isNoise(line)) {
        if (line === "") out.push({ text: "", pageNumber: page.pageNumber, heading: null });
        continue;
      }

      let heading: number | null = null;

      // Un titulo nunca termina en signo de puntuacion de frase.
      const endsLikeSentence = /[.;,]$/.test(line);

      if (CHAPTER_RE.test(line) && line.length <= 120 && !endsLikeSentence) {
        heading = 1;
      } else if (endsLikeSentence) {
        heading = null;
      } else {
        const numbered = NUMBERED_RE.exec(line);
        if (numbered && !/[.:;,]$/.test(numbered[2]) && line.length <= 120) {
          const depth = numbered[1].split(".").length;
          heading = Math.min(depth + 1, 4);
        } else if (isMostlyUppercase(line) && line.length <= 90 && !/[.;,]$/.test(line)) {
          heading = 1;
        }
      }

      const previous = out[out.length - 1];
      const continuesHeading =
        heading !== null &&
        previous &&
        previous.heading !== null &&
        previous.text !== "" &&
        // Un titulo largo partido en dos lineas: la segunda no lleva numeracion.
        !NUMBERED_RE.test(line) &&
        !CHAPTER_RE.test(line) &&
        previous.text.length + line.length <= 140;

      if (continuesHeading) {
        previous.text = `${previous.text} ${line}`;
        continue;
      }

      out.push({ text: line, pageNumber: page.pageNumber, heading });
    }
    // Marca implicita de fin de pagina.
    out.push({ text: "", pageNumber: page.pageNumber, heading: null });
  }

  return out;
}

/** Agrupa las lineas en secciones segun los titulos detectados. */
function buildRawSections(lines: TaggedLine[]) {
  const sections: {
    title: string;
    level: number;
    startPage: number;
    endPage: number;
    lines: TaggedLine[];
    /** Titulos sin cuerpo que preceden a esta seccion (p. ej. "TEMA 2"). */
    prefix: { title: string; level: number }[];
  }[] = [];

  let current = {
    title: "Introduccion",
    level: 1,
    startPage: lines[0]?.pageNumber ?? 1,
    endPage: lines[0]?.pageNumber ?? 1,
    lines: [] as TaggedLine[],
    prefix: [] as { title: string; level: number }[],
  };

  /**
   * Titulos sin cuerpo propio (por ejemplo "TEMA 2" seguido inmediatamente de
   * "1. Elementos de proteccion"). En lugar de descartarlos se arrastran hasta
   * la siguiente seccion con contenido, donde se conservan como subtitulos.
   */
  let carried: { title: string; level: number; pageNumber: number }[] = [];
  let first = true;

  for (const line of lines) {
    if (line.heading !== null) {
      if (current.lines.some((l) => l.text)) {
        sections.push(current);
      } else if (!first) {
        carried.push({
          title: current.title,
          level: current.level,
          pageNumber: current.startPage,
        });
      }
      first = false;

      current = {
        title: line.text,
        level: line.heading,
        startPage: line.pageNumber,
        endPage: line.pageNumber,
        lines: [],
        prefix: carried.map((item) => ({ title: item.title, level: item.level })),
      };
      carried = [];
      continue;
    }
    current.lines.push(line);
    if (line.text) current.endPage = Math.max(current.endPage, line.pageNumber);
  }

  if (current.lines.some((l) => l.text)) sections.push(current);
  return sections;
}

/**
 * Convierte lineas en texto plano insertando marcas `[[pag. N]]` cada vez que
 * cambia de pagina. Esas marcas son lo que permite a la IA citar la pagina
 * exacta de cada concepto y que el usuario salte al PDF original.
 */
function linesToContent(lines: TaggedLine[]) {
  const out: string[] = [];
  let lastPage = -1;
  for (const line of lines) {
    if (line.text && line.pageNumber !== lastPage) {
      out.push(`[[pag. ${line.pageNumber}]]`);
      lastPage = line.pageNumber;
    }
    out.push(line.text);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Trocea el documento en fragmentos con titulo y rango de paginas.
 * Las secciones demasiado largas se dividen por parrafos; las muy cortas se
 * fusionan con la siguiente para no malgastar llamadas a la IA.
 */
export function buildChunks(pages: PageText[]): Chunk[] {
  const cleaned = stripRepeatedHeaders(pages);
  const lines = tagLines(cleaned);
  const rawSections = buildRawSections(lines);

  const chunks: Chunk[] = [];
  let pending: Chunk | null = null;

  const push = (chunk: Chunk) => {
    chunks.push({ ...chunk, position: chunks.length, charCount: chunk.content.length });
  };

  for (const section of rawSections) {
    let content = linesToContent(section.lines);
    if (!content) continue;

    // Un titulo padre sin cuerpo propio pasa a titular este fragmento, y el
    // titulo de la seccion se conserva como subtitulo dentro del contenido.
    let title = section.title;
    let level = section.level;
    let prefix = section.prefix;

    if (prefix.length && prefix[0].level < section.level) {
      title = prefix[0].title;
      level = prefix[0].level;
      prefix = prefix.slice(1);
      content = `${"#".repeat(Math.min(section.level + 1, 6))} ${section.title}\n\n${content}`;
    }

    if (prefix.length) {
      content = `${prefixMarkdown(prefix)}\n\n${content}`;
    }

    const base: Chunk = {
      position: 0,
      title,
      level,
      startPage: section.startPage,
      endPage: section.endPage,
      content,
      charCount: content.length,
    };

    // Seccion corta: se acumula para fusionarla con la siguiente.
    if (base.content.length < MIN_CHUNK_CHARS) {
      if (pending === null) {
        pending = base;
      } else if (pending.content.length + base.content.length <= MAX_CHUNK_CHARS) {
        const merged: Chunk = {
          position: pending.position,
          title: pending.title,
          level: pending.level,
          startPage: pending.startPage,
          endPage: Math.max(pending.endPage, base.endPage),
          // El titulo de la seccion absorbida se conserva como subtitulo,
          // para que ni la IA ni el motor extractivo pierdan la estructura.
          content: `${pending.content}\n\n${"#".repeat(Math.min(base.level + 1, 6))} ${base.title}\n\n${base.content}`,
          charCount: 0,
        };
        merged.charCount = merged.content.length;
        pending = merged;
      } else {
        push(pending);
        pending = base;
      }
      continue;
    }

    if (pending) {
      push(pending);
      pending = null;
    }

    if (base.content.length <= MAX_CHUNK_CHARS) {
      push(base);
      continue;
    }

    // Seccion larga: se parte por parrafos manteniendo el rango de paginas.
    const paragraphs = base.content.split(/\n{2,}/);
    let buffer = "";
    let part = 1;
    for (const paragraph of paragraphs) {
      if (buffer && buffer.length + paragraph.length > TARGET_CHUNK_CHARS) {
        push({
          ...base,
          title: `${base.title} (parte ${part})`,
          content: buffer.trim(),
        });
        part += 1;
        buffer = "";
      }
      buffer += (buffer ? "\n\n" : "") + paragraph;
    }
    if (buffer.trim()) {
      push({
        ...base,
        title: part > 1 ? `${base.title} (parte ${part})` : base.title,
        content: buffer.trim(),
      });
    }
  }

  if (pending) push(pending);

  // Documento sin ninguna estructura detectable: troceo por tamano.
  if (chunks.length === 0) {
    const all = cleaned.map((p) => p.text).join("\n\n");
    if (all.trim()) {
      push({
        position: 0,
        title: "Documento completo",
        level: 1,
        startPage: cleaned[0]?.pageNumber ?? 1,
        endPage: cleaned[cleaned.length - 1]?.pageNumber ?? 1,
        content: all.trim(),
        charCount: all.length,
      });
    }
  }

  return chunks;
}

/** Indice de titulos detectados, util para el esquema de respaldo. */
export function detectHeadings(pages: PageText[]): DetectedHeading[] {
  const lines = tagLines(stripRepeatedHeaders(pages));
  const headings: DetectedHeading[] = [];
  lines.forEach((line, index) => {
    if (line.heading !== null && line.text) {
      headings.push({
        title: line.text,
        level: line.heading,
        pageNumber: line.pageNumber,
        index,
      });
    }
  });
  return headings;
}
