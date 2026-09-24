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
import { readFile } from "node:fs/promises";
import { prisma } from "../db";
import { env } from "../env";
import {
  extractPdf,
  PdfInvalidError,
  PdfProtectedError,
  looksLikePdf,
  type PageLine,
} from "../pdf/extract";
import { ocrAvailable } from "../pdf/ocr";
import { pdfEnDisco } from "../storage/en-disco";
import { cerrarExtraccion, extraccionCompleta, guardarLote } from "../documents/paginas";
import {
  avisarProgresoOcr,
  contarPendientes,
  ocrEnServidor,
  reconocerRepartido,
} from "./ocr-repartido";
import {
  buildChunks,
  chunkOptionsFor,
  detectHeadings,
  type Chunk,
} from "../pdf/structure";
import { mergeHeadings, readStructure, type Toc } from "../pdf/toc";
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
import { registerHandler, updateJob, type JobOutcome } from "./queue";

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

/** El PDF, cargado solo si hace falta (y una vez por ronda). */
type CargarPdf = () => Promise<{ data: Buffer; pdfPath: string }>;

/**
 * Fases 1 y 2: texto de cada página, con OCR cuando hace falta.
 *
 * El texto se saca una sola vez y queda guardado con sus líneas. Lo normal es
 * que lo saque el propio dispositivo nada más subir el PDF (en segundos, y
 * sin que el servidor tenga que abrir un PDF de 60 MB); si no, lo hace el
 * servidor. Las rondas siguientes ya no abren el PDF: solo esperan a que se
 * lean las páginas escaneadas, o las leen si le toca al servidor.
 */
