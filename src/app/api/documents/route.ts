import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { env } from "@/lib/env";
import { buildDocumentKey, checksum, storage } from "@/lib/storage";
import { detectActiveContent, looksLikePdf } from "@/lib/pdf/extract";
import { ensureWorker, enqueue } from "@/lib/jobs";

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

const uploadSchema = z.object({
  title: z.string().trim().max(200).optional(),
  subjectId: z.string().trim().optional(),
  topicId: z.string().trim().optional(),
  summaryDepth: z
    .enum(["RAPIDO", "NORMAL", "DETALLADO", "MUY_DETALLADO"])
    .default("DETALLADO"),
  educationLevel: z
    .enum(["ESO", "BACHILLERATO", "FP", "UNIVERSIDAD", "OTRO"])
    .default("UNIVERSIDAD"),
  explanationStyle: z.enum(["CERO", "NORMAL", "AVANZADO"]).default("NORMAL"),
});

/** Subida de un PDF: valida, almacena y encola el procesamiento. */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return fail("No has adjuntado ningún archivo.", 400, "NO_FILE");
  }
  if (file.size === 0) {
    return fail("El archivo está vacío.", 400, "EMPTY_FILE");
  }
  if (file.size > env.limits.maxUploadBytes) {
    return fail(
      `El PDF supera el límite de ${env.limits.maxUploadMb} MB.`,
      413,
      "FILE_TOO_LARGE",
    );
  }

  const settings = uploadSchema.parse({
    title: form.get("title") ?? undefined,
    subjectId: form.get("subjectId") ?? undefined,
    topicId: form.get("topicId") ?? undefined,
    summaryDepth: form.get("summaryDepth") ?? undefined,
    educationLevel: form.get("educationLevel") ?? undefined,
    explanationStyle: form.get("explanationStyle") ?? undefined,
  });

  const data = Buffer.from(await file.arrayBuffer());

  // Validación por contenido, no por extensión ni por el tipo declarado.
  if (!looksLikePdf(data)) {
    return fail(
      "El archivo no es un PDF válido. Comprueba que no se haya renombrado otro tipo de fichero.",
      415,
      "NOT_A_PDF",
    );
  }

  const activeContent = detectActiveContent(data);

  // La asignatura y el tema deben pertenecer al usuario.
  let subjectId: string | null = null;
  let topicId: string | null = null;
  if (settings.subjectId) {
    const subject = await prisma.subject.findFirst({
      where: { id: settings.subjectId, userId: user.id },
      select: { id: true },
    });
    subjectId = subject?.id ?? null;
  }
  if (settings.topicId && subjectId) {
    const topic = await prisma.topic.findFirst({
      where: { id: settings.topicId, subjectId },
      select: { id: true },
    });
    topicId = topic?.id ?? null;
  }

  const storageKey = buildDocumentKey(user.id, file.name);
  await storage.put(storageKey, data, "application/pdf");

  const title =
    settings.title?.trim() ||
    file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() ||
    "Documento sin título";

  const document = await prisma.document.create({
    data: {
      userId: user.id,
      subjectId,
      topicId,
      title: title.slice(0, 200),
      originalName: file.name.slice(0, 255),
      storageKey,
      sizeBytes: data.length,
      checksum: checksum(data),
      status: "UPLOADED",
      statusMessage: "PDF recibido, preparando análisis…",
      progress: 3,
      summaryDepth: settings.summaryDepth,
      educationLevel: settings.educationLevel,
      explanationStyle: settings.explanationStyle,
    },
  });

  await ensureWorker();
  await enqueue(document.id, "PROCESS_DOCUMENT");

  return ok(
    {
      document: {
        id: document.id,
        title: document.title,
        status: document.status,
        statusMessage: document.statusMessage,
        sizeBytes: document.sizeBytes,
      },
      warnings: activeContent.length
        ? [
            `Este PDF contiene ${activeContent.join(", ")}. No lo ejecutamos en ningún momento: solo leemos su texto.`,
          ]
        : [],
    },
    { status: 201 },
  );
});
