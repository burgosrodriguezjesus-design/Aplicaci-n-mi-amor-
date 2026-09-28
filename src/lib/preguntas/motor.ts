/**
 * Preguntas sobre un documento, sin IA: la respuesta sale siempre del
 * propio PDF, con la página de donde viene.
 *
 * Primero se entiende qué se pregunta (qué es algo, qué tipos hay, cómo se
 * calcula, por qué, una cifra, una diferencia, un resumen, preguntas de
 * repaso…) y se busca en lo que el resumen ya tiene ordenado: definiciones,
 * clasificaciones, fórmulas, datos y apartados. Si no encaja en nada de eso,
 * se buscan los fragmentos del documento que más se parecen a la pregunta
 * (resumen y texto de las páginas). Si el documento no habla de ello, se
 * dice claramente, sin inventar.
 */
import {
  type Apartado,
  type Contenido,
  type Definicion,
  type Formula,
  type Lista,
  type Lugar,
  type SeccionResumen,
  extraer,
  frases as partirFrases,
  limpiar,
  mayuscula,
  sinPunto,
  tituloSinNumero,
  variables,
} from "../examen/extraer";
import { examenDesdeContenido } from "../examen/generar";

export type PaginaTexto = { numero: number; texto: string };

/* ── Palabras ───────────────────────────────────────────────────── */

const VACIAS = new Set(
  (
    "a al algo algun alguna algunas alguno algunos ante antes aqui asi aun bajo bien cada vez veces como con contra cual cuales cuando " +
    "de del desde donde dos el ella ellas ellos en entre era es esa esas ese eso esos esta estan estas este esto estos fue " +
    "ha hay la las le les lo los mas me mi mis mucho muy nada ni no nos o os otra otras otro otros para pero poco por porque " +
    "que quien se ser si sin sobre son su sus tambien tan tanto te tiene tienen todo todos tu tus un una uno unos unas y ya yo " +
    // palabras de pregunta y de petición
    "dime explica explicame explicar explicas define definir definicion significa significado entiende entender concepto " +
    "cuanto cuanta cuantos cuantas cual cuales quien quienes podrias puedes puede quiero quisiera saber sabes favor hola gracias " +
    "hace hacer haz documento tema texto apuntes libro segun pdf dice habla hablame cuentame consiste consisten sirve sirven " +
    "debe deben tipo tipos clase clases existen existe forma formas manera"
  ).split(" "),
);

export function norma(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ%√]+/g, " ")
    .trim();
}

/** Raíz aproximada: "impositivos" e "impositivo" → "imposit". */
export function raiz(palabra: string) {
  let w = palabra;
  if (w.length <= 4) return w;
  for (const suf of [
    "aciones", "iciones", "ciones", "cion", "mente", "idades", "idad", "ivos", "ivas", "ivo", "iva", "ales",
    // formas verbales: "revisan", "revisarán", "revisado", "calculando"…
    "aran", "eran", "iran", "ando", "iendo", "ados", "adas", "idos", "idas", "ado", "ada", "ido", "ida", "an", "en", "ar", "er", "ir",
    "es", "s",
  ]) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  return w.slice(0, 7);
}

/** Palabras con contenido de un texto, ya reducidas a su raíz. */
export function claves(texto: string) {
  return norma(texto)
    .split(" ")
    .filter((w) => w && (w.length > 2 || /\d/.test(w)) && !VACIAS.has(w))
    .map(raiz);
}

/** Qué parte de `buscadas` aparece en `texto` (0-1). */
function cobertura(buscadas: string[], texto: string) {
  if (!buscadas.length) return 0;
  const en = new Set(claves(texto));
  return buscadas.filter((b) => en.has(b)).length / buscadas.length;
}

/* ── Fragmentos para buscar ─────────────────────────────────────── */

type Fragmento = { texto: string; pagina: number | null; apartado: string; origen: "resumen" | "pdf"; claves: string[] };

