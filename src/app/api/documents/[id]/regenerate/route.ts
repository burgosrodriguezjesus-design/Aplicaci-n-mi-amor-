import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { ensureWorker, enqueue } from "@/lib/jobs";
import { narrate, regenerateSection, type GenerationContext } from "@/lib/ai/generate";
import type {
  EducationLevel,
  ExplanationStyle,
  SummaryDepth,
} from "@/lib/ai/prompts";
import { estimateSeconds } from "@/lib/tts/speakify";
import { segmentScript } from "@/lib/tts/segment";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Regenerar un apartado llama al modelo: damos margen suficiente.
export const maxDuration = 300;

const schema = z.object({
  target: z.enum(["summary", "outline", "section"]),
  sectionId: z.string().optional(),
  instructions: z.string().trim().max(600).optional(),
  depth: z.enum(["RAPIDO", "NORMAL", "DETALLADO", "MUY_DETALLADO"]).optional(),
  educationLevel: z.enum(["ESO", "BACHILLERATO", "FP", "UNIVERSIDAD", "OTRO"]).optional(),
  explanationStyle: z.enum(["CERO", "NORMAL", "AVANZADO"]).optional(),
});

/** Rehace el texto completo del resumen a partir de sus apartados. */
async function rebuildSummaryMarkdown(summaryId: string, documentTitle: string) {
  const sections = await prisma.summarySection.findMany({
    where: { summaryId },
    orderBy: { position: "asc" },
  });
  const markdown = [`# ${documentTitle}`, "", ...sections.map((s) => s.markdown)]
    .join("\n\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  await prisma.summary.update({ where: { id: summaryId }, data: { markdown } });
}

export const POST = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;
    const body = schema.parse(await request.json());

    const document = await prisma.document.findFirst({
      where: { id, userId: user.id },
    });
    if (!document) return fail("No encontramos ese documento.", 404, "NOT_FOUND");

    // ── Regeneración completa (asíncrona) ───────────────────────────────
    if (body.target === "summary" || body.target === "outline") {
      await prisma.document.update({
        where: { id },
        data: {
          status: body.target === "summary" ? "SUMMARIZING" : "OUTLINING",
          statusMessage:
            body.target === "summary"
              ? "Regenerando el resumen…"
              : "Regenerando el esquema…",
          progress: 35,
          errorCode: null,
          errorMessage: null,
        },
      });

      await ensureWorker();
      await enqueue(
        id,
        body.target === "summary" ? "REGENERATE_SUMMARY" : "REGENERATE_OUTLINE",
        {
          instructions: body.instructions ?? null,
          depth: body.depth,
          level: body.educationLevel,
          style: body.explanationStyle,
        },
      );

      return ok({ queued: true });
    }

    // ── Regeneración de un solo apartado (síncrona, sin reprocesar todo) ─
    if (!body.sectionId) {
      return fail("Falta indicar el apartado que quieres regenerar.", 400, "NO_SECTION");
    }

    const section = await prisma.summarySection.findFirst({
      where: { id: body.sectionId, summary: { documentId: id } },
      include: { summary: true },
    });
    if (!section) return fail("No encontramos ese apartado.", 404, "SECTION_NOT_FOUND");

    const pages: number[] = JSON.parse(section.sourcePages || "[]");
    const startPage = pages.length ? Math.min(...pages) : 1;
    const endPage = pages.length ? Math.max(...pages) : document.pageCount;

    // Fuente de verdad: el texto original del PDF de esas páginas.
    const documentSections = await prisma.documentSection.findMany({
      where: { documentId: id },
      orderBy: { position: "asc" },
    });
    const matching = documentSections.filter(
      (candidate) => candidate.startPage <= endPage && candidate.endPage >= startPage,
    );
    const sourceText = (matching.length ? matching : documentSections)
      .map((candidate) => candidate.content)
      .join("\n\n")
      .slice(0, 60000);

    if (!sourceText.trim()) {
      return fail(
        "No conservamos el texto original de este apartado. Vuelve a procesar el documento.",
        409,
        "NO_SOURCE",
      );
    }

    const ctx: GenerationContext = {
      documentTitle: document.title,
      pageCount: document.pageCount,
      depth: (body.depth ?? document.summaryDepth) as SummaryDepth,
      level: (body.educationLevel ?? document.educationLevel) as EducationLevel,
      style: (body.explanationStyle ?? document.explanationStyle) as ExplanationStyle,
    };

    const { markdown } = await regenerateSection({
      sectionTitle: section.title,
      currentMarkdown: section.markdown,
      sourceText,
      instructions: body.instructions || "Mejora la claridad sin perder información.",
      startPage,
      endPage,
      ctx,
    });

    await prisma.summarySection.update({
      where: { id: section.id },
      data: { markdown },
    });
    await rebuildSummaryMarkdown(section.summaryId, document.title);

    // Solo se regenera el audio del apartado afectado.
    const track = await prisma.audioTrack.findFirst({
      where: { documentId: id, title: section.title, source: "SUMMARY" },
    });
    if (track) {
      const script = await narrate(section.title, markdown);
      const seconds = estimateSeconds(script);
      const segments = segmentScript(script, seconds);

      if (track.audioKey) await storage.delete(track.audioKey).catch(() => undefined);
      await prisma.audioSegment.deleteMany({ where: { trackId: track.id } });
      await prisma.audioTrack.update({
        where: { id: track.id },
        data: {
          script,
          charCount: script.length,
          estimatedSeconds: seconds,
          audioStatus: "PENDING",
          audioKey: null,
          durationSeconds: null,
          errorMessage: null,
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

    return ok({ section: { id: section.id, title: section.title, markdown } });
  },
);
