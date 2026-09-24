import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { env } from "@/lib/env";
import { CAMPOS_DE_SUBIDA, recibirPdf } from "@/lib/documents/recibir";
import { asegurarCola, origenDe } from "@/lib/jobs/impulso";

export const runtime = "nodejs";
// La subida puede tardar: nunca se cachea.
export const dynamic = "force-dynamic";

const SORTS = {
  recent: { createdAt: "desc" as const },
  name: { title: "asc" as const },
  progress: { updatedAt: "desc" as const },
};

/** Listado de la biblioteca, con búsqueda, filtro por asignatura y orden. */
export const GET = route(async (request: Request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const subjectId = url.searchParams.get("subjectId") ?? undefined;
  const sort = (url.searchParams.get("sort") ?? "recent") as keyof typeof SORTS;

  const documents = await prisma.document.findMany({
    where: {
      userId: user.id,
      // Una subida a medias no es todavía un documento de la biblioteca.
      status: { not: "UPLOADING" },
      ...(subjectId ? { subjectId } : {}),
      ...(query ? { title: { contains: query } } : {}),
    },
    orderBy: SORTS[sort] ?? SORTS.recent,
    include: {
      subject: { select: { id: true, name: true, color: true, emoji: true } },
      topic: { select: { id: true, name: true } },
      progressRows: { where: { userId: user.id }, take: 1 },
      _count: { select: { audioTracks: true } },
      audioTracks: { select: { estimatedSeconds: true } },
    },
  });

  const items = documents.map((document) => {
    const progress = document.progressRows[0];
    const audioSeconds = document.audioTracks.reduce(
      (sum, track) => sum + track.estimatedSeconds,
      0,
    );
    return {
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
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      subject: document.subject,
      topic: document.topic,
      studyPercent: progress?.percent ?? 0,
      audioSeconds,
      trackCount: document._count.audioTracks,
      summaryDepth: document.summaryDepth,
      educationLevel: document.educationLevel,
      explanationStyle: document.explanationStyle,
    };
  });

  if (sort === "progress") items.sort((a, b) => b.studyPercent - a.studyPercent);

  return ok({ documents: items });
});

/**
 * Subida de un PDF en una sola peticion.
 *
 * Sirve en el ordenador y en alojamientos con disco. En Vercel una peticion no
 * puede pasar de 4,5 MB, asi que la interfaz sube por trozos (ver
 * /api/uploads) y acaba en el mismo `recibirPdf`.
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return fail("No has adjuntado ningún archivo.", 400, "NO_FILE");
  }
  if (file.size > env.limits.maxUploadBytes) {
    return fail(
      `El PDF supera el límite de ${env.limits.maxUploadMb} MB.`,
      413,
      "FILE_TOO_LARGE",
    );
  }

  const campos: Record<string, unknown> = {};
  for (const nombre of CAMPOS_DE_SUBIDA) campos[nombre] = form.get(nombre) ?? undefined;

  const respuesta = await recibirPdf(user.id, Buffer.from(await file.arrayBuffer()), file.name, campos);
  // A partir de aquí sigue solo aunque se cierre la app.
  await asegurarCola(origenDe(request)).catch(() => undefined);
  return respuesta;
});
