import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";

export const dynamic = "force-dynamic";

const schema = z.object({
  documentId: z.string(),
  /** Segundos leídos desde el último envío (se acumulan). */
  readSeconds: z.number().int().min(0).max(3600).optional(),
  /** Segundos escuchados desde el último envío (se acumulan). */
  listenSeconds: z.number().int().min(0).max(3600).optional(),
  completedSectionId: z.string().optional(),
  uncompletedSectionId: z.string().optional(),
  lastTab: z.enum(["pdf", "summary", "outline", "audio"]).optional(),
  lastTrackId: z.string().nullable().optional(),
  lastPositionSeconds: z.number().min(0).optional(),
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Guarda el progreso de estudio. Al estar en el servidor y asociado al
 * usuario, se sincroniza automáticamente entre dispositivos.
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const body = schema.parse(await request.json());

  const document = await prisma.document.findFirst({
    where: { id: body.documentId, userId: user.id },
    select: { id: true },
  });
  if (!document) return fail("No encontramos ese documento.", 404, "NOT_FOUND");

  const existing = await prisma.studyProgress.findUnique({
    where: { userId_documentId: { userId: user.id, documentId: body.documentId } },
  });

  const completed = new Set<string>(
    existing ? (JSON.parse(existing.completedSections || "[]") as string[]) : [],
  );
  if (body.completedSectionId) completed.add(body.completedSectionId);
  if (body.uncompletedSectionId) completed.delete(body.uncompletedSectionId);

  const totalSections = await prisma.summarySection.count({
    where: { summary: { documentId: body.documentId, isCurrent: true } },
  });
  const percent =
    totalSections > 0
      ? Math.min(100, Math.round((completed.size / totalSections) * 100))
      : existing?.percent ?? 0;

  const progress = await prisma.studyProgress.upsert({
    where: { userId_documentId: { userId: user.id, documentId: body.documentId } },
    create: {
      userId: user.id,
      documentId: body.documentId,
      percent,
      readSeconds: body.readSeconds ?? 0,
      listenSeconds: body.listenSeconds ?? 0,
      completedSections: JSON.stringify([...completed]),
      lastTab: body.lastTab,
      lastTrackId: body.lastTrackId ?? null,
      lastPositionSeconds: body.lastPositionSeconds ?? 0,
    },
    update: {
      percent,
      completedSections: JSON.stringify([...completed]),
      ...(body.readSeconds ? { readSeconds: { increment: body.readSeconds } } : {}),
      ...(body.listenSeconds ? { listenSeconds: { increment: body.listenSeconds } } : {}),
      ...(body.lastTab ? { lastTab: body.lastTab } : {}),
      ...(body.lastTrackId !== undefined ? { lastTrackId: body.lastTrackId } : {}),
      ...(body.lastPositionSeconds !== undefined
        ? { lastPositionSeconds: body.lastPositionSeconds }
        : {}),
    },
  });

  // Registro diario para las estadísticas del panel.
  for (const [kind, seconds] of [
    ["READ", body.readSeconds ?? 0],
    ["LISTEN", body.listenSeconds ?? 0],
  ] as const) {
    if (seconds > 0) {
      await prisma.studySession.create({
        data: {
          userId: user.id,
          documentId: body.documentId,
          kind,
          seconds,
          day: today(),
        },
      });
    }
  }

  return ok({
    progress: {
      percent: progress.percent,
      readSeconds: progress.readSeconds,
      listenSeconds: progress.listenSeconds,
      completedSections: [...completed],
      lastTrackId: progress.lastTrackId,
      lastPositionSeconds: progress.lastPositionSeconds,
    },
  });
});
