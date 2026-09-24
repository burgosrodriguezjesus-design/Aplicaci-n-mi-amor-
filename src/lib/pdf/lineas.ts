/**
 * Reconstruccion de las lineas de una pagina a partir de los fragmentos de
 * texto de pdf.js. Codigo puro, sin dependencias: lo usan igual el servidor
 * (src/lib/pdf/extract.ts) y el dispositivo (src/lib/client/pdf-dispositivo.ts),
 * asi que el texto sale identico se extraiga donde se extraiga.
 */

/** Una linea con sus senales tipograficas: altura de letra y margen izquierdo. */
export type PageLine = { text: string; height: number; x: number };

/** Una pagina con menos caracteres que esto se considera "sin texto util". */
export const MIN_CHARS_PER_PAGE = 40;

export type TextItem = {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
};

type Line = { y: number; height: number; parts: { x: number; width: number; str: string }[] };

/**
 * Reconstruye el texto de una pagina agrupando los fragmentos por linea
 * (coordenada Y) y separando parrafos cuando el salto vertical es mayor de
 * lo normal. Asi se conservan titulos, listas y numeracion.
 */
export function itemsToText(items: TextItem[]): string {
  return itemsToLines(items)
    .map((line) => line.text)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Igual que arriba, pero conservando la altura y el margen izquierdo de cada
 * linea. Son las dos senales que distinguen un titulo de un parrafo cuando el
 * documento no numera sus apartados.
 */
export function itemsToLines(items: TextItem[]): PageLine[] {
  const lines: Line[] = [];
  const tolerance = 2.5;

  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const height = item.height && item.height > 0 ? item.height : 10;
    let line = lines.find((l) => Math.abs(l.y - y) <= tolerance);
    if (!line) {
      line = { y, height, parts: [] };
      lines.push(line);
    }
    line.height = Math.max(line.height, height);
    line.parts.push({ x, width: item.width ?? item.str.length * 4, str: item.str });
  }

  if (lines.length === 0) return [];

  lines.sort((a, b) => b.y - a.y);

  // Altura de linea tipica: mediana de los saltos verticales consecutivos.
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y);
  const sorted = [...gaps].sort((a, b) => a - b);
  const medianGap = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 14;

  const out: PageLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    line.parts.sort((a, b) => a.x - b.x);

    let rendered = "";
    let prevEnd = -Infinity;
    for (const part of line.parts) {
      const needsSpace =
        rendered !== "" &&
        part.x - prevEnd > 1 &&
        !rendered.endsWith(" ") &&
        !part.str.startsWith(" ");
      if (needsSpace) rendered += " ";
      rendered += part.str;
      prevEnd = part.x + part.width;
    }

    rendered = rendered.replace(/\s+/g, " ").trim();
    if (!rendered) continue;

    if (i > 0) {
      const gap = lines[i - 1].y - line.y;
      // Un salto claramente mayor que el interlineado indica parrafo nuevo.
      if (gap > medianGap * 1.6) out.push({ text: "", height: 0, x: 0 });
    }
    out.push({
      text: rendered,
      height: Math.round(line.height * 10) / 10,
      x: Math.round(line.parts[0].x),
    });
  }

  return out;
}


/** Lo que se guarda de cada pagina, se extraiga en el servidor o en el dispositivo. */
export function paginaDesdeItems(items: TextItem[]) {
  const lines = itemsToLines(items);
  const text = lines
    .map((line) => line.text)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const charCount = text.replace(/\s/g, "").length;
  const source: "TEXT" | "EMPTY" = charCount >= MIN_CHARS_PER_PAGE ? "TEXT" : "EMPTY";
  return { text, charCount, lines, source };
}
