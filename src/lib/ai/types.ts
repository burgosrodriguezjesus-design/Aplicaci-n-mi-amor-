/** Tipos compartidos entre el modo con IA y el modo extractivo. */

export type ChunkAnalysis = {
  title: string;
  markdown: string;
  keyConcepts: string[];
  sourcePages: number[];
  formulas: string[];
  /** Formulas con la pagina exacta en la que aparecen (modo extractivo). */
  formulaRefs?: { text: string; page: number }[];
  examHighlights: string[];
  /** Definiciones encontradas en el texto (modo sin IA): para el glosario. */
  definiciones?: { termino: string; definicion: string }[];
};

export type OutlineNodeKind =
  | "chapter"
  | "section"
  | "subsection"
  | "concept"
  | "detail"
  | "formula"
  | "key";

export type OutlineNode = {
  label: string;
  kind?: OutlineNodeKind;
  page?: number;
  children?: OutlineNode[];
};

export type OutlineTree = {
  title: string;
  nodes: OutlineNode[];
};
