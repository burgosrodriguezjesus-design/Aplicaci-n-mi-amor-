/** Punto de entrada del worker: registra los manejadores y arranca la cola. */
import "server-only";
import "./processor";
import { recoverStuckJobs, runQueue } from "./queue";
import { env } from "../env";

export { enqueue } from "./queue";

let booted = false;

/**
 * Se llama desde las rutas de API que necesitan que la cola esté viva.
 *
 * `run: false` solo hace la recuperación, sin lanzar la cola en segundo
 * plano: lo usa el endpoint que procesa una rebanada y quiere ejecutarla él
 * mismo, esperándola, porque donde no hay servidor tampoco hay segundo plano.
 */
export async function ensureWorker(opts: { run?: boolean } = {}) {
  if (!booted) {
    booted = true;
    await recoverStuckJobs().catch(() => undefined);
  }
  if (opts.run !== false && env.jobs.background) void runQueue();
}
