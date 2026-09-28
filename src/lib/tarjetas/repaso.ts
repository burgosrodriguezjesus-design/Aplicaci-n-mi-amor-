/**
 * Repaso espaciado: cada tarjeta vuelve justo cuando está a punto de
 * olvidarse. Si te la sabes, el siguiente repaso se aleja (2 días, 4, 10,
 * un mes…); si dudas, se acerca; si no te la sabes, vuelve en 10 minutos.
 * Es una versión sencilla del método SM-2 (el de Anki y SuperMemo).
 */

export type Nota = 0 | 1 | 2; // 0 = No me la sé · 1 = Dudé · 2 = Me la sé

export type EstadoTarjeta = {
  /** Días hasta el siguiente repaso (0 = hoy mismo). */
  intervalo: number;
  /** Cuánto crece el intervalo al acertar (1,3 – 3). */
  facilidad: number;
  repeticiones: number;
  fallos: number;
  vence: Date;
};

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
export const FACILIDAD_INICIAL = 2.5;
/** Una tarjeta se da por aprendida cuando su repaso ya es a una semana o más. */
export const DIAS_APRENDIDA = 7;

export function siguiente(estado: EstadoTarjeta | null, nota: Nota, ahora = new Date()): EstadoTarjeta {
  const previo = estado ?? { intervalo: 0, facilidad: FACILIDAD_INICIAL, repeticiones: 0, fallos: 0, vence: ahora };
  if (nota === 0) {
    return {
      intervalo: 0,
      facilidad: Math.max(1.3, previo.facilidad - 0.2),
      repeticiones: 0,
      fallos: previo.fallos + 1,
      vence: new Date(ahora.getTime() + 10 * MINUTO),
    };
  }
  let intervalo: number;
  let facilidad = previo.facilidad;
  if (nota === 1) {
    intervalo = previo.repeticiones === 0 ? 1 : Math.max(1, Math.round(previo.intervalo * 1.2));
    facilidad = Math.max(1.3, facilidad - 0.15);
  } else {
    intervalo =
      previo.repeticiones === 0 ? 2 : previo.repeticiones === 1 ? 4 : Math.max(previo.intervalo + 1, Math.round(previo.intervalo * facilidad));
    facilidad = Math.min(3, facilidad + 0.05);
  }
  intervalo = Math.min(intervalo, 365);
  return { intervalo, facilidad, repeticiones: previo.repeticiones + 1, fallos: previo.fallos, vence: new Date(ahora.getTime() + intervalo * DIA) };
}

/** «10 min», «1 día», «4 días», «2 meses»: lo que se ve en cada botón. */
export function cuando(estado: EstadoTarjeta | null, nota: Nota, ahora = new Date()) {
  const s = siguiente(estado, nota, ahora);
  if (s.intervalo === 0) return "10 min";
  if (s.intervalo === 1) return "1 día";
  if (s.intervalo < 30) return `${s.intervalo} días`;
  const meses = Math.round(s.intervalo / 30);
  return meses === 1 ? "1 mes" : `${meses} meses`;
}

export function aprendida(estado: Pick<EstadoTarjeta, "intervalo"> | null) {
  return Boolean(estado && estado.intervalo >= DIAS_APRENDIDA);
}
