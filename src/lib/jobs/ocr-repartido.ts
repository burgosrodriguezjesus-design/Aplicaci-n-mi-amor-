/**
 * Reconocimiento de paginas escaneadas repartido entre varias peticiones.
 *
 * Un libro escaneado de cientos de paginas, reconocido por una sola peticion
 * detras de otra, tardaba muchisimo: en Vercel cada peticion tiene poco
 * tiempo y poca CPU. Aqui cada pagina pendiente se "reclama" en la base de
 * datos antes de reconocerla, asi que varias peticiones a la vez (la rebanada
 * normal del trabajo y los ayudantes que lanza la aplicacion) pueden ir
 * cogiendo paginas libres sin pisarse ni repetir ninguna.
 *
 * - Cada pagina se guarda nada mas leerla.
 * - Si una peticion muere con paginas reclamadas, el reclamo caduca y otra
 *   las coge.
 * - Una pagina que el reconocimiento no sabe leer se intenta como mucho
 *   MAX_INTENTOS veces: nunca se queda dando vueltas para siempre.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { ocrAvailable, ocrPages } from "../pdf/ocr";
import { limpiarTextoOcr } from "../pdf/limpiar-ocr";

export const MAX_INTENTOS = 2;

/**
 * ¿Lee el servidor las páginas escaneadas? En Vercel, no: cada petición tiene
 * una sola CPU y poco tiempo, y ahí la preparación de las páginas falla. Allí
 * las lee el propio dispositivo (ver src/lib/client/ocr-dispositivo.ts), que
 * además es mucho más rápido. OCR_EN_SERVIDOR=1 lo fuerza.
 */
export function ocrEnServidor() {
  const forzado = process.env.OCR_EN_SERVIDOR;
  if (forzado) return !/^(0|false|no)$/i.test(forzado);
  return !process.env.VERCEL;
}
const RECLAMO_CADUCA_MS = 3 * 60_000;
/** Paginas que se reclaman de una vez por cada hilo de reconocimiento. */
const POR_RECLAMO = 2;

/** Condicion de "pagina que aun hay que reconocer". */
function pendiente(documentId: string) {
  return {
    documentId,
    source: "EMPTY",
    ocrIntentos: { lt: MAX_INTENTOS },
  };
}

function libre() {
  return {
    OR: [
      { ocrToken: null },
      { ocrReclamadaEn: { lt: new Date(Date.now() - RECLAMO_CADUCA_MS) } },
    ],
  };
}

export async function contarPendientes(documentId: string) {
  return prisma.documentPage.count({ where: pendiente(documentId) });
}

/** ¿Tiene este usuario algun documento con paginas esperando reconocimiento? */
export async function hayOcrPendiente(userId: string) {
  if (ocrEnServidor() && !ocrAvailable()) return false;
  const pagina = await prisma.documentPage.findFirst({
    where: {
      source: "EMPTY",
      ocrIntentos: { lt: MAX_INTENTOS },
      document: { userId, status: { notIn: ["READY", "FAILED", "UPLOADING"] } },
    },
    select: { id: true },
  });
  return pagina !== null;
}

/** El documento de este usuario con paginas libres para reconocer, si hay. */
export async function documentoConOcrLibre(userId: string) {
  const pagina = await prisma.documentPage.findFirst({
    where: {
      source: "EMPTY",
      ocrIntentos: { lt: MAX_INTENTOS },
      document: { userId, status: { notIn: ["READY", "FAILED", "UPLOADING"] } },
      ...libre(),
    },
    select: {
      document: { select: { id: true, storageKey: true, sizeBytes: true } },
    },
  });
  return pagina?.document ?? null;
}

