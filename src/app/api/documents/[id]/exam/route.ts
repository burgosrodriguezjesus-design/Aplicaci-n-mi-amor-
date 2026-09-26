import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api";
import { env } from "@/lib/env";
import { crearExamen } from "@/lib/examen/ia";
import type { Examen } from "@/lib/examen/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Con IA, preparar 40 preguntas con sus soluciones lleva su tiempo.
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

function respuesta(exam: { id: string; version: number; provider: string; createdAt: Date; content: string }) {
  return {
    id: exam.id,
    version: exam.version,
    provider: exam.provider,
    createdAt: exam.createdAt,
    examen: JSON.parse(exam.content) as Examen,
  };
}

/** El examen actual del documento (o null si todavía no se ha creado). */
export const GET = route(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const document = await prisma.document.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!document) return fail("No encontramos ese documento.", 404, "NOT_FOUND");
  const exam = await prisma.exam.findFirst({ where: { documentId: id, isCurrent: true }, orderBy: { version: "desc" } });
  return ok({ exam: exam ? respuesta(exam) : null });
});

/** Crea un examen nuevo (el anterior queda guardado como versión antigua). */
export const POST = route(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
    include: {
      summaries: {
        where: { isCurrent: true },
        take: 1,
        include: { sections: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!document) return fail("No encontramos ese documento.", 404, "NOT_FOUND");
  const summary = document.summaries[0];
  if (!summary?.sections.length) {
    return fail("El examen se prepara a partir del resumen: espera a que el documento esté listo.", 409, "NOT_READY");
  }

  // El texto original solo hace falta si lo va a leer la IA.
  const paginas = env.ai.enabled
    ? (
        await prisma.documentPage.findMany({
          where: { documentId: id },
          orderBy: { pageNumber: "asc" },
          select: { pageNumber: true, text: true },
        })
      ).map((p) => ({ numero: p.pageNumber, texto: p.text }))
    : [];

  const previo = await prisma.exam.findFirst({ where: { documentId: id }, orderBy: { version: "desc" }, select: { version: true } });
  const version = (previo?.version ?? 0) + 1;
  const { examen, proveedor } = await crearExamen({
    titulo: document.title,
    secciones: summary.sections.map((s) => ({
      titulo: s.title,
      markdown: s.markdown,
      paginas: JSON.parse(s.sourcePages || "[]") as number[],
    })),
    paginas,
    semilla: `${id}:${version}`,
  });
  if (!examen.test.length && !examen.cortas.length) {
    return fail("Este documento no tiene suficiente contenido de temario para preparar un examen.", 422, "EMPTY");
  }

  const [, exam] = await prisma.$transaction([
    prisma.exam.updateMany({ where: { documentId: id, isCurrent: true }, data: { isCurrent: false } }),
    prisma.exam.create({
      data: { documentId: id, content: JSON.stringify(examen), provider: proveedor, version, isCurrent: true },
    }),
  ]);
  return ok({ exam: respuesta(exam) }, { status: 201 });
});
