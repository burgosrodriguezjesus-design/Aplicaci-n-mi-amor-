/**
 * Adaptación de texto escrito a lenguaje hablado.
 *
 * Se usa de dos formas:
 *  - como motor de narración cuando no hay IA disponible,
 *  - como red de seguridad después de la IA, para que nunca se cuele un
 *    símbolo suelto que el sintetizador leería de forma robótica.
 *
 * Nunca añade ni elimina información: solo cambia la forma de decirla.
 */

const UNITS: Record<string, [string, string]> = {
  V: ["voltio", "voltios"],
  kV: ["kilovoltio", "kilovoltios"],
  mV: ["milivoltio", "milivoltios"],
  A: ["amperio", "amperios"],
  mA: ["miliamperio", "miliamperios"],
  kA: ["kiloamperio", "kiloamperios"],
  W: ["vatio", "vatios"],
  kW: ["kilovatio", "kilovatios"],
  MW: ["megavatio", "megavatios"],
  Wh: ["vatio hora", "vatios hora"],
  kWh: ["kilovatio hora", "kilovatios hora"],
  VA: ["voltiamperio", "voltiamperios"],
  VAr: ["voltiamperio reactivo", "voltiamperios reactivos"],
  Hz: ["hercio", "hercios"],
  kHz: ["kilohercio", "kilohercios"],
  "Ω": ["ohmio", "ohmios"],
  "°C": ["grado centígrado", "grados centígrados"],
  mm: ["milímetro", "milímetros"],
  cm: ["centímetro", "centímetros"],
  km: ["kilómetro", "kilómetros"],
  kg: ["kilogramo", "kilogramos"],
  ms: ["milisegundo", "milisegundos"],
};

/** Variables de una sola letra, solo se traducen dentro de fórmulas. */
const VARIABLES: Record<string, string> = {
  V: "el voltaje",
  U: "la tensión",
  I: "la intensidad",
  R: "la resistencia",
  P: "la potencia",
  Q: "la carga",
  S: "la sección",
  L: "la longitud",
  C: "la capacidad",
  E: "la energía",
  T: "el tiempo",
  t: "el tiempo",
  F: "la fuerza",
  m: "la masa",
  v: "la velocidad",
  a: "la aceleración",
};

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bp\.\s?ej\./gi, "por ejemplo"],
  [/\bpág(s)?\./gi, "página$1"],
  [/\bpag(s)?\./gi, "página$1"],
  [/\bapdo\./gi, "apartado"],
  [/\bart\./gi, "artículo"],
  [/\baprox\./gi, "aproximadamente"],
  [/\betc\./gi, "etcétera"],
  [/\bnº\.?/gi, "número"],
  [/\bn\.º/gi, "número"],
  [/\bmáx\./gi, "máximo"],
  [/\bmín\./gi, "mínimo"],
  [/\bfig\./gi, "figura"],
  [/\bcap\./gi, "capítulo"],
  [/\bvol\./gi, "volumen"],
  [/\bs\.\s?XX\b/g, "siglo veinte"],
  [/\bEE\.?\s?UU\.?/g, "Estados Unidos"],
  [/\bcos\s*\(?\s*(φ|fi|phi)\s*\)?/gi, "coseno de fi"],
];

