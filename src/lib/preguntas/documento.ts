/**
 * Carga un documento del estudiante preparado para responder preguntas
 * sobre él. Se guarda un momento en memoria: las preguntas seguidas sobre
 * el mismo documento no vuelven a leerlo entero.
 */
import "server-only";
import { prisma } from "@/lib/db";
import { type Documento, prepararDocumento } from "./motor";

type Cargado = { documento: Documento; resumen: string };

const CACHE = new Map<string, { cargado: Cargado; usado: number }>();
const MAXIMO_EN_CACHE = 12;

/** null si no existe o no es suyo. */
export async function cargarDocumento(userId: string, documentId: string): Promise<Cargado | null> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, userId },
    select: {
      id: true,
      title: true,
      summaries: { where: { isCurrent: true }, take: 1, select: { id: true, version: true } },
    },
  });
  if (!doc) return null;
  const resumenActual = doc.summaries[0];
  const clave = `${doc.id}:${resumenActual?.id ?? "sin-resumen"}:${doc.title}`;
  const guardado = CACHE.get(clave);
  if (guardado) {
    guardado.usado = Date.now();
    return guardado.cargado;
  }

  const [secciones, paginas] = await Promise.all([
    resumenActual
      ? prisma.summarySection.findMany({
          where: { summaryId: resumenActual.id },
          orderBy: { position: "asc" },
          select: { title: true, markdown: true, sourcePages: true },
        })
      : Promise.resolve([]),
    prisma.documentPage.findMany({
      where: { documentId: doc.id },
      orderBy: { pageNumber: "asc" },
      select: { pageNumber: true, text: true },
    }),
  ]);
  const seccionesResumen = secciones.map((s) => ({
    titulo: s.title,
    markdown: s.markdown,
    paginas: JSON.parse(s.sourcePages || "[]") as number[],
  }));
  const cargado: Cargado = {
    documento: prepararDocumento(
      doc.title,
      seccionesResumen,
      paginas.map((p) => ({ numero: p.pageNumber, texto: p.text })),
    ),
    resumen: seccionesResumen.map((s) => s.markdown).join("\n\n"),
  };

  CACHE.set(clave, { cargado, usado: Date.now() });
  if (CACHE.size > MAXIMO_EN_CACHE) {
    const masViejo = [...CACHE.entries()].sort((a, b) => a[1].usado - b[1].usado)[0];
    if (masViejo) CACHE.delete(masViejo[0]);
  }
  return cargado;
}
