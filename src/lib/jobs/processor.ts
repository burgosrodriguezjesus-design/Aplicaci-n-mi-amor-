/**
 * Pipeline de procesamiento de un documento.
 *
 * Fases:
 *   1. Extracción de texto por páginas (pdfjs).
 *   2. OCR de las páginas escaneadas.
 *   3. Detección de estructura y troceado con referencias a página.
 *   4. Fase "map": análisis/resumen de cada fragmento.
 *   5. Fase "reduce": visión global del documento.
 *   6. Esquema jerárquico.
 *   7. Guiones de audio adaptados a lenguaje hablado.
 *
 * Cada fase actualiza el estado del documento para que la interfaz pueda
 * mostrar en todo momento qué está ocurriendo.
 */
import "server-only";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../db";
import { env } from "../env";
import { storage } from "../storage";
import {
  extractPdf,
  PdfInvalidError,
  PdfProtectedError,
  looksLikePdf,
} from "../pdf/extract";
import { ocrAvailable, ocrEngineLabel, ocrPages } from "../pdf/ocr";
import {
  buildChunks,
  chunkOptionsFor,
  detectHeadings,
  type Chunk,
} from "../pdf/structure";
import {
  analyzeChunk,
  currentProvider,
  generateOutline,
  narrate,
  synthesize,
  type GenerationContext,
  type HeadingRef,
} from "../ai/generate";
import type { ChunkAnalysis } from "../ai/types";
import type {
  EducationLevel,
  ExplanationStyle,
  SummaryDepth,
} from "../ai/prompts";
import { estimateSeconds } from "../tts/speakify";
import { segmentScript } from "../tts/segment";
import { registerHandler, updateJob } from "./queue";

export class ProcessingError extends Error {
  code: string;
  fatal: boolean;
  constructor(code: string, message: string, fatal = true) {
    super(message);
    this.code = code;
    this.fatal = fatal;
  }
}

async function setStatus(
  documentId: string,
  jobId: string,
  status: string,
  message: string,
  progress: number,
) {
  await prisma.document.update({
    where: { id: documentId },
    data: { status, statusMessage: message, progress },
  });
  await updateJob(jobId, { stage: status, message, progress });
}

