/**
 * Examen de un documento: preguntas tipo test, cortas, de desarrollo y
 * ejercicios prácticos, cada una con su dificultad y su solución (que se
 * enseña aparte, nunca junto a la pregunta).
 */

export type Dificultad = "FACIL" | "MEDIA" | "DIFICIL";

export const DIFICULTADES: { value: Dificultad; label: string }[] = [
  { value: "FACIL", label: "Fácil" },
  { value: "MEDIA", label: "Media" },
  { value: "DIFICIL", label: "Difícil" },
];

export const ETIQUETA_DIFICULTAD: Record<Dificultad, string> = { FACIL: "Fácil", MEDIA: "Media", DIFICIL: "Difícil" };

/** De dónde sale la pregunta: el apartado, la página y la frase del PDF. */
export type Fuente = { apartado: string; pagina: number | null; cita: string };

type Base = {
  id: string;
  dificultad: Dificultad;
  enunciado: string;
  explicacion: string;
  fuente: Fuente;
};

export type PreguntaTest = Base & { opciones: string[]; correcta: number };
export type PreguntaAbierta = Base & { respuesta: string };
/** Ejercicio práctico: la respuesta es la solución paso a paso. */
export type Ejercicio = Base & { datos?: string[]; respuesta: string };

export type Examen = {
  titulo: string;
  test: PreguntaTest[];
  cortas: PreguntaAbierta[];
  desarrollo: PreguntaAbierta[];
  ejercicios: Ejercicio[];
  /** Por qué falta algo (p. ej., el contenido no permite ejercicios). */
  avisos: string[];
};

export const OBJETIVO = { test: 20, cortas: 10, desarrollo: 5, ejercicios: 5 } as const;

export const LETRAS = ["A", "B", "C", "D"] as const;

const ORDEN: Record<Dificultad, number> = { FACIL: 0, MEDIA: 1, DIFICIL: 2 };

/** Ordena por dificultad (fácil → difícil) conservando el orden dentro de cada una. */
export function porDificultad<T extends { dificultad: Dificultad }>(lista: T[]): T[] {
  return lista
    .map((p, i) => ({ p, i }))
    .sort((a, b) => ORDEN[a.p.dificultad] - ORDEN[b.p.dificultad] || a.i - b.i)
    .map(({ p }) => p);
}

/** ¿Es un examen bien formado? (sirve para validar lo que devuelve la IA). */
export function esExamenValido(examen: unknown): examen is Examen {
  const e = examen as Examen;
  if (!e || typeof e !== "object") return false;
  const dif = (d: unknown) => d === "FACIL" || d === "MEDIA" || d === "DIFICIL";
  const fuente = (f: Fuente) => f && typeof f.cita === "string" && typeof f.apartado === "string";
  const base = (p: Base) =>
    p && typeof p.enunciado === "string" && p.enunciado.trim().length > 5 && dif(p.dificultad) && typeof p.explicacion === "string" && fuente(p.fuente);
  return (
    Array.isArray(e.test) &&
    e.test.every(
      (p) =>
        base(p) &&
        Array.isArray(p.opciones) &&
        p.opciones.length === 4 &&
        p.opciones.every((o) => typeof o === "string" && o.trim()) &&
        new Set(p.opciones.map((o) => o.trim().toLowerCase())).size === 4 &&
        Number.isInteger(p.correcta) &&
        p.correcta >= 0 &&
        p.correcta <= 3,
    ) &&
    [e.cortas, e.desarrollo, e.ejercicios].every(
      (lista) => Array.isArray(lista) && lista.every((p) => base(p) && typeof p.respuesta === "string" && p.respuesta.trim()),
    )
  );
}
