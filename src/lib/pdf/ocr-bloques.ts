/**
 * Texto de una página escaneada a partir de lo que devuelve el lector
 * (Tesseract) con la confianza de cada palabra.
 *
 * El texto "tal cual" mezcla lo bueno con la basura: gráficos, fotos, rayas,
 * sellos y las líneas de puntos de un índice se leen como palabras que no
 * existen ("CN Cr=="000", "TACONCEPLO", "rosas 4"...), y esa basura acababa
 * en el resumen. Medido en escaneos de libro: las líneas buenas salen con
 * 93-96 % de confianza y la basura con 0-45 %. Así que:
 *
 * - una línea con menos del 60 % de confianza media se descarta entera;
 * - en las que quedan, se quitan las palabras sueltas por debajo del 45 %
 *   (los puntos de relleno del índice, restos de una mancha...);
 * - las viñetas que el lector confunde con letras ("e", "+", "«") pasan a
 *   ser viñetas de verdad;
 * - un trozo de líneas cortas (hasta 4 palabras cada una) en letra claramente
 *   más pequeña que la del libro es un rótulo de una foto o de un gráfico
 *   ("OFERTAS", "T1 T2", la leyenda "Ventas / Compras"): fuera. Las notas al
 *   pie, con líneas largas, se quedan.
 *
 * Código puro: lo usan igual el dispositivo y el servidor.
 */

export type PalabraOcr = { text: string; confidence: number };
export type Caja = { x0: number; y0: number; x1: number; y1: number };
export type LineaOcr = { text?: string; confidence: number; words: PalabraOcr[]; bbox?: Caja };
export type ParrafoOcr = { lines: LineaOcr[] };
export type BloqueOcr = { paragraphs: ParrafoOcr[] };

const LINEA_MINIMA = 60;
const PALABRA_MINIMA = 45;

/** Lo que el lector suele leer donde había un topo o una flecha de lista. */
const VINETA_LEIDA = /^(?:[+*•·«»°■□▪➢►>~oe]|[-–—])$/;

/** Altura de la letra de una línea (de sus palabras, sin contar los márgenes). */
function altura(linea: LineaOcr) {
  return linea.bbox ? linea.bbox.y1 - linea.bbox.y0 : 0;
}

export function textoDesdeBloques(bloques: BloqueOcr[] | null | undefined): string | null {
  if (!bloques || bloques.length === 0) return null;
  const parrafos: string[] = [];

  // La letra normal del libro: la mediana de las alturas de las líneas largas.
  const alturas = bloques
    .flatMap((b) => b.paragraphs ?? [])
    .flatMap((p) => p.lines ?? [])
    .filter((l) => (l.words ?? []).length >= 5 && altura(l) > 0)
    .map(altura)
    .sort((a, b) => a - b);
  const normal = alturas.length >= 3 ? alturas[Math.floor(alturas.length / 2)] : 0;

  for (const bloque of bloques) {
    for (const parrafo of bloque.paragraphs ?? []) {
      // Rótulo de foto o de gráfico: poco texto y en letra pequeña.
      const suyas = parrafo.lines ?? [];
      const cortas = suyas.every((l) => (l.words ?? []).filter((p) => p.text?.trim()).length <= 4);
      const mayor = Math.max(0, ...suyas.map(altura));
      if (normal && mayor > 0 && cortas && mayor < normal * 0.72) continue;

      const lineas: string[] = [];
      for (const linea of parrafo.lines ?? []) {
        const palabras = (linea.words ?? []).filter((p) => p.text?.trim());
        if (palabras.length === 0) continue;

        // Confianza media ponderada por la longitud de cada palabra.
        const peso = palabras.reduce((s, p) => s + p.text.length, 0) || 1;
        const media = palabras.reduce((s, p) => s + p.confidence * p.text.length, 0) / peso;
        if (media < LINEA_MINIMA) continue;

        const buenas: string[] = [];
        palabras.forEach((palabra, i) => {
          const texto = palabra.text.trim();
          // Viñeta confundida con una letra al principio de la línea.
          if (i === 0 && VINETA_LEIDA.test(texto) && /^[A-ZÁÉÍÓÚÑ¿¡]/.test(palabras[1]?.text ?? "")) {
            buenas.push("-");
            return;
          }
          if (palabra.confidence < PALABRA_MINIMA) return;
          buenas.push(texto);
        });
        const texto = buenas.join(" ").trim();
        if (texto && texto !== "-") lineas.push(texto);
      }
      if (lineas.length) parrafos.push(lineas.join("\n"));
    }
  }

  const texto = parrafos.join("\n\n").trim();
  return texto || null;
}