/** Fases 1 y 2: texto de cada página, con OCR cuando hace falta. */
async function extractPages(documentId: string, jobId: string, data: Buffer) {
  await setStatus(documentId, jobId, "EXTRACTING", "Extrayendo contenido…", 8);

  const extraction = await extractPdf(data);

  if (extraction.pageCount === 0) {
    throw new ProcessingError(
      "PDF_EMPTY",
      "El PDF no contiene ninguna página legible.",
    );
  }

  if (extraction.pageCount > env.limits.maxPages) {
    throw new ProcessingError(
      "TOO_MANY_PAGES",
      `El documento tiene ${extraction.pageCount} páginas y el límite configurado es ${env.limits.maxPages}. Divídelo en varios PDF (por ejemplo, por temas) y súbelos por separado.`,
    );
  }

  await prisma.documentPage.deleteMany({ where: { documentId } });
  await prisma.documentPage.createMany({
    data: extraction.pages.map((page) => ({
      documentId,
      pageNumber: page.pageNumber,
      text: page.text,
      charCount: page.charCount,
      source: page.source,
    })),
  });

  await prisma.document.update({
    where: { id: documentId },
    data: {
      pageCount: extraction.pageCount,
      textCoverage: extraction.textCoverage,
    },
  });

  let usedOcr = false;

  if (extraction.scannedPages.length > 0) {
    if (ocrAvailable()) {
      // Un libro escaneado entero gasta una llamada de visión por página:
      // el tope evita sorpresas en la factura y en el tiempo de espera.
      const targets = extraction.scannedPages.slice(0, env.limits.ocrMaxPages);
      const omitted = extraction.scannedPages.length - targets.length;

      await setStatus(
        documentId,
        jobId,
        "EXTRACTING",
        `Aplicando ${ocrEngineLabel()} a ${targets.length} ${
          targets.length === 1 ? "página escaneada" : "páginas escaneadas"
        }…`,
        18,
      );

      if (omitted > 0) {
        await prisma.document.update({
          where: { id: documentId },
          data: {
            errorCode: "OCR_PARTIAL",
            errorMessage: `El documento tiene ${extraction.scannedPages.length} páginas escaneadas y solo reconocemos las primeras ${targets.length}. Sube el resto en otro PDF o sube el límite con OCR_MAX_PAGES.`,
          },
        });
      }

      // El rasterizado necesita el PDF en disco: se deja en un temporal y se
      // borra al terminar, pase lo que pase.
      const workDir = await mkdtemp(path.join(os.tmpdir(), "estudia-ocr-"));
      const pdfPath = path.join(workDir, "documento.pdf");
      let results: Awaited<ReturnType<typeof ocrPages>> = [];

      try {
        await writeFile(pdfPath, data);
        results = await ocrPages(pdfPath, targets, async (done, total) => {
          await setStatus(
            documentId,
            jobId,
            "EXTRACTING",
            `Reconociendo texto de imágenes (${done}/${total})…`,
            18 + Math.round((done / total) * 12),
          );
        });
      } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      }

      for (const result of results) {
        usedOcr = true;
        await prisma.documentPage.update({
          where: {
            documentId_pageNumber: { documentId, pageNumber: result.pageNumber },
          },
          data: {
            text: result.text,
            charCount: result.text.replace(/\s/g, "").length,
            source: "OCR",
          },
        });
      }
    }
  }

  const pages = await prisma.documentPage.findMany({
    where: { documentId },
    orderBy: { pageNumber: "asc" },
    select: { pageNumber: true, text: true, source: true },
  });

  const withText = pages.filter((page) => page.source !== "EMPTY").length;
  const coverage = Math.round((withText / pages.length) * 100);

  await prisma.document.update({
    where: { id: documentId },
    data: { textCoverage: coverage, usedOcr },
  });

  if (withText === 0) {
    throw new ProcessingError(
      "NO_TEXT",
      ocrAvailable()
        ? "No hemos podido extraer texto de estas páginas. El documento es solo imágenes y el reconocimiento no ha devuelto nada legible: prueba con un escaneo de más calidad o más recto."
        : "No hemos podido extraer texto de estas páginas: el PDF es solo imágenes y no hay ningún motor de reconocimiento disponible. Instala la dependencia opcional con `npm install tesseract.js` (no necesita ninguna clave) o configura ANTHROPIC_API_KEY.",
    );
  }

  return { pages, pageCount: extraction.pageCount, coverage };
}

/** Fase 3: estructura y troceado. */
async function storeChunks(documentId: string, chunks: Chunk[]) {
  await prisma.documentSection.deleteMany({ where: { documentId } });
  await prisma.documentSection.createMany({
    data: chunks.map((chunk) => ({
      documentId,
      position: chunk.position,
      title: chunk.title.slice(0, 300),
      level: chunk.level,
      startPage: chunk.startPage,
      endPage: chunk.endPage,
      content: chunk.content,
      charCount: chunk.charCount,
    })),
  });
}

