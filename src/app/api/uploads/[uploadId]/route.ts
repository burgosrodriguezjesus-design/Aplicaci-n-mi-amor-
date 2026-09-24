import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, route } from "@/lib/api";
import { storage } from "@/lib/storage";
import {
  CAMPOS_DE_SUBIDA,
  completarDocumento,
  prepararDocumento,
  Rechazo,
} from "@/lib/documents/recibir";
import {
  borrarTrozos,
  clavesDeTrozos,
  idDeSubidaValido,
  juntarTrozos,
} from "@/lib/documents/trozos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Juntar un PDF grande y guardarlo lleva unos segundos.
export const maxDuration = 60;

const finSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    parts: z.number().int().min(1).max(10000),
    documentId: z.string().optional(),
    extraeDispositivo: z.boolean().optional(),
  })
  .passthrough();

type Contexto = { params: Promise<{ uploadId: string }> };

/** Termina la subida: junta los trozos y completa el documento. */
export const POST = route(async (request: Request, { params }: Contexto) => {
  const user = await requireUser();
  const { uploadId } = await params;
  if (!idDeSubidaValido(uploadId)) return fail("Subida no válida.", 400, "BAD_UPLOAD");

  const cuerpo = finSchema.parse(await request.json());
  const datos = await juntarTrozos(user.id, uploadId, cuerpo.parts);
  if (!datos) {
    await borrarTrozos(user.id, uploadId, cuerpo.parts);
    return fail(
      "No ha llegado el archivo completo. Vuelve a intentarlo.",
      409,
      "INCOMPLETE_UPLOAD",
    );
  }

  try {
    // El documento se creó al empezar la subida. (Una versión anterior de la
    // app no lo manda: entonces se crea ahora, como antes.)
    let documentId = cuerpo.documentId;
    if (documentId) {
      const propio = await prisma.document.findFirst({
        where: { id: documentId, userId: user.id, status: "UPLOADING" },
        select: { id: true },
      });
      if (!propio) return fail("No encontramos esa subida.", 404, "NOT_FOUND");
    } else {
      const campos: Record<string, unknown> = {};
      for (const nombre of CAMPOS_DE_SUBIDA) campos[nombre] = cuerpo[nombre];
      documentId = (await prepararDocumento(user.id, cuerpo.name, datos.length, campos)).id;
    }

    return await completarDocumento(documentId, datos, {
      extraeDispositivo: cuerpo.extraeDispositivo === true,
      // Si el almacenamiento sabe, los trozos pasan a ser el PDF tal cual:
      // no se reescriben 60 MB de golpe (en Vercel podía pasar del límite).
      guardar: storage.componer
        ? (storageKey: string) =>
            storage.componer!(
              storageKey,
              clavesDeTrozos(user.id, uploadId, cuerpo.parts),
              "application/pdf",
            )
        : undefined,
    });
  } catch (error) {
    if (error instanceof Rechazo) return error.respuesta;
    throw error;
  } finally {
    // Los trozos compuestos ya no están con este nombre: solo se borran
    // los que sobren (si algo ha fallado).
    await borrarTrozos(user.id, uploadId, cuerpo.parts);
  }
});

/** Cancela una subida a medias: borra lo que hubiera llegado y el documento. */
export const DELETE = route(async (request: Request, { params }: Contexto) => {
  const user = await requireUser();
  const { uploadId } = await params;
  if (!idDeSubidaValido(uploadId)) return fail("Subida no válida.", 400, "BAD_UPLOAD");
  const url = new URL(request.url);
  const partes = Number(url.searchParams.get("parts") ?? "0");
  if (Number.isInteger(partes) && partes > 0 && partes <= 10000) {
    await borrarTrozos(user.id, uploadId, partes);
  }
  const documentId = url.searchParams.get("documentId");
  if (documentId) {
    await prisma.document.deleteMany({
      where: { id: documentId, userId: user.id, status: "UPLOADING" },
    });
  }
  return new Response(null, { status: 204 });
});
