/**
 * Empuja el trabajo pendiente desde el navegador.
 *
 * En un servidor normal la cola corre sola y esto responde en seguida sin
 * hacer nada. Donde no hay servidor (Vercel y parecidos) no se ejecuta nada
 * entre peticiones y cada una se corta a los 60 segundos: ahí el trabajo
 * avanza porque la aplicación va pidiendo rebanadas, una detrás de otra.
 *
 * Es seguro llamarla de más: si no hay nada que hacer, termina enseguida.
 */
import { api } from "./api";

export async function empujarTrabajo(opts: { cancelado?: () => boolean } = {}) {
  for (;;) {
    if (opts.cancelado?.()) return;
    try {
      const respuesta = await api.post<{ pending: boolean }>("/api/jobs/tick", {});
      if (!respuesta.pending) return;
    } catch {
      // Una rebanada que falla no pierde nada: lo hecho está guardado.
      // Se espera un poco y se vuelve a intentar.
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}
