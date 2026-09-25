/**
 * Modo sin IA: resumen y esquema construidos con el propio texto del PDF.
 *
 * Nunca escribe nada que no esté en el documento (no puede "inventar"), pero
 * tampoco copia párrafos enteros: da al texto la forma de unos buenos apuntes
 * de estudio, como los de un temario de oposición o de FP.
 *
 * Resumen, por apartado:
 *  - las ideas en viñetas cortas, con las frases que cargan el contenido
 *    (definiciones, clasificaciones, datos, obligaciones), sin conectores de
 *    relleno ("Por eso se dice que", "Además,", "Es decir,");
 *  - el término que se define, en negrita;
 *  - las clasificaciones como listas, con el nombre de cada tipo en negrita;
 *  - los recuadros del libro ("Recuerda", "Importante") y las fórmulas,
 *    destacados;
 *  - fuera pies de figura, restos de gráficos y líneas de basura;
 *  - lo que no es temario, separado de la teoría: los ejemplos (empresas y
 *    personas inventadas, cálculos con cifras) van aparte en un recuadro
 *    «Ejemplo», las actividades y tests se quedan en un aviso «Para
 *    practicar», y los créditos, testimonios y datos de la editorial fuera.
 *
 * Visión general: qué trata cada unidad y un glosario con las definiciones.
 *
 * Esquema: se construye a partir del resumen (así sale igual al regenerarlo):
 * unidad → apartado → subapartado, y debajo de cada uno sus conceptos con
 * la definición corta, los tipos de cada clasificación, fórmulas y avisos.
 */
import "server-only";
import type { Chunk } from "../pdf/structure";
import {
  empiezaCuriosidad,
  empiezaEjemplo,
  esCalculoConCifras,
  esCredito,
  esEnunciado,
  esEnunciadoNumerado,
  esFraseDeEjemplo,
  esTestimonio,
  esTituloDePractica,
  sinMarcaDeCuriosidad,
  sinMarcaDeEjemplo,
} from "../pdf/clasificar";
import type { SummaryDepth } from "./prompts";
import type { ChunkAnalysis, OutlineNode, OutlineTree } from "./types";

const PAGE_MARKER = /\[\[pag\. (\d+)\]\]/g;

/* ── Señales del texto ─────────────────────────────────────────────── */

const STOP_WORDS = new Set(
  ("de la que el en y a los del se las por un para con no una su al lo como mas más " +
    "pero sus le ya o este si porque esta entre cuando muy sin sobre tambien también me " +
    "hasta hay donde quien desde todo nos durante todos uno les ni contra otros " +
    "ese eso ante ellos e esto mi antes algunos qué unos yo otro otras otra él " +
    "tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas " +
    "algo nosotros cada puede pueden debe deben tiene tienen hace")
    .split(/\s+/),
);

/** Verbos que introducen una definición. */
const DEFINE =
  "es|son|se define como|se definen como|se denomina|se denominan|consiste en|consisten en|se llama|se llaman|se conoce como|se conocen como|recibe el nombre de|reciben el nombre de|indica|indican|representa|representan";
const DEFINITION_RE = new RegExp(`\\b(${DEFINE})\\b`, "i");
const FORMULA_RE = /[\p{L}\p{N})\]]\s*=\s*[\p{L}\p{N}(]/u;
const IMPORTANT_RE =
  /\b(importante|fundamental|clave|obligatori[oa]|atenci[oó]n|no confundir|examen|debe|deben|siempre|nunca|prohibid[oa])\b/i;
const ENUMERA_RE =
  /\b(se clasifican|se dividen|se distinguen|tipos de|clases de|consta de|se compone|comprende|los siguientes|las siguientes|principalmente)\b/i;
const DATO_RE =
  /\d+\s*(?:%|€|ºC|°C|m²|m2)|\d+\s*(?:km|cm|mm|kg|g|s|h|min|V|A|W|kW|MW|Hz|Ω|euros?|años?|días?|meses|horas?)\b|\bmodelo\s+\d{3}\b/i;
const UNIDAD_RE =
  /\b(se mide en|se miden en|su unidad es|sus unidades son|se expresa en|se expresan en|unidad de medida)\b/i;
/** Viñetas, topos y enumeradores al principio de línea. */
const VINETA_RE =
  /^\s*(?:[-–—•·▪◦●○■□➢►✓*+]\s+|\(?[a-z]\)\s+|\(?\d{1,2}\)\s+|\d{1,2}[.)]\s+(?=[a-záéíóúñ]))/;
/** Recuadros del libro: "Recuerda: …", "Importante: …". */
const AVISO_RE =
  /^(recuerda|importante|atenci[oó]n|ojo|nota|no olvides|a tener en cuenta|consejo)\s*:\s*/i;
const PIE_RE =
  /^(figura|fig\.|fotograf[ií]a|foto|imagen|ilustraci[oó]n|gr[aá]fico|esquema|mapa|tabla|cuadro|fuente)\s*\d+([.\-]\d+)*\.?\s/i;
/** Conectores que no aportan contenido al principio de una frase. */
const CONECTOR_RE =
  /^(?:además|asimismo|así pues|por (?:eso|ello|tanto|lo tanto|consiguiente)|es decir|o sea|en (?:este|ese) sentido|de (?:esta|este|ese|esa) (?:forma|modo|manera)|en (?:resumen|definitiva|conclusi[oó]n)|como (?:hemos visto|se ha visto|ya sabemos|ya se ha dicho)[^,]*|por (?:otro|otra|una) (?:lado|parte)|en primer lugar|en segundo lugar|finalmente|por último)\s*,?\s*(?:se (?:dice|afirma) que\s+|podemos decir que\s+|hay que (?:decir|señalar) que\s+)?/i;

/** "Se utilizan dos métodos", "existen tres tipos": anuncian lo que sigue. */
const NUMEROS: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, varios: 3, varias: 3 };
const ANUNCIO_RE =
  /\b(dos|tres|cuatro|cinco|seis|varios|varias)\s+(?:grandes\s+|principales\s+)?(?:métodos|tipos|clases|formas|fases|etapas|modelos|sistemas|criterios|grupos|categorías|elementos|funciones|partes|modalidades|procedimientos)\b/i;

