/**
 * Vuelve a leer las páginas escaneadas que se quedaron sin texto.
 *
 * Sirve para un documento ya terminado al que le faltan páginas (por ejemplo,
 * porque la lectura falló en el servidor): no hace falta volver a subir el
 * PDF. Se leen solo las que faltan y después se rehacen resumen y esquema.
 */
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { ensureWorker, enqueue } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

export const POST = route(async (_request: Request, { params }: Contexto) => {
  const user = await requireUser();
  const { id } = await params;
  const documento = await prisma.document.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true },
  });
  if (!documento) return fail("No encontramos ese documento.", 404, "NOT_FOUND");
  if (documento.status !== "READY" && documento.status !== "FAILED") {
    return fail("Este documento todavía se está procesando.", 409, "BUSY");
  }

  const { count } = await prisma.documentPage.updateMany({
    where: { documentId: id, source: "EMPTY" },
    data: { ocrIntentos: 0, ocrToken: null, ocrReclamadaEn: null },
  });
  if (count === 0) return ok({ queued: false, pendientes: 0 });

  await prisma.document.update({
    where: { id },
    data: {
      status: "EXTRACTING",
      statusMessage: "Leyendo las páginas escaneadas…",
      progress: 18,
      errorCode: null,
      errorMessage: null,
    },
  });
  await ensureWorker();
  await enqueue(id, "PROCESS_DOCUMENT");
  return ok({ queued: true, pendientes: count });
});
