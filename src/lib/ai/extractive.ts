/**
 * Modo sin IA (extractivo).
 *
 * Cuando no hay ANTHROPIC_API_KEY configurada la aplicacion sigue siendo util:
 * construye el resumen y el esquema SELECCIONANDO frases del propio PDF, nunca
 * generando texto nuevo. Es imposible que alucine porque no escribe nada que no
 * estuviera en el documento; a cambio, la redaccion no se simplifica.
 */
import "server-only";
import type { Chunk } from "../pdf/structure";
import type { SummaryDepth } from "./prompts";
import type { ChunkAnalysis, OutlineNode, OutlineTree } from "./types";

const PAGE_MARKER = /\[\[pag\. (\d+)\]\]/g;

/** Proporcion de frases que se conservan segun el nivel de detalle. */
const KEEP_RATIO: Record<SummaryDepth, number> = {
  RAPIDO: 0.3,
  NORMAL: 0.5,
  DETALLADO: 0.72,
  MUY_DETALLADO: 0.95,
};

const STOP_WORDS = new Set(
  ("de la que el en y a los del se las por un para con no una su al lo como mas " +
    "pero sus le ya o este si porque esta entre cuando muy sin sobre tambien me " +
    "hasta hay donde quien desde todo nos durante todos uno les ni contra otros " +
    "ese eso ante ellos e esto mi antes algunos qué unos yo otro otras otra él " +
    "tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas " +
    "algo nosotros cada")
    .split(/\s+/),
);

const DEFINITION_RE =
  /\b(se define como|se denomina|se conoce como|consiste en|es el|es la|es un|es una|son los|son las|se llama|entendemos por|definicion)\b/i;
const FORMULA_RE = /(^|\s)[A-Za-zα-ω][\w₀-₉]*\s*=\s*[^.;]{2,60}/;
const NUMBER_RE = /\d/;
const IMPORTANT_RE =
  /\b(importante|fundamental|clave|recuerda|obligatorio|atencion|no confundir|examen|debe|siempre|nunca)\b/i;

type Sentence = { text: string; page: number; score: number; index: number };
type Heading = { kind: "heading"; level: number; text: string; index: number };
type Item = ({ kind: "sentence" } & Sentence) | Heading;

function stripMarkers(text: string) {
  return text.replace(PAGE_MARKER, "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Separa el contenido en titulos y frases, anotando la pagina de cada una.
 * Los titulos se conservan siempre: son los que dan estructura al resumen.
 */
function toItems(content: string, fallbackPage: number): Item[] {
  const items: Item[] = [];
  let page = fallbackPage;
  let bufferPage = fallbackPage;
  let buffer: string[] = [];
  let index = 0;

  for (const rawLine of content.split("\n")) {
    const markers = [...rawLine.matchAll(PAGE_MARKER)];
    if (markers.length) {
      page = Number.parseInt(markers[markers.length - 1][1], 10) || page;
    }
    const line = rawLine.replace(PAGE_MARKER, "").trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      items.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2].trim(),
        index: index++,
      });
      continue;
    }

    if (buffer.length === 0) bufferPage = page;
    buffer.push(line);
  }

  flushParagraph();
  return items;

  /**
   * Une las lineas de un mismo parrafo antes de separarlas en frases: en un
   * PDF una frase suele venir partida en varias lineas, y separarlas romperia
   * las frases por la mitad.
   */
  function flushParagraph() {
    if (buffer.length === 0) return;
    const paragraph = buffer.join(" ").replace(/\s{2,}/g, " ").trim();
    buffer = [];
    if (!paragraph) return;

    const parts = paragraph
      .split(/(?<=[.:;!?])\s+(?=[A-ZÁÉÍÓÚÑ0-9¿¡])/)
      .map((piece) => piece.trim())
      .filter(Boolean);

    for (const part of parts) {
      items.push({ kind: "sentence", text: part, page: bufferPage, score: 0, index: index++ });
    }
  }
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