/** Fases 4 y 5: resumen por fragmentos + síntesis global. */
export async function buildSummary(opts: {
  documentId: string;
  jobId: string;
  chunks: Chunk[];
  ctx: GenerationContext;
  instructions?: string | null;
}) {
  const { documentId, jobId, chunks, ctx } = opts;
  const analyses: ChunkAnalysis[] = new Array(chunks.length);

  // Los fragmentos se analizan en paralelo (con un tope) para que un temario
  // completo no tarde horas. El orden del resultado se respeta siempre.
  const concurrency = Math.max(1, Math.min(env.ai.concurrency, chunks.length));
  let next = 0;
  let done = 0;

  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= chunks.length) return;

      const analysis = await analyzeChunk(chunks[index], chunks.length, ctx);
      analyses[index] = analysis;

      await prisma.documentSection.updateMany({
        where: { documentId, position: chunks[index].position },
        data: { analysis: JSON.stringify(analysis) },
      });

      done += 1;
      await setStatus(
        documentId,
        jobId,
        "SUMMARIZING",
        `Creando resumen — apartado ${done} de ${chunks.length}…`,
        35 + Math.round((done / chunks.length) * 40),
      );
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  await setStatus(documentId, jobId, "SUMMARIZING", "Uniendo el resumen global…", 78);
  const intro = await synthesize(analyses, ctx);

  const provider = currentProvider();
  const markdown = [`# ${ctx.documentTitle}`, "", intro, "", ...analyses.map((a) => a.markdown)]
    .join("\n\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  const previous = await prisma.summary.findFirst({
    where: { documentId, isCurrent: true },
    orderBy: { version: "desc" },
  });

  await prisma.summary.updateMany({
    where: { documentId, isCurrent: true },
    data: { isCurrent: false },
  });

  const summary = await prisma.summary.create({
    data: {
      documentId,
      depth: ctx.depth,
      educationLevel: ctx.level,
      explanationStyle: ctx.style,
      markdown,
      provider: provider.provider,
      model: provider.model,
      version: (previous?.version ?? 0) + 1,
      isCurrent: true,
      instructions: opts.instructions ?? null,
      sections: {
        create: [
          {
            position: 0,
            title: "Visión general",
            level: 2,
            markdown: intro,
            sourcePages: "[]",
            keyConcepts: "[]",
          },
          ...analyses.map((analysis, index) => ({
            position: index + 1,
            title: analysis.title,
            level: 2,
            markdown: analysis.markdown,
            sourcePages: JSON.stringify(analysis.sourcePages),
            keyConcepts: JSON.stringify(analysis.keyConcepts),
          })),
        ],
      },
    },
    include: { sections: { orderBy: { position: "asc" } } },
  });

  return { summary, analyses };
}

/** Fase 6: esquema jerárquico. */
export async function buildOutline(opts: {
  documentId: string;
  jobId: string;
  analyses: ChunkAnalysis[];
  chunks: Chunk[];
  ctx: GenerationContext;
  headings?: HeadingRef[];
  instructions?: string | null;
}) {
  const { documentId, jobId, analyses, chunks, ctx } = opts;
  await setStatus(documentId, jobId, "OUTLINING", "Creando esquema de estudio…", 84);

  const tree = await generateOutline(analyses, chunks, ctx, opts.headings ?? []);
  const provider = currentProvider();

  const previous = await prisma.outline.findFirst({
    where: { documentId, isCurrent: true },
    orderBy: { version: "desc" },
  });
  await prisma.outline.updateMany({
    where: { documentId, isCurrent: true },
    data: { isCurrent: false },
  });

  return prisma.outline.create({
    data: {
      documentId,
      tree: JSON.stringify(tree),
      provider: provider.provider,
      model: provider.model,
      version: (previous?.version ?? 0) + 1,
      isCurrent: true,
      instructions: opts.instructions ?? null,
    },
  });
}

/** Fase 7: guiones de audio, uno por apartado del resumen. */
export async function buildAudioScripts(opts: {
  documentId: string;
  jobId: string;
  sections: { id: string; title: string; markdown: string; sourcePages: string }[];
}) {
  const { documentId, jobId, sections } = opts;

  await prisma.audioTrack.deleteMany({ where: { documentId, source: "SUMMARY" } });

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    await setStatus(
      documentId,
      jobId,
      "NARRATING",
      `Preparando audio — capítulo ${i + 1} de ${sections.length}…`,
      88 + Math.round(((i + 1) / sections.length) * 10),
    );

    const script = await narrate(section.title, section.markdown);
    if (!script.trim()) continue;

    const seconds = estimateSeconds(script);
    const segments = segmentScript(script, seconds);
    const pages: number[] = JSON.parse(section.sourcePages || "[]");

    await prisma.audioTrack.create({
      data: {
        documentId,
        source: "SUMMARY",
        position: i,
        title: section.title,
        chapter: section.title,
        script,
        charCount: script.length,
        estimatedSeconds: seconds,
        audioStatus: "PENDING",
        segments: {
          create: segments.map((segment) => ({
            position: segment.position,
            text: segment.text,
            displayText: segment.text,
            startChar: segment.startChar,
            endChar: segment.endChar,
            startMs: segment.startMs,
            endMs: segment.endMs,
            pageNumber: pages[0] ?? null,
            summarySectionId: section.id,
          })),
        },
      },
    });
  }
}

