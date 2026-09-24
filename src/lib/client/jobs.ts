/**
 * Empuja el trabajo pendiente desde el navegador.
 *
 * En un servidor normal la cola corre sola y esto responde en seguida sin
 * hacer nada. Donde no hay servidor (Vercel y parecidos) no se ejecuta nada
 * entre peticiones y cada una se corta a los 60 segundos: ahí el trabajo
 * avanza porque la aplicación va pidiendo rebanadas, una detrás de otra.
 *
 * Si hay páginas escaneadas que leer, además lanza unos cuantos ayudantes a
 * la vez: cada uno es otro servidor leyendo páginas del mismo documento.
 *
 * Es seguro llamarla de más: si no hay nada que hacer, termina enseguida.
 */
import { api } from "./api";

/** Ayudantes de lectura en paralelo, además de la rebanada normal. */
const AYUDANTES = 3;
const FALLOS_SEGUIDOS_MAXIMOS = 5;

let ayudantesEnMarcha = 0;

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ayudar(cancelado?: () => boolean) {
  ayudantesEnMarcha += 1;
  let fallos = 0;
  try {
    while (!cancelado?.()) {
      try {
        const respuesta = await api.post<{ pending: boolean }>("/api/jobs/ocr", {});
        fallos = 0;
        if (!respuesta.pending) return;
      } catch {
        fallos += 1;
        if (fallos >= FALLOS_SEGUIDOS_MAXIMOS) return;
        await esperar(3000);
      }
    }
  } finally {
    ayudantesEnMarcha -= 1;
  }
}

function lanzarAyudantes(cancelado?: () => boolean) {
  while (ayudantesEnMarcha < AYUDANTES) void ayudar(cancelado);
}

/**
 * Vigia: mientras dura el procesado, mira cada pocos segundos si ya hay
 * paginas escaneadas que leer (sin esperar a que acabe la primera rebanada,
 * que puede tardar casi un minuto) y, en cuanto las hay, llama a los ayudantes.
 */
async function vigilar(sigue: () => boolean, cancelado?: () => boolean) {
  while (sigue() && !cancelado?.()) {
    if (ayudantesEnMarcha === 0) {
      try {
        const respuesta = await api.post<{ pending: boolean }>("/api/jobs/ocr", {});
        if (respuesta.pending) {
          lanzarAyudantes(cancelado);
          continue;
        }
      } catch {
        /* se volvera a mirar */
      }
    }
    await esperar(4000);
  }
}

let enCurso: Promise<void> | null = null;

/**
 * Una sola a la vez en toda la aplicación: la pantalla de subida, la del
 * documento y el empujón de fondo comparten la misma.
 */
export function empujarTrabajo(opts: { cancelado?: () => boolean } = {}): Promise<void> {
  if (enCurso) return enCurso;
  enCurso = empujar(opts).finally(() => {
    enCurso = null;
  });
  return enCurso;
}

async function empujar(opts: { cancelado?: () => boolean }) {
  let enMarcha = true;
  void vigilar(() => enMarcha, opts.cancelado);
  try {
    for (;;) {
      if (opts.cancelado?.()) return;
      try {
        const respuesta = await api.post<{ pending: boolean; ocr?: boolean }>(
          "/api/jobs/tick",
          {},
        );
        if (respuesta.ocr) lanzarAyudantes(opts.cancelado);
        if (!respuesta.pending) return;
      } catch {
        // Una rebanada que falla no pierde nada: lo hecho está guardado.
        // Se espera un poco y se vuelve a intentar.
        await esperar(3000);
      }
    }
  } finally {
    enMarcha = false;
  }
}