function scoreSentences(sentences: Sentence[]) {
  const freq = new Map<string, number>();
  for (const sentence of sentences) {
    for (const word of tokenize(sentence.text)) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }
  const max = Math.max(1, ...freq.values());

  for (const sentence of sentences) {
    const words = tokenize(sentence.text);
    const density = words.length
      ? words.reduce((sum, w) => sum + (freq.get(w) ?? 0) / max, 0) / words.length
      : 0;

    let score = density * 2;
    if (DEFINITION_RE.test(sentence.text)) score += 1.6;
    if (FORMULA_RE.test(sentence.text)) score += 1.8;
    if (IMPORTANT_RE.test(sentence.text)) score += 1.2;
    if (NUMBER_RE.test(sentence.text)) score += 0.5;
    if (sentence.index < 2) score += 0.8; // las primeras frases suelen introducir
    if (sentence.text.length < 25) score -= 0.8;
    if (sentence.text.length > 400) score -= 0.3;

    sentence.score = score;
  }
  return sentences;
}

/** Palabras demasiado genericas para ser un "concepto clave". */
const GENERIC_TERMS = new Set([
  "unidad",
  "unidades",
  "representa",
  "letra",
  "puntos",
  "punto",
  "tiempo",
  "valores",
  "valor",
  "ejemplo",
  "ejemplos",
  "sistema",
  "forma",
  "manera",
  "parte",
  "partes",
  "caso",
  "casos",
  "tipo",
  "tipos",
  "numero",
  "nombre",
  "figura",
  "tabla",
  "capitulo",
  "tema",
  "apartado",
]);

/** Limpia la numeracion de un titulo: "1.2 Intensidad" -> "Intensidad". */
function cleanHeading(title: string) {
  return title
    .replace(/^(tema|capitulo|capítulo|unidad|bloque|parte)\s*\d+\s*[-–—.:]?\s*/i, "")
    .replace(/^\d+(\.\d+)*[.)]?\s*/, "")
    .trim();
}

/**
 * Conceptos clave: primero los titulos del propio documento (la mejor señal
 * posible, porque los ha escrito el autor) y despues los terminos que aparecen
 * justo antes de una definicion.
 */
function extractKeyConcepts(
  sentences: Sentence[],
  headings: Heading[],
  limit = 8,
) {
  const scored = new Map<string, number>();

  const add = (raw: string, weight: number) => {
    const term = raw.trim().replace(/\s{2,}/g, " ");
    if (term.length < 5 || term.length > 60) return;
    const words = term.toLowerCase().split(/\s+/);
    if (STOP_WORDS.has(words[0]) || GENERIC_TERMS.has(words[0])) return;
    if (words.length === 1 && GENERIC_TERMS.has(words[0])) return;
    const key = term.toLowerCase();
    scored.set(key, (scored.get(key) ?? 0) + weight);
  };

  for (const heading of headings) {
    const clean = cleanHeading(heading.text);
    if (clean) add(clean, 5);
  }

  for (const sentence of sentences) {
    // "La tension electrica, tambien llamada..., es el trabajo..."
    const definition =
      /^(?:la|el|los|las|un|una)\s+([a-záéíóúñ]{4,}(?:\s+[a-záéíóúñ]{3,}){0,2})\s+(?:es|son|se define|se denomina|se conoce|consiste)/i.exec(
        sentence.text,
      );
    if (definition) add(definition[1], 3);

    // "se denomina X", "se conoce como X"
    const named = /\b(?:se denomina|se conoce como|se llama)\s+([a-záéíóúñ]{4,}(?:\s+[a-záéíóúñ]{3,}){0,2})/i.exec(
      sentence.text,
    );
    if (named) add(named[1], 2);
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term.charAt(0).toUpperCase() + term.slice(1));
}

function extractFormulas(sentences: Sentence[]) {
  const seen = new Set<string>();
  const formulas: { text: string; page: number }[] = [];
  for (const sentence of sentences) {
    const match = FORMULA_RE.exec(sentence.text);
    if (!match) continue;
    const formula = shortFormula(match[0]);
    if (formula.length > 90 || seen.has(formula)) continue;
    seen.add(formula);
    formulas.push({ text: formula, page: sentence.page });
  }
  return formulas;
}

