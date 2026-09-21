/**
 * Segmentación del guion en frases.
 *
 * Cada segmento guarda su posición en caracteres y una estimación temporal
 * proporcional a su longitud. Cuando se conoce la duración real del audio
 * sintetizado, las marcas se reescalan con `rescaleSegments`, y eso es lo que
 * permite resaltar el texto que se está narrando y saltar a un párrafo.
 */

export type ScriptSegment = {
  position: number;
  text: string;
  startChar: number;
  endChar: number;
  startMs: number;
  endMs: number;
};

const SENTENCE_SPLIT = /(?<=[.!?…])\s+(?=[¿¡"“(A-ZÁÉÍÓÚÑ0-9])/;

/** Longitud máxima de un segmento; los más largos se parten por comas. */
const MAX_SEGMENT_CHARS = 320;

function splitLong(sentence: string): string[] {
  if (sentence.length <= MAX_SEGMENT_CHARS) return [sentence];
  const parts: string[] = [];
  let buffer = "";
  for (const piece of sentence.split(/(?<=[,;:])\s+/)) {
    if (buffer && buffer.length + piece.length > MAX_SEGMENT_CHARS) {
      parts.push(buffer.trim());
      buffer = "";
    }
    buffer += (buffer ? " " : "") + piece;
  }
  if (buffer.trim()) parts.push(buffer.trim());
  return parts;
}

/**
 * Une los fragmentos que solo contienen la numeración de un apartado
 * ("1.", "2.") con la frase siguiente: son marcadores de lista, no frases.
 */
function mergeOrphanNumbers(pieces: string[]): string[] {
  const out: string[] = [];
  let carry = "";
  for (const piece of pieces) {
    if (/^\d{1,2}(\.\d{1,2})*\.?$/.test(piece)) {
      carry = carry ? `${carry} ${piece}` : piece;
      continue;
    }
    out.push(carry ? `${carry} ${piece}` : piece);
    carry = "";
  }
  if (carry) out.push(carry);
  return out;
}

/**
 * @param script guion narrado completo
 * @param totalSeconds duración estimada (o real) del audio
 */
export function segmentScript(script: string, totalSeconds: number): ScriptSegment[] {
  const sentences = mergeOrphanNumbers(
    script
      .split(SENTENCE_SPLIT)
      .flatMap(splitLong)
      .map((piece) => piece.trim())
      .filter(Boolean),
  );

  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0) || 1;
  const totalMs = Math.max(1000, Math.round(totalSeconds * 1000));

  const segments: ScriptSegment[] = [];
  let charCursor = 0;
  let msCursor = 0;

  sentences.forEach((text, position) => {
    const startChar = script.indexOf(text, charCursor);
    const resolvedStart = startChar >= 0 ? startChar : charCursor;
    const endChar = resolvedStart + text.length;
    charCursor = endChar;

    const share = text.length / totalChars;
    const durationMs = Math.max(400, Math.round(totalMs * share));
    const startMs = msCursor;
    msCursor += durationMs;

    segments.push({
      position,
      text,
      startChar: resolvedStart,
      endChar,
      startMs,
      endMs: msCursor,
    });
  });

  // Ajuste final para que el último segmento termine exactamente al final.
  if (segments.length) {
    const scale = totalMs / (segments[segments.length - 1].endMs || totalMs);
    if (Number.isFinite(scale) && scale > 0 && Math.abs(scale - 1) > 0.001) {
      for (const segment of segments) {
        segment.startMs = Math.round(segment.startMs * scale);
        segment.endMs = Math.round(segment.endMs * scale);
      }
    }
  }

  return segments;
}

/** Reescala las marcas temporales a la duración real del audio generado. */
export function rescaleSegments<T extends { startMs: number; endMs: number }>(
  segments: T[],
  realSeconds: number,
): T[] {
  if (!segments.length || !realSeconds) return segments;
  const currentEnd = segments[segments.length - 1].endMs || 1;
  const scale = (realSeconds * 1000) / currentEnd;
  return segments.map((segment) => ({
    ...segment,
    startMs: Math.round(segment.startMs * scale),
    endMs: Math.round(segment.endMs * scale),
  }));
}
