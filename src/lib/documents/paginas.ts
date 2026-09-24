/**
 * Guardado del texto de las páginas de un documento, venga del servidor o
 * del dispositivo. Las mismas reglas para los dos: qué página es escaneada,
 * el tope de páginas a leer y el porcentaje de texto.
 */
import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { MAX_INTENTOS } from "@/lib/jobs/ocr-repartido";
import type { PageLine } from "@/lib/pdf/lineas";

export type PaginaExtraida = {
  pageNumber: number;
  text: string;
  source: "TEXT" | "EMPTY";
  lines?: PageLine[];
};

/** ¿Está ya el texto de todas las páginas guardado? */
export async function extraccionCompleta(documentId: string) {
  const [documento, filas] = await Promise.all([
    prisma.document.findUnique({ where: { id: documentId }, select: { pageCount: true } }),
    prisma.documentPage.count({ where: { documentId } }),
  ]);
  const pageCount = documento?.pageCount ?? 0;
  return pageCount > 0 && filas === pageCount;
}

/** Guarda (o sustituye) un lote de páginas. */
export async function guardarLote(documentId: string, lote: PaginaExtraida[]) {
  if (lote.length === 0) return;
  await prisma.$transaction([
    prisma.documentPage.deleteMany({
      where: { documentId, pageNumber: { in: lote.map((p) => p.pageNumber) } },
    }),
    prisma.documentPage.createMany({
      data: lote.map((pagina) => ({
        documentId,
        pageNumber: pagina.pageNumber,
        text: pagina.text,
        charCount: pagina.text.replace(/\s/g, "").length,
        source: pagina.source,
        lineas: pagina.lines && pagina.lines.length > 0 ? JSON.stringify(pagina.lines) : null,
      })),
    }),
  ]);
}

/**
 * Da la extracción por terminada: comprueba que están todas las páginas,
 * aplica el tope de páginas escaneadas y deja el documento listo para leer
 * las escaneadas. Devuelve false si faltan páginas.
 */
export async function cerrarExtraccion(documentId: string, pageCount: number) {
  const paginas = await prisma.documentPage.findMany({
    where: { documentId },
    select: { pageNumber: true, source: true },
    orderBy: { pageNumber: "asc" },
  });
  const numeros = new Set(paginas.map((p) => p.pageNumber));
  for (let n = 1; n <= pageCount; n++) if (!numeros.has(n)) return false;

  const escaneadas = paginas.filter((p) => p.source === "EMPTY").map((p) => p.pageNumber);
  const conTexto = paginas.length - escaneadas.length;

  // Un libro escaneado entero es mucho trabajo: el tope evita sorpresas.
  // Las escaneadas que pasan del tope se marcan como ya intentadas.
  const sobran = escaneadas.slice(env.limits.ocrMaxPages);
  if (sobran.length > 0) {
    await prisma.documentPage.updateMany({
      where: { documentId, pageNumber: { in: sobran } },
      data: { ocrIntentos: MAX_INTENTOS },
    });
  }

  await prisma.document.update({
    where: { id: documentId },
    data: {
      pageCount,
      textCoverage: pageCount === 0 ? 0 : Math.round((conTexto / pageCount) * 100),
      ...(escaneadas.length > 0
        ? { statusMessage: "Leyendo las páginas escaneadas…", progress: 18 }
        : { statusMessage: "Analizando el documento…", progress: 30 }),
      ...(sobran.length > 0
        ? {
            errorCode: "OCR_PARTIAL",
            errorMessage: `El documento tiene ${escaneadas.length} páginas escaneadas y se leen las ${env.limits.ocrMaxPages} primeras. Para leer más, sube el límite con OCR_MAX_PAGES o divide el PDF.`,
          }
        : {}),
    },
  });
  return true;
}