/** Frases de procedimiento: "La cuota se obtiene…", "El método FIFO valora…". */
const PROCEDIMIENTO_RE =
  /^(?:El|La|Los|Las)\s+([^,;:]{3,50}?)\s+((?:se\s+(?:obtiene|obtienen|calcula|calculan|determina|determinan|mide|miden|utiliza|utilizan|aplica|aplican))|calcula|calculan|valora|valoran|mide|miden|permite|permiten|consiste|consisten|establece|establecen|sirve|sirven)\s+(.+)$/;

/** Frases que por su contenido no pueden faltar en el resumen. */
function imprescindible(texto: string) {
  return (
    DEFINITION_RE.test(texto) ||
    FORMULA_RE.test(texto) ||
    IMPORTANT_RE.test(texto) ||
    ENUMERA_RE.test(texto) ||
    UNIDAD_RE.test(texto) ||
    DATO_RE.test(texto)
  );
}

/** Proporción de frases que se conservan según el nivel de detalle. */
const KEEP_RATIO: Record<SummaryDepth, number> = {
  RAPIDO: 0.35,
  NORMAL: 0.55,
  DETALLADO: 0.75,
  MUY_DETALLADO: 0.95,
};

/* ── Utilidades de texto ───────────────────────────────────────────── */

function sinTildes(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function mayusculaInicial(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Termina en punto (salvo que ya acabe en signo). */
function cerrar(texto: string) {
  const t = texto.trim();
  return /[.!?:…)]$/.test(t) ? t : `${t}.`;
}

/** Acorta sin partir palabras. */
function acortar(texto: string, maximo: number) {
  const t = texto.trim().replace(/\s+/g, " ");
  if (t.length <= maximo) return t;
  const corte = t.slice(0, maximo);
  const espacio = corte.lastIndexOf(" ");
  return `${corte.slice(0, espacio > maximo * 0.6 ? espacio : maximo).replace(/[,;:\s]+$/, "")}…`;
}

/** Primera cláusula de una explicación: lo que cabe en un esquema. */
function nucleo(texto: string, maximo = 90) {
  const limpio = texto.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const primera = limpio.split(/(?<=[.;])\s|,\s(?:que|lo que|es decir|ya que|porque|aunque|mientras)\b/)[0];
  return acortar(primera.replace(/[.;,:]+$/, ""), maximo);
}

/** ¿Es un trozo de texto legible? (descarta restos del escaneo) */
function legible(texto: string) {
  const piezas = texto.split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p));
  if (piezas.length === 0) return false;
  const buenas = piezas.filter((pieza) => {
    const p = pieza.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%€]+$/gu, "");
    if (!p) return false;
    if (/^[\d.,:%€ºª/-]+$/.test(p)) return true;
    if (/(.)\1\1/u.test(p.toLowerCase())) return false;
    if (/\p{Ll}\p{Lu}/u.test(p)) return false;
    if (p.length === 1) return /^[aeoyuAEOYU]$/.test(p) || /^[A-Z]$/.test(p);
    return /[aeiouáéíóúüy]/i.test(p) || /^[A-Z]{2,6}$/.test(p);
  });
  return buenas.length / piezas.length >= 0.75;
}

/** Quita la numeración de un título: "2.1. Tipos" → "Tipos". */
function sinNumeracion(titulo: string) {
  return titulo
    .replace(/^(tema|cap[ií]tulo|unidad|bloque|parte|lecci[oó]n)\s*[\divxlc]+\s*[-–—.:]?\s*/i, "")
    .replace(/^\d+(\.\d+)*[.)]?\s*/, "")
    .trim();
}