/** Recorta una formula a su expresion, sin la explicacion que la acompana. */
function shortFormula(formula: string) {
  const clean = formula
    .split(/,|\bdonde\b|\bsiendo\b/i)[0]
    // Corta cuando detras de la expresion empieza una frase normal.
    .split(/\s(?=[A-ZÁÉÍÓÚÑ][a-záéíóúñ])/)[0]
    .trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

function pageLabel(pages: number[]) {
  if (pages.length === 0) return "";
  const min = Math.min(...pages);
  const max = Math.max(...pages);
  return min === max ? ` (pag. ${min})` : ` (pags. ${min}-${max})`;
}

/** Resumen extractivo de un fragmento. */
export function extractiveChunkSummary(
  chunk: Chunk,
  depth: SummaryDepth,
): ChunkAnalysis {
  const items = toItems(chunk.content, chunk.startPage);
  const sentences = scoreSentences(
    items.filter((item): item is { kind: "sentence" } & Sentence => item.kind === "sentence"),
  );

  const ratio = KEEP_RATIO[depth] ?? KEEP_RATIO.DETALLADO;
  const keep = Math.max(3, Math.round(sentences.length * ratio));

  const kept = new Set(
    [...sentences]
      .sort((a, b) => b.score - a.score)
      .slice(0, keep)
      .map((sentence) => sentence.index),
  );

  const selected = sentences.filter((sentence) => kept.has(sentence.index));
  const pages = [...new Set(selected.map((sentence) => sentence.page))].sort((a, b) => a - b);
  const headings = items.filter((item): item is Heading => item.kind === "heading");
  const concepts = extractKeyConcepts(selected, headings);
  const formulas = extractFormulas(sentences);

  const title = stripMarkers(chunk.title) || "Apartado";
  const body: string[] = [`### ${title}${pageLabel(pages)}`, ""];

  // Se recorren titulos y frases en su orden original.
  let currentPage = -1;
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      body.push(paragraph.join(" "));
      body.push("");
      paragraph = [];
    }
  };

  for (const item of items) {
    if (item.kind === "heading") {
      flush();
      currentPage = -1;
      body.push(`#### ${item.text}`, "");
      continue;
    }
    if (!kept.has(item.index)) continue;

    if (item.page !== currentPage) {
      flush();
      currentPage = item.page;
    }
    const highlighted = IMPORTANT_RE.test(item.text) ? `**${item.text}**` : item.text;
    paragraph.push(highlighted);
    if (paragraph.length >= 4) flush();
  }
  flush();

  if (formulas.length) {
    body.push("**Formulas de este apartado**", "");
    for (const formula of formulas) body.push(`- \`${formula.text}\``);
    body.push("");
  }

  if (concepts.length) {
    body.push("**Conceptos clave**", "");
    body.push(concepts.map((c) => `**${c}**`).join(" · "));
    body.push("");
  }

  const examHighlights = selected
    .filter((s) => IMPORTANT_RE.test(s.text))
    .slice(0, 3)
    .map((s) => s.text);

  if (examHighlights.length) {
    // El propio texto ya suele empezar por "IMPORTANTE PARA EL EXAMEN:".
    const highlight = examHighlights[0]
      .replace(/^\s*(importante|atencion|atención|ojo)[^:]{0,40}:\s*/i, "")
      .trim();
    body.push(`> [!examen] ${highlight}`, "");
  }

  return {
    title,
    markdown: body.join("\n").trim(),
    keyConcepts: concepts,
    sourcePages: pages.length ? pages : [chunk.startPage],
    formulas: formulas.map((formula) => formula.text),
    formulaRefs: formulas,
    examHighlights,
  };
}