/** Recupera los titulos detectados a partir del texto ya extraido. */
async function headingsFor(documentId: string): Promise<HeadingRef[]> {
  const pages = await prisma.documentPage.findMany({
    where: { documentId },
    orderBy: { pageNumber: "asc" },
    select: { pageNumber: true, text: true },
  });
  return detectHeadings(pages);
}

/** Handler principal: procesa un documento de principio a fin. */
async function handleProcessDocument(job: {
  id: string;
  documentId: string;
  payload: Record<string, unknown>;
}) {
  const document = await prisma.document.findUnique({ where: { id: job.documentId } });
  if (!document) throw new ProcessingError("NOT_FOUND", "El documento ya no existe.");

  let data: Buffer;
  try {
    data = await storage.get(document.storageKey);
  } catch {
    throw new ProcessingError(
      "FILE_MISSING",
      "No encontramos el fichero original. Vuelve a subirlo, por favor.",
    );
  }

  if (!looksLikePdf(data)) {
    throw new ProcessingError("PDF_INVALID", "El archivo no es un PDF válido.");
  }

  let extracted;
  try {
    extracted = await extractPages(job.documentId, job.id, data);
  } catch (error) {
    if (error instanceof PdfProtectedError) {
      throw new ProcessingError(
        "PDF_PROTECTED",
        "El PDF parece estar protegido con contraseña. Quita la protección y vuelve a subirlo.",
      );
    }
    if (error instanceof PdfInvalidError) {
      throw new ProcessingError("PDF_INVALID", error.message);
    }
    throw error;
  }

  await setStatus(
    job.documentId,
    job.id,
    "ANALYZING",
    `Analizando ${extracted.pageCount} ${
      extracted.pageCount === 1 ? "página" : "páginas"
    }…`,
    32,
  );

  const pageTexts = extracted.pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.text,
  }));
  const totalChars = pageTexts.reduce((sum, page) => sum + page.text.length, 0);
  const chunks = buildChunks(pageTexts, chunkOptionsFor(totalChars));
  const headings = detectHeadings(pageTexts);

  if (chunks.length === 0) {
    throw new ProcessingError(
      "NO_TEXT",
      "No hemos podido extraer contenido aprovechable de este documento.",
    );
  }

  await storeChunks(job.documentId, chunks);

  const ctx: GenerationContext = {
    documentTitle: document.title,
    pageCount: extracted.pageCount,
    depth: document.summaryDepth as SummaryDepth,
    level: document.educationLevel as EducationLevel,
    style: document.explanationStyle as ExplanationStyle,
  };

  const { summary, analyses } = await buildSummary({
    documentId: job.documentId,
    jobId: job.id,
    chunks,
    ctx,
  });

  await buildOutline({
    documentId: job.documentId,
    jobId: job.id,
    analyses,
    chunks,
    ctx,
    headings,
  });

  await buildAudioScripts({
    documentId: job.documentId,
    jobId: job.id,
    sections: summary.sections,
  });

  await setStatus(
    job.documentId,
    job.id,
    "READY",
    "¡Tu material de estudio está listo!",
    100,
  );
}

registerHandler("PROCESS_DOCUMENT", handleProcessDocument);

