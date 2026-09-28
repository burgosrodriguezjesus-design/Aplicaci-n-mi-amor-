/**
 * Examen sin IA: se construye con lo que dice el propio documento (su
 * resumen), nunca con conocimiento de fuera.
 *
 *  - Test: 4 opciones, una correcta. Las incorrectas son del mismo documento
 *    y del mismo tipo (otra definición, otro elemento de la misma
 *    clasificación, otra cifra con la misma unidad, la fórmula con una
 *    operación cambiada…), así que son creíbles. La letra correcta se reparte
 *    por igual entre A, B, C y D.
 *  - Cortas: definir, enumerar, completar un dato, "¿por qué…?", comparar.
 *  - Desarrollo: un apartado o una unidad entera, con lo que debe incluir.
 *  - Ejercicios: con las fórmulas y procedimientos del temario (y, si no hay,
 *    de relacionar); si el contenido no da para ejercicios, se avisa.
 */
import {
  type Apartado,
  type Contenido,
  type Definicion,
  type Expr,
  type Formula,
  type Lista,
  type Lugar,
  type SeccionResumen,
  escribir,
  evaluar,
  extraer,
  mayuscula,
  sinPunto,
  variables,
} from "./extraer";
import {
  type Dificultad,
  type Ejercicio,
  type Examen,
  type Fuente,
  type PreguntaAbierta,
  type PreguntaTest,
  LETRAS,
  OBJETIVO,
  porDificultad,
} from "./tipos";

/* ── Azar reproducible ─────────────────────────────────────────── */