function fragmentosDe(c: Contenido, paginas: PaginaTexto[]): Fragmento[] {
  const salida: Fragmento[] = [];
  for (const a of c.apartados) {
    for (const f of a.frases) salida.push({ texto: f, pagina: a.pagina, apartado: a.titulo, origen: "resumen", claves: claves(`${f} ${a.titulo}`) });
  }
  // El texto de las páginas, por si el resumen no recoge un detalle.
  for (const p of paginas) {
    const parrafos = p.texto.split(/\n\s*\n/).flatMap((par) => {
      const fr = partirFrases(par.replace(/\s+/g, " ").trim());
      const trozos: string[] = [];
      for (let i = 0; i < fr.length; i += 2) trozos.push(fr.slice(i, i + 2).join(" "));
      return trozos;
    });
    for (const t of parrafos) {
      if (t.split(/\s+/).length < 5 || t.length > 900) continue;
      salida.push({ texto: t, pagina: p.numero, apartado: "", origen: "pdf", claves: claves(t) });
    }
  }
  return salida;
}

/** Puntuación BM25 de cada fragmento para la pregunta. */
function buscar(fragmentos: Fragmento[], pregunta: string[], cuantos = 4, prefiere?: RegExp) {
  if (!pregunta.length || !fragmentos.length) return [];
  const N = fragmentos.length;
  const df = new Map<string, number>();
  for (const f of fragmentos) for (const k of new Set(f.claves)) df.set(k, (df.get(k) ?? 0) + 1);
  const media = fragmentos.reduce((s, f) => s + f.claves.length, 0) / N;
  const terminos = [...new Set(pregunta)];
  const puntuados = fragmentos.map((f) => {
    const tf = new Map<string, number>();
    for (const k of f.claves) tf.set(k, (tf.get(k) ?? 0) + 1);
    let puntos = 0;
    let presentes = 0;
    for (const t of terminos) {
      const n = tf.get(t) ?? 0;
      if (!n) continue;
      presentes++;
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      puntos += (idf * n * 2.2) / (n + 1.2 * (0.25 + 0.75 * (f.claves.length / media)));
    }
    // Lo del resumen está limpio y ordenado: un poco de ventaja.
    if (f.origen === "resumen") puntos *= 1.15;
    // "¿Cuándo…?" prefiere fechas y plazos; "¿cuánto…?", cifras.
    if (prefiere && prefiere.test(norma(f.texto))) puntos *= 1.8;
    return { f, puntos, presentes: presentes / terminos.length };
  });
  // Primero las que contienen más de lo preguntado; entre ellas, las más relevantes.
  const escalon = (x: number) => Math.round(x * 4) / 4;
  return puntuados
    .filter((p) => p.puntos > 0)
    .sort((a, b) => escalon(b.presentes) - escalon(a.presentes) || b.puntos - a.puntos)
    .slice(0, cuantos * 3);
}

/* ── Formato de la respuesta ────────────────────────────────────── */

function pag(p: number | null | undefined) {
  return p ? ` (pág. ${p})` : "";
}

function fuente(l: Lugar) {
  const apartado = tituloSinNumero(l.apartado);
  return `\n\n*Fuente: ${apartado ? `«${apartado}»` : "el documento"}${l.pagina ? `, pág. ${l.pagina}` : ""}.*`;
}

function parecido(a: string, b: string) {
  const x = new Set(claves(a));
  const y = new Set(claves(b));
  if (!x.size || !y.size) return 0;
  let comunes = 0;
  for (const k of x) if (y.has(k)) comunes++;
  return comunes / Math.min(x.size, y.size);
}

/* ── Qué se pregunta ────────────────────────────────────────────── */

type Intencion = "saludo" | "gracias" | "resumen" | "repaso" | "definicion" | "tipos" | "formula" | "porque" | "diferencia" | "cifra" | "explica" | "general";