/** El documento de este usuario con paginas por leer (libres o no). */
export async function documentoConOcrPendiente(userId: string) {
  const pagina = await prisma.documentPage.findFirst({
    where: {
      source: "EMPTY",
      ocrIntentos: { lt: MAX_INTENTOS },
      document: { userId, status: { notIn: ["READY", "FAILED", "UPLOADING"] } },
    },
    select: { document: { select: { id: true } } },
  });
  return pagina?.document ?? null;
}

/**
 * Un documento de este usuario al que aún le falta el texto de las páginas
 * (para que lo saque el dispositivo, que lo hace en segundos).
 */
export async function documentoPorExtraer(userId: string) {
  const enMarcha = await prisma.document.findMany({
    where: { userId, status: { in: ["UPLOADED", "QUEUED", "EXTRACTING"] } },
    select: { id: true, pageCount: true, _count: { select: { pages: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const falta = enMarcha.find((d) => d.pageCount === 0 || d._count.pages !== d.pageCount);
  return falta?.id ?? null;
}

/** Reclama hasta `cuantas` paginas libres. Devuelve las que se han conseguido. */
export async function reclamar(documentId: string, token: string, cuantas: number) {
  const candidatas = await prisma.documentPage.findMany({
    where: { ...pendiente(documentId), ...libre() },
    orderBy: { pageNumber: "asc" },
    take: cuantas,
    select: { pageNumber: true },
  });
  if (candidatas.length === 0) return [];

  // La condicion se vuelve a comprobar al actualizar: si otra peticion se ha
  // adelantado con alguna, esa no se queda aqui.
  await prisma.documentPage.updateMany({
    where: {
      ...pendiente(documentId),
      ...libre(),
      pageNumber: { in: candidatas.map((c) => c.pageNumber) },
    },
    data: { ocrToken: token, ocrReclamadaEn: new Date() },
  });
  const mias = await prisma.documentPage.findMany({
    where: { documentId, ocrToken: token, source: "EMPTY" },
    orderBy: { pageNumber: "asc" },
    select: { pageNumber: true },
  });
  return mias.map((m) => m.pageNumber);
}

/** Progreso sobre el total de paginas escaneadas del documento. */
export async function progresoOcr(documentId: string) {
  const [leidas, fallidas, pendientes] = await Promise.all([
    prisma.documentPage.count({ where: { documentId, source: "OCR" } }),
    prisma.documentPage.count({
      where: { documentId, source: "EMPTY", ocrIntentos: { gte: MAX_INTENTOS } },
    }),
    contarPendientes(documentId),
  ]);
  const total = leidas + fallidas + pendientes;
  return { hechas: leidas + fallidas, total, pendientes };
}

let ultimoAviso = 0;

/** Pone en el documento cuanto va, como mucho una vez cada 2 segundos. */
export async function avisarProgresoOcr(documentId: string, forzar = false) {
  if (!forzar && Date.now() - ultimoAviso < 2000) return;
  ultimoAviso = Date.now();
  const { hechas, total } = await progresoOcr(documentId);
  if (total === 0) return;
  await prisma.document.update({
    where: { id: documentId },
    data: {
      statusMessage: `Leyendo las páginas escaneadas: ${hechas} de ${total}…`,
      progress: 18 + Math.round((hechas / total) * 12),
    },
  });
}

/**
 * Reconoce paginas libres del documento hasta `deadline`.
 * Devuelve cuantas se han leido en esta llamada.
 */
export async function reconocerRepartido(opts: {
  documentId: string;
  pdfPath: string;
  deadline: number;
}): Promise<number> {
  const { documentId, pdfPath, deadline } = opts;
  if (!ocrAvailable()) return 0;

  const token = randomUUID();
  let leidas = 0;
  let intentadas = 0;
  let fallos = 0;
  const reclamadas = new Set<number>();

  const siguienteLote = async () => {
    if (fallos >= 2) return [];
    if (Date.now() >= deadline && intentadas > 0) return [];
    const paginas = await reclamar(documentId, token, POR_RECLAMO);
    for (const p of paginas) reclamadas.add(p);
    return paginas;
  };

  try {
    await ocrPages(
      pdfPath,
      siguienteLote,
      undefined,
      async (resultado) => {
        leidas += 1;
        const texto = limpiarTextoOcr(resultado.text);
        await prisma.documentPage.updateMany({
          where: { documentId, pageNumber: resultado.pageNumber },
          data: {
            text: texto,
            charCount: texto.replace(/\s/g, "").length,
            source: "OCR",
            ocrToken: null,
            ocrReclamadaEn: null,
            ocrIntentos: { increment: 1 },
          },
        });
      },
      // Se para al acabarse el tiempo, pero nunca antes de haber intentado
      // una pagina: si no, una peticion que llega justa no avanzaria nunca.
      () => fallos >= 2 || (intentadas > 0 && Date.now() >= deadline),
      async (pagina) => {
        intentadas += 1;
        reclamadas.delete(pagina);
        // Intentada y sin texto: cuenta el intento y se suelta.
        await prisma.documentPage.updateMany({
          where: { documentId, pageNumber: pagina, source: "EMPTY", ocrToken: token },
          data: { ocrToken: null, ocrReclamadaEn: null, ocrIntentos: { increment: 1 } },
        });
        await avisarProgresoOcr(documentId).catch(() => undefined);
      },
      async (pagina) => {
        // No se ha podido ni dibujar: fallo del servidor, no de la página.
        // Se suelta sin contar el intento, y con dos seguidos se para.
        fallos += 1;
        reclamadas.delete(pagina);
        await prisma.documentPage.updateMany({
          where: { documentId, pageNumber: pagina, ocrToken: token },
          data: { ocrToken: null, ocrReclamadaEn: null },
        });
        console.error(`[ocr] no se ha podido preparar la página ${pagina} de ${documentId}`);
      },
    );
  } finally {
    // Lo reclamado que no ha dado tiempo a intentar queda libre para otro.
    if (reclamadas.size > 0) {
      await prisma.documentPage
        .updateMany({
          where: { documentId, ocrToken: token },
          data: { ocrToken: null, ocrReclamadaEn: null },
        })
        .catch(() => undefined);
    }
  }
  return leidas;
}


/** Lo que devuelve el dispositivo: el texto de cada página que ha leído. */
export type LecturaDeDispositivo = { pageNumber: number; text: string };

/**
 * Guarda lo leído en el dispositivo. Una página sin texto legible cuenta como
 * intento (y tras MAX_INTENTOS deja de pedirse); con texto, queda leída.
 * Se acepta aunque el reclamo haya caducado: el trabajo ya está hecho.
 */
export async function guardarLecturas(
  documentId: string,
  token: string,
  lecturas: LecturaDeDispositivo[],
) {
  let leidas = 0;
  for (const lectura of lecturas) {
    const texto = limpiarTextoOcr(lectura.text ?? "");
    const util = (texto.match(/[\p{L}\p{N}]/gu) ?? []).length >= 3;
    const hecho = await prisma.documentPage.updateMany({
      where: { documentId, pageNumber: lectura.pageNumber, source: "EMPTY" },
      data: util
        ? {
            text: texto,
            charCount: texto.replace(/\s/g, "").length,
            source: "OCR",
            ocrToken: null,
            ocrReclamadaEn: null,
            ocrIntentos: { increment: 1 },
          }
        : { ocrToken: null, ocrReclamadaEn: null, ocrIntentos: { increment: 1 } },
    });
    if (util && hecho.count > 0) leidas += 1;
  }
  await avisarProgresoOcr(documentId, true);
  return leidas;
}

/** Suelta lo que el dispositivo tenía reservado y no va a leer. */
export async function soltar(documentId: string, token: string) {
  await prisma.documentPage.updateMany({
    where: { documentId, ocrToken: token },
    data: { ocrToken: null, ocrReclamadaEn: null },
  });
}