/** Regeneración completa del resumen (con instrucciones opcionales). */
async function handleRegenerateSummary(job: {
  id: string;
  documentId: string;
  payload: Record<string, unknown>;
}) {
  const document = await prisma.document.findUnique({ where: { id: job.documentId } });
  if (!document) throw new ProcessingError("NOT_FOUND", "El documento ya no existe.");

  const sections = await prisma.documentSection.findMany({
    where: { documentId: job.documentId },
    orderBy: { position: "asc" },
  });
  if (sections.length === 0) {
    throw new ProcessingError(
      "NOT_PROCESSED",
      "Este documento todavía no se ha analizado.",
    );
  }

  const chunks: Chunk[] = sections.map((section) => ({
    position: section.position,
    title: section.title,
    level: section.level,
    startPage: section.startPage,
    endPage: section.endPage,
    content: section.content,
    charCount: section.charCount,
  }));

  const ctx: GenerationContext = {
    documentTitle: document.title,
    pageCount: document.pageCount,
    depth: (job.payload.depth as SummaryDepth) ?? (document.summaryDepth as SummaryDepth),
    level:
      (job.payload.level as EducationLevel) ??
      (document.educationLevel as EducationLevel),
    style:
      (job.payload.style as ExplanationStyle) ??
      (document.explanationStyle as ExplanationStyle),
  };

  await prisma.document.update({
    where: { id: job.documentId },
    data: {
      summaryDepth: ctx.depth,
      educationLevel: ctx.level,
      explanationStyle: ctx.style,
      status: "SUMMARIZING",
      errorCode: null,
      errorMessage: null,
    },
  });

  const instructions = (job.payload.instructions as string) ?? null;
  const { summary, analyses } = await buildSummary({
    documentId: job.documentId,
    jobId: job.id,
    chunks,
    ctx,
    instructions,
  });

  if (job.payload.regenerateOutline !== false) {
    await buildOutline({
      documentId: job.documentId,
      jobId: job.id,
      analyses,
      chunks,
      ctx,
      headings: await headingsFor(job.documentId),
      instructions,
    });
  }

  await buildAudioScripts({
    documentId: job.documentId,
    jobId: job.id,
    sections: summary.sections,
  });

  await setStatus(
    job.documentId,
    job.id,
    "READY",
    "¡Tu material de estudio está listo!",
    100,
  );
}

registerHandler("REGENERATE_SUMMARY", handleRegenerateSummary);

/** Regeneración únicamente del esquema. */
async function handleRegenerateOutline(job: {
  id: string;
  documentId: string;
  payload: Record<string, unknown>;
}) {
  const document = await prisma.document.findUnique({ where: { id: job.documentId } });
  if (!document) throw new ProcessingError("NOT_FOUND", "El documento ya no existe.");

  const sections = await prisma.documentSection.findMany({
    where: { documentId: job.documentId },
    orderBy: { position: "asc" },
  });

  const chunks: Chunk[] = sections.map((section) => ({
    position: section.position,
    title: section.title,
    level: section.level,
    startPage: section.startPage,
    endPage: section.endPage,
    content: section.content,
    charCount: section.charCount,
  }));

  const analyses: ChunkAnalysis[] = sections.map((section) => {
    if (section.analysis) {
      try {
        return JSON.parse(section.analysis) as ChunkAnalysis;
      } catch {
        /* cae al valor por defecto */
      }
    }
    return {
      title: section.title,
      markdown: "",
      keyConcepts: [],
      sourcePages: [section.startPage],
      formulas: [],
      examHighlights: [],
    };
  });

  await buildOutline({
    documentId: job.documentId,
    jobId: job.id,
    analyses,
    chunks,
    headings: await headingsFor(job.documentId),
    ctx: {
      documentTitle: document.title,
      pageCount: document.pageCount,
      depth: document.summaryDepth as SummaryDepth,
      level: document.educationLevel as EducationLevel,
      style: document.explanationStyle as ExplanationStyle,
    },
    instructions: (job.payload.instructions as string) ?? null,
  });

  await setStatus(
    job.documentId,
    job.id,
    "READY",
    "¡Tu material de estudio está listo!",
    100,
  );
}

registerHandler("REGENERATE_OUTLINE", handleRegenerateOutline);