function intencion(p: string): Intencion {
  const t = norma(p);
  if (/^(hola|buenas|buenos dias|buenas tardes|hey|que tal)\b/.test(t) && t.split(" ").length <= 4) return "saludo";
  if (/^(gracias|muchas gracias|genial|perfecto|vale|ok)\b/.test(t) && t.split(" ").length <= 4) return "gracias";
  if (/\b(preguntas|examina|examiname|ponme a prueba|pon me a prueba|test|repaso|preguntame)\b/.test(t) && !/\bque es\b/.test(t)) return "repaso";
  if (/\b(resume|resumen|resumeme|ideas clave|ideas principales|de que trata|de que va|lo mas importante|puntos clave)\b/.test(t)) return "resumen";
  if (/\b(diferencia|diferencias|diferenciar|distinguir|compara|comparar|comparacion)\b/.test(t) || /\bentre .+ y .+/.test(t) && /\b(que|cual)\b/.test(t)) return "diferencia";
  if (/\b(como se calcula|como se obtiene|como calculo|como se halla|formula|formulas|calcular|ecuacion|expresion)\b/.test(t)) return "formula";
  if (/\bpor que\b|\bpor que razon\b|\bmotivo\b/.test(t)) return "porque";
  if (/\b(tipos|clases|clasifica|clasifican|clasificacion|cuales son|que .* (hay|existen)|enumera|elementos|partes|fases|etapas|categorias)\b/.test(t)) return "tipos";
  if (/^(que|quien) (es|son|significa|era|fue)\b|\b(define|definicion|significa|que se entiende|concepto de|a que se refiere)\b/.test(t)) return "definicion";
  if (/\b(cuanto|cuanta|cuantos|cuantas|cuando|plazo|porcentaje|que numero|que cifra|fecha|ano|tanto por ciento)\b/.test(t)) return "cifra";
  if (/\b(explica|explicame|hablame|cuentame|que dice|en que consiste|de que habla|que sabes)\b/.test(t)) return "explica";
  return "general";
}

