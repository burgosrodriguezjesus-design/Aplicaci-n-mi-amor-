import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ensureWorker, enqueue } from "@/lib/jobs";
import { CAMPOS_DE_SUBIDA, prepararDocumento, Rechazo } from "@/lib/documents/recibir";
import { BYTES_POR_TROZO, totalDeTrozos } from "@/lib/documents/trozos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inicioSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    size: z.number().int().nonnegative(),
    /** El PDF se queda en el dispositivo: no se sube, solo va el texto. */
    soloDispositivo: z.boolean().optional(),
  })
  .passthrough();

/**
 * Empieza una subida por trozos: dice cuántos trozos y de qué tamaño, y crea
 * ya el documento para que el dispositivo pueda ir sacando el texto y
 * leyendo las páginas escaneadas mientras el PDF sube.
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const cuerpo = inicioSchema.parse(await request.json());

  const campos: Record<string, unknown> = {};
  for (const nombre of CAMPOS_DE_SUBIDA) campos[nombre] = cuerpo[nombre];

  const grande = cuerpo.size > env.limits.maxServidorMb * 1024 * 1024;
  if (grande && !cuerpo.soloDispositivo) {
    return fail(
      `Los PDF de más de ${env.limits.maxServidorMb} MB se guardan en tu dispositivo. Actualiza la aplicación (ciérrala y vuelve a abrirla).`,
      413,
      "USE_DEVICE",
    );
  }

  try {
    const documento = await prepararDocumento(user.id, cuerpo.name, cuerpo.size, campos);

    if (cuerpo.soloDispositivo) {
      // No hay nada que subir: el dispositivo guarda el PDF, saca el texto y
      // lee las escaneadas. El servidor solo recibe el texto.
      await prisma.document.update({
        where: { id: documento.id },
        data: {
          pdfEnDispositivo: true,
          checksum: null,
          status: "UPLOADED",
          statusMessage: "Leyendo el PDF en tu dispositivo…",
          progress: 3,
        },
      });
      await ensureWorker();
      await enqueue(documento.id, "PROCESS_DOCUMENT");
      return ok({ documentId: documento.id, soloDispositivo: true });
    }

    return ok({
      uploadId: randomUUID(),
      documentId: documento.id,
      chunkBytes: BYTES_POR_TROZO,
      parts: totalDeTrozos(cuerpo.size),
    });
  } catch (error) {
    if (error instanceof Rechazo) return error.respuesta;
    throw error;
  }
});
