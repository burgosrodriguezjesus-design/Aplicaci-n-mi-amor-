/**
 * Avanza una rebanada de trabajo pendiente.
 *
 * En un servidor normal la cola corre sola en segundo plano y esto no hace
 * falta. En un alojamiento sin servidor (Vercel y parecidos) no hay "segundo
 * plano": entre petición y petición no se ejecuta nada, y cada petición se
 * corta a los 60 segundos. Así que la propia aplicación va llamando aquí
 * mientras tiene un documento procesándose, y cada llamada empuja el trabajo
 * un poco más.
 *
 * Responde `pending: true` mientras quede trabajo, para que el cliente sepa
 * que debe volver a llamar. Es idempotente: si ya hay una rebanada en marcha,
 * esta llamada no hace nada y lo dice.
 */
import { requireUser } from "@/lib/auth";
import { ok, route } from "@/lib/api";
import { ensureWorker } from "@/lib/jobs";
import { runQueue, sliceDeadline } from "@/lib/jobs/queue";
import { env } from "@/lib/env";
import { hayOcrPendiente, ocrEnServidor } from "@/lib/jobs/ocr-repartido";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel corta a los 60 s; el margen de guardado lo pone JOB_SLICE_SECONDS. */
export const maxDuration = 60;

export const POST = route(async () => {
  // Solo se responde a alguien con sesión: no es un endpoint público.
  const user = await requireUser();
  // `run: false`: la rebanada la ejecuta esta misma petición, esperándola.
  await ensureWorker({ run: false });

  const { pending } = await runQueue({ deadline: sliceDeadline() });
  // `ocr`: hay paginas escaneadas esperando. La aplicacion lanza entonces
  // ayudantes (/api/jobs/ocr) para leerlas en paralelo.
  const ocr = pending ? await hayOcrPendiente(user.id) : false;
  return ok({
    pending,
    ocr,
    ocrEnServidor: ocrEnServidor(),
    sliceSeconds: env.jobs.sliceSeconds,
  });
});