/** La parte de la pregunta que nombra el tema: "¿Qué es el stock de seguridad?" → "stock de seguridad". */
function tema(p: string) {
  return p
    .replace(/[¿?¡!.]/g, " ")
    .replace(/^\s*(y\s+)?(dime|explicame|explícame|explica|define|háblame de|hablame de|cuéntame|cuentame|qué|que|cuál|cual|cuáles|cuales|cómo|como|por qué|porque|cuántos|cuantos|cuántas|cuantas|cuánto|cuanto)\b/i, " ")
    .replace(/\b(es|son|significa|se entiende por|se calcula|se obtiene|la fórmula de|la formula de|los tipos de|las clases de|tipos de|clases de|el concepto de|la definición de|la definicion de)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── El documento, preparado una vez ────────────────────────────── */

export type Documento = {
  titulo: string;
  contenido: Contenido;
  fragmentos: Fragmento[];
};

export function prepararDocumento(titulo: string, secciones: SeccionResumen[], paginas: PaginaTexto[]): Documento {
  const contenido = extraer(secciones);
  return { titulo, contenido, fragmentos: fragmentosDe(contenido, paginas) };
}

/** Lo mejor de una lista según cuánto se parece su nombre a lo preguntado. */
function mejor<T>(lista: T[], nombre: (x: T) => string, buscado: string[], minimo = 0.5) {
  let elegido: T | null = null;
  let puntos = 0;
  for (const x of lista) {
    const suyo = claves(nombre(x));
    if (!suyo.length) continue;
    const enPregunta = suyo.filter((k) => buscado.includes(k)).length;
    // Cuánto del nombre sale en la pregunta y cuánto de la pregunta en el nombre.
    let p = (enPregunta / suyo.length) * 0.6 + (enPregunta / Math.max(1, buscado.length)) * 0.4;
    // La sigla entre paréntesis o el nombre exacto: es justo eso ("IVA").
    const sigla = /\(([^)]+)\)/.exec(nombre(x))?.[1];
    if (sigla && claves(sigla).join(" ") === buscado.join(" ")) p += 0.5;
    if (suyo.join(" ") === buscado.join(" ")) p += 0.3;
    if (p > puntos) {
      puntos = p;
      elegido = x;
    }
  }
  return puntos >= minimo ? elegido : null;
}

function definicionTexto(d: Definicion) {
  return `**${mayuscula(d.termino)}:** ${sinPunto(d.definicion)}.`;
}

/** Lo que el documento añade justo después de una definición (sin pasar a otro concepto). */
function detallesDe(doc: Documento, d: Definicion, cuantos = 2) {
  const apartado = doc.contenido.apartados.find((a) => a.titulo === d.apartado && a.unidad === d.unidad);
  const frases = apartado?.frases ?? [];
  const i = frases.findIndex((f) => parecido(f, d.frase) > 0.8);
  if (i < 0) return [];
  const otras = doc.contenido.definiciones.filter((o) => o !== d).map((o) => o.frase);
  const salida: string[] = [];
  for (const f of frases.slice(i + 1)) {
    if (salida.length >= cuantos || otras.some((o) => parecido(o, f) > 0.8)) break;
    if (parecido(f, d.frase) > 0.7) continue;
    salida.push(f);
  }
  return salida;
}

function listaTexto(l: Lista) {
  const cabeza = `${mayuscula(sinPunto(l.intro)).replace(/\s(en|como|son)$/i, (m) => m)}:`;
  return [cabeza, ...l.elementos.map((e) => `- **${e.nombre}**${e.detalle ? `: ${sinPunto(e.detalle)}.` : ""}`)].join("\n");
}

function formulaTexto(f: Formula) {
  const linea = `**${f.texto}**${f.contexto ? ` (${f.contexto})` : ""}${pag(f.pagina)}`;
  return f.procedimiento ? `Se obtiene ${sinPunto(f.procedimiento)}:\n${linea}` : linea;
}

/** "Donde: P es la potencia (W)…", una sola vez para todas las fórmulas. */
function simbolosDe(formulas: Formula[], c: Contenido) {
  const usados = formulas.flatMap((f) => [f.nombre, ...variables(f.expr)]).filter((v, i, a) => a.indexOf(v) === i && c.simbolos[v]);
  if (!usados.length) return "";
  return `\n\nDonde:\n${usados.map((v) => `- **${v}**: ${c.simbolos[v].nombre}${c.simbolos[v].unidad ? ` (se mide en ${c.simbolos[v].unidad})` : ""}.`).join("\n")}`;
}

function apartadoTexto(a: Apartado) {
  return [`**${tituloSinNumero(a.titulo)}**${pag(a.pagina)}`, ...a.frases.slice(0, 8).map((f) => `- ${sinPunto(f)}.`)].join("\n");
}

function noEncontrado(doc: Documento) {
  const ideas = sugerencias(doc, 3);
  return (
    `No encuentro nada sobre eso en «${doc.titulo}». Solo puedo responder con lo que dice el documento.` +
    (ideas.length ? `\n\nPuedes preguntarme, por ejemplo:\n${ideas.map((s) => `- ${s}`).join("\n")}` : "")
  );
}

/* ── Respuesta ─────────────────────────────────────────────────── */

export function responderSinIa(doc: Documento, pregunta: string, anteriores: string[] = []): string {
  const c = doc.contenido;
  let buscado = claves(tema(pregunta));
  // "¿Y el reducido?": una pregunta muy corta sigue el hilo de la anterior.
  const previa = anteriores.at(-1);
  if (previa && buscado.length <= 1 && /^\s*(y|¿y)\b/i.test(pregunta)) buscado = [...new Set([...buscado, ...claves(tema(previa))])];
  const todas = claves(pregunta);
  const tipo = intencion(pregunta);

  if (tipo === "saludo") {
    return `¡Hola! Pregúntame lo que quieras sobre «${doc.titulo}». Por ejemplo:\n${sugerencias(doc, 4).map((s) => `- ${s}`).join("\n")}`;
  }
  if (tipo === "gracias") return "¡De nada! Si tienes otra duda del documento, pregúntame.";

  if (tipo === "resumen") {
    const unidades = [...new Set(c.apartados.map((a) => a.unidad))];
    const partes = [`**«${doc.titulo}»** trata de:`];
    for (const u of unidades.slice(0, 12)) {
      const aps = c.apartados.filter((a) => a.unidad === u && a.titulo !== u).map((a) => tituloSinNumero(a.titulo));
      partes.push(`- **${tituloSinNumero(u)}**${aps.length ? `: ${aps.slice(0, 6).join("; ").toLowerCase()}` : ""}.`);
    }
    const clave = c.definiciones.slice(0, 5);
    if (clave.length) partes.push("", "**Ideas clave:**", ...clave.map((d) => `- ${definicionTexto(d)}${pag(d.pagina)}`));
    if (c.formulas.length) partes.push("", "**Fórmulas:**", ...c.formulas.slice(0, 4).map((f) => `- ${f.texto}${pag(f.pagina)}`));
    return partes.join("\n");
  }

  if (tipo === "repaso") {
    const examen = examenDesdeContenido(doc.titulo, c, `${Date.now()}`);
    const preguntas = [...examen.cortas, ...examen.desarrollo].slice(0, 5);
    if (!preguntas.length) return noEncontrado(doc);
    return [
      "Aquí tienes 5 preguntas de repaso. Intenta responderlas y después mira las soluciones:",
      "",
      ...preguntas.map((p, i) => `${i + 1}. ${p.enunciado}`),
      "",
      "**Soluciones**",
      ...preguntas.map((p, i) => `${i + 1}. ${p.respuesta.split("\n").slice(0, 4).join(" ").replace(/^Puntos que debe contener la respuesta:\s*/, "")}${pag(p.fuente.pagina)}`),
      "",
      "*En la pestaña «Examen» del documento tienes un examen completo.*",
    ].join("\n");
  }

  if (tipo === "diferencia") {
    const partes = tema(pregunta).split(/\s+(?:y|e|frente a|con|vs\.?)\s+/i).map((x) => claves(x.replace(/\b(entre|diferencia|diferencias)\b/gi, "")));
    const encontrados = partes
      .map((k) => mejor(c.definiciones, (d) => d.termino, k, 0.45))
      .filter((d): d is Definicion => Boolean(d));
    const unicos = encontrados.filter((d, i) => encontrados.indexOf(d) === i);
    if (unicos.length >= 2) {
      return [
        "Según el documento:",
        "",
        ...unicos.map((d) => `- ${definicionTexto(d)}${pag(d.pagina)}`),
        "",
        `La diferencia está en lo que hace cada uno: ${unicos.map((d) => `«${d.termino}» ${sinPunto(d.definicion).charAt(0).toLowerCase()}${sinPunto(d.definicion).slice(1)}`).join("; mientras que ")}.`,
      ].join("\n");
    }
  }

  if (tipo === "formula" || (tipo === "definicion" && /\bformula\b/.test(norma(pregunta)))) {
    const candidatas = c.formulas.filter((f) => {
      const nombre = `${f.nombre} ${c.simbolos[f.nombre]?.nombre ?? ""} ${f.contexto ?? ""}`;
      return cobertura(claves(nombre), tema(pregunta)) > 0 || cobertura(buscado, nombre) >= 0.5;
    });
    const ordenadas = candidatas
      .map((f) => ({ f, p: cobertura(buscado, `${f.nombre} ${c.simbolos[f.nombre]?.nombre ?? ""} ${f.contexto ?? ""} ${f.frase}`) }))
      .sort((a, b) => b.p - a.p);
    if (ordenadas.length && ordenadas[0].p >= 0.34) {
      // Si hay varias del mismo nombre (continua, alterna, trifásica…), todas
      // salvo que se pregunte por una en concreto.
      const top = ordenadas[0].p;
      const elegidas = ordenadas.filter((o) => o.p >= top - 0.01).map((o) => o.f).slice(0, 4);
      return elegidas.map((f) => formulaTexto(f)).join("\n\n") + simbolosDe(elegidas, c) + fuente(elegidas[0]);
    }
  }

  if (tipo === "porque") {
    const r = mejor(c.razones, (x) => x.pregunta, buscado, 0.45);
    if (r) return `${r.respuesta}.${fuente(r)}`;
  }

  if (tipo === "tipos") {
    const l = mejor(c.listas, (x) => `${x.intro} ${x.apartado}`, buscado, 0.3);
    if (l) return `${listaTexto(l)}${fuente(l)}`;
  }

  if (tipo === "definicion" || tipo === "general" || tipo === "explica") {
    const d = mejor(c.definiciones, (x) => x.termino, buscado, tipo === "definicion" ? 0.5 : 0.7);
    if (d) {
      const extra = detallesDe(doc, d);
      return [definicionTexto(d), ...(extra.length ? ["", ...extra.map((f) => `- ${sinPunto(f)}.`)] : [])].join("\n") + fuente(d);
    }
    // ¿Es el nombre de un apartado? Se explica el apartado entero.
    const a = mejor(c.apartados, (x) => tituloSinNumero(x.titulo), buscado, 0.6);
    if (a && a.frases.length) return `${apartadoTexto(a)}${fuente(a)}`;
    // ¿O el de un elemento de una clasificación?
    for (const l of c.listas) {
      const e = mejor(l.elementos, (x) => x.nombre, buscado, 0.5);
      if (e) {
        const otros = l.elementos.filter((x) => x !== e).map((x) => x.nombre);
        return `**${e.nombre}**${e.detalle ? `: ${sinPunto(e.detalle)}.` : "."}\n\nEs uno de los elementos de «${tituloSinNumero(l.apartado)}»${otros.length ? `, junto con ${otros.join(", ").replace(/, ([^,]*)$/, " y $1")}` : ""}.${fuente(l)}`;
      }
    }
  }

  // Búsqueda en todo el documento.
  const consulta = buscado.length ? buscado : todas;
  const t = norma(pregunta);
  const prefiere = /\bcuando\b|\bplazo|cada cuant|frecuencia|con que frecuencia|cuanto tiempo/.test(t)
    ? /\b(dias?|mes(es)?|anos?|anual\w*|mensual\w*|trimestr\w*|semana\w*|horas?|vez|veces|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|plazo|cada|antes|despues|hasta)\b/
    : /\b(cuanto|cuanta|cuantos|cuantas|porcentaje|cifra|numero)\b/.test(t)
      ? /\d/
      : undefined;
  const resultados = buscar(doc.fragmentos, consulta, 4, prefiere);
  if (!resultados.length) return noEncontrado(doc);
  const mejorRes = resultados[0];
  // Tiene que aparecer buena parte de lo preguntado; si no, no está en el documento.
  const exigido = consulta.length >= 4 ? 0.5 : consulta.length >= 2 ? 0.5 : 1;
  if (mejorRes.presentes < exigido) return noEncontrado(doc);
  const elegidos: Fragmento[] = [];
  for (const r of resultados) {
    if (elegidos.length >= 3 || (r.presentes >= mejorRes.presentes && r.puntos < mejorRes.puntos * 0.45)) break;
    if (r.presentes < exigido * 0.8 || r.presentes < mejorRes.presentes - 0.2) continue;
    if (elegidos.some((e) => parecido(e.texto, r.f.texto) > 0.6)) continue;
    elegidos.push(r.f);
  }
  return [
    `Esto es lo que dice el documento${tipo === "cifra" ? " sobre ese dato" : ""}:`,
    "",
    ...elegidos.map((f) => `- ${sinPunto(limpiar(f.texto))}.${pag(f.pagina)}`),
  ].join("\n");
}

/* ── Sugerencias sacadas del propio documento ───────────────────── */

/** "el stock de seguridad", "las existencias": el término con el artículo con que lo usa el documento. */
export function conArticulo(termino: string, frase: string) {
  const escapado = termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`\\b(el|la|los|las)\\s+${escapado}`, "i").exec(frase);
  const nombre = /^[A-ZÁÉÍÓÚ]{2,}/.test(termino) ? termino : termino.charAt(0).toLowerCase() + termino.slice(1);
  return m ? { texto: `${m[1].toLowerCase()} ${nombre}`, plural: /^l[ao]s$/i.test(m[1]) } : { texto: `«${nombre}»`, plural: false };
}