/** Introduccion global del material, tambien extractiva. */
export function extractiveSynthesis(
  documentTitle: string,
  analyses: ChunkAnalysis[],
  pageCount: number,
): string {
  const concepts = [...new Set(analyses.flatMap((a) => a.keyConcepts))].slice(0, 12);
  const lines = [
    "## Vision general",
    "",
    `Este material procede del documento **${documentTitle}** (${pageCount} ${
      pageCount === 1 ? "pagina" : "paginas"
    }) y se ha organizado en ${analyses.length} ${
      analyses.length === 1 ? "apartado" : "apartados"
    }.`,
    "",
    "> [!aclaracion] Resumen generado en modo extractivo: el texto procede literalmente del PDF, seleccionando las frases con mayor carga de informacion. Configura una clave de IA para obtener explicaciones reescritas y adaptadas a tu nivel.",
    "",
    "## Como estudiar este tema",
    "",
  ];

  analyses.slice(0, 8).forEach((analysis, index) => {
    lines.push(
      `${index + 1}. **${analysis.title}**${pageLabel(analysis.sourcePages)}`,
    );
  });
  lines.push("");

  if (concepts.length) {
    lines.push("## Conceptos imprescindibles", "");
    for (const concept of concepts) lines.push(`- **${concept}**`);
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * Esquema jerarquico a partir de los titulos reales detectados en el PDF.
 * Es la opcion preferida: procede literalmente del documento.
 */
export function outlineFromHeadings(
  documentTitle: string,
  headings: { title: string; level: number; pageNumber: number }[],
  analyses: ChunkAnalysis[],
): OutlineTree | null {
  if (headings.length < 2) return null;

  const nodes: OutlineNode[] = [];
  const stack: { level: number; node: OutlineNode }[] = [];

  for (const heading of headings) {
    const node: OutlineNode = {
      label: heading.title,
      kind:
        heading.level <= 1 ? "chapter" : heading.level === 2 ? "section" : "subsection",
      page: heading.pageNumber,
      children: [],
    };

    while (stack.length && stack[stack.length - 1].level >= heading.level) stack.pop();

    if (stack.length === 0) nodes.push(node);
    else {
      const parent = stack[stack.length - 1].node;
      parent.children = parent.children ?? [];
      parent.children.push(node);
    }
    stack.push({ level: heading.level, node });
  }

  // Las formulas detectadas se cuelgan del apartado de su misma pagina.
  const formulas = analyses.flatMap((analysis) =>
    analysis.formulaRefs?.length
      ? analysis.formulaRefs.map((ref) => ({ formula: ref.text, page: ref.page }))
      : analysis.formulas.map((formula) => ({
          formula,
          page: analysis.sourcePages[0] ?? 1,
        })),
  );

  // Cada formula se cuelga de un unico apartado, el primero de su pagina.
  const used = new Set<string>();
  const attach = (list: OutlineNode[]) => {
    for (const node of list) {
      if (node.children?.length) {
        attach(node.children);
        continue;
      }
      const matching = formulas
        .filter((item) => item.page === node.page && !used.has(item.formula))
        .slice(0, 4);
      if (matching.length) {
        node.children = matching.map((item) => {
          used.add(item.formula);
          return {
            label: item.formula,
            kind: "formula" as const,
            page: item.page,
          };
        });
      }
    }
  };
  attach(nodes);

  return { title: documentTitle, nodes };
}

/** Esquema de respaldo, construido con los fragmentos analizados. */
export function extractiveOutline(
  documentTitle: string,
  analyses: ChunkAnalysis[],
  chunks: Chunk[],
): OutlineTree {
  const nodes: OutlineNode[] = [];
  const stack: { level: number; node: OutlineNode }[] = [];

  analyses.forEach((analysis, index) => {
    const chunk = chunks[index];
    const level = chunk?.level ?? 1;
    const page = analysis.sourcePages[0] ?? chunk?.startPage;

    const children: OutlineNode[] = [];
    for (const concept of analysis.keyConcepts.slice(0, 6)) {
      children.push({ label: concept, kind: "concept", page });
    }
    for (const formula of analysis.formulas.slice(0, 4)) {
      children.push({ label: formula, kind: "formula", page });
    }

    const node: OutlineNode = {
      label: analysis.title,
      kind: level <= 1 ? "chapter" : level === 2 ? "section" : "subsection",
      page,
      children,
    };

    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();

    if (stack.length === 0) {
      nodes.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      parent.children = parent.children ?? [];
      parent.children.push(node);
    }
    stack.push({ level, node });
  });

  return { title: documentTitle, nodes };
}
