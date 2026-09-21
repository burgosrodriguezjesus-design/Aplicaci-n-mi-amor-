import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Detalle completo de un documento: resumen, esquema, pistas de audio y progreso. */
export const GET = route(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
    include: {
      subject: true,
      topic: true,
      summaries: {
        where: { isCurrent: true },
        take: 1,
        include: { sections: { orderBy: { position: "asc" } } },
      },
      outlines: { where: { isCurrent: true }, take: 1 },
      // Los segmentos y los guiones NO se envían aquí: en un temario de
      // cientos de páginas serían megas de JSON. Se piden por pista en
      // /api/audio/[trackId] cuando hacen falta.
      audioTracks: {
        orderBy: { position: "asc" },
        include: { _count: { select: { segments: true } } },
      },
      progressRows: { where: { userId: user.id }, take: 1 },
    },
  });

  if (!document) return fail("No encontramos ese documento.", 404, "NOT_FOUND");

  const summary = document.summaries[0] ?? null;
  const outline = document.outlines[0] ?? null;
  const progress = document.progressRows[0] ?? null;

  return ok({
    document: {
      id: document.id,
      title: document.title,
      originalName: document.originalName,
      pageCount: document.pageCount,
      sizeBytes: document.sizeBytes,
      status: document.status,
      statusMessage: document.statusMessage,
      processingProgress: document.progress,
      errorCode: document.errorCode,
      errorMessage: document.errorMessage,
      textCoverage: document.textCoverage,
      usedOcr: document.usedOcr,
      summaryDepth: document.summaryDepth,
      educationLevel: document.educationLevel,
      explanationStyle: document.explanationStyle,
      createdAt: document.createdAt,
      subject: document.subject,
      topic: document.topic,
    },
    summary: summary
      ? {
          id: summary.id,
          depth: summary.depth,
          provider: summary.provider,
          model: summary.model,
          version: summary.version,
          createdAt: summary.createdAt,
          // El Markdown completo se descarga aparte (/export): aquí van los
          // apartados, que es lo que pinta la interfaz.
          sections: summary.sections.map((section) => ({
            id: section.id,
            position: section.position,
            title: section.title,
            markdown: section.markdown,
            sourcePages: JSON.parse(section.sourcePages || "[]") as number[],
            keyConcepts: JSON.parse(section.keyConcepts || "[]") as string[],
          })),
        }
      : null,
    outline: outline
      ? {
          id: outline.id,
          provider: outline.provider,
          version: outline.version,
          tree: JSON.parse(outline.tree),
        }
      : null,
    tracks: document.audioTracks.map((track) => ({
      id: track.id,
      source: track.source,
      position: track.position,
      title: track.title,
      chapter: track.chapter,
      estimatedSeconds: track.estimatedSeconds,
      durationSeconds: track.durationSeconds,
      audioStatus: track.audioStatus,
      charCount: track.charCount,
      segmentCount: track._count.segments,
      segments: [],
    })),
    progress: progress
      ? {
          percent: progress.percent,
          readSeconds: progress.readSeconds,
          listenSeconds: progress.listenSeconds,
          completedSections: JSON.parse(progress.completedSections || "[]") as string[],
          lastTab: progress.lastTab,
          lastTrackId: progress.lastTrackId,
          lastPositionSeconds: progress.lastPositionSeconds,
        }
      : null,
  });
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  subjectId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const body = patchSchema.parse(await request.json());

  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!document) return fail("No encontramos ese documento.", 404, "NOT_FOUND");

  // Validamos la pertenencia de asignatura y tema antes de asignarlos.
  let subjectId = body.subjectId;
  if (subjectId) {
    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, userId: user.id },
      select: { id: true },
    });
    if (!subject) return fail("Esa asignatura no existe.", 404, "SUBJECT_NOT_FOUND");
  }
  let topicId = body.topicId;
  if (topicId) {
    const topic = await prisma.topic.findFirst({
      where: { id: topicId, subject: { userId: user.id } },
      select: { id: true, subjectId: true },
    });
    if (!topic) return fail("Ese tema no existe.", 404, "TOPIC_NOT_FOUND");
    subjectId = subjectId ?? topic.subjectId;
  }

  const updated = await prisma.document.update({
    where: { id },
    data: {
      ...(body.title ? { title: body.title } : {}),
      ...(body.subjectId !== undefined ? { subjectId } : {}),
      ...(body.topicId !== undefined ? { topicId } : {}),
    },
    include: { subject: true, topic: true },
  });

  return ok({ document: updated });
});

export const DELETE = route(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
    include: { audioTracks: { select: { audioKey: true } } },
  });
  if (!document) return fail("No encontramos ese documento.", 404, "NOT_FOUND");

  // Primero la base de datos (en cascada) y después los ficheros.
  await prisma.document.delete({ where: { id } });
  await storage.delete(document.storageKey).catch(() => undefined);
  for (const track of document.audioTracks) {
    if (track.audioKey) await storage.delete(track.audioKey).catch(() => undefined);
  }

  return ok({ ok: true });
});