/** Título limpio: sin puntos de relleno ni número de página del índice. */
function limpiarTitulo(titulo: string) {
  return titulo
    .replace(PAGE_MARKER, "")
    .replace(/\s*(\.{2,}|…+|[-_=·]{3,}).*$/, "")
    .replace(/\s+\d{1,4}$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cuántos ejemplos entran según el detalle pedido: en un resumen rápido
 * ninguno; en uno detallado, todos, pero siempre aparte de la teoría.
 */
const EJEMPLOS: Record<SummaryDepth, { bloques: number; largo: number; sueltos: boolean; curiosidades: boolean }> = {
  RAPIDO: { bloques: 0, largo: 0, sueltos: false, curiosidades: false },
  NORMAL: { bloques: 2, largo: 220, sueltos: false, curiosidades: false },
  DETALLADO: { bloques: 6, largo: 320, sueltos: true, curiosidades: true },
  MUY_DETALLADO: { bloques: 20, largo: 520, sueltos: true, curiosidades: true },
};

/** Las primeras frases enteras que caben en `maximo` caracteres. */
function recortarFrases(texto: string, maximo: number) {
  if (maximo <= 0) return "";
  const frases = partirFrases(texto.replace(/\s+/g, " ").trim());
  let salida = "";
  for (const frase of frases) {
    if ((salida + " " + frase).trim().length > maximo) break;
    salida = `${salida} ${frase}`.trim();
  }
  return salida || acortar(frases[0] ?? texto, maximo);
}

/* ── Lectura del fragmento en bloques ──────────────────────────────── */

type Bloque =
  | { tipo: "titulo"; nivel: number; texto: string; pagina: number }
  | { tipo: "parrafo"; texto: string; pagina: number }
  | { tipo: "lista"; intro: string | null; items: string[]; pagina: number }
  | { tipo: "aviso"; clase: "recuerda" | "importante"; texto: string; pagina: number }
  | { tipo: "formula"; texto: string; pagina: number }
  /** Lo que no es teoría: un ejemplo o un recuadro de curiosidad. */
  | { tipo: "ejemplo" | "curiosidad"; texto: string; pagina: number }
  /** Actividades, ejercicios o un test: no se resumen, se señalan. */
  | { tipo: "practica"; enunciados: number; pagina: number }
  /** Marca suelta ("Actividades", "Ejemplo 4.1") para lo que viene después. */
  | { tipo: "marca"; clase: "practica" | "ejemplo" | "curiosidad"; pagina: number };

/**
 * "Importante:", "Atención:", "Ojo:" avisan de algo que no hay que pasar por
 * alto; "Recuerda:", "Nota:" repasan. Cada uno con su recuadro.
 */
function claseDeAviso(texto: string): "recuerda" | "importante" {
  return /^\s*(importante|atenci[oó]n|ojo|no olvides|a tener en cuenta)\b/i.test(texto) ? "importante" : "recuerda";
}

/** Un párrafo de teoría dentro de una zona de actividades: se acabó la práctica. */
function pareceTeoria(texto: string) {
  const frases = partirFrases(texto);
  return (
    texto.split(/\s+/).length >= 35 &&
    DEFINITION_RE.test(texto) &&
    !esEnunciado(texto) &&
    !/\?/.test(texto) &&
    frases.filter(esFraseDeEjemplo).length < frases.length / 2
  );
}

/** Cuántos enunciados numerados trae un párrafo de actividades. */
function contarEnunciados(texto: string) {
  const numerados = texto.match(/(?:^|\s)\d{1,2}[.)]\s+(?=[¿¡\p{Lu}])/gu)?.length ?? 0;
  if (numerados) return numerados;
  return esEnunciado(texto) || /\?\s*$/.test(texto) ? 1 : 0;
}

function leerBloques(contenido: string, paginaInicial: number): Bloque[] {
  const bloques: Bloque[] = [];
  let pagina = paginaInicial;
  let parrafo: string[] = [];
  let paginaParrafo = pagina;
  let lista: { items: string[]; pagina: number } | null = null;
  let blancoEnLista = false;

  const cerrarParrafo = () => {
    if (parrafo.length === 0) return;
    const texto = parrafo
      .join(" ")
      // "conoci- miento" partido entre líneas de un texto con extracción.
      .replace(/(\p{L})- (\p{Ll})/gu, "$1$2")
      .replace(/\s{2,}/g, " ")
      .trim();
    parrafo = [];
    if (texto) bloques.push({ tipo: "parrafo", texto, pagina: paginaParrafo });
  };
  const cerrarLista = () => {
    if (!lista) return;
    if (lista.items.length) bloques.push({ tipo: "lista", intro: null, items: lista.items, pagina: lista.pagina });
    lista = null;
  };

  for (const bruta of contenido.split("\n")) {
    const marcas = [...bruta.matchAll(PAGE_MARKER)];
    if (marcas.length) pagina = Number.parseInt(marcas[marcas.length - 1][1], 10) || pagina;
    const linea = bruta.replace(PAGE_MARKER, "").trim();

    if (!linea) {
      cerrarParrafo();
      // Una lista con líneas en blanco entre viñetas sigue siendo una lista.
      if (lista) blancoEnLista = true;
      continue;
    }

    const titulo = /^(#{1,6})\s+(.*)$/.exec(linea);
    if (titulo) {
      cerrarParrafo();
      cerrarLista();
      const texto = limpiarTitulo(titulo[2]);
      if (texto && legible(texto)) {
        bloques.push({ tipo: "titulo", nivel: titulo[1].length, texto, pagina });
      }
      continue;
    }

    // Créditos de fotos, editorial, enlaces: fuera.
    if (esCredito(linea)) continue;

    // "Actividades", "Ejemplo 4.1", "¿Sabías que…?": marcan lo que viene.
    if (esTituloDePractica(linea)) {
      cerrarParrafo();
      cerrarLista();
      bloques.push({ tipo: "marca", clase: "practica", pagina });
      continue;
    }
    const esEjemplo = empiezaEjemplo(linea);
    if (esEjemplo || empiezaCuriosidad(linea)) {
      cerrarParrafo();
      cerrarLista();
      const resto = esEjemplo ? sinMarcaDeEjemplo(linea) : sinMarcaDeCuriosidad(linea);
      if (resto.split(/\s+/).filter(Boolean).length < 3) {
        bloques.push({ tipo: "marca", clase: esEjemplo ? "ejemplo" : "curiosidad", pagina });
        continue;
      }
    }
    // Cada enunciado de ejercicio y cada cita («…»), su propio párrafo: el
    // escaneo los pega a la teoría de al lado.
    if (esEnunciadoNumerado(linea) || /^[«"“]/.test(linea)) cerrarParrafo();

    if (VINETA_RE.test(linea)) {
      cerrarParrafo();
      if (!lista) lista = { items: [], pagina };
      lista.items.push(linea.replace(VINETA_RE, "").trim());
      blancoEnLista = false;
      continue;
    }

    if (lista) {
      // Continuación de la viñeta anterior (una viñeta larga ocupa varias líneas).
      if (!blancoEnLista && /^\p{Ll}/u.test(linea) && lista.items.length) {
        lista.items[lista.items.length - 1] += ` ${linea}`;
        continue;
      }
      cerrarLista();
      blancoEnLista = false;
    }

    // Un recuadro ("Recuerda: …") empieza siempre su propio párrafo.
    if (AVISO_RE.test(linea)) cerrarParrafo();
    if (parrafo.length === 0) paginaParrafo = pagina;
    parrafo.push(linea);
  }
  cerrarParrafo();
  cerrarLista();

  // Un párrafo que no termina (sin punto) y sigue en minúscula es el mismo:
  // el escaneo lo partió (p. ej. la última línea de un recuadro).
  for (let i = bloques.length - 2; i >= 0; i--) {
    const a = bloques[i];
    const b = bloques[i + 1];
    if (a.tipo === "parrafo" && b.tipo === "parrafo" && !/[.:;!?]$/.test(a.texto) && /^\p{Ll}/u.test(b.texto)) {
      a.texto = `${a.texto} ${b.texto}`;
      bloques.splice(i + 1, 1);
    }
  }

  // Segunda pasada: qué es temario y qué no (actividades, ejemplos,
  // curiosidades, testimonios), avisos, fórmulas, pies de figura, basura, y
  // la frase que introduce una lista ("se clasifican en:") unida a su lista.
  const salida: Bloque[] = [];
  let practica: { enunciados: number; pagina: number } | null = null;
  let pendiente: "ejemplo" | "curiosidad" | null = null;
  const cerrarPractica = () => {
    if (practica) salida.push({ tipo: "practica", ...practica });
    practica = null;
  };

  for (let i = 0; i < bloques.length; i++) {
    const bloque = bloques[i];

    if (bloque.tipo === "marca") {
      if (bloque.clase === "practica") {
        practica = practica ?? { enunciados: 0, pagina: bloque.pagina };
        pendiente = null;
      } else pendiente = bloque.clase;
      continue;
    }
    if (bloque.tipo === "titulo") {
      if (esTituloDePractica(bloque.texto)) {
        practica = practica ?? { enunciados: 0, pagina: bloque.pagina };
        continue;
      }
      cerrarPractica();
      pendiente = null;
      salida.push(bloque);
      continue;
    }

    // Zona de actividades: hasta el siguiente título (o hasta que vuelva la teoría).
    if (practica) {
      if (bloque.tipo === "parrafo" && pareceTeoria(bloque.texto)) {
        cerrarPractica();
      } else {
        if (bloque.tipo === "parrafo") practica.enunciados += contarEnunciados(bloque.texto);
        continue;
      }
    }

    if (bloque.tipo === "parrafo") {
      const texto = bloque.texto;
      if (PIE_RE.test(texto) && texto.length < 160) continue;
      if (!legible(texto)) continue;
      if (/^[«"“]/.test(texto) && esTestimonio(texto)) continue;

      // Ejemplo o curiosidad: aparte, nunca mezclado con la teoría.
      const clase = pendiente ?? (empiezaEjemplo(texto) ? "ejemplo" : empiezaCuriosidad(texto) ? "curiosidad" : null);
      if (clase) {
        pendiente = null;
        const limpio = clase === "ejemplo" ? sinMarcaDeEjemplo(texto) : sinMarcaDeCuriosidad(texto);
        if (limpio) salida.push({ tipo: clase, texto: limpio, pagina: bloque.pagina });
        continue;
      }

      // Un ejercicio suelto ("4. Calcula…") en mitad del texto.
      if (esEnunciadoNumerado(texto)) {
        const anterior = salida[salida.length - 1];
        if (anterior?.tipo === "practica") anterior.enunciados += 1;
        else salida.push({ tipo: "practica", enunciados: 1, pagina: bloque.pagina });
        continue;
      }

      // Un párrafo que de principio a fin es un caso concreto es un ejemplo.
      const frases = partirFrases(texto);
      if (frases.length && frases.filter(esFraseDeEjemplo).length / frases.length >= 0.6) {
        salida.push({ tipo: "ejemplo", texto, pagina: bloque.pagina });
        continue;
      }

      if (AVISO_RE.test(texto)) {
        const aviso = texto.replace(AVISO_RE, "").trim();
        if (esCalculoConCifras(aviso)) salida.push({ tipo: "ejemplo", texto: aviso, pagina: bloque.pagina });
        else salida.push({ tipo: "aviso", clase: claseDeAviso(texto), texto: aviso, pagina: bloque.pagina });
        continue;
      }
      const siguiente = bloques[i + 1];
      if (siguiente?.tipo === "lista" && /:\s*$/.test(texto)) {
        const frases = partirFrases(texto);
        const intro = frases.pop() ?? texto;
        if (frases.length) salida.push({ tipo: "parrafo", texto: frases.join(" "), pagina: bloque.pagina });
        salida.push({ ...siguiente, intro });
        i++;
        continue;
      }
      if (FORMULA_RE.test(texto) && texto.split(/\s+/).length <= 14) {
        // "500 × 21 % = 105 €" no es una fórmula: es la cuenta de un ejemplo.
        salida.push({ tipo: esCalculoConCifras(texto) ? "ejemplo" : "formula", texto, pagina: bloque.pagina });
        continue;
      }
      salida.push(bloque);
    } else if (bloque.tipo === "lista") {
      const items = bloque.items.filter((item) => legible(item) && !esCredito(item));
      if (!items.length) continue;
      if (pendiente) {
        salida.push({ tipo: pendiente, texto: items.join("; "), pagina: bloque.pagina });
        pendiente = null;
        continue;
      }
      salida.push({ ...bloque, items });
    } else {
      salida.push(bloque);
    }
  }
  cerrarPractica();
  return salida;
}

/** Separa un párrafo en frases sin romper abreviaturas ni numeraciones. */
function partirFrases(texto: string): string[] {
  return texto
    .replace(/\b(etc|p\.\s?ej|art|arts|núm|pág|págs|aprox|Sr|Sra|Dr|Dra|Ud|Uds)\./gi, "$1§")
    .split(/(?<=[.!?;])\s+(?=[¿¡"«(]?[A-ZÁÉÍÓÚÑ0-9])/)
    .map((f) => f.replace(/§/g, ".").trim())
    .filter(Boolean);
}

/* ── Frases: puntuación, selección y pulido ────────────────────────── */

type Frase = { texto: string; parrafo: number; orden: number; nota: number };

function palabras(texto: string) {
  return sinTildes(texto.toLowerCase())
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

function puntuar(frases: Frase[]) {
  const frecuencia = new Map<string, number>();
  for (const f of frases) for (const w of palabras(f.texto)) frecuencia.set(w, (frecuencia.get(w) ?? 0) + 1);
  const maximo = Math.max(1, ...frecuencia.values());
  const primeras = new Set<number>();
  for (const f of frases) {
    const ws = palabras(f.texto);
    const densidad = ws.length ? ws.reduce((s, w) => s + (frecuencia.get(w) ?? 0) / maximo, 0) / ws.length : 0;
    let nota = densidad * 2;
    if (DEFINITION_RE.test(f.texto)) nota += 1.6;
    if (FORMULA_RE.test(f.texto)) nota += 1.6;
    if (IMPORTANT_RE.test(f.texto)) nota += 1.1;
    if (ENUMERA_RE.test(f.texto)) nota += 1;
    if (DATO_RE.test(f.texto)) nota += 0.8;
    // La primera frase de un párrafo suele ser la que lo resume.
    if (!primeras.has(f.parrafo)) {
      nota += 0.9;
      primeras.add(f.parrafo);
    }
    if (/\b(por ejemplo|p\. ?ej\.|imaginemos|supongamos)\b/i.test(f.texto)) nota -= 0.9;
    if (f.texto.length < 30) nota -= 0.8;
    if (f.texto.length > 320) nota -= 0.4;
    f.nota = nota;
  }
}

/** Quita el relleno de una frase sin cambiar sus palabras. */
function pulir(texto: string, depth: SummaryDepth) {
  let t = texto.trim().replace(CONECTOR_RE, "");
  if (depth === "RAPIDO" || depth === "NORMAL") {
    // Los ejemplos se quedan fuera en un resumen corto.
    t = t.replace(/,?\s*(?:como por ejemplo|por ejemplo|p\. ?ej\.)[^.;]*/i, "");
  }
  t = t.replace(/\s+([,.;:])/g, "$1").replace(/\s{2,}/g, " ").trim();
  return cerrar(mayusculaInicial(t));
}

/** Pone en negrita el término que la frase define. */
function resaltarDefinicion(frase: string): { texto: string; termino: string | null; definicion: string | null } {
  // "El impuesto sobre el valor añadido (IVA) es un tributo…"
  const sujeto = new RegExp(
    `^((?:el|la|los|las|un|una)\\s+)?([^,.;:]{2,80}?)\\s+(${DEFINE})\\s+(.+)$`,
    "i",
  ).exec(frase);
  if (sujeto) {
    const termino = sujeto[2].trim();
    const nPalabras = termino.split(/\s+/).length;
    const pareceSujeto =
      nPalabras <= 9 &&
      !/\b(que|cuando|si|porque|donde|como|esto|esta|este|ello|lo)\b/i.test(termino) &&
      !/^(se|no|ya|también|además)\b/i.test(termino);
    if (pareceSujeto) {
      const articulo = sujeto[1] ?? "";
      const verbo = sujeto[3];
      const texto = articulo
        ? `${mayusculaInicial(articulo)}**${termino}** ${verbo} ${sujeto[4]}`
        : `**${mayusculaInicial(termino)}** ${verbo} ${sujeto[4]}`;
      const directo = /^(es|son)$/i.test(verbo);
      return { texto, termino, definicion: directo ? sujeto[4] : `${verbo} ${sujeto[4]}` };
    }
  }
  // "Se denomina indirecto porque…"
  const nombrado = /\b(se denomina|se denominan|se llama|se llaman|se conoce como|recibe el nombre de)\s+([^,.;]{2,45}?)(?=\s+(?:porque|por|a|al|cuando|si|ya)\b|[,.;]|$)/i.exec(frase);
  if (nombrado) {
    const termino = nombrado[2].trim();
    const resto = frase.slice((nombrado.index ?? 0) + nombrado[0].length).replace(/^\s*(porque|ya que|por)\s+/i, "");
    return {
      texto: frase.replace(nombrado[0], `${nombrado[1]} **${termino}**`),
      termino,
      definicion: resto.length > 8 ? resto : null,
    };
  }
  return { texto: frase, termino: null, definicion: null };
}

/** Viñeta de una lista: "Mercaderías: bienes…" → "**Mercaderías:** bienes…". */
function itemDeLista(item: string): { texto: string; etiqueta: string | null; detalle: string } {
  const t = cerrar(mayusculaInicial(item.trim()));
  const dosPuntos = /^([^:]{2,60}):\s+(.+)$/.exec(t);
  if (dosPuntos && dosPuntos[1].split(/\s+/).length <= 7) {
    return { texto: `**${dosPuntos[1]}:** ${dosPuntos[2]}`, etiqueta: dosPuntos[1], detalle: dosPuntos[2] };
  }
  // "Tipo general del 21 %, que se aplica a…"
  const coma = /^([^,]{3,60}),\s+((?:que|para|en|con|cuando|si|donde)\b.+)$/.exec(t);
  if (coma && coma[1].split(/\s+/).length <= 7) {
    return { texto: `**${coma[1]}**, ${coma[2]}`, etiqueta: coma[1], detalle: coma[2] };
  }
  return { texto: t, etiqueta: null, detalle: t };
}

function formula(texto: string) {
  return texto
    .replace(AVISO_RE, "")
    .replace(/\s+x\s+/g, " × ")
    .replace(/[.;]\s*$/, "")
    .trim();
}

/* ── Resumen de un fragmento ───────────────────────────────────────── */

type Definicion = { termino: string; definicion: string };

export function extractiveChunkSummary(chunk: Chunk, depth: SummaryDepth): ChunkAnalysis & {
  definiciones?: Definicion[];
} {
  const bloques = leerBloques(chunk.content, chunk.startPage);

  // Las frases de todos los párrafos, para elegir las que se quedan.
  // Las frases de ejemplo sueltas ("Por ejemplo, Lucía compra…") y las
  // preguntas o enunciados no son teoría: se apartan antes de elegir.
  const frases: Frase[] = [];
  const ejemplosSueltos = new Map<number, string[]>();
  bloques.forEach((bloque, i) => {
    if (bloque.tipo !== "parrafo") return;
    for (const texto of partirFrases(bloque.texto)) {
      if (!legible(texto) || esCredito(texto) || esTestimonio(texto)) continue;
      if (esEnunciado(texto) || /\?\s*$/.test(texto)) continue;
      if (esFraseDeEjemplo(texto)) {
        ejemplosSueltos.set(i, [...(ejemplosSueltos.get(i) ?? []), texto]);
        continue;
      }
      frases.push({ texto, parrafo: i, orden: frases.length, nota: 0 });
    }
  });
  puntuar(frases);
  const ratio = KEEP_RATIO[depth] ?? KEEP_RATIO.DETALLADO;
  const cupo = Math.max(2, Math.round(frases.length * ratio));
  const elegidas = new Set(
    [...frases].sort((a, b) => b.nota - a.nota).slice(0, cupo).map((f) => f.orden),
  );
  for (const f of frases) if (imprescindible(f.texto)) elegidas.add(f.orden);
  // Coherencia: si una frase anuncia "dos métodos" o "tres tipos", las que
  // los explican (las siguientes del mismo párrafo) no pueden faltar.
  for (const f of frases) {
    if (!elegidas.has(f.orden)) continue;
    const anuncio = ANUNCIO_RE.exec(f.texto);
    if (!anuncio) continue;
    const cuantos = Math.min(6, NUMEROS[anuncio[1].toLowerCase()] ?? 3);
    for (let k = 1; k <= cuantos; k++) {
      const siguiente = frases[f.orden + k];
      if (!siguiente || siguiente.parrafo !== f.parrafo) break;
      elegidas.add(siguiente.orden);
    }
  }
  // Sin repeticiones: un temario repite la misma idea con otras palabras.
  const vistas = new Set<string>();
  for (const f of frases) {
    if (!elegidas.has(f.orden)) continue;
    const clave = palabras(f.texto).slice(0, 10).join(" ");
    if (clave.length > 12 && vistas.has(clave)) elegidas.delete(f.orden);
    vistas.add(clave);
  }

  const titulo = limpiarTitulo(chunk.title.split(" · ").pop() ?? chunk.title) || "Apartado";
  // Mismas marcas que usa el troceado: unidad "##", apartado "###"...
  const nivelPropio = Math.min(5, Math.max(2, chunk.level + 1));
  const md: string[] = [];
  const conceptos: string[] = [];
  const definiciones: Definicion[] = [];
  const formulas: { text: string; page: number }[] = [];
  const avisos: string[] = [];
  const paginas = new Set<number>();
  let tituloPuesto = false;
  const cupoEjemplos = EJEMPLOS[depth] ?? EJEMPLOS.DETALLADO;
  let ejemplosPuestos = 0;
  const ponerEjemplo = (clase: "ejemplo" | "curiosidad", texto: string) => {
    if (clase === "curiosidad" && !cupoEjemplos.curiosidades) return;
    if (ejemplosPuestos >= cupoEjemplos.bloques) return;
    // El recuadro ya dice "Ejemplo": fuera el "Por ejemplo," del principio.
    const breve = recortarFrases(texto.replace(/^(?:as[ií],\s*)?por\s+ejemplo\s*,?\s*/i, ""), cupoEjemplos.largo);
    if (!breve) return;
    ejemplosPuestos++;
    md.push("", `> [!${clase}] ${cerrar(mayusculaInicial(breve))}`, "");
  };

  const ponerTitulo = () => {
    if (tituloPuesto) return;
    md.push(`${"#".repeat(nivelPropio)} ${titulo}`, "");
    tituloPuesto = true;
  };

  bloques.forEach((bloque, i) => {
    if (bloque.tipo === "titulo") {
      if (sinTildes(bloque.texto.toLowerCase()) === sinTildes(titulo.toLowerCase())) {
        ponerTitulo();
        return;
      }
      // Los títulos del principio (la unidad, el apartado padre) van antes
      // que el del propio fragmento; los de dentro, después. Cada uno con su
      // nivel, que es el que marca el troceado.
      if (!tituloPuesto && bloque.nivel < nivelPropio) {
        md.push(`${"#".repeat(Math.max(2, bloque.nivel))} ${bloque.texto}`, "");
        return;
      }
      ponerTitulo();
      md.push(`${"#".repeat(Math.min(6, Math.max(nivelPropio + 1, bloque.nivel)))} ${bloque.texto}`, "");
      return;
    }
    ponerTitulo();
    paginas.add(bloque.pagina);

    if (bloque.tipo === "parrafo") {
      const deEste = frases.filter(
        (f) => f.parrafo === i && (elegidas.has(f.orden) || AVISO_RE.test(f.texto)),
      );
      for (const f of deEste) {
        if (AVISO_RE.test(f.texto)) {
          const aviso = cerrar(mayusculaInicial(f.texto.replace(AVISO_RE, "")));
          avisos.push(aviso);
          md.push("", `> [!${claseDeAviso(f.texto)}] ${resaltarDefinicion(aviso).texto}`, "");
          continue;
        }
        const pulida = pulir(f.texto, depth);
        const { texto, termino, definicion } = resaltarDefinicion(pulida);
        if (termino) {
          const limpio = mayusculaInicial(termino.replace(/\s*\(([^)]+)\)/, " ($1)").trim());
          if (!conceptos.includes(limpio)) conceptos.push(limpio);
          if (definicion) definiciones.push({ termino: limpio, definicion: nucleo(definicion, 140) });
        }
        if (FORMULA_RE.test(f.texto) && f.texto.split(/\s+/).length <= 16 && !esCalculoConCifras(f.texto)) {
          formulas.push({ text: formula(f.texto), page: bloque.pagina });
        }
        md.push(`- ${texto}`);
      }
      if (deEste.length) md.push("");
      const sueltos = ejemplosSueltos.get(i);
      if (sueltos?.length && cupoEjemplos.sueltos) ponerEjemplo("ejemplo", sueltos.join(" "));
      return;
    }

    if (bloque.tipo === "ejemplo" || bloque.tipo === "curiosidad") {
      ponerEjemplo(bloque.tipo, bloque.texto);
      return;
    }

    if (bloque.tipo === "practica") {
      const n = bloque.enunciados;
      const cuantas = n ? `${n} ${n === 1 ? "actividad" : "actividades"}` : "actividades";
      md.push("", `> [!practica] El libro propone ${cuantas} (pág. ${bloque.pagina}) para comprobar lo aprendido.`, "");
      return;
    }

    if (bloque.tipo === "lista") {
      if (bloque.intro) md.push(pulir(bloque.intro, "DETALLADO"), "");
      for (const item of bloque.items) {
        const { texto, etiqueta } = itemDeLista(item);
        if (etiqueta && !conceptos.includes(etiqueta)) conceptos.push(etiqueta);
        md.push(`- ${texto}`);
      }
      md.push("");
      return;
    }

    if (bloque.tipo === "aviso") {
      const texto = cerrar(mayusculaInicial(bloque.texto));
      if (FORMULA_RE.test(texto)) {
        formulas.push({ text: formula(texto), page: bloque.pagina });
        md.push(`> [!formula] ${formula(texto)}`, "");
      } else {
        avisos.push(texto);
        md.push(`> [!${bloque.clase}] ${resaltarDefinicion(texto).texto}`, "");
      }
      return;
    }

    if (bloque.tipo === "formula") {
      formulas.push({ text: formula(bloque.texto), page: bloque.pagina });
      md.push(`> [!formula] ${formula(bloque.texto)}`, "");
    }
  });
  ponerTitulo();

  const paginasOrdenadas = [...paginas].sort((a, b) => a - b);
  return {
    title: titulo,
    markdown: md.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    keyConcepts: conceptos.slice(0, 8),
    sourcePages: paginasOrdenadas.length ? paginasOrdenadas : [chunk.startPage],
    formulas: formulas.map((f) => f.text),
    formulaRefs: formulas,
    examHighlights: avisos.slice(0, 3),
    definiciones,
  };
}

/* ── Visión general ────────────────────────────────────────────────── */

export function extractiveSynthesis(
  documentTitle: string,
  analyses: (ChunkAnalysis & { definiciones?: Definicion[] })[],
  pageCount: number,
): string {
  // Unidades (títulos "## ") con sus apartados, sacados del propio resumen.
  const unidades: { titulo: string; apartados: string[] }[] = [];
  for (const analysis of analyses) {
    for (const linea of analysis.markdown.split("\n")) {
      const t = /^(#{2,4})\s+(.*)$/.exec(linea);
      if (!t) continue;
      if (t[1] === "##") unidades.push({ titulo: t[2], apartados: [] });
      else if (t[1] === "###") {
        if (unidades.length === 0) unidades.push({ titulo: documentTitle, apartados: [] });
        const apartado = sinNumeracion(t[2]);
        const lista = unidades[unidades.length - 1].apartados;
        if (apartado && !lista.includes(apartado)) lista.push(apartado);
      }
    }
  }

  const lineas = ["## Visión general", ""];
  const nApartados = unidades.reduce((s, u) => s + u.apartados.length, 0) || analyses.length;
  lineas.push(
    `Resumen de **${documentTitle}** (${pageCount} ${pageCount === 1 ? "página" : "páginas"}): ${
      unidades.length > 1 ? `${unidades.length} unidades y ` : ""
    }${nApartados} ${nApartados === 1 ? "apartado" : "apartados"}.`,
    "",
  );

  if (unidades.length) {
    lineas.push("### Qué vas a estudiar", "");
    for (const unidad of unidades) {
      const temas = unidad.apartados.map((a) => a.charAt(0).toLowerCase() + a.slice(1));
      lineas.push(`- **${unidad.titulo}**${temas.length ? `: ${temas.join("; ")}.` : ""}`);
    }
    lineas.push("");
  }

  // Glosario: las definiciones del propio texto, en una línea cada una.
  const vistas = new Set<string>();
  const glosario = analyses
    .flatMap((a) => a.definiciones ?? [])
    .filter((d) => {
      const clave = sinTildes(d.termino.toLowerCase());
      if (vistas.has(clave) || d.definicion.length < 8) return false;
      vistas.add(clave);
      // La sigla ya definida con su nombre completo ("… (IVA)") no se repite.
      const sigla = /\(([A-ZÁÉÍÓÚÑ]{2,8})\)/.exec(d.termino)?.[1];
      if (sigla) vistas.add(sinTildes(sigla.toLowerCase()));
      return true;
    })
    .slice(0, 16);
  if (glosario.length) {
    lineas.push("### Conceptos imprescindibles", "");
    for (const d of glosario) lineas.push(`- **${d.termino}:** ${cerrar(d.definicion)}`);
    lineas.push("");
  }

  const formulas = [...new Set(analyses.flatMap((a) => a.formulas))].slice(0, 10);
  if (formulas.length) {
    lineas.push("### Fórmulas", "");
    for (const f of formulas) lineas.push(`- ${f}`);
    lineas.push("");
  }

  return lineas.join("\n").trim();
}

/* ── Esquema ───────────────────────────────────────────────────────── */

const MAX_HIJOS = 10;

/** Esquema a partir del resumen ya hecho (mismo resultado al regenerarlo). */
function esquemaDesdeResumen(documentTitle: string, analyses: ChunkAnalysis[]): OutlineTree | null {
  const raiz: OutlineNode[] = [];
  const pila: { nivel: number; nodo: OutlineNode }[] = [];
  const colgar = (hijo: OutlineNode) => {
    const padre = pila[pila.length - 1]?.nodo;
    if (!padre) {
      raiz.push(hijo);
      return;
    }
    padre.children = padre.children ?? [];
    if (padre.children.length < MAX_HIJOS) padre.children.push(hijo);
  };

  for (const analysis of analyses) {
    const pagina = analysis.sourcePages[0];
    const lineas = analysis.markdown.split("\n");
    let grupo: OutlineNode | null = null;

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i].trim();
      if (!linea) {
        grupo = null;
        continue;
      }
      const titulo = /^(#{2,6})\s+(.*)$/.exec(linea);
      if (titulo) {
        const nivel = titulo[1].length;
        while (pila.length && pila[pila.length - 1].nivel >= nivel) pila.pop();
        const nodo: OutlineNode = {
          label: titulo[2],
          kind: nivel <= 2 ? "chapter" : nivel === 3 ? "section" : "subsection",
          page: pagina,
          children: [],
        };
        colgar(nodo);
        pila.push({ nivel, nodo });
        grupo = null;
        continue;
      }

      const aviso = /^>\s*\[!(\w+)\]\s*(.*)$/.exec(linea);
      if (aviso) {
        // El esquema es solo del temario: ni ejemplos ni actividades.
        if (aviso[1] === "ejemplo" || aviso[1] === "curiosidad" || aviso[1] === "practica") continue;
        const esFormula = aviso[1] === "formula";
        colgar({
          label: esFormula ? aviso[2] : nucleo(aviso[2], 110),
          kind: esFormula ? "formula" : "key",
          page: pagina,
        });
        continue;
      }

      const vineta = /^-\s+(.*)$/.exec(linea);
      if (vineta) {
        const texto = vineta[1];
        const etiqueta = /^\*\*([^*]+?):?\*\*:?\s*(.*)$/.exec(texto);
        let nodo: OutlineNode | null = null;
        if (etiqueta) {
          // "**Mercaderías:** bienes…" o "**Tipo general del 21 %**, que se aplica…"
          const detalle = etiqueta[2]
            .replace(/^[,:;]\s*/, "")
            .replace(/^(?:que\s+(?:se\s+)?)?(?:para|aplica(?:n)?\s+a|se\s+aplica(?:n)?\s+a)?\s*/i, "")
            .replace(/[.]\s*$/, "");
          nodo = {
            label: detalle ? `${etiqueta[1].replace(/:$/, "")}: ${acortar(detalle, 80)}` : etiqueta[1],
            kind: "detail",
            page: pagina,
          };
        } else {
          const def = new RegExp(`\\*\\*([^*]+)\\*\\*\\s+(${DEFINE})\\s+(.*)$`, "i").exec(texto);
          const nombrado = /se (?:denomina|denominan|llama|llaman|conoce como)\s+\*\*([^*]+)\*\*\s+(?:porque|ya que|por)\s+(.*)$/i.exec(texto);
          if (def) {
            const verbo = /^(es|son)$/i.test(def[2]) ? "" : `${def[2]} `;
            nodo = { label: `${mayusculaInicial(def[1])}: ${nucleo(verbo + def[3], 90)}`, kind: "concept", page: pagina };
          } else if (nombrado) {
            nodo = { label: `${mayusculaInicial(nombrado[1])}: ${nucleo(nombrado[2], 90)}`, kind: "concept", page: pagina };
          } else if (/\*\*[^*]+\*\*/.test(texto)) {
            const termino = /\*\*([^*]+)\*\*/.exec(texto)![1];
            nodo = { label: `${mayusculaInicial(termino)}: ${nucleo(texto.replace(/\*\*/g, ""), 90)}`, kind: "concept", page: pagina };
          } else if (PROCEDIMIENTO_RE.test(texto) && texto.split(/\s+/).length <= 40) {
            const [, sujeto, verbo, resto] = PROCEDIMIENTO_RE.exec(texto)!;
            nodo = { label: `${mayusculaInicial(sujeto)}: ${nucleo(`${verbo} ${resto}`, 90)}`, kind: "concept", page: pagina };
          } else if (DATO_RE.test(texto) || IMPORTANT_RE.test(texto)) {
            nodo = { label: nucleo(texto, 100), kind: "detail", page: pagina };
          }
        }
        if (!nodo) continue;
        if (grupo) {
          grupo.children = grupo.children ?? [];
          grupo.children.push(nodo);
        } else colgar(nodo);
        continue;
      }

      // Frase que presenta una lista ("Se clasifican en:"): agrupa sus tipos.
      if (/:\s*$/.test(linea) && lineas[i + 2]?.trim().startsWith("- ")) {
        const presenta = nucleo(linea.replace(/:\s*$/, ""), 90);
        grupo = {
          label: presenta.endsWith("…") ? presenta : `${presenta}:`,
          kind: "concept",
          page: pagina,
          children: [],
        };
        colgar(grupo);
        i++; // la línea en blanco que separa la frase de la lista
      }
    }
  }

  // Fuera ramas vacías de nivel profundo que no aportan nada.
  const podar = (nodos: OutlineNode[]) => {
    for (const n of nodos) {
      if (n.children?.length) podar(n.children);
      if (n.children && n.children.length === 0) delete n.children;
    }
  };
  podar(raiz);
  if (raiz.length === 0) return null;
  return { title: documentTitle, nodes: raiz };
}

/**
 * Esquema jerárquico. Se construye a partir del resumen: tiene sus títulos en
 * orden y, debajo, sus conceptos, clasificaciones, fórmulas y avisos.
 */
export function outlineFromHeadings(
  documentTitle: string,
  headings: { title: string; level: number; pageNumber: number }[],
  analyses: ChunkAnalysis[],
): OutlineTree | null {
  const desdeResumen = esquemaDesdeResumen(documentTitle, analyses);
  if (desdeResumen) return desdeResumen;
  if (headings.length < 2) return null;
  // Respaldo: solo los títulos del documento.
  const nodos: OutlineNode[] = [];
  const pila: { level: number; node: OutlineNode }[] = [];
  for (const heading of headings) {
    const node: OutlineNode = {
      label: limpiarTitulo(heading.title),
      kind: heading.level <= 1 ? "chapter" : heading.level === 2 ? "section" : "subsection",
      page: heading.pageNumber,
    };
    while (pila.length && pila[pila.length - 1].level >= heading.level) pila.pop();
    if (pila.length === 0) nodos.push(node);
    else (pila[pila.length - 1].node.children ??= []).push(node);
    pila.push({ level: heading.level, node });
  }
  return { title: documentTitle, nodes: nodos };
}

/** Esquema de respaldo (sin títulos detectados): el mismo, desde el resumen. */
export function extractiveOutline(
  documentTitle: string,
  analyses: ChunkAnalysis[],
  chunks: Chunk[],
): OutlineTree {
  return (
    esquemaDesdeResumen(documentTitle, analyses) ?? {
      title: documentTitle,
      nodes: analyses.map((analysis, index) => ({
        label: analysis.title,
        kind: "section" as const,
        page: analysis.sourcePages[0] ?? chunks[index]?.startPage,
      })),
    }
  );
}
