import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ok, route } from "@/lib/api";
import { CAMPOS_DE_SUBIDA, prepararDocumento, Rechazo } from "@/lib/documents/recibir";
import { BYTES_POR_TROZO, totalDeTrozos } from "@/lib/documents/trozos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inicioSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    size: z.number().int().nonnegative(),
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

  try {
    const documento = await prepararDocumento(user.id, cuerpo.name, cuerpo.size, campos);
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
