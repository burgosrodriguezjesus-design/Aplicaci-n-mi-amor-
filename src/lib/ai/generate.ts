/**
 * Capa unificada de generacion.
 *
 * Decide en cada paso si usa el modelo de IA o el motor extractivo, y degrada
 * al extractivo si la IA falla, para que un documento nunca se quede a medias.
 */
import "server-only";
import { env } from "../env";
import type { Chunk } from "../pdf/structure";
import { complete, getAnthropic, parseJsonLoose } from "./client";
import {
  extractiveChunkSummary,
  extractiveOutline,
  extractiveSynthesis,
  outlineFromHeadings,
} from "./extractive";
import {
  buildChunkPrompt,
  buildNarrationPrompt,
  buildOutlinePrompt,
  buildRegenerationPrompt,
  buildSynthesisPrompt,
  buildSystemPrompt,
  type EducationLevel,
  type ExplanationStyle,
  type SummaryDepth,
} from "./prompts";
import type { ChunkAnalysis, OutlineTree } from "./types";

export type GenerationContext = {
  documentTitle: string;
  pageCount: number;
  depth: SummaryDepth;
  level: EducationLevel;
  style: ExplanationStyle;
};

export type ProviderInfo = { provider: "anthropic" | "extractive"; model: string };

export function currentProvider(): ProviderInfo {
  return env.ai.enabled
    ? { provider: "anthropic", model: env.ai.model }
    : { provider: "extractive", model: "extractivo-local" };
}

function systemFor(ctx: GenerationContext) {
  return buildSystemPrompt({ depth: ctx.depth, level: ctx.level, style: ctx.style });
}

/** Limpia restos de marcas internas que el modelo pudiera copiar. */
function sanitize(markdown: string) {
  return markdown.replace(/\[\[pag\. \d+\]\]/g, "").trim();
}

/** Fase "map": analiza un fragmento del documento. */
export async function analyzeChunk(
  chunk: Chunk,
  total: number,
  ctx: GenerationContext,
): Promise<ChunkAnalysis> {
  if (!getAnthropic()) return extractiveChunkSummary(chunk, ctx.depth);

  try {
    const raw = await complete({
      system: systemFor(ctx),
      user: buildChunkPrompt({
        documentTitle: ctx.documentTitle,
        chunkTitle: chunk.title,
        position: chunk.position,
        total,
        startPage: chunk.startPage,
        endPage: chunk.endPage,
        content: chunk.content,
      }),
      // El resumen puede ser tan largo como el original en modo muy detallado.
      maxTokens: ctx.depth === "MUY_DETALLADO" ? 24000 : 16000,
      model: ctx.depth === "MUY_DETALLADO" ? env.ai.deepModel : env.ai.model,
      effort: ctx.depth === "MUY_DETALLADO" ? "high" : "medium",
    });

    const parsed = parseJsonLoose<{
      title?: string;
      markdown?: string;
      keyConcepts?: string[];
      sourcePages?: number[];
      formulas?: string[];
      examHighlights?: string[];
    }>(raw);

    if (!parsed?.markdown) {
      // El modelo respondio en Markdown plano: lo aprovechamos igualmente.
      if (raw.trim().length > 40) {
        return {
          title: chunk.title,
          markdown: sanitize(raw),
          keyConcepts: [],
          sourcePages: [chunk.startPage, chunk.endPage],
          formulas: [],
          examHighlights: [],
        };
      }
      throw new Error("Respuesta de IA vacia o no interpretable");
    }

    const pages = (parsed.sourcePages ?? []).filter(
      (page) => Number.isInteger(page) && page >= 1 && page <= ctx.pageCount,
    );

    return {
      title: parsed.title?.trim() || chunk.title,
      markdown: sanitize(parsed.markdown),
      keyConcepts: (parsed.keyConcepts ?? []).slice(0, 12),
      sourcePages: pages.length ? pages : [chunk.startPage],
      formulas: parsed.formulas ?? [],
      examHighlights: parsed.examHighlights ?? [],
    };
  } catch {
    // Degradacion segura: mejor un resumen extractivo que un documento roto.
    return extractiveChunkSummary(chunk, ctx.depth);
  }
}

