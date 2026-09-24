import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, route } from "@/lib/api";
import { CAMPOS_DE_SUBIDA, recibirPdf } from "@/lib/documents/recibir";
import {
  borrarTrozos,
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
  })
  .passthrough();

type Contexto = { params: Promise<{ uploadId: string }> };

/** Termina la subida: junta los trozos y crea el documento. */
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

  const campos: Record<string, unknown> = {};
  for (const nombre of CAMPOS_DE_SUBIDA) campos[nombre] = cuerpo[nombre];

  try {
    return await recibirPdf(user.id, datos, cuerpo.name, campos);
  } finally {
    await borrarTrozos(user.id, uploadId, cuerpo.parts);
  }
});

/** Cancela una subida a medias y borra lo que hubiera llegado. */
export const DELETE = route(async (request: Request, { params }: Contexto) => {
  const user = await requireUser();
  const { uploadId } = await params;
  if (!idDeSubidaValido(uploadId)) return fail("Subida no válida.", 400, "BAD_UPLOAD");
  const partes = Number(new URL(request.url).searchParams.get("parts") ?? "0");
  if (Number.isInteger(partes) && partes > 0 && partes <= 10000) {
    await borrarTrozos(user.id, uploadId, partes);
  }
  return new Response(null, { status: 204 });
});
