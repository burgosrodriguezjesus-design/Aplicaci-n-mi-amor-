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
 *   ser viñetas de verdad.
 *
 * Código puro: lo usan igual el dispositivo y el servidor.
 */

export type PalabraOcr = { text: string; confidence: number };
export type LineaOcr = { text?: string; confidence: number; words: PalabraOcr[] };
export type ParrafoOcr = { lines: LineaOcr[] };
export type BloqueOcr = { paragraphs: ParrafoOcr[] };

const LINEA_MINIMA = 60;
const PALABRA_MINIMA = 45;

/** Lo que el lector suele leer donde había un topo o una flecha de lista. */
const VINETA_LEIDA = /^(?:[+*•·«»°■□▪➢►>~oe]|[-–—])$/;

export function textoDesdeBloques(bloques: BloqueOcr[] | null | undefined): string | null {
  if (!bloques || bloques.length === 0) return null;
  const parrafos: string[] = [];

  for (const bloque of bloques) {
    for (const parrafo of bloque.paragraphs ?? []) {
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
