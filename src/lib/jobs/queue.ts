/**
 * Cola de trabajos en proceso, respaldada por la base de datos.
 *
 * Es deliberadamente simple: un único worker por instancia que va tomando
 * trabajos QUEUED. El estado vive en la tabla ProcessingJob, así que si el
 * proceso se reinicia los trabajos se recuperan (no se pierden en memoria).
 * Para escalar horizontalmente basta sustituir `runQueue` por un consumidor
 * de Redis/SQS: el resto de la aplicación no cambia.
 */
import "server-only";
import { prisma } from "../db";
import { env } from "../env";

/**
 * Lo que devuelve un manejador cuando se le acaba el tiempo de la rebanada:
 * ha guardado lo hecho y hay que volver a llamarlo para seguir.
 */
export type JobOutcome = void | { pending: true; message?: string };

type JobHandler = (job: {
  id: string;
  documentId: string;
  type: string;
  payload: Record<string, unknown>;
  /**
   * Momento (Date.now()) a partir del cual hay que parar y guardar. Solo se
   * define cuando el alojamiento corta las peticiones; si no, es Infinity.
   */
  deadline: number;
}) => Promise<JobOutcome>;

/** Cuando debe terminar esta rebanada de trabajo. */
export function sliceDeadline() {
  const segundos = env.jobs.sliceSeconds;
  return segundos > 0 ? Date.now() + segundos * 1000 : Number.POSITIVE_INFINITY;
}

const handlers = new Map<string, JobHandler>();
let running = false;

export function registerHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

export async function enqueue(
  documentId: string,
  type: string,
  payload: Record<string, unknown> = {},
) {
  const job = await prisma.processingJob.create({
    data: { documentId, type, payload: JSON.stringify(payload) },
  });
  // No bloqueamos la respuesta HTTP: el trabajo corre en segundo plano.
  // Donde no hay servidor, no hay segundo plano: avanza por rebanadas.
  if (env.jobs.background) void runQueue();
  return job;
}

export async function updateJob(
  jobId: string,
  data: { stage?: string; message?: string; progress?: number },
) {
  await prisma.processingJob.update({ where: { id: jobId }, data });
}

/**
 * Vuelve a encolar los trabajos que quedaron a medias tras un reinicio.
 *
 * Esto se llama al arrancar el proceso, y la cola vive dentro del propio
 * proceso: cualquier trabajo marcado como RUNNING pertenecia al proceso
 * anterior, que ya no existe. Por eso no se espera a que pase un rato -antes
 * habia que esperar quince minutos-, que es justo lo que dejaba colgado un
 * libro a medio reconocer en un alojamiento que se duerme solo.
 *
 * Lo ya reconocido no se pierde: cada pagina se guarda al terminarla.
 */
export async function recoverStuckJobs() {
  await prisma.processingJob.updateMany({
    where: { status: "RUNNING" },
    data: { status: "QUEUED", message: "Reanudando donde se quedó…" },
  });
}

/**
 * Procesa trabajos hasta que no quede ninguno o se acabe el tiempo.
 *
 * Devuelve si queda trabajo pendiente, para que quien la llamó sepa si tiene
 * que volver a llamar (es lo que hace la aplicación en un alojamiento que
 * corta las peticiones).
 */
export async function runQueue(opts: { deadline?: number } = {}): Promise<{ pending: boolean }> {
  if (running) return { pending: true };
  running = true;
  const deadline = opts.deadline ?? sliceDeadline();

  try {
    for (;;) {
      if (Date.now() >= deadline) {
        const quedan = await prisma.processingJob.count({
          where: { status: { in: ["QUEUED", "RUNNING"] } },
        });
        return { pending: quedan > 0 };
      }

      const job = await prisma.processingJob.findFirst({
        where: { status: "QUEUED" },
        orderBy: { createdAt: "asc" },
      });
      if (!job) return { pending: false };

      const handler = handlers.get(job.type);
      if (!handler) {
        await prisma.processingJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            error: `No hay manejador para el trabajo "${job.type}"`,
            finishedAt: new Date(),
          },
        });
        continue;
      }

      await prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: "RUNNING",
          startedAt: new Date(),
          attempts: { increment: 1 },
          message: "Procesando…",
        },
      });

      try {
        const resultado = await handler({
          id: job.id,
          documentId: job.documentId,
          type: job.type,
          payload: JSON.parse(job.payload || "{}"),
          deadline,
        });

        if (resultado && resultado.pending) {
          // Se acabó el tiempo de la rebanada, no es un fallo: el trabajo
          // vuelve a la cola tal cual y el intento no cuenta.
          await prisma.processingJob.update({
            where: { id: job.id },
            data: {
              status: "QUEUED",
              attempts: { decrement: 1 },
              message: resultado.message ?? "Continuará en unos segundos…",
            },
          });
          return { pending: true };
        }

        await prisma.processingJob.update({
          where: { id: job.id },
          data: {
            status: "DONE",
            progress: 100,
            message: "Completado",
            finishedAt: new Date(),
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const current = await prisma.processingJob.findUnique({ where: { id: job.id } });
        const attempts = current?.attempts ?? 1;
        const maxAttempts = current?.maxAttempts ?? 3;
        const retryable =
          attempts < maxAttempts &&
          !(error as { fatal?: boolean })?.fatal &&
          !/PDF_PROTECTED|PDF_INVALID|NO_TEXT/.test(
            (error as { code?: string })?.code ?? "",
          );

        await prisma.processingJob.update({
          where: { id: job.id },
          data: retryable
            ? { status: "QUEUED", error: message, message: "Reintentando…" }
            : { status: "FAILED", error: message, finishedAt: new Date() },
        });

        if (!retryable) {
          await prisma.document.update({
            where: { id: job.documentId },
            data: {
              status: "FAILED",
              statusMessage: "No se ha podido procesar el documento",
              errorCode: (error as { code?: string })?.code ?? "PROCESSING_ERROR",
              errorMessage: message,
            },
          });
        }
      }
    }
  } finally {
    running = false;
  }
}
