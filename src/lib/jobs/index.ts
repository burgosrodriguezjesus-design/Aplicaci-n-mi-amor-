/** Punto de entrada del worker: registra los manejadores y arranca la cola. */
import "server-only";
import "./processor";
import { recoverStuckJobs, runQueue } from "./queue";

export { enqueue } from "./queue";

let booted = false;

/** Se llama desde las rutas de API que necesitan que la cola esté viva. */
export async function ensureWorker() {
  if (!booted) {
    booted = true;
    await recoverStuckJobs().catch(() => undefined);
  }
  void runQueue();
}