function semilla(texto: string) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function generador(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Azar = () => number;

function barajar<T>(lista: T[], azar: Azar): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function entre(azar: Azar, min: number, max: number, paso = 1) {
  const pasos = Math.floor((max - min) / paso);
  return min + Math.floor(azar() * (pasos + 1)) * paso;
}

/* ── Utilidades ───────────────────────────────────────────────── */

const norma = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();

function fuente(l: Lugar, cita: string): Fuente {
  const apartado = l.unidad && norma(l.unidad) !== norma(l.apartado) ? `${l.unidad} › ${l.apartado}` : l.apartado;
  return { apartado, pagina: l.pagina, cita: sinPunto(cita) + "." };
}

const opcion = (t: string) => mayuscula(sinPunto(t));

/**
 * Elige `n` distractores distintos entre sí y de la correcta. Los candidatos
 * pueden venir por niveles de preferencia (los más parecidos primero); entre
 * los mejores, los de longitud más parecida: que el largo no delate nada.
 */
function distractores(correcta: string, candidatos: string[] | string[][], n: number, azar: Azar): string[] | null {
  const niveles = (Array.isArray(candidatos[0]) ? candidatos : [candidatos]) as string[][];
  const vistos = new Set([norma(correcta)]);
  const validos: string[] = [];
  for (const nivel of niveles) {
    for (const c of barajar(nivel, azar)) {
      const k = norma(c);
      if (!k || vistos.has(k)) continue;
      // Tampoco una que contenga a la otra ("IVA" frente a "IVA soportado").
      if ([...vistos].some((v) => v.length > 3 && k.length > 3 && (v.includes(k) || k.includes(v)))) continue;
      vistos.add(k);
      validos.push(opcion(c));
      // Con unos pocos de sobra basta: en un libro largo hay miles.
      if (validos.length >= n + 2) break;
    }
    if (validos.length >= n + 2) break;
  }
  if (validos.length < n) return null;
  const largo = correcta.length;
  return validos
    .slice(0, n + 2)
    .map((v, i) => ({ v, d: Math.abs(v.length - largo) / Math.max(largo, 1) + i * 0.08 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.v);
}

/** Título del apartado sin numeración: "2. Clasificación de las existencias" → "Clasificación de las existencias". */
function tituloDe(l: Lugar) {
  return l.apartado.replace(/^(?:tema|unidad|cap[ií]tulo|bloque)?\s*[\divxlc]+(?:\.\d+)*[.)]?\s*[-–—.:]?\s*/i, "").trim() || l.apartado;
}

/** La frase que presenta la lista, como frase completa ("…se clasifican en" → "…se clasifican en varios grupos"). */
function introDe(l: Lista) {
  const t = mayuscula(sinPunto(l.intro));
  if (/\s(en|como|son|los|las|el|la|siguientes|de)$/i.test(t)) {
    return /clasific|divid|agrup|distingu/i.test(t) ? `${t} varios grupos` : `${t} los siguientes elementos`;
  }
  return t;
}

function palabraDe(lista: Lista) {
  if (/clasific/i.test(lista.intro)) return "clasificación";
  if (/\btipos?\b/i.test(lista.intro)) return "relación de tipos";
  if (/\b(fases|etapas|pasos)\b/i.test(lista.intro)) return "secuencia";
  return "enumeración";
}

function enumerar(nombres: string[]) {
  return nombres.length <= 1 ? nombres.join("") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/* ── Números: huecos para completar y cifras parecidas ─────────── */

const PALABRAS_NUMERO = ["uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];
const DECENAS = ["veinte", "treinta", "cuarenta", "cincuenta", "sesenta"];
const UNIDAD = "(?:\\s?%|\\s?€|\\s(?:euros|d[ií]as|meses|años|horas|minutos|segundos|semanas|trimestres|unidades|kg|g|km|m|cm|mm|l|ml|V|W|kW|kWh|A|mA|Hz|Ω|ºC|°C|grados|personas|trabajadores|socios))";
const CIFRA_RE = new RegExp(`(?<![\\w.,])(\\d{1,3}(?:\\.\\d{3})+|\\d+(?:,\\d+)?)(${UNIDAD})?(?![\\w])`, "g");
const PALABRA_RE = new RegExp(`\\b(${[...PALABRAS_NUMERO.slice(1), ...DECENAS].join("|")})\\b`, "gi");

export type Hueco = { texto: string; hueco: string; tipo: "palabra" | "porcentaje" | "cifra"; valor: number; unidad: string };

export function huecos(frase: string): Hueco[] {
  const salida: Hueco[] = [];
  for (const m of frase.matchAll(CIFRA_RE)) {
    const valor = Number(m[1].replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(valor)) continue;
    const unidad = (m[2] ?? "").trim();
    // Numeraciones ("1.", "3.2.") y años sueltos en títulos no se preguntan.
    if (/^\d+(\.\d+)*$/.test(m[1]) && m[1].includes(".") && !unidad) continue;
    salida.push({
      texto: m[0].trim(),
      hueco: frase.slice(0, m.index) + "____" + frase.slice((m.index ?? 0) + m[0].length),
      tipo: unidad === "%" ? "porcentaje" : "cifra",
      valor,
      unidad,
    });
  }
  for (const m of frase.matchAll(PALABRA_RE)) {
    const palabra = m[1].toLowerCase();
    const i = PALABRAS_NUMERO.indexOf(palabra);
    salida.push({
      texto: m[1],
      hueco: frase.slice(0, m.index) + "____" + frase.slice((m.index ?? 0) + m[0].length),
      tipo: "palabra",
      valor: i >= 0 ? i + 1 : (DECENAS.indexOf(palabra) + 2) * 10,
      unidad: "",
    });
  }
  return salida;
}

/** Un solo formateador para todo (crear uno por número es muy lento). */
const NUMERO = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

function formatear(valor: number, unidad: string) {
  const n = NUMERO.format(valor);
  return unidad ? `${n} ${unidad}` : n;
}

/** Tres cifras falsas y creíbles: primero las del propio documento con la misma unidad. */
function cifrasParecidas(h: Hueco, delDocumento: Hueco[], azar: Azar): string[] {
  const candidatas: string[] = [];
  const conMayuscula = /^[A-ZÁÉÍÓÚ]/.test(h.texto);
  if (h.tipo === "palabra") {
    const lista = h.valor >= 20 ? DECENAS : PALABRAS_NUMERO;
    const i = lista.indexOf(h.texto.toLowerCase());
    for (const d of [-1, 1, 2, -2, 3]) {
      const w = lista[i + d];
      if (w && w !== "uno") candidatas.push(conMayuscula ? mayuscula(w) : w);
    }
    return candidatas;
  }
  // Cifras del propio documento con la misma unidad (unas pocas bastan).
  const mismos = new Set<number>();
  for (const o of delDocumento) {
    if (o.tipo === h.tipo && o.unidad === h.unidad && o.valor !== h.valor) mismos.add(o.valor);
    if (mismos.size >= 12) break;
  }
  for (const valor of barajar([...mismos], azar)) candidatas.push(formatear(valor, h.unidad));
  const v = h.valor;
  if (Number.isInteger(v) && v >= 100 && !h.unidad && !(v >= 1000 && v <= 2100)) {
    // Números de modelo, artículo, ley…: se parecen cambiando una cifra.
    const digitos = String(v);
    const variantes = new Set<number>();
    for (let i = 0; i < digitos.length; i++) {
      for (const d of [1, -1, 3, 5]) {
        const nuevo = digitos.slice(0, i) + ((Number(digitos[i]) + d + 10) % 10) + digitos.slice(i + 1);
        if (!nuevo.startsWith("0")) variantes.add(Number(nuevo));
      }
    }
    for (const x of barajar([...variantes], azar)) if (x !== v) candidatas.push(formatear(x, ""));
    return candidatas;
  }
  const extra =
    h.tipo === "porcentaje"
      ? [4, 5, 7, 8, 10, 12, 15, 16, 18, 20, 21, 25, 30, 50].filter((p) => Math.abs(p - v) <= 15)
      : v >= 1000 && v <= 2100 && Number.isInteger(v) && !h.unidad
        ? [v - 10, v + 8, v - 4, v + 14, v - 22]
        : Number.isInteger(v)
          ? [v * 2, Math.round(v / 2), v + (v >= 20 ? 10 : 1), v - (v >= 20 ? 10 : 1), v * 3, v + (v >= 100 ? 90 : 5)]
          : [v * 2, v / 2, v + 1, v - 1].map((x) => Math.round(x * 100) / 100);
  for (const x of barajar(extra, azar)) if (x > 0 && x !== v) candidatas.push(formatear(x, h.unidad));
  return candidatas;
}

/* ── Fórmulas: variantes incorrectas y cálculos ────────────────── */

function mutaciones(e: Expr): Expr[] {
  if (e.t !== "op") return [];
  const salida: Expr[] = [];
  const opuesto = { "+": "-", "-": "+", "*": "/", "/": "*" } as const;
  const cambio = { "+": "*", "-": "/", "*": "+", "/": "-" } as const;
  salida.push({ ...e, op: opuesto[e.op] });
  salida.push({ ...e, op: cambio[e.op] });
  if (e.op === "-" || e.op === "/") salida.push({ ...e, a: e.b, b: e.a });
  // Los términos cambiados de sitio con la operación contraria: I ÷ R frente a R ÷ I.
  salida.push({ ...e, op: opuesto[e.op], a: e.b, b: e.a });
  // A + B × C → (A + B) × C
  if (e.b.t === "op" && (e.op === "+" || e.op === "-") && (e.b.op === "*" || e.b.op === "/")) {
    salida.push({ t: "op", op: e.b.op, a: { t: "op", op: e.op, a: e.a, b: e.b.a }, b: e.b.b });
  }
  for (const m of mutaciones(e.a)) salida.push({ ...e, a: m });
  for (const m of mutaciones(e.b)) salida.push({ ...e, b: m });
  return salida;
}

function equivalentes(a: Expr, b: Expr) {
  const nombres = [...new Set([...variables(a), ...variables(b)])];
  for (const prueba of [
    [3, 7, 11, 13, 17],
    [2.5, 19, 4, 23, 6],
    [41, 2, 9, 5, 31],
  ]) {
    const valores = new Map(nombres.map((n, i) => [n, prueba[i % prueba.length] + i * 0.37]));
    const x = evaluar(a, valores);
    const y = evaluar(b, valores);
    if (!(Math.abs(x - y) < 1e-6 * Math.max(1, Math.abs(x)))) return false;
  }
  return true;
}

type Magnitud = { unidad: string; min: number; max: number; paso: number; porcentaje?: boolean; conocida: boolean };

function magnitud(nombre: string): Magnitud {
  const n = norma(nombre);
  const m = (unidad: string, min: number, max: number, paso: number): Magnitud => ({ unidad, min, max, paso, conocida: true });
  if (/^(tipo|porcentaje|tasa)\b|%/.test(n) || /\b(tipo impositivo|porcentaje)\b/.test(n)) return { ...m("%", 0, 0, 1), porcentaje: true };
  if (/^cos /.test(n) || n === "factor de potencia") return m("", 0.8, 0.95, 0.05);
  if (/plazo|dias|duracion|demora/.test(n)) return m("días", 3, 15, 1);
  if (/consumo|demanda diaria|ventas diarias/.test(n)) return m("unidades/día", 10, 80, 5);
  if (/stock|existencias|unidades|cantidad|inventario|pedido|lote/.test(n)) return m("unidades", 50, 400, 10);
  if (/iva|importe|precio|coste|costo|base|cuota|ingreso|gasto|capital|valor|venta|compra|salario|sueldo|beneficio|euros/.test(n))
    return m("€", 200, 6000, 50);
  if (/tension|voltaje|diferencia de potencial/.test(n)) return m("V", 12, 400, 1);
  if (/intensidad|corriente/.test(n)) return m("A", 1, 20, 1);
  if (/resistencia/.test(n)) return m("Ω", 2, 100, 1);
  if (/potencia/.test(n)) return m("W", 100, 3000, 50);
  if (/carga/.test(n)) return m("C", 2, 120, 2);
  if (/longitud|distancia/.test(n)) return m("m", 5, 100, 5);
  if (/tiempo|horas/.test(n)) return m("h", 1, 12, 1);
  if (/masa|peso/.test(n)) return m("kg", 1, 100, 1);
  if (/fuerza/.test(n)) return m("N", 10, 500, 10);
  // Un nombre descriptivo ("consumo medio diario") se entiende aunque no se
  // sepa su unidad; un símbolo suelto ("rho") sin explicar, no.
  return { unidad: "", min: 5, max: 200, paso: 5, conocida: nombre.trim().split(/\s+/).length >= 2 };
}

/** La magnitud de una variable: por su nombre o por lo que el texto dice de su símbolo. */
function magnitudDe(variable: string, c: Contenido): Magnitud {
  const simbolo = c.simbolos[variable];
  if (/^(cos|sen)\(/.test(variable)) return magnitud("cos x");
  if (!simbolo) return magnitud(variable);
  const m = magnitud(simbolo.nombre);
  return { ...m, unidad: simbolo.unidad || m.unidad, conocida: true };
}

/** "P" → "P (potencia eléctrica)"; los nombres normales, tal cual. */
function etiquetaDe(nombre: string, c: Contenido) {
  const simbolo = c.simbolos[nombre];
  return simbolo ? `${nombre} (${simbolo.nombre})` : nombre;
}

/** Igual, con la mayúscula inicial salvo en los símbolos ("t" sigue siendo "t"). */
function etiquetaDato(nombre: string, c: Contenido) {
  return c.simbolos[nombre] || /^[A-Za-z]\w{0,2}$/.test(nombre) || /^(cos|sen)\(/.test(nombre) ? etiquetaDe(nombre, c) : mayuscula(nombre);
}

/** "«P (potencia eléctrica)» en trifásica". */
function formulaEnFrase(f: Formula, c: Contenido) {
  return `${enFrase(f.nombre, c)}${f.contexto ? ` ${f.contexto}` : ""}`;
}

/** Para ponerlo dentro de una frase: "punto de pedido", pero "IVA" y "P" tal cual. */
function enFrase(nombre: string, c: Contenido) {
  if (c.simbolos[nombre] || /^[A-Za-z]\w{0,2}$/.test(nombre)) return `«${etiquetaDe(nombre, c)}»`;
  return `«${/^[A-ZÁÉÍÓÚ][A-ZÁÉÍÓÚ]/.test(nombre) ? nombre : nombre.charAt(0).toLowerCase() + nombre.slice(1)}»`;
}

function unidadResultado(f: Formula, c: Contenido, magnitudes: Map<string, Magnitud>) {
  const propia = magnitudDe(f.nombre, c);
  if (propia.unidad && !propia.porcentaje) return propia.unidad === "unidades/día" ? "unidades" : propia.unidad;
  const unidades = [...magnitudes.values()].filter((m) => !m.porcentaje && m.unidad).map((m) => m.unidad);
  if (unidades.length && unidades.every((u) => u === unidades[0]) && ["+", "-"].includes(f.expr.t === "op" ? f.expr.op : "")) return unidades[0];
  if (unidades.includes("unidades")) return "unidades";
  return "";
}

/**
 * Parejas de conceptos que tiene sentido comparar: del mismo apartado y, a
 * ser posible, que compartan palabra ("Método PMP" / "Método FIFO", "IVA
 * repercutido" / "IVA soportado").
 */
function parejas(defs: Definicion[]): [Definicion, Definicion][] {
  const grupos = new Map<string, Definicion[]>();
  for (const d of defs) grupos.set(`${d.unidad}|${d.apartado}`, [...(grupos.get(`${d.unidad}|${d.apartado}`) ?? []), d]);
  const palabras = (d: Definicion) => new Set(norma(d.termino).split(" ").filter((w) => w.length >= 3 && !/^(del|las|los|por|para|con|que)$/.test(w)));
  const salida: [Definicion, Definicion][] = [];
  for (const grupo of grupos.values()) {
    const libres = [...grupo];
    while (libres.length >= 2) {
      const a = libres.shift()!;
      const pa = palabras(a);
      const i = libres.findIndex((b) => [...palabras(b)].some((w) => pa.has(w)));
      if (i >= 0) salida.push([a, libres.splice(i, 1)[0]]);
    }
  }
  return salida;
}

/* ── Candidatas ───────────────────────────────────────────────── */

type Cand<T> = T & { plantilla: string; clave: string };
type CandTest = Cand<{ dificultad: Dificultad; enunciado: string; correcta: string; distractores: string[]; explicacion: string; fuente: Fuente }>;
type CandAbierta = Cand<Omit<PreguntaAbierta, "id">>;
type CandEjercicio = Cand<Omit<Ejercicio, "id">>;

/** "Las existencias", "El stock de seguridad": el término con su artículo, tal como sale en su frase. */
function conArticulo(d: Definicion): string | null {
  const escapado = d.termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`\\b(el|la|los|las)\\s+${escapado}`, "i").exec(d.frase);
  return m ? m[0] : null;
}

function candidatasTest(c: Contenido, azar: Azar): CandTest[] {
  const salida: CandTest[] = [];
  const defs = c.definiciones;
  const elementos = c.listas.flatMap((l) => l.elementos.map((e) => ({ ...e, lista: l })));
  const terminos = [...defs.map((d) => mayuscula(d.termino)), ...elementos.map((e) => e.nombre), ...c.formulas.map((f) => f.nombre)];
  const deVerbo = (t: string) => /^(calcula|valora|indica|mide|permite|determina|regula|grava|recoge|establece|sirve|consiste|se\s)/i.test(t);

  for (const d of defs) {
    // ¿Qué es X? → su definición entre otras del mismo documento.
    const otras = [
      defs.filter((o) => o !== d && o.unidad === d.unidad && deVerbo(o.definicion) === deVerbo(d.definicion)).map((o) => o.definicion),
      defs.filter((o) => o !== d && deVerbo(o.definicion) === deVerbo(d.definicion)).map((o) => o.definicion),
      elementos.filter((e) => e.detalle && !/^(para|que|se|de|en|con|por)\b/i.test(e.detalle) && deVerbo(e.detalle) === deVerbo(d.definicion)).map((e) => e.detalle),
      defs.filter((o) => o !== d).map((o) => o.definicion),
    ];
    const malas = distractores(d.definicion, otras, 3, azar);
    if (malas) {
      salida.push({
        plantilla: "definicion",
        clave: d.id,
        dificultad: "FACIL",
        enunciado: `¿Cuál de las siguientes opciones define correctamente «${d.termino}»?`,
        correcta: opcion(d.definicion),
        distractores: malas,
        explicacion: `El temario define «${d.termino}» como: «${sinPunto(d.definicion)}». Las demás opciones son definiciones de otros conceptos del documento.`,
        fuente: fuente(d, d.frase),
      });
    }
    // Definición → ¿qué concepto es?
    const malos = distractores(
      mayuscula(d.termino),
      [
        defs.filter((o) => o !== d && o.unidad === d.unidad).map((o) => mayuscula(o.termino)),
        defs.filter((o) => o !== d).map((o) => mayuscula(o.termino)),
        c.formulas.map((f) => f.nombre),
        terminos,
      ],
      3,
      azar,
    );
    if (malos) {
      salida.push({
        plantilla: "termino",
        clave: d.id,
        dificultad: "MEDIA",
        enunciado: `¿A qué concepto del temario corresponde la siguiente definición? «${mayuscula(sinPunto(d.definicion))}».`,
        correcta: opcion(d.termino),
        distractores: malos,
        explicacion: `Esa es la definición de «${d.termino}». ${enumerar(malos.map((m) => `«${m}»`))} son otros conceptos del documento con un significado distinto.`,
        fuente: fuente(d, d.frase),
      });
    }
  }

  // Afirmación correcta entre afirmaciones con los conceptos cambiados.
  const conArt = defs.map((d) => ({ d, art: conArticulo(d) })).filter((x): x is { d: Definicion; art: string } => Boolean(x.art));
  for (const { d } of conArt) {
    const falsas: string[] = [];
    for (const otra of barajar(conArt.filter((x) => x.d !== d), azar)) {
      const intruso = barajar(conArt.filter((x) => x.d !== otra.d), azar)[0];
      if (!intruso) continue;
      const [articulo, ...resto] = intruso.art.split(" ");
      const cambiada = otra.d.frase.replace(otra.art, (m) => `${/^[A-ZÁÉÍÓÚ]/.test(m) ? mayuscula(articulo.toLowerCase()) : articulo.toLowerCase()} ${resto.join(" ")}`);
      if (cambiada !== otra.d.frase && norma(cambiada) !== norma(d.frase)) falsas.push(cambiada);
      if (falsas.length >= 6) break;
    }
    const malas = distractores(d.frase, falsas, 3, azar);
    if (malas) {
      salida.push({
        plantilla: "afirmacion",
        clave: `${d.id}-af`,
        dificultad: "DIFICIL",
        enunciado: "¿Cuál de las siguientes afirmaciones es correcta según el temario?",
        correcta: opcion(d.frase),
        distractores: malas,
        explicacion: `La afirmación correcta es la que recoge el documento tal cual. En las otras se ha cambiado el concepto: cada definición corresponde en realidad a otro término.`,
        fuente: fuente(d, d.frase),
      });
    }
  }

  for (const l of c.listas) {
    const palabra = palabraDe(l);
    const nombres = l.elementos.map((e) => e.nombre);
    const enIntro = (t: string) => norma(l.intro).includes(norma(t));
    const fuera = (t: string) => !nombres.some((n) => norma(n) === norma(t)) && !enIntro(t);
    const nivelesAjenos = [
      defs.filter((d) => d.unidad === l.unidad).map((d) => mayuscula(d.termino)).filter(fuera),
      elementos.filter((e) => e.lista !== l && e.lista.unidad === l.unidad).map((e) => e.nombre).filter(fuera),
      [...elementos.filter((e) => e.lista !== l).map((e) => e.nombre), ...defs.map((d) => mayuscula(d.termino))].filter(fuera),
    ];
    const conCifra = l.elementos.filter((e) => huecos(e.nombre).some((h) => h.tipo !== "palabra"));
    /** Elementos falsos muy creíbles: uno real con la cifra cambiada. */
    const falsosConCifra = (cuantos: number) => {
      const salidaFalsos: string[] = [];
      const todos = l.elementos.flatMap((e) => huecos(e.nombre));
      for (const base of barajar(conCifra, azar)) {
        const h = huecos(base.nombre).find((x) => x.tipo !== "palabra")!;
        for (const cifra of cifrasParecidas(h, todos, azar)) {
          const candidato = h.hueco.replace("____", cifra);
          if (fuera(candidato) && !salidaFalsos.some((f) => norma(f) === norma(candidato))) {
            salidaFalsos.push(candidato);
            break;
          }
        }
        if (salidaFalsos.length >= cuantos) break;
      }
      // Si hay pocos elementos, otra cifra para el mismo.
      for (const base of conCifra) {
        if (salidaFalsos.length >= cuantos) break;
        const h = huecos(base.nombre).find((x) => x.tipo !== "palabra")!;
        for (const cifra of cifrasParecidas(h, todos, azar)) {
          const candidato = h.hueco.replace("____", cifra);
          if (fuera(candidato) && !salidaFalsos.some((f) => norma(f) === norma(candidato))) {
            salidaFalsos.push(candidato);
            if (salidaFalsos.length >= cuantos) break;
          }
        }
      }
      return salidaFalsos;
    };

    // ¿Cuál NO forma parte? Si los elementos llevan cifras, el intruso es uno
    // de ellos con la cifra cambiada: muy creíble.
    if (nombres.length >= 3) {
      const cifrado = conCifra.length ? falsosConCifra(1)[0] : undefined;
      const intruso = cifrado ?? barajar(nivelesAjenos.find((n) => n.length) ?? [], azar)[0] ?? null;
      if (intruso) {
        const reales = barajar(nombres, azar).slice(0, 3);
        salida.push({
          plantilla: "no-es",
          clave: l.id,
          dificultad: cifrado ? "DIFICIL" : "MEDIA",
          enunciado: `${introDe(l)}. ¿Cuál de las siguientes opciones NO forma parte de esa ${palabra}?`,
          correcta: opcion(intruso),
          distractores: reales.map(opcion),
          explicacion: `La ${palabra} del temario incluye: ${enumerar(nombres)}. «${opcion(intruso)}» no está entre ellos.`,
          fuente: fuente(l, `${sinPunto(l.intro)}: ${enumerar(nombres)}`),
        });
      }
    }

    // ¿Cuál SÍ forma parte?
    if (nombres.length >= 2) {
      const real = barajar(nombres, azar)[0];
      const malas = distractores(real, conCifra.length ? [falsosConCifra(4)] : nivelesAjenos, 3, azar);
      if (malas) {
        salida.push({
          plantilla: "si-es",
          clave: `${l.id}-si`,
          dificultad: conCifra.length ? "MEDIA" : "FACIL",
          enunciado: `${introDe(l)}. ¿Cuál de las siguientes opciones SÍ forma parte de esa ${palabra}?`,
          correcta: opcion(real),
          distractores: malas,
          explicacion: `«${opcion(real)}» es uno de los elementos de la ${palabra} (${enumerar(nombres)}). ${
            conCifra.length ? "Las demás opciones cambian la cifra del temario." : "Las demás opciones son conceptos del documento que no pertenecen a ella."
          }`,
          fuente: fuente(l, `${sinPunto(l.intro)}: ${enumerar(nombres)}`),
        });
      }
    }

    // ¿Qué caracteriza a un elemento? → las descripciones de sus hermanos.
    const conDetalle = l.elementos.filter((e) => e.detalle.split(/\s+/).length >= 3);
    for (const e of conDetalle) {
      const otras = [conDetalle.filter((o) => o !== e).map((o) => o.detalle), elementos.filter((o) => o.lista !== l && o.detalle).map((o) => o.detalle), defs.map((d) => d.definicion)];
      const malas = distractores(e.detalle, otras, 3, azar);
      if (malas) {
        salida.push({
          plantilla: "detalle",
          clave: `${l.id}-${norma(e.nombre)}`,
          dificultad: conDetalle.length >= 4 ? "DIFICIL" : "MEDIA",
          enunciado: `Según el apartado «${tituloDe(l)}», ¿qué caracteriza a «${e.nombre}»?`,
          correcta: opcion(e.detalle),
          distractores: malas,
          explicacion: `Según el temario, «${e.nombre}»: ${sinPunto(e.detalle)}. Las otras opciones describen otros elementos.`,
          fuente: fuente(l, `${e.nombre}: ${e.detalle}`),
        });
      }
      const malos = distractores(e.nombre, [nombres, ...nivelesAjenos], 3, azar);
      if (malos && conDetalle.length >= 3) {
        salida.push({
          plantilla: "elemento",
          clave: `${l.id}-${norma(e.nombre)}`,
          dificultad: "MEDIA",
          enunciado: `Según el apartado «${tituloDe(l)}», ¿a qué elemento corresponde esta descripción? «${mayuscula(sinPunto(e.detalle))}».`,
          correcta: opcion(e.nombre),
          distractores: malos,
          explicacion: `Esa descripción corresponde a «${e.nombre}».`,
          fuente: fuente(l, `${e.nombre}: ${e.detalle}`),
        });
      }
    }
  }

  // Datos: completar la cifra.
  const todosLosHuecos = c.datos.flatMap((d) => huecos(d.frase));
  for (const d of c.datos) {
    for (const h of huecos(d.frase)) {
      const malas = distractores(h.texto, cifrasParecidas(h, todosLosHuecos, azar), 3, azar);
      if (!malas) continue;
      salida.push({
        plantilla: "dato",
        clave: `${d.id}-${norma(h.texto)}`,
        dificultad: h.tipo === "palabra" ? "FACIL" : h.tipo === "porcentaje" || h.unidad ? "DIFICIL" : "MEDIA",
        enunciado: `Completa la frase del temario: «${sinPunto(h.hueco)}.»`,
        correcta: opcion(h.texto),
        distractores: malas.map(opcion),
        explicacion: `El dato que da el temario es «${h.texto}». ${
          h.tipo === "palabra" ? "Las demás opciones son cantidades cercanas que no son las del texto." : "Las demás opciones son cifras parecidas que no son las del texto."
        }`,
        fuente: fuente(d, d.frase),
      });
    }
  }

  // Fórmulas y procedimientos: la expresión correcta frente a otras con una operación cambiada.
  for (const f of c.formulas) {
    const correcta = escribir(f.expr);
    const falsas = mutaciones(f.expr)
      .filter((m) => !equivalentes(m, f.expr))
      .map((m) => escribir(m));
    const malas = distractores(correcta, falsas, 3, azar);
    if (!malas) continue;
    salida.push({
      plantilla: "formula",
      clave: f.id,
      dificultad: variables(f.expr).length >= 3 ? "DIFICIL" : "MEDIA",
      enunciado: f.procedimiento
        ? `Según el temario, ¿cómo se obtiene ${formulaEnFrase(f, c)}?`
        : `¿Cuál es la expresión correcta para calcular ${formulaEnFrase(f, c)}?`,
      correcta: `${f.nombre} = ${correcta}`,
      distractores: malas.map((m) => `${f.nombre} = ${m}`),
      explicacion: f.procedimiento
        ? `El documento indica que se obtiene ${sinPunto(f.procedimiento)}, es decir: ${f.texto}. Las demás opciones cambian la operación o el orden.`
        : `La fórmula del temario es ${f.texto}. Las demás cambian una operación o el orden de los términos, y dan otro resultado.`,
      fuente: fuente(f, f.frase),
    });
  }
  return salida;
}

function candidatasCortas(c: Contenido, azar: Azar): CandAbierta[] {
  const salida: CandAbierta[] = [];
  for (const d of c.definiciones) {
    salida.push({
      plantilla: "define",
      clave: d.id,
      dificultad: "FACIL",
      enunciado: `Define «${d.termino}».`,
      respuesta: `${mayuscula(d.termino)}: ${sinPunto(d.definicion)}.`,
      explicacion: "Es la definición que da el propio documento; se valora que recoja todos sus elementos.",
      fuente: fuente(d, d.frase),
    });
  }
  for (const l of c.listas) {
    const clasifica = /^(.+?)\s+se\s+(clasifican|dividen|agrupan|distinguen|componen|dividen)\s+en$/i.exec(sinPunto(l.intro));
    const nombres = l.elementos.map((e) => e.nombre);
    salida.push({
      plantilla: "enumera",
      clave: `${l.id}-en`,
      dificultad: nombres.length >= 5 ? "DIFICIL" : "MEDIA",
      enunciado: clasifica
        ? `¿En qué se ${clasifica[2]} ${clasifica[1].replace(/^[A-ZÁÉÍÓÚ]/, (m) => m.toLowerCase())}? Nombra todos los elementos.`
        : `${introDe(l)}. Enumera todos los elementos de esta ${palabraDe(l)}.`,
      respuesta: l.elementos.map((e) => (e.detalle ? `${e.nombre}: ${sinPunto(e.detalle)}.` : `${e.nombre}.`)).join("\n"),
      explicacion: `Son ${nombres.length}: ${enumerar(nombres)}.`,
      fuente: fuente(l, `${sinPunto(l.intro)}: ${enumerar(nombres)}`),
    });
    for (const e of l.elementos.filter((x) => x.detalle.split(/\s+/).length >= 3)) {
      salida.push({
        plantilla: "elemento",
        clave: `${l.id}-${norma(e.nombre)}`,
        dificultad: "MEDIA",
        enunciado: `Según el apartado «${tituloDe(l)}», ¿qué caracteriza a «${e.nombre}»?`,
        respuesta: `${e.nombre}: ${sinPunto(e.detalle)}.`,
        explicacion: "Es la descripción que da el documento para ese elemento.",
        fuente: fuente(l, `${e.nombre}: ${e.detalle}`),
      });
    }
  }
  for (const r of c.razones) {
    salida.push({
      plantilla: "razon",
      clave: r.id,
      dificultad: "MEDIA",
      enunciado: r.pregunta,
      respuesta: `${r.respuesta}.`,
      explicacion: "La razón aparece explicada en el propio documento.",
      fuente: fuente(r, r.frase),
    });
  }
  for (const d of c.datos) {
    const h = barajar(huecos(d.frase), azar)[0];
    if (!h) continue;
    salida.push({
      plantilla: "dato",
      clave: `${d.id}-${norma(h.texto)}`,
      dificultad: h.tipo === "palabra" ? "FACIL" : "MEDIA",
      enunciado: `Completa: «${sinPunto(h.hueco)}.»`,
      respuesta: h.texto,
      explicacion: `Es el dato exacto que da el temario en ese punto («${h.texto}»).`,
      fuente: fuente(d, d.frase),
    });
  }
  for (const f of c.formulas) {
    salida.push({
      plantilla: "formula",
      clave: f.id,
      dificultad: "MEDIA",
      enunciado: `¿Cómo se calcula ${formulaEnFrase(f, c)}? Escribe la expresión.`,
      respuesta: f.procedimiento ? `${mayuscula(sinPunto(f.procedimiento))}: ${f.texto}.` : `${f.texto}.`,
      explicacion: "Es la fórmula (o el procedimiento) que recoge el documento.",
      fuente: fuente(f, f.frase),
    });
  }
  // Comparar dos conceptos parecidos del mismo apartado.
  for (const [a, b] of parejas(c.definiciones)) {
    salida.push({
      plantilla: "compara",
      clave: `${a.id}-${b.id}`,
      dificultad: "DIFICIL",
      enunciado: `¿Qué diferencia hay entre «${a.termino}» y «${b.termino}»?`,
      respuesta: `${mayuscula(a.termino)}: ${sinPunto(a.definicion)}.\n${mayuscula(b.termino)}: ${sinPunto(b.definicion)}.`,
      explicacion: "Se espera que la respuesta defina ambos conceptos y señale en qué se distinguen, con las palabras del temario.",
      fuente: fuente(a, a.frase === b.frase ? a.frase : `${a.frase} ${b.frase}`),
    });
  }
  return salida;
}

function candidatasDesarrollo(c: Contenido): CandAbierta[] {
  const salida: CandAbierta[] = [];
  const guion = (a: Apartado) => a.frases.slice(0, 14).map((f) => `- ${sinPunto(f)}.`).join("\n");
  for (const a of c.apartados) {
    if (a.frases.length < 2) continue;
    const puntos: string[] = [];
    const defs = c.definiciones.filter((d) => d.apartado === a.titulo && d.unidad === a.unidad);
    const listas = c.listas.filter((l) => l.apartado === a.titulo && l.unidad === a.unidad);
    const formulas = c.formulas.filter((f) => f.apartado === a.titulo && f.unidad === a.unidad);
    const datos = c.datos.filter((d) => d.apartado === a.titulo && d.unidad === a.unidad);
    if (defs.length) puntos.push(`la definición de ${enumerar(defs.map((d) => `«${d.termino}»`))}`);
    for (const l of listas) puntos.push(`la ${palabraDe(l)} completa (${enumerar(l.elementos.map((e) => e.nombre.toLowerCase()))})`);
    if (formulas.length) puntos.push(`cómo se calcula ${enumerar(formulas.map((f) => formulaEnFrase(f, c)))}`);
    if (datos.length) puntos.push("los datos y cifras que da el temario");
    const peso = a.frases.length + listas.length * 2 + formulas.length;
    salida.push({
      plantilla: "apartado",
      clave: a.id,
      dificultad: peso >= 7 ? "DIFICIL" : peso >= 4 ? "MEDIA" : "FACIL",
      enunciado:
        `Desarrolla el apartado «${a.titulo}»${a.unidad && norma(a.unidad) !== norma(a.titulo) ? ` (${a.unidad})` : ""}.` +
        (puntos.length ? ` Tu respuesta debe incluir ${enumerar(puntos)}.` : ""),
      respuesta: `Puntos que debe contener la respuesta:\n${guion(a)}`,
      explicacion: "Una buena respuesta explica cada punto con las palabras del temario, en orden y relacionándolos entre sí.",
      fuente: fuente(a, a.frases.slice(0, 2).join(" ")),
    });
  }
  // Una unidad entera, relacionando sus apartados.
  const unidades = new Map<string, Apartado[]>();
  for (const a of c.apartados) unidades.set(a.unidad, [...(unidades.get(a.unidad) ?? []), a]);
  for (const [unidad, todos] of unidades) {
    // La introducción del tema no es uno de sus apartados.
    const apartados = todos.filter((a) => norma(a.titulo) !== norma(unidad));
    if (apartados.length < 2) continue;
    salida.push({
      plantilla: "unidad",
      clave: `u-${norma(unidad)}`,
      dificultad: "DIFICIL",
      enunciado: `Explica de forma global «${unidad}», relacionando sus apartados: ${enumerar(apartados.map((a) => `«${a.titulo}»`))}.`,
      respuesta:
        "Puntos que debe contener la respuesta:\n" +
        apartados.map((a) => `${a.titulo}:\n${a.frases.slice(0, 3).map((f) => `- ${sinPunto(f)}.`).join("\n")}`).join("\n"),
      explicacion: "Se valora que la respuesta recorra todos los apartados y muestre cómo se relacionan.",
      fuente: { ...fuente(apartados[0], apartados[0].frases[0] ?? unidad), apartado: unidad },
    });
  }
  // Comparar dos conceptos parecidos, más a fondo.
  for (const [a, b] of parejas(c.definiciones)) {
    const apartado = c.apartados.find((x) => x.titulo === a.apartado && x.unidad === a.unidad);
    salida.push({
      plantilla: "compara",
      clave: `${a.id}-${b.id}-des`,
      dificultad: "DIFICIL",
      enunciado: `Compara «${a.termino}» y «${b.termino}»: explica en qué consiste cada uno, qué tienen en común y en qué se diferencian, según el temario.`,
      respuesta: `Puntos que debe contener la respuesta:\n- ${mayuscula(a.termino)}: ${sinPunto(a.definicion)}.\n- ${mayuscula(b.termino)}: ${sinPunto(b.definicion)}.${
        apartado ? `\n- Contexto del apartado «${apartado.titulo}»: ${sinPunto(apartado.frases[0] ?? "")}.` : ""
      }`,
      explicacion: "Se espera una comparación ordenada: definición de cada uno, semejanzas y diferencias.",
      fuente: fuente(a, a.frase === b.frase ? a.frase : `${a.frase} ${b.frase}`),
    });
  }
  return salida;
}

function candidatasEjercicios(c: Contenido, azar: Azar): CandEjercicio[] {
  const salida: CandEjercicio[] = [];
  const porcentajes = [...new Set(c.datos.flatMap((d) => huecos(d.frase)).concat(c.listas.flatMap((l) => l.elementos.flatMap((e) => huecos(e.nombre)))).filter((h) => h.tipo === "porcentaje").map((h) => h.valor))];

  for (const f of c.formulas) {
    const nombres = variables(f.expr);
    if (!nombres.length) continue;
    for (const inversa of [false, true]) {
      for (let intento = 0; intento < 2; intento++) {
        const magnitudes = new Map(nombres.map((n) => [n, magnitudDe(n, c)]));
        // Sin saber qué es cada término, el ejercicio no tendría sentido.
        if ([...magnitudes.values()].some((m) => !m.conocida)) break;
        const valores = new Map<string, number>();
        const textos = new Map<string, string>();
        for (const [n, m] of magnitudes) {
          if (m.porcentaje) {
            const p = porcentajes.length ? barajar(porcentajes, azar)[0] : entre(azar, 5, 25);
            valores.set(n, p / 100);
            textos.set(n, formatear(p, "%"));
          } else {
            let v = Math.round(entre(azar, m.min, m.max, m.paso) * 100) / 100;
            // Que lo restado no supere a lo que se resta: resultados con sentido.
            if (f.expr.t === "op" && f.expr.op === "-" && f.expr.b.t === "var" && f.expr.b.nombre === n) {
              const a = f.expr.a.t === "var" ? valores.get(f.expr.a.nombre) : undefined;
              if (a) v = Math.max(m.min, Math.round((a * (0.3 + azar() * 0.5)) / m.paso) * m.paso);
            }
            valores.set(n, v);
            textos.set(n, formatear(v, m.unidad.replace("unidades/día", "unidades/día")));
          }
        }
        const resultado = Math.round(evaluar(f.expr, valores) * 100) / 100;
        if (!Number.isFinite(resultado)) continue;
        const unidad = unidadResultado(f, c, magnitudes);
        const datos = nombres.map((n) => `${etiquetaDato(n, c)}: ${textos.get(n)}`);
        if (!inversa) {
          salida.push({
            plantilla: "calculo",
            clave: `${f.id}-${intento}`,
            dificultad: nombres.length >= 3 ? "MEDIA" : "FACIL",
            enunciado: `Calcula ${formulaEnFrase(f, c)} con los siguientes datos:`,
            datos,
            respuesta: [
              `Se aplica la fórmula del temario: ${f.texto}.`,
              `Sustituyendo: ${f.nombre} = ${escribir(f.expr, textos)}`,
              `Resultado: ${f.nombre} = ${formatear(resultado, unidad)}.`,
              ...(resultado < 0 && f.procedimiento ? ["El resultado es negativo: interprétalo según lo que indica el temario."] : []),
            ].join("\n"),
            explicacion: `Basta con identificar cada dato con su término de la fórmula y respetar el orden de las operaciones (primero multiplicaciones y divisiones).`,
            fuente: fuente(f, f.frase),
          });
          break;
        }
        // Inversa: se da el resultado y se pide un dato (solo si es lineal en él).
        const incognita = barajar(nombres.filter((n) => !magnitudes.get(n)!.porcentaje), azar)[0];
        if (!incognita || resultado <= 0) continue;
        const prueba = (x: number) => evaluar(f.expr, new Map([...valores, [incognita, x]]));
        const [y0, y1, y2] = [prueba(0), prueba(1), prueba(2)];
        const pendiente = y1 - y0;
        if (!(Math.abs(y2 - y1 - pendiente) < 1e-9) || Math.abs(pendiente) < 1e-9) continue;
        const conX = new Map(textos);
        conX.set(incognita, "x");
        salida.push({
          plantilla: "inversa",
          clave: `${f.id}-inv`,
          dificultad: "DIFICIL",
          enunciado: `Sabiendo que ${formulaEnFrase(f, c)} vale ${formatear(resultado, unidad)}, calcula ${enFrase(incognita, c)} con estos datos:`,
          datos: nombres.filter((n) => n !== incognita).map((n) => `${etiquetaDato(n, c)}: ${textos.get(n)}`),
          respuesta: [
            `Se parte de la fórmula del temario: ${f.texto}.`,
            `Sustituyendo (x = ${incognita}): ${formatear(resultado, unidad)} = ${escribir(f.expr, conX)}`,
            `Despejando x: ${incognita} = ${formatear(valores.get(incognita)!, magnitudes.get(incognita)!.unidad)}.`,
          ].join("\n"),
          explicacion: "Se sustituyen los datos conocidos y se despeja la incógnita. Comprueba el resultado volviendo a calcular la fórmula.",
          fuente: fuente(f, f.frase),
        });
        break;
      }
    }
  }

  // Porcentajes que el temario dice "sobre" qué se aplican (tipos de IVA, etc.).
  for (const l of c.listas) {
    const sobre = /se\s+aplica(?:n)?\s+sobre\s+(?:el|la|los|las)\s+([^,.;]{3,40}?)(?:\s+seg[uú]n|\s+de\s|[,.;]|$)/i.exec(l.intro);
    if (!sobre) continue;
    const base = sobre[1].trim();
    const conPorcentaje = l.elementos.map((e) => ({ e, h: huecos(e.nombre).find((h) => h.tipo === "porcentaje") })).filter((x) => x.h);
    for (const { e, h } of barajar(conPorcentaje, azar).slice(0, 2)) {
      const importe = entre(azar, 200, 3000, 50);
      const resultado = Math.round(importe * h!.valor) / 100;
      salida.push({
        plantilla: "porcentaje",
        clave: `${l.id}-${norma(e.nombre)}-p`,
        dificultad: "MEDIA",
        enunciado: `Aplica el «${e.nombre.toLowerCase()}» sobre ${/^(base|cantidad|cuota)/i.test(base) ? "una" : "un"} ${base} de ${formatear(importe, "€")}. ¿Qué importe resulta?`,
        respuesta: [
          `El temario indica que ${sinPunto(l.intro).replace(/^[A-ZÁÉÍÓÚ]/, (m) => m.toLowerCase())}.`,
          `${formatear(importe, "€")} × ${formatear(h!.valor, "%")} = ${formatear(importe, "")} × ${formatear(h!.valor / 100, "")} = ${formatear(resultado, "€")}.`,
        ].join("\n"),
        explicacion: "Aplicar un porcentaje es multiplicar el importe por el porcentaje y dividir entre 100.",
        fuente: fuente(l, `${sinPunto(l.intro)}: ${e.nombre}`),
      });
    }
  }

  // Relacionar cada elemento con su descripción.
  for (const l of c.listas) {
    const conDetalle = l.elementos.filter((e) => e.detalle.split(/\s+/).length >= 3);
    if (conDetalle.length < 3) continue;
    const letras = "abcdefghij";
    const desordenados = barajar(conDetalle, azar);
    salida.push({
      plantilla: "relaciona",
      clave: `${l.id}-rel`,
      dificultad: conDetalle.length >= 4 ? "MEDIA" : "FACIL",
      enunciado: `${introDe(l)}. Relaciona cada elemento con su descripción:`,
      datos: [
        ...conDetalle.map((e, i) => `${i + 1}. ${e.nombre}`),
        ...desordenados.map((e, i) => `${letras[i]}) ${mayuscula(sinPunto(e.detalle))}`),
      ],
      respuesta: conDetalle.map((e, i) => `${i + 1} → ${letras[desordenados.indexOf(e)]}) (${e.nombre}: ${sinPunto(e.detalle)})`).join("\n"),
      explicacion: "Cada descripción es la que da el temario para ese elemento.",
      fuente: fuente(l, `${sinPunto(l.intro)}: ${enumerar(conDetalle.map((e) => e.nombre))}`),
    });
  }
  return salida;
}

/* ── Selección equilibrada ────────────────────────────────────── */

type Reparto = Record<Dificultad, number>;

function repartoPara(total: number, base: Reparto): Reparto {
  const suma = base.FACIL + base.MEDIA + base.DIFICIL;
  const f = Math.round((base.FACIL * total) / suma);
  const d = Math.round((base.DIFICIL * total) / suma);
  return { FACIL: f, MEDIA: Math.max(0, total - f - d), DIFICIL: d };
}

function elegir<T extends { plantilla: string; clave: string; dificultad: Dificultad; enunciado: string }>(
  candidatas: T[],
  n: number,
  reparto: Reparto,
  usados: Set<string>,
  azar: Azar,
): T[] {
  // Intercaladas por plantilla: variedad de tipos de pregunta.
  const grupos = new Map<string, T[]>();
  for (const c of barajar(candidatas, azar)) grupos.set(c.plantilla, [...(grupos.get(c.plantilla) ?? []), c]);
  const orden: T[] = [];
  const colas = barajar([...grupos.values()], azar);
  while (colas.some((q) => q.length)) for (const q of colas) if (q.length) orden.push(q.shift()!);

  const elegidas: T[] = [];
  const cupo = { ...reparto };
  const enunciados = new Set<string>();
  const clavesAqui = new Set<string>();
  const tomar = (c: T) => {
    elegidas.push(c);
    enunciados.add(norma(c.enunciado));
    clavesAqui.add(c.clave);
    cupo[c.dificultad]--;
  };
  const base = (c: T) => c.clave.split("-")[0];
  // Que ningún tipo de pregunta se coma el bloque (salvo que no haya otra cosa).
  const tope = Math.max(2, Math.ceil(n * 0.4));
  const dePlantilla = (p: string) => elegidas.filter((e) => e.plantilla === p).length;
  for (const pasada of [0, 1, 2]) {
    for (const c of orden) {
      if (elegidas.length >= n) break;
      if (elegidas.includes(c) || enunciados.has(norma(c.enunciado))) continue;
      if (pasada < 2 && dePlantilla(c.plantilla) >= tope) continue;
      const repetida = usados.has(c.clave) || clavesAqui.has(c.clave) || [...clavesAqui].some((k) => k.split("-")[0] === base(c));
      if (pasada === 0 && (repetida || cupo[c.dificultad] <= 0)) continue;
      if (pasada === 1 && (usados.has(c.clave) || clavesAqui.has(c.clave))) continue;
      tomar(c);
    }
  }
  for (const c of elegidas) usados.add(c.clave);
  return elegidas;
}

/* ── Examen ───────────────────────────────────────────────────── */

/**
 * En un libro largo hay miles de definiciones y datos: se trabaja con una
 * muestra repartida por todo el documento (distinta en cada examen), así el
 * examen sale en un momento sea cual sea el tamaño del libro.
 */
const MUESTRA = { definiciones: 160, listas: 80, datos: 200, razones: 80, formulas: 60, apartados: 160 } as const;

function muestra(c: Contenido, azar: Azar): Contenido {
  const tomar = <T,>(lista: T[], n: number) => {
    if (lista.length <= n) return lista;
    const elegidos = new Set(barajar(lista.map((_, i) => i), azar).slice(0, n));
    return lista.filter((_, i) => elegidos.has(i));
  };
  return {
    simbolos: c.simbolos,
    definiciones: tomar(c.definiciones, MUESTRA.definiciones),
    listas: tomar(c.listas, MUESTRA.listas),
    datos: tomar(c.datos, MUESTRA.datos),
    razones: tomar(c.razones, MUESTRA.razones),
    formulas: tomar(c.formulas, MUESTRA.formulas),
    apartados: tomar(c.apartados, MUESTRA.apartados),
  };
}

export function examenDesdeContenido(titulo: string, todo: Contenido, seed: string): Examen {
  const azar = generador(semilla(seed));
  const c = muestra(todo, azar);
  const usados = new Set<string>();

  const test = elegir(candidatasTest(c, azar), OBJETIVO.test, repartoPara(OBJETIVO.test, { FACIL: 7, MEDIA: 8, DIFICIL: 5 }), usados, azar);
  const cortas = elegir(candidatasCortas(c, azar), OBJETIVO.cortas, repartoPara(OBJETIVO.cortas, { FACIL: 3, MEDIA: 5, DIFICIL: 2 }), usados, azar);
  const desarrollo = elegir(candidatasDesarrollo(c), OBJETIVO.desarrollo, { FACIL: 1, MEDIA: 2, DIFICIL: 2 }, new Set(), azar);
  const ejerciciosTodos = candidatasEjercicios(c, azar);
  // Primero los de cálculo; los de relacionar, solo para completar.
  const deCalculo = ejerciciosTodos.filter((e) => e.plantilla !== "relaciona");
  let ejercicios = elegir(deCalculo, OBJETIVO.ejercicios, { FACIL: 1, MEDIA: 2, DIFICIL: 2 }, new Set(), azar);
  if (ejercicios.length < OBJETIVO.ejercicios) {
    ejercicios = [...ejercicios, ...elegir(ejerciciosTodos.filter((e) => e.plantilla === "relaciona"), OBJETIVO.ejercicios - ejercicios.length, { FACIL: 5, MEDIA: 5, DIFICIL: 5 }, new Set(), azar)];
  }

  // La letra correcta, repartida por igual entre A, B, C y D.
  const posiciones = barajar(
    Array.from({ length: test.length }, (_, i) => i % 4),
    azar,
  );
  const ordenadas = porDificultad(test);
  const preguntasTest: PreguntaTest[] = ordenadas.map((p, i) => {
    const opciones = barajar(p.distractores, azar);
    opciones.splice(posiciones[i], 0, p.correcta);
    return {
      id: `t${i + 1}`,
      dificultad: p.dificultad,
      enunciado: p.enunciado,
      opciones,
      correcta: posiciones[i],
      explicacion: p.explicacion,
      fuente: p.fuente,
    };
  });
  const abierta = (prefijo: string) => (p: CandAbierta, i: number): PreguntaAbierta => ({
    id: `${prefijo}${i + 1}`,
    dificultad: p.dificultad,
    enunciado: p.enunciado,
    respuesta: p.respuesta,
    explicacion: p.explicacion,
    fuente: p.fuente,
  });

  const avisos: string[] = [];
  const falta = (n: number, objetivo: number, que: string) => {
    if (n < objetivo) avisos.push(`El documento solo da para ${n} ${que} distintas sin repetir contenido (se pedían ${objetivo}).`);
  };
  falta(preguntasTest.length, OBJETIVO.test, "preguntas tipo test");
  falta(cortas.length, OBJETIVO.cortas, "preguntas cortas");
  falta(desarrollo.length, OBJETIVO.desarrollo, "preguntas de desarrollo");
  if (!ejercicios.length) avisos.push("El contenido no incluye fórmulas, cálculos ni clasificaciones con los que plantear ejercicios prácticos.");
  else if (ejercicios.length < OBJETIVO.ejercicios) avisos.push(`El contenido solo permite ${ejercicios.length} ejercicios prácticos distintos.`);

  return {
    titulo,
    test: preguntasTest,
    cortas: porDificultad(cortas).map(abierta("c")),
    desarrollo: porDificultad(desarrollo).map(abierta("d")),
    ejercicios: porDificultad(ejercicios).map((p, i) => ({
      id: `e${i + 1}`,
      dificultad: p.dificultad,
      enunciado: p.enunciado,
      datos: p.datos,
      respuesta: p.respuesta,
      explicacion: p.explicacion,
      fuente: p.fuente,
    })),
    avisos,
  };
}

/** Examen completo a partir de los apartados del resumen. */
export function examenExtractivo(titulo: string, secciones: SeccionResumen[], seed: string): Examen {
  return examenDesdeContenido(titulo, extraer(secciones), seed);
}

export { LETRAS };