/** Fase "reduce": introduccion global del material. */
export async function synthesize(
  analyses: ChunkAnalysis[],
  ctx: GenerationContext,
): Promise<string> {
  if (!getAnthropic()) {
    return extractiveSynthesis(ctx.documentTitle, analyses, ctx.pageCount);
  }
  try {
    const markdown = await complete({
      system: systemFor(ctx),
      user: buildSynthesisPrompt({
        documentTitle: ctx.documentTitle,
        pageCount: ctx.pageCount,
        index: analyses.map((analysis) => ({
          title: analysis.title,
          pages: analysis.sourcePages,
          concepts: analysis.keyConcepts,
        })),
      }),
      maxTokens: 6000,
      effort: "medium",
    });
    return sanitize(markdown);
  } catch {
    return extractiveSynthesis(ctx.documentTitle, analyses, ctx.pageCount);
  }
}

export type HeadingRef = { title: string; level: number; pageNumber: number };

/** Esquema jerarquico del documento. */
export async function generateOutline(
  analyses: ChunkAnalysis[],
  chunks: Chunk[],
  ctx: GenerationContext,
  headings: HeadingRef[] = [],
): Promise<OutlineTree> {
  const fallback = () =>
    outlineFromHeadings(ctx.documentTitle, headings, analyses) ??
    extractiveOutline(ctx.documentTitle, analyses, chunks);

  if (!getAnthropic()) return fallback();

  try {
    const raw = await complete({
      system: systemFor(ctx),
      user: buildOutlinePrompt({
        documentTitle: ctx.documentTitle,
        headings,
        index: analyses.map((analysis) => ({
          title: analysis.title,
          pages: analysis.sourcePages,
          concepts: analysis.keyConcepts,
          formulas: analysis.formulas,
          // Solo la primera parte del resumen: el esquema no necesita el cuerpo entero.
          summary: analysis.markdown.slice(0, 900),
        })),
      }),
      maxTokens: 12000,
      effort: "medium",
    });

    const parsed = parseJsonLoose<OutlineTree>(raw);
    if (!parsed?.nodes?.length) throw new Error("Esquema vacio");
    return { title: parsed.title || ctx.documentTitle, nodes: parsed.nodes };
  } catch {
    return fallback();
  }
}

/** Adaptacion del texto escrito a lenguaje hablado. */
export async function narrate(title: string, markdown: string): Promise<string> {
  const { speakify } = await import("../tts/speakify");
  if (!getAnthropic()) return speakify(markdown);

  try {
    const spoken = await complete({
      system:
        "Eres un narrador profesional de audiolibros educativos en espanol. " +
        "Adaptas texto escrito a lenguaje hablado natural sin anadir ni quitar informacion.",
      user: buildNarrationPrompt({ title, markdown }),
      maxTokens: 16000,
      effort: "low",
      cacheSystem: true,
    });
    // Red de seguridad: si quedara algun simbolo suelto, lo verbalizamos.
    return speakify(spoken, { alreadyAdapted: true });
  } catch {
    return speakify(markdown);
  }
}

/** Regeneracion de un unico apartado con instrucciones del estudiante. */
export async function regenerateSection(opts: {
  sectionTitle: string;
  currentMarkdown: string;
  sourceText: string;
  instructions: string;
  startPage: number;
  endPage: number;
  ctx: GenerationContext;
}): Promise<{ markdown: string; provider: ProviderInfo }> {
  const provider = currentProvider();
  if (!getAnthropic()) {
    // Sin IA no se puede reescribir: se reextrae con mas o menos detalle.
    const deeper: SummaryDepth = /detall|amplia|mas inform|conserva/i.test(
      opts.instructions,
    )
      ? "MUY_DETALLADO"
      : /reduc|corto|resum|acort/i.test(opts.instructions)
        ? "RAPIDO"
        : opts.ctx.depth;

    const analysis = extractiveChunkSummary(
      {
        position: 0,
        title: opts.sectionTitle,
        level: 2,
        startPage: opts.startPage,
        endPage: opts.endPage,
        content: opts.sourceText,
        charCount: opts.sourceText.length,
      },
      deeper,
    );
    return { markdown: analysis.markdown, provider };
  }

  const markdown = await complete({
    system: systemFor(opts.ctx),
    user: buildRegenerationPrompt(opts),
    maxTokens: 16000,
    effort: "high",
  });
  return { markdown: sanitize(markdown), provider };
}
