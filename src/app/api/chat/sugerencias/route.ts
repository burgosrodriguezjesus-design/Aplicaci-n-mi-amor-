import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { sugerencias } from "@/lib/preguntas/motor";
import { cargarDocumento } from "@/lib/preguntas/documento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Preguntas de ejemplo sacadas del propio documento (que sí sabe responder). */
export const GET = route(async (request: Request) => {
  const user = await requireUser();
  const doc = new URL(request.url).searchParams.get("doc");
  if (!doc) return fail("Elige un documento.", 422, "VALIDATION_ERROR");
  const cargado = await cargarDocumento(user.id, doc);
  if (!cargado) return fail("No encontramos ese documento.", 404, "NOT_FOUND");
  return ok({ sugerencias: sugerencias(cargado.documento, 4) });
});