async function extractPages(
  documentId: string,
  jobId: string,
  cargarPdf: CargarPdf,
  deadline: number,
  /** ¿Lee el servidor las escaneadas? (no si el PDF está en el dispositivo) */
  servidorLee: boolean,
) {
  if (!(await extraccionCompleta(documentId))) {
    await setStatus(documentId, jobId, "EXTRACTING", "Extrayendo contenido…", 8);
    const { data } = await cargarPdf();
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

    // Si mientras tanto lo ha terminado el dispositivo, se queda lo suyo.
    if (!(await extraccionCompleta(documentId))) {
      await prisma.documentPage.deleteMany({ where: { documentId } });
      for (let i = 0; i < extraction.pages.length; i += 100) {
        await guardarLote(
          documentId,
          extraction.pages.slice(i, i + 100).map((page) => ({
            pageNumber: page.pageNumber,
            text: page.text,
            source: page.source === "TEXT" ? "TEXT" : "EMPTY",
            lines: page.lines,
          })),
        );
      }
      await cerrarExtraccion(documentId, extraction.pageCount);
    }
  }

  const guardado = await prisma.document.findUnique({
    where: { id: documentId },
    select: { pageCount: true },
  });
  const pageCount = guardado?.pageCount ?? 0;

  if (servidorLee && ocrAvailable() && (await contarPendientes(documentId)) > 0) {
    await setStatus(
      documentId,
      jobId,
      "EXTRACTING",
      "Leyendo las páginas escaneadas…",
      18,
    );
    await avisarProgresoOcr(documentId, true);
    const { pdfPath } = await cargarPdf();
    const leidas = await reconocerRepartido({ documentId, pdfPath, deadline });
    await avisarProgresoOcr(documentId, true);
    // Si los ayudantes tienen reclamadas todas las que quedan, esta ronda no
    // ha podido coger ninguna: se espera un poco en vez de volver en seguida.
    if (leidas === 0 && Date.now() < deadline) {
      await new Promise((listo) => setTimeout(listo, 2500));
    }
  }

  const pages = await prisma.documentPage.findMany({
    where: { documentId },
    orderBy: { pageNumber: "asc" },
    select: { pageNumber: true, text: true, source: true, lineas: true },
  });

  const withText = pages.filter((page) => page.source !== "EMPTY").length;
  const coverage = Math.round((withText / pages.length) * 100);
  const usedOcr = pages.some((page) => page.source === "OCR");

  await prisma.document.update({
    where: { id: documentId },
    data: { textCoverage: coverage, usedOcr },
  });

  // Quedan paginas por leer: esto sigue en la siguiente ronda.
  // (Si las lee el dispositivo, quedan pendientes hasta que las mande.)
  const ocrPendiente =
    (servidorLee ? ocrAvailable() : true) && (await contarPendientes(documentId)) > 0;
  if (ocrPendiente) {
    return { pages, pageCount, coverage, linesByPage: new Map<number, PageLine[]>(), ocrPendiente };
  }

  if (withText === 0) {
    throw new ProcessingError(
      "NO_TEXT",
      ocrAvailable() || !servidorLee
        ? "No hemos podido leer texto en este PDF. Parece un escaneo en el que no se distinguen las letras: prueba con un escaneo más nítido y recto."
        : "No hemos podido leer este PDF escaneado porque la lectura de imágenes no está disponible ahora mismo en el servidor. Vuelve a intentarlo en unos minutos.",
    );
  }

  // Las senales tipograficas (tamano de letra, margen) distinguen un titulo
  // de un parrafo. Van guardadas con cada pagina: no hay que reabrir el PDF.
  const linesByPage = new Map<number, PageLine[]>();
  for (const page of pages) {
    if (!page.lineas || page.source !== "TEXT") continue;
    try {
      const lines = JSON.parse(page.lineas) as PageLine[];
      if (lines.length > 0) linesByPage.set(page.pageNumber, lines);
    } catch {
      /* lineas estropeadas: se sigue sin ellas */
    }
  }

  return { pages, pageCount, coverage, linesByPage, ocrPendiente: false };
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
  /** Momento en que hay que parar y guardar. Infinito si no hay limite. */
  deadline?: number;
}) {
  const { documentId, jobId, chunks, ctx } = opts;
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY;
  const analyses: ChunkAnalysis[] = new Array(chunks.length);

  // Lo analizado en una rebanada anterior se reutiliza: con IA, analizar un
  // apartado cuesta una llamada, y repetirla seria tirar tiempo y dinero.
  if (!opts.instructions) {
    const guardadas = await prisma.documentSection.findMany({
      where: { documentId, analysis: { not: null } },
      select: { position: true, analysis: true },
    });
    const porPosicion = new Map(guardadas.map((s) => [s.position, s.analysis]));
    chunks.forEach((chunk, index) => {
      const guardada = porPosicion.get(chunk.position);
      if (!guardada) return;
      try {
        analyses[index] = JSON.parse(guardada) as ChunkAnalysis;
      } catch {
        /* si esta corrupta se vuelve a analizar */
      }
    });
  }
  let seAcaboElTiempo = false;

  // Los fragmentos se analizan en paralelo (con un tope) para que un temario
  // completo no tarde horas. El orden del resultado se respeta siempre.
  const concurrency = Math.max(1, Math.min(env.ai.concurrency, chunks.length));
  let next = 0;
  let done = 0;

  const worker = async () => {
    for (;;) {
      if (Date.now() >= deadline) {
        seAcaboElTiempo = true;
        return;
      }
      const index = next++;
      if (index >= chunks.length) return;
      if (analyses[index]) {
        done += 1;
        continue;
      }

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

  // Si falta algun apartado por analizar, se corta aqui: lo analizado ya esta
  // guardado en la base de datos y la siguiente rebanada sigue por ahi.
  if (seAcaboElTiempo && analyses.some((analysis) => !analysis)) {
    return { pending: true as const };
  }

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
  /** Indice del propio libro, si lo trae: manda sobre lo deducido. */
  toc?: Toc | null;
  instructions?: string | null;
}) {
  const { documentId, jobId, analyses, chunks, ctx } = opts;
  await setStatus(documentId, jobId, "OUTLINING", "Creando esquema de estudio…", 84);

  // El indice del libro fija los temas y sus niveles; los titulos hallados en
  // el cuerpo aportan los subapartados que el indice no lista.
  const headings = mergeHeadings(opts.headings ?? [], opts.toc ?? null);
  const tree = await generateOutline(analyses, chunks, ctx, headings);
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
async function headingsFor(
  documentId: string,
): Promise<{ headings: HeadingRef[]; toc: Toc | null }> {
  const pages = await prisma.documentPage.findMany({
    where: { documentId },
    orderBy: { pageNumber: "asc" },
    select: { pageNumber: true, text: true },
  });
  // Al regenerar no tenemos las senales tipograficas -no se guardan-, pero el
  // indice del libro se vuelve a leer del texto igual de bien.
  const structure = readStructure(pages);
  return { headings: detectHeadings(pages, structure), toc: structure.toc };
}

/** ¿Ya está extraído y solo faltan páginas escaneadas por leer? */
async function esperandoAlDispositivo(documentId: string) {
  return (await extraccionCompleta(documentId)) && (await contarPendientes(documentId)) > 0;
}

/** Handler principal: procesa un documento de principio a fin. */
async function handleProcessDocument(job: {
  id: string;
  documentId: string;
  payload: Record<string, unknown>;
  deadline: number;
}): Promise<JobOutcome> {
  const document = await prisma.document.findUnique({ where: { id: job.documentId } });
  if (!document) throw new ProcessingError("NOT_FOUND", "El documento ya no existe.");

  // El PDF está en el dispositivo (los muy grandes no se suben): el servidor
  // no puede abrirlo, así que espera a que el dispositivo mande el texto.
  const servidorLee = ocrEnServidor() && !document.pdfEnDispositivo;
  if (document.pdfEnDispositivo && !(await extraccionCompleta(document.id))) {
    await new Promise((listo) => setTimeout(listo, 3000));
    return { pending: true, message: "Leyendo el PDF en tu dispositivo…" };
  }

  // El dispositivo que acaba de subir el PDF está sacando el texto: se le
  // deja un rato antes de que el servidor lo haga él (y abra 60 MB).
  const dispositivoHasta = Number(job.payload?.dispositivoHasta ?? 0);
  if (Date.now() < dispositivoHasta && !(await extraccionCompleta(document.id))) {
    await new Promise((listo) => setTimeout(listo, 3000));
    return { pending: true, message: "Leyendo el PDF en tu dispositivo…" };
  }

  // Las páginas escaneadas las está leyendo el dispositivo: no hace falta
  // traer el PDF solo para decir que aún no ha terminado.
  if (!servidorLee && (await esperandoAlDispositivo(document.id))) {
    await new Promise((listo) => setTimeout(listo, 3000));
    return { pending: true, message: "Leyendo las páginas escaneadas en tu dispositivo…" };
  }

  let pdf: Promise<{ data: Buffer; pdfPath: string }> | null = null;
  const cargarPdf: CargarPdf = () => {
    pdf ??= (async () => {
      let data: Buffer;
      let pdfPath: string;
      try {
        // Del disco temporal si este servidor ya lo tiene de una ronda anterior.
        pdfPath = await pdfEnDisco(document.storageKey, document.sizeBytes);
        data = await readFile(pdfPath);
      } catch {
        throw new ProcessingError(
          "FILE_MISSING",
          "No encontramos el fichero original. Vuelve a subirlo, por favor.",
        );
      }
      if (!looksLikePdf(data)) {
        throw new ProcessingError("PDF_INVALID", "El archivo no es un PDF válido.");
      }
      return { data, pdfPath };
    })();
    return pdf;
  };

  let extracted;
  try {
    extracted = await extractPages(job.documentId, job.id, cargarPdf, job.deadline, servidorLee);
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

  // Si el reconocimiento se ha quedado a medias por falta de tiempo, aqui se
  // corta: lo hecho ya esta guardado y la siguiente rebanada sigue por ahi.
  // (Antes de pasar a "Analizando": mientras queden paginas por leer, el
  // documento sigue en lectura y los ayudantes siguen entrando.)
  if (extracted.ocrPendiente) {
    return {
      pending: true,
      message: "Leyendo las páginas escaneadas…",
    };
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
    lines: extracted.linesByPage.get(page.pageNumber),
  }));
  // Primero entender el documento y solo despues trocearlo: el indice del
  // propio libro manda sobre cualquier heuristica.
  const structure = readStructure(pageTexts);
  if (structure.toc) {
    await setStatus(
      job.documentId,
      job.id,
      "ANALYZING",
      `Índice reconocido: ${structure.toc.entries.length} apartados`,
      34,
    );
  }
  const totalChars = pageTexts.reduce((sum, page) => sum + page.text.length, 0);
  const chunks = buildChunks(pageTexts, chunkOptionsFor(totalChars), structure);
  const headings = detectHeadings(pageTexts, structure);

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

  const resumen = await buildSummary({
    documentId: job.documentId,
    jobId: job.id,
    chunks,
    ctx,
    deadline: job.deadline,
  });
  if ("pending" in resumen) {
    return { pending: true, message: "Creando el resumen por tandas…" };
  }
  const { summary, analyses } = resumen;

  await buildOutline({
    documentId: job.documentId,
    jobId: job.id,
    analyses,
    chunks,
    ctx,
    headings,
    toc: structure.toc,
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
  deadline: number;
}): Promise<JobOutcome> {
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
  const resumen = await buildSummary({
    documentId: job.documentId,
    jobId: job.id,
    chunks,
    ctx,
    instructions,
    deadline: job.deadline,
  });
  if ("pending" in resumen) {
    return { pending: true, message: "Rehaciendo el resumen por tandas…" };
  }
  const { summary, analyses } = resumen;

  if (job.payload.regenerateOutline !== false) {
    await buildOutline({
      documentId: job.documentId,
      jobId: job.id,
      analyses,
      chunks,
      ctx,
      ...(await headingsFor(job.documentId)),
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
    ...(await headingsFor(job.documentId)),
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
