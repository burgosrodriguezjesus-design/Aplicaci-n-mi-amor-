/**
 * Lo que pasa con un PDF cuando llega entero al servidor, venga como venga
 * (en una sola peticion o por trozos): se valida, se guarda y se encola.
 */
import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { env } from "@/lib/env";
import { buildDocumentKey, checksum, storage } from "@/lib/storage";
import { detectActiveContent, looksLikePdf } from "@/lib/pdf/extract";
import { ensureWorker, enqueue } from "@/lib/jobs";

/** Los ajustes que acompañan a la subida. */
export const CAMPOS_DE_SUBIDA = [
  "title",
  "subjectId",
  "topicId",
  "summaryDepth",
  "educationLevel",
  "explanationStyle",
] as const;

const ajustesSchema = z.object({
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

export async function recibirPdf(
  userId: string,
  data: Buffer,
  nombreOriginal: string,
  campos: Record<string, unknown>,
): Promise<Response> {
  if (data.length === 0) {
    return fail("El archivo está vacío.", 400, "EMPTY_FILE");
  }
  if (data.length > env.limits.maxUploadBytes) {
    return fail(
      `El PDF supera el límite de ${env.limits.maxUploadMb} MB.`,
      413,
      "FILE_TOO_LARGE",
    );
  }

  // Los campos vacios cuentan como no enviados.
  const limpios = Object.fromEntries(
    Object.entries(campos).filter(([, valor]) => valor !== "" && valor !== null),
  );
  const settings = ajustesSchema.parse(limpios);

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
      where: { id: settings.subjectId, userId },
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

  const storageKey = buildDocumentKey(userId, nombreOriginal);
  await storage.put(storageKey, data, "application/pdf");

  const title =
    settings.title?.trim() ||
    nombreOriginal.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() ||
    "Documento sin título";

  const document = await prisma.document.create({
    data: {
      userId,
      subjectId,
      topicId,
      title: title.slice(0, 200),
      originalName: nombreOriginal.slice(0, 255),
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
}
