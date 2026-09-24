/**
 * Ayudante de reconocimiento de texto.
 *
 * Mientras un documento escaneado se esta leyendo, la aplicacion llama aqui
 * varias veces a la vez. Cada llamada es un servidor mas leyendo paginas del
 * mismo documento (las reclama en la base de datos, asi que nunca repiten
 * ninguna). Con un libro de cientos de paginas es la diferencia entre una
 * hora y unos minutos.
 *
 * Responde `pending: true` mientras queden paginas por leer.
 */
import { requireUser } from "@/lib/auth";
import { ok, route } from "@/lib/api";
import { env } from "@/lib/env";
import { pdfEnDisco } from "@/lib/storage/en-disco";
import {
  avisarProgresoOcr,
  documentoConOcrLibre,
  documentoConOcrPendiente,
  documentoPorExtraer,
  hayOcrPendiente,
  ocrEnServidor,
  reconocerRepartido,
} from "@/lib/jobs/ocr-repartido";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = route(async (request: Request) => {
  const user = await requireUser();

  // Donde el servidor no lee (Vercel), esto solo dice qué documento hay que
  // leer en el dispositivo. `servidor: true` lo fuerza, como último recurso
  // si el dispositivo no puede.
  const forzar = await request
    .json()
    .then((cuerpo: { servidor?: boolean }) => cuerpo?.servidor === true)
    .catch(() => false);
  // Primero lo primero: si a un documento le falta el texto, lo saca el
  // dispositivo (en segundos, sin que el servidor abra el PDF).
  const extraer = await documentoPorExtraer(user.id);
  if (extraer && !forzar) {
    return ok({
      pending: true,
      enDispositivo: true,
      extraer: extraer.id,
      soloDispositivo: extraer.soloDispositivo,
      documentId: null,
    });
  }

  // Si el PDF está en el dispositivo, solo el dispositivo puede leerlo.
  const pendiente = await documentoConOcrPendiente(user.id);
  if (pendiente?.pdfEnDispositivo) {
    return ok({ pending: true, enDispositivo: true, soloDispositivo: true, documentId: pendiente.id });
  }

  if (!ocrEnServidor() && !forzar) {
    return ok({
      pending: pendiente !== null,
      enDispositivo: true,
      documentId: pendiente?.id ?? null,
    });
  }

  const documento = await documentoConOcrLibre(user.id);
  if (!documento) {
    // Puede que todo lo que queda este reclamado por otros: se sigue
    // ayudando solo si aun falta algo.
    return ok({ pending: await hayOcrPendiente(user.id) });
  }

  const segundos = env.jobs.sliceSeconds > 0 ? env.jobs.sliceSeconds : 45;
  const deadline = Date.now() + segundos * 1000;
  const pdfPath = await pdfEnDisco(documento.storageKey, documento.sizeBytes);
  await reconocerRepartido({ documentId: documento.id, pdfPath, deadline });
  await avisarProgresoOcr(documento.id, true).catch(() => undefined);

  return ok({ pending: await hayOcrPendiente(user.id) });
});
