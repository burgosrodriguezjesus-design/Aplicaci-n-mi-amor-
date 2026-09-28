/** Tipos de tarjeta de memoria (compartido entre servidor y pantalla). */

export type TipoTarjeta = "concepto" | "clasificacion" | "elemento" | "formula" | "porque" | "dato";

export type Tarjeta = {
  clave: string;
  tipo: TipoTarjeta;
  /** Lo que se ve primero: la pregunta. */
  frente: string;
  /** La respuesta, en Markdown sencillo. */
  reverso: string;
  apartado: string;
  pagina: number | null;
};

export const ETIQUETA_TIPO: Record<TipoTarjeta, string> = {
  concepto: "Concepto",
  clasificacion: "Clasificación",
  elemento: "Elemento",
  formula: "Fórmula",
  porque: "¿Por qué?",
  dato: "Dato",
};
