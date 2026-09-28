import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { colaDeHoy, registrarRepaso } from "@/lib/tarjetas/cola";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * El repaso de hoy (de todos los documentos o de uno: ?doc=ID), con el
 * resumen de lo aprendido. ?solo=resumen devuelve solo los números (Inicio).
 */
export const GET = route(async (request: Request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const doc = url.searchParams.get("doc");
  const repaso = await colaDeHoy(user.id, doc);
  if (!repaso) return fail("No encontramos ese documento.", 404, "NOT_FOUND");
  if (url.searchParams.get("solo") === "resumen") return ok({ totales: repaso.totales, resumen: repaso.resumen });
  return ok(repaso);
});

const schema = z.object({
  documentId: z.string().min(1).max(64),
  clave: z.string().min(1).max(80),
  nota: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});

/** Cómo ha ido una tarjeta: 0 = no me la sé, 1 = dudé, 2 = me la sé. */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const body = schema.parse(await request.json());
  const estado = await registrarRepaso(user.id, body.documentId, body.clave, body.nota);
  if (!estado) return fail("No encontramos esa tarjeta.", 404, "NOT_FOUND");
  return ok({ estado });
});
