/**
 * Limpieza del texto que sale del reconocimiento de páginas escaneadas.
 *
 * El lector devuelve el texto tal cual lo ve, con los defectos típicos de un
 * escaneo: palabras partidas con guion a final de línea, líneas de "basura"
 * que son manchas o bordes de la hoja, ligaduras tipográficas y espacios de
 * más. Todo eso empeora el resumen y el índice. Aquí se arregla sin inventar
 * nada: solo se unen, se quitan o se normalizan caracteres, nunca se cambian
 * palabras. Las fórmulas y los números se quedan como están.
 */

const LIGADURAS: Record<string, string> = {
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬀ": "ff",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
  "“": '"',
  "”": '"',
  "„": '"',
  "‘": "'",
  "’": "'",
  "‚": "'",
  "­": "", // guion blando
};

/** ¿Es una línea sin nada legible? (manchas, bordes, rayas del escáner) */
function esBasura(linea: string) {
  const texto = linea.trim();
  if (!texto) return false; // las líneas en blanco separan párrafos: se quedan
  const utiles = (texto.match(/[\p{L}\p{N}]/gu) ?? []).length;
  if (utiles === 0) return true;
  // Muy corta y casi todo símbolos: "~ ." "| ," "=—"...
  return texto.length <= 4 && utiles <= 1 && !/^\p{N}+[.)]?$/u.test(texto);
}

export function limpiarTextoOcr(texto: string): string {
  let limpio = texto.replace(/\r\n?/g, "\n");
  limpio = limpio.replace(/[ﬁﬂﬀﬃﬄ“”„‘’‚­]/g, (c) => LIGADURAS[c] ?? c);

  // Palabra partida a final de línea: "conoci-\nmiento" → "conocimiento".
  // Solo si sigue en minúscula: "Madrid-\nBarcelona" se deja.
  limpio = limpio.replace(/(\p{L})-[ \t]*\n[ \t]*(\p{Ll})/gu, "$1$2");

  limpio = limpio
    .split("\n")
    .filter((linea) => !esBasura(linea))
    .map((linea) => linea.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n");

  return limpio.replace(/\n{3,}/g, "\n\n").trim();
}