export function sugerencias(doc: Documento, cuantas = 4): string[] {
  const c = doc.contenido;
  const ideas: string[] = [];
  const d = [...c.definiciones].filter((x) => x.termino.split(/\s+/).length <= 5).sort((a, b) => a.termino.length - b.termino.length)[0];
  if (d) {
    const t = conArticulo(d.termino, d.frase);
    ideas.push(`¿Qué ${t.plural ? "son" : "es"} ${t.texto}?`);
  }
  const l = c.listas.find((x) => x.elementos.length >= 3);
  if (l) {
    const clasifica = /^(.+?)\s+se\s+(clasifican|dividen|agrupan|distinguen)\s+en$/i.exec(sinPunto(l.intro));
    const titulo = tituloSinNumero(l.apartado);
    ideas.push(
      clasifica
        ? `¿En qué se ${clasifica[2]} ${clasifica[1].replace(/^.*?,\s*/, "").replace(/^[A-ZÁÉÍÓÚ]/, (m) => m.toLowerCase())}?`
        : /^(tipos|clases)\b/i.test(titulo)
          ? `¿Cuáles son los ${titulo.toLowerCase()}?`
          : `¿Qué incluye «${titulo}»?`,
    );
  }
  const f = c.formulas[0];
  if (f) {
    const simbolo = c.simbolos[f.nombre];
    ideas.push(`¿Cómo se calcula ${simbolo ? `la ${simbolo.nombre}` : conArticulo(f.nombre, f.frase).texto}?`);
  }
  const r = [...c.razones].sort((a, b) => a.pregunta.length - b.pregunta.length)[0];
  if (r) ideas.push(r.pregunta);
  ideas.push("Resúmeme el documento", "Hazme preguntas de repaso");
  return ideas.slice(0, cuantas);
}
