/**
 * Lectura de páginas escaneadas en el propio dispositivo.
 *
 * El móvil reserva unas cuantas páginas pendientes, las lee él mismo y manda
 * el texto. Las reservas son las mismas que usan los servidores, así que
 * nunca se lee dos veces la misma página aunque haya varios leyendo a la vez.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import {
  guardarLecturas,
  progresoOcr,
  reclamar,
  soltar,
} from "@/lib/jobs/ocr-repartido";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cuerpoSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("reclamar"), cuantas: z.number().int().min(1).max(24) }),
  z.object({
    accion: z.literal("guardar"),
    token: z.string().uuid(),
    lecturas: z
      .array(
        z.object({
          pageNumber: z.number().int().min(1),
          text: z.string().max(60_000),
        }),
      )
      .max(24),
  }),
  z.object({ accion: z.literal("soltar"), token: z.string().uuid() }),
]);

type Contexto = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, { params }: Contexto) => {
  const user = await requireUser();
  const { id } = await params;
  const documento = await prisma.document.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!documento) return fail("No encontramos ese documento.", 404, "NOT_FOUND");

  const cuerpo = cuerpoSchema.parse(await request.json());

  if (cuerpo.accion === "reclamar") {
    const token = randomUUID();
    const paginas = await reclamar(id, token, cuerpo.cuantas);
    return ok({ token, paginas, ...(await progresoOcr(id)) });
  }
  if (cuerpo.accion === "guardar") {
    const leidas = await guardarLecturas(id, cuerpo.token, cuerpo.lecturas);
    return ok({ leidas, ...(await progresoOcr(id)) });
  }
  await soltar(id, cuerpo.token);
  return ok({ soltadas: true });
});
