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
import { extraccionCompleta } from "@/lib/documents/paginas";

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

/** Error de validación con su respuesta ya preparada. */
class Rechazo extends Error {
  constructor(public respuesta: Response) {
    super("rechazado");
  }
}

/**
 * Paso 1: crea el documento, aún sin el PDF (estado UPLOADING).
 *
 * Se hace al empezar la subida para que el dispositivo pueda ponerse a
 * sacar el texto y leer las páginas escaneadas mientras el PDF sube: el
 * tiempo de subida queda escondido detrás de la lectura.
 */
export async function prepararDocumento(
  userId: string,
  nombreOriginal: string,
  bytes: number,
  campos: Record<string, unknown>,
) {
  if (bytes === 0) throw new Rechazo(fail("El archivo está vacío.", 400, "EMPTY_FILE"));
  if (bytes > env.limits.maxUploadBytes) {
    throw new Rechazo(
      fail(`El PDF supera el límite de ${env.limits.maxUploadMb} MB.`, 413, "FILE_TOO_LARGE"),
    );
  }

  // Los campos vacios cuentan como no enviados.
  const limpios = Object.fromEntries(
    Object.entries(campos).filter(([, valor]) => valor !== "" && valor !== null && valor !== undefined),
  );
  const settings = ajustesSchema.parse(limpios);

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

  const title =
    settings.title?.trim() ||
    nombreOriginal.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() ||
    "Documento sin título";

  // Subidas abandonadas hace tiempo (se cerró la app a mitad): fuera.
  await prisma.document.deleteMany({
    where: { userId, status: "UPLOADING", createdAt: { lt: new Date(Date.now() - 6 * 3600_000) } },
  });

  return prisma.document.create({
    data: {
      userId,
      subjectId,
      topicId,
      title: title.slice(0, 200),
      originalName: nombreOriginal.slice(0, 255),
      storageKey: buildDocumentKey(userId, nombreOriginal),
      sizeBytes: bytes,
      checksum: "",
      status: "UPLOADING",
      statusMessage: "Subiendo el PDF…",
      progress: 1,
      summaryDepth: settings.summaryDepth,
      educationLevel: settings.educationLevel,
      explanationStyle: settings.explanationStyle,
    },
  });
}

/**
 * Paso 2: ya está el PDF entero. Se valida por contenido, se guarda y se
 * pone en cola. Si no es un PDF de verdad, el documento se borra.
 */
export async function completarDocumento(
  documentId: string,
  data: Buffer,
  opciones: {
    /** El dispositivo que lo sube saca él mismo el texto. */
    extraeDispositivo?: boolean;
    /** Cómo guardarlo, si no es escribiendo los bytes (p. ej. componiendo trozos). */
    guardar?: (storageKey: string) => Promise<void>;
  } = {},
): Promise<Response> {
  const documento = await prisma.document.findUnique({ where: { id: documentId } });
  if (!documento) return fail("No encontramos ese documento.", 404, "NOT_FOUND");

  // Validación por contenido, no por extensión ni por el tipo declarado.
  if (data.length === 0 || !looksLikePdf(data)) {
    await prisma.document.delete({ where: { id: documentId } }).catch(() => undefined);
    return fail(
      "El archivo no es un PDF válido. Comprueba que no se haya renombrado otro tipo de fichero.",
      415,
      "NOT_A_PDF",
    );
  }

  const activeContent = detectActiveContent(data);

  if (opciones.guardar) await opciones.guardar(documento.storageKey);
  else await storage.put(documento.storageKey, data, "application/pdf");

  // Puede que el dispositivo haya sacado ya el texto mientras subía.
  const yaExtraido = await extraccionCompleta(documentId);
  const document = await prisma.document.update({
    where: { id: documentId },
    data: {
      sizeBytes: data.length,
      checksum: checksum(data),
      status: yaExtraido ? "EXTRACTING" : "UPLOADED",
      ...(yaExtraido
        ? {}
        : {
            statusMessage: opciones.extraeDispositivo
              ? "Leyendo el PDF en tu dispositivo…"
              : "PDF recibido, preparando análisis…",
            progress: 3,
          }),
    },
  });

  await ensureWorker();
  // Si el dispositivo saca el texto, el servidor le espera un poco antes de
  // hacerlo él (por si se cierra la app a mitad, no espera para siempre).
  await enqueue(
    document.id,
    "PROCESS_DOCUMENT",
    opciones.extraeDispositivo && !yaExtraido ? { dispositivoHasta: Date.now() + 90_000 } : {},
  );

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

/** Subida en una sola petición: los dos pasos seguidos. */
export async function recibirPdf(
  userId: string,
  data: Buffer,
  nombreOriginal: string,
  campos: Record<string, unknown>,
): Promise<Response> {
  try {
    const documento = await prepararDocumento(userId, nombreOriginal, data.length, campos);
    return await completarDocumento(documento.id, data);
  } catch (error) {
    if (error instanceof Rechazo) return error.respuesta;
    throw error;
  }
}

export { Rechazo };