/** Convierte una expresión matemática a lenguaje hablado. */
export function speakFormula(expression: string): string {
  let out = ` ${expression.trim()} `;

  // Variables de una letra rodeadas de operadores o espacios.
  out = out.replace(/(^|[\s(=+\-*/×·])([A-Za-z])(?=[\s)=+\-*/×·,.]|$)/g, (m, pre, letter) => {
    const word = VARIABLES[letter as keyof typeof VARIABLES];
    return word ? `${pre}${word}` : m;
  });

  out = out
    .replace(/\s*=\s*/g, " es igual a ")
    .replace(/\s*[×x*·]\s*/g, " multiplicado por ")
    .replace(/\s*\/\s*/g, " dividido entre ")
    .replace(/\s*\+\s*/g, " más ")
    .replace(/(\d|\w)\s*-\s*(\d|\w)/g, "$1 menos $2")
    .replace(/\^2\b/g, " al cuadrado")
    .replace(/\^3\b/g, " al cubo")
    .replace(/²/g, " al cuadrado")
    .replace(/³/g, " al cubo")
    .replace(/√\s*/g, " raíz cuadrada de ")
    .replace(/±/g, " más menos ")
    .replace(/≈/g, " aproximadamente igual a ")
    .replace(/≤/g, " menor o igual que ")
    .replace(/≥/g, " mayor o igual que ")
    .replace(/</g, " menor que ")
    .replace(/>/g, " mayor que ")
    .replace(/\s{2,}/g, " ")
    .trim();

  out = fixAgreement(out);

  // La frase resultante empieza en mayúscula.
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/**
 * Corrige la concordancia de genero: "la intensidad multiplicado" ->
 * "la intensidad multiplicada", y la contraccion "a el" -> "al".
 */
function fixAgreement(text: string) {
  return text
    .replace(
      /\b(la\s+[\wáéíóúñ]+)\s+(multiplicad|divid|elevad|sumad|restad)o\b/gi,
      (_m, noun: string, stem: string) => `${noun} ${stem}a`,
    )
    .replace(/\ba\s+el\b/g, "al")
    .replace(/\bde\s+el\b/g, "del");
}

function expandUnits(text: string) {
  let out = text;
  for (const [symbol, [singular, plural]] of Object.entries(UNITS)) {
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Unidad precedida de un numero: "230 V" -> "230 voltios".
    out = out.replace(
      new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${escaped}(?![\\wÁ-ÿ])`, "g"),
      (_match, number: string) =>
        `${number} ${Number.parseFloat(number.replace(",", ".")) === 1 ? singular : plural}`,
    );
    // "el voltio (V)" -> "el voltio": leerlo dos veces suena redundante.
    out = out.replace(
      new RegExp(`\\b(${singular}|${plural})\\s*\\(\\s*${escaped}\\s*\\)`, "gi"),
      "$1",
    );
    // Simbolo aislado entre parentesis: "(W)" -> "(vatios)".
    out = out.replace(new RegExp(`\\(\\s*${escaped}\\s*\\)`, "g"), `(${plural})`);
  }
  return out.replace(/(\d+(?:[.,]\d+)?)\s*%/g, "$1 por ciento");
}

function expandAbbreviations(text: string) {
  let out = text;
  for (const [pattern, replacement] of ABBREVIATIONS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

const FORMULA_LINE = /^[^.!?]{0,80}?[A-Za-zΩ°√][^.!?]{0,80}?=[^=][^.!?]{0,90}$/;

/**
 * Convierte Markdown en un guion hablado.
 *
 * @param markdown texto original (Markdown o ya adaptado por la IA)
 * @param options.alreadyAdapted si el texto viene de la IA, se limita a limpiar restos
 */
export function speakify(
  markdown: string,
  options: { alreadyAdapted?: boolean } = {},
): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let listIndex = 0;

  const ORDINALS = [
    "Primero",
    "Segundo",
    "Tercero",
    "Cuarto",
    "Quinto",
    "Sexto",
    "Séptimo",
    "Octavo",
    "Noveno",
    "Décimo",
  ];

  for (const raw of lines) {
    let line = raw.trim();
    if (!line) {
      listIndex = 0;
      continue;
    }

    // Referencias de página: no se narran.
    line = line.replace(/\((?:pág|pag|páginas|paginas|págs|pags)\.?\s*[\d\s,y.-]+\)/gi, "");

    // Avisos especiales.
    const callout = /^>\s*\[!(\w+)\]\s*(.*)$/.exec(line);
    if (callout) {
      const [, kind, body] = callout;
      const prefix =
        ({
          examen: "Presta atención a esto: ",
          aclaracion: "Aclaración añadida: ",
          duda: "Ojo, este punto no queda claro en el documento original: ",
          recuerda: "Recuerda: ",
          importante: "Importante: ",
          formula: "Fórmula: ",
          ejemplo: "Por ejemplo: ",
          curiosidad: "Como curiosidad: ",
        } as Record<string, string>)[kind] ?? "";
      line = prefix + body;
    } else {
      line = line.replace(/^>\s?/, "");
    }

    // Encabezados.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const title = heading[2].replace(/[*_`]/g, "").trim();
      if (title) out.push(`${title}.`);
      listIndex = 0;
      continue;
    }

    // Separadores horizontales.
    if (/^[-*_]{3,}$/.test(line)) continue;

    // Tablas: cada fila se lee como una enumeración.
    if (/^\|.*\|$/.test(line)) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue;
      const cells = line
        .split("|")
        .map((c) => c.replace(/[*_`]/g, "").trim())
        .filter(Boolean);
      if (cells.length) out.push(`${cells.join(", ")}.`);
      continue;
    }

    // Listas.
    const bullet = /^([-*+•]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      listIndex += 1;
      const label = ORDINALS[listIndex - 1] ?? `Punto ${listIndex}`;
      // "Primero, el IVA…": minúscula tras la coma, salvo siglas y nombres.
      const resto = bullet[2].replace(/^(\p{Lu})(\p{Ll})/u, (_, a: string, b: string) => a.toLowerCase() + b);
      line = `${label}, ${/^(El|La|Los|Las|Un|Una|Unos|Unas|Se|Es|Son|Si|En|Por|Para|Con|Cuando|Cada)\b/.test(bullet[2]) ? resto : bullet[2]}`;
    } else {
      listIndex = 0;
    }

    // Énfasis, código y enlaces.
    line = line
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

    // Fórmulas: línea entera o expresiones sueltas dentro de la frase.
    if (!options.alreadyAdapted && FORMULA_LINE.test(line) && /=/.test(line)) {
      line = speakFormula(line);
    } else if (/[A-Za-z0-9)]\s*=\s*[A-Za-z0-9(]/.test(line)) {
      line = line.replace(
        /([A-Za-zΩ][\w]*\s*=\s*[^,.;]{1,60})/g,
        (expression) => speakFormula(expression),
      );
    }

    line = fixAgreement(expandUnits(expandAbbreviations(line)));

    // Puntuación final para que el sintetizador haga la pausa.
    if (line && !/[.!?:;]$/.test(line)) line += ".";
    if (line) out.push(line);
  }

  return out
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .replace(/\.\s*\./g, ".")
    .trim();
}

/** Estimación de duración: ~155 palabras por minuto en castellano. */
export function estimateSeconds(text: string, wordsPerMinute = 155) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / wordsPerMinute) * 60));
}
