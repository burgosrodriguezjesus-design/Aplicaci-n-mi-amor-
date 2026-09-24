/**
 * Texto de las páginas extraído en el propio dispositivo.
 *
 * Nada más subir el PDF, el móvil saca el texto de todas las páginas (en
 * segundos: ya lo tiene en memoria) y lo manda aquí por tandas. Así el
 * servidor no tiene que abrir un PDF de decenas de MB, que en Vercel no le
 * cabía en el tiempo de una petición. Se aplican las mismas reglas que si
 * lo extrajera el servidor (ver src/lib/documents/paginas.ts).
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { env } from "@/lib/env";
import {
  cerrarExtraccion,
  extraccionCompleta,
  guardarLote,
} from "@/lib/documents/paginas";
import { asegurarCola, origenDe } from "@/lib/jobs/impulso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const linea = z.object({ text: z.string().max(5000), height: z.number(), x: z.number() });

const cuerpoSchema = z.object({
  pageCount: z.number().int().min(1),
  lote: z
    .array(
      z.object({
        pageNumber: z.number().int().min(1),
        text: z.string().max(100_000),
        source: z.enum(["TEXT", "EMPTY"]),
        lines: z.array(linea).max(3000).optional(),
      }),
    )
    .max(80),
  fin: z.boolean().optional(),
});

type Contexto = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, { params }: Contexto) => {
  const user = await requireUser();
  const { id } = await params;
  const documento = await prisma.document.findFirst({
    where: { id, userId: user.id },
    select: { status: true },
  });
  if (!documento) return fail("No encontramos ese documento.", 404, "NOT_FOUND");
  if (documento.status === "READY" || documento.status === "FAILED") {
    return fail("Este documento ya está terminado.", 409, "NOT_PROCESSING");
  }

  const cuerpo = cuerpoSchema.parse(await request.json());
  if (cuerpo.pageCount > env.limits.maxPages) {
    return fail(
      `El documento tiene ${cuerpo.pageCount} páginas y el límite es ${env.limits.maxPages}.`,
      413,
      "TOO_MANY_PAGES",
    );
  }
  if (cuerpo.lote.some((p) => p.pageNumber > cuerpo.pageCount)) {
    return fail("Página fuera del documento.", 400, "BAD_PAGE");
  }

  // Si el servidor ya lo sacó por su cuenta, no se pisa.
  if (await extraccionCompleta(id)) return ok({ completo: true });

  await guardarLote(id, cuerpo.lote);

  if (cuerpo.fin) {
    const completo = await cerrarExtraccion(id, cuerpo.pageCount);
    if (!completo) return fail("Faltan páginas por mandar.", 409, "INCOMPLETE");
    // Con el texto ya en el servidor, el resto sigue aunque se cierre la app.
    await asegurarCola(origenDe(request)).catch(() => undefined);
    return ok({ completo: true });
  }
  const hechas = await prisma.documentPage.count({ where: { documentId: id } });
  await prisma.document.update({
    where: { id },
    data: {
      // Mientras el PDF aún sube, sigue "subiendo": el cierre de la subida
      // busca el documento en ese estado.
      ...(documento.status === "UPLOADING" ? {} : { status: "EXTRACTING" }),
      statusMessage: `Extrayendo el texto: ${hechas} de ${cuerpo.pageCount} páginas…`,
      progress: 3 + Math.round((hechas / cuerpo.pageCount) * 12),
    },
  });
  return ok({ completo: false });
});
