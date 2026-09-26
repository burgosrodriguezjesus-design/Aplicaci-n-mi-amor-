/**
 * Lee el resumen de un documento y saca lo que se puede preguntar en un
 * examen: definiciones, clasificaciones, datos con cifras, fórmulas,
 * procedimientos ("se obtiene restando…") y las frases de cada apartado.
 *
 * Solo el temario: los recuadros de ejemplo, curiosidad, actividades y las
 * aclaraciones añadidas no cuentan (no son contenido del PDF).
 */

export type Lugar = { apartado: string; unidad: string; pagina: number | null };

export type Definicion = Lugar & { id: string; termino: string; definicion: string; frase: string };
export type Elemento = { nombre: string; detalle: string };
export type Lista = Lugar & { id: string; intro: string; elementos: Elemento[]; frase: string };
export type Dato = Lugar & { id: string; frase: string };
/** Pregunta de razonamiento: "¿Por qué…?" con su respuesta, sacada de la frase. */
export type Razon = Lugar & { id: string; pregunta: string; respuesta: string; frase: string };
/** Fórmula como árbol: variables (texto) y operaciones. */
export type Expr =
  | { t: "var"; nombre: string }
  | { t: "num"; valor: number; texto: string }
  | { t: "op"; op: "+" | "-" | "*" | "/"; a: Expr; b: Expr };
export type Formula = Lugar & {
  id: string;
  nombre: string;
  expr: Expr;
  texto: string;
  frase: string;
  procedimiento?: string;
  /** "en trifásica", "en corriente continua": cuándo se usa esa fórmula. */
  contexto?: string;
};
export type Apartado = Lugar & { id: string; titulo: string; frases: string[] };

/** Lo que significa un símbolo según el propio documento: V → tensión eléctrica (V). */
export type Simbolo = { nombre: string; unidad: string };

export type Contenido = {
  /** Símbolos que el documento explica ("se representa con la letra V…"). */
  simbolos: Record<string, Simbolo>;
  definiciones: Definicion[];
  listas: Lista[];
  datos: Dato[];
  razones: Razon[];
  formulas: Formula[];
  apartados: Apartado[];
};

export type SeccionResumen = { titulo: string; markdown: string; paginas: number[] };

/* ── Texto ─────────────────────────────────────────────────────── */

export function limpiar(texto: string) {
  return texto
    .replace(/\*\*|__|`/g, "")
    .replace(/\[\[pag\. \d+\]\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function mayuscula(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function sinPunto(texto: string) {
  return texto.trim().replace(/[.;:,]+$/, "").trim();
}

/** Separa en frases sin romper abreviaturas (p. ej., S.L., art.). */
export function frases(texto: string): string[] {
  return texto
    .replace(/\b(etc|p\.\s?ej|art|arts|núm|pág|págs|aprox|Sr|Sra|Dr|Dra|Ud|Uds|S\.\s?[AL]|S\.\s?Coop)\./gi, (m) => m.replace(/\./g, "§"))
    .split(/(?<=[.!?;])\s+(?=[¿¡"«(]?[A-ZÁÉÍÓÚÑ0-9])/)
    .map((f) => f.replace(/§/g, ".").trim())
    .filter((f) => f.length > 3);
}

/** "1.2 Intensidad de corriente" → "Intensidad de corriente". */
export function tituloSinNumero(titulo: string) {
  return titulo.replace(/^(?:tema|unidad|cap[ií]tulo|bloque)?\s*[\divxlc]+(?:\.\d+)*[.)]?\s*[-–—.:]?\s*/i, "").trim() || titulo;
}

const PAGINA_RE = /\s*\((?:p[aá]gs?\.?|p\.)\s*(\d+)(?:\s*[-–]\s*\d+)?\)\s*$/i;
const ARTICULO = /^(?:el|la|los|las|un|una|unos|unas|lo)\s+/i;

function sinArticulo(texto: string) {
  return texto.replace(ARTICULO, "").trim();
}

/** Recuadros que no son temario del PDF. */
const RECUADRO_FUERA = /^(ejemplo|curiosidad|practica|aclaracion|duda|consejo|nota)$/i;

const VERBO_DEFINE = "es|son|se define como|se definen como|consiste en|consisten en|se denomina|se denominan|se llama|se llaman|se entiende por|se considera|se consideran|representa|representan|constituye|constituyen";
/** Verbos que dicen para qué sirve algo: "el método FIFO valora…". */
const VERBO_FUNCION = "calcula|calculan|valora|valoran|indica|indican|mide|miden|permite|permiten|determina|determinan|regula|regulan|grava|gravan|recoge|recogen|establece|establecen|sirve para|sirven para";
/** Una definición empieza por un determinante o un sustantivo, no por un adjetivo suelto. */
const EMPIEZA_DEFINICION = new RegExp(
  "^(?:el|la|los|las|lo|un|una|unos|unas|aquel|aquella|aquellos|aquellas|aquello|todo|toda|cualquier|" +
    "conjunto|cantidad|proceso|acto|documento|relaci[oó]n|operaci[oó]n|persona|bien|bienes|derecho|contrato|" +
    "impuesto|tributo|m[eé]todo|sistema|t[eé]cnica|forma|parte|elemento|valor|n[uú]mero|periodo|per[ií]odo|" +
    "importe|capacidad|instrumento|organismo|entidad|sociedad|registro|tipo|clase|medida|unidad|herramienta|" +
    "fase|etapa|estudio|ciencia|disciplina|rama|consiste|consisten|se\\s|" +
    VERBO_FUNCION.replace(/ /g, "\\s+") +
    ")",
  "i",
);

/* ── Fórmulas ─────────────────────────────────────────────────── */

const UNIDADES: Record<string, string> = {
  voltio: "V", voltios: "V", amperio: "A", amperios: "A", ohmio: "Ω", ohmios: "Ω", vatio: "W", vatios: "W",
  culombio: "C", culombios: "C", segundo: "s", segundos: "s", metro: "m", metros: "m", julio: "J", julios: "J",
  hercio: "Hz", hercios: "Hz", kilogramo: "kg", kilogramos: "kg", newton: "N", newtons: "N", pascal: "Pa",
  euro: "€", euros: "€", hora: "h", horas: "h", minuto: "min", minutos: "min", kilovatio: "kW", kilovatios: "kW",
};

function unidadDe(palabra: string, simbolo?: string) {
  return simbolo?.trim() || UNIDADES[palabra.toLowerCase()] || palabra;
}

/** Un símbolo de fórmula: "P", "I", "cos(fi)", "rho"… (no una palabra corriente). */
const SIMBOLO_RE = /^(?:[A-Za-zΩρλγ][A-Za-z0-9_]{0,2}|cos\s*\(\s*\w+\s*\)|sen\s*\(\s*\w+\s*\)|rho|gamma|lambda|delta|fi|phi)$/;

/**
 * Fórmulas escritas dentro de una frase: "En corriente continua se calcula
 * como P = V x I.", "V = I x R De esta expresión se deducen: I = V / R y
 * R = V / I", "I = Q / t, donde Q es la carga…".
 */
function formulasEn(frase: string): { izquierda: string; derecha: string }[] {
  const salida: { izquierda: string; derecha: string }[] = [];
  // "Nombre largo = expresión" ocupando toda la línea.
  const entera = /^([^=:]{3,60}?)\s*=\s*([^=]+)$/.exec(frase);
  if (entera && !/\b(se calcula|es|son|como)\b/i.test(entera[1]) && entera[1].split(/\s+/).length <= 6) {
    return [{ izquierda: entera[1], derecha: entera[2] }];
  }
  const re = /(?:^|[\s:(])([A-Za-zΩρλγ][A-Za-z0-9_]{0,2})\s*=\s*/g;
  const marcas = [...frase.matchAll(re)];
  for (const [i, m] of marcas.entries()) {
    const inicio = (m.index ?? 0) + m[0].length;
    const fin = marcas[i + 1] ? (marcas[i + 1].index ?? frase.length) : frase.length;
    let derecha = frase.slice(inicio, fin);
    derecha = derecha
      .split(/,\s*(?:donde|siendo)\b|\.\s|;|\s+(?:De|Donde|Siendo|Es|Se)\s/)[0]
      .replace(/\s+(?:y|e|o)\s*$/i, "")
      .replace(/[.,:\s]+$/, "");
    if (derecha) salida.push({ izquierda: m[1], derecha });
  }
  return salida;
}

/** "donde Q es la carga en culombios y t el tiempo en segundos" → Q y t. */
function simbolosDeDonde(frase: string): [string, Simbolo][] {
  const donde = /\b(?:donde|siendo)\s+(.+)$/i.exec(frase);
  if (!donde) return [];
  return donde[1]
    .split(/,\s*|\s+y\s+/)
    .map((trozo) => /^([A-Za-zΩρλγ]\w{0,2})\s+(?:es\s+|son\s+)?(?:el|la|los|las)\s+(.+?)(?:\s+(?:en|expresad[oa] en)\s+([a-záéíóú]+))?\.?$/i.exec(trozo.trim()))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => [m[1], { nombre: m[2].trim(), unidad: m[3] ? unidadDe(m[3]) : "" }]);
}

/** "stock de seguridad + consumo medio diario × plazo de entrega" → árbol. */
export function leerExpresion(texto: string): Expr | null {
  const fichas: string[] = [];
  const limpio = texto
    .replace(/\s[x·]\s/g, " × ")
    .replace(/−/g, "-")
    .replace(/÷/g, "/");
  // "cos(fi)" y "sen(x)" son un solo término.
  const re = /\s*((?:cos|sen|tg)\s*\(\s*\w+\s*\))\s*|\s*([()+\-×*/])\s*|([^()+\-×*/]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(limpio))) {
    if (m[1]) fichas.push(m[1].replace(/\s+/g, ""));
    else if (m[2]) fichas.push(m[2] === "×" ? "*" : m[2]);
    else if (m[3]?.trim()) fichas.push(m[3].trim());
  }
  let i = 0;
  const primario = (): Expr | null => {
    const f = fichas[i++];
    if (f === undefined) return null;
    if (f === "(") {
      const dentro = suma();
      if (fichas[i++] !== ")") return null;
      return dentro;
    }
    if ("+-*/)".includes(f)) return null;
    const raiz = /^(?:ra[ií]z(?:\s+cuadrada)?\s+de|√)\s*(\d+(?:[.,]\d+)?)$/i.exec(f);
    if (raiz) return { t: "num", valor: Math.sqrt(Number(raiz[1].replace(",", "."))), texto: `√${raiz[1]}` };
    const numero = /^(\d+(?:[.,]\d+)?)\s*(%?)$/.exec(f);
    if (numero) {
      const valor = Number(numero[1].replace(",", "."));
      return { t: "num", valor: numero[2] ? valor / 100 : valor, texto: f };
    }
    if (/^(?:cos|sen|tg)\(\w+\)$/.test(f)) return { t: "var", nombre: f };
    if (!/\p{L}/u.test(f) || f.length > 60 || f.split(/\s+/).length > 7) return null;
    return { t: "var", nombre: sinArticulo(f) };
  };
  const producto = (): Expr | null => {
    let a = primario();
    while (a && (fichas[i] === "*" || fichas[i] === "/")) {
      const op = fichas[i++] as "*" | "/";
      const b = primario();
      if (!b) return null;
      a = { t: "op", op, a, b };
    }
    return a;
  };
  const suma = (): Expr | null => {
    let a = producto();
    while (a && (fichas[i] === "+" || fichas[i] === "-")) {
      const op = fichas[i++] as "+" | "-";
      const b = producto();
      if (!b) return null;
      a = { t: "op", op, a, b };
    }
    return a;
  };
  const arbol = suma();
  if (!arbol || i !== fichas.length || arbol.t !== "op") return null;
  return arbol;
}

const SIMBOLO = { "+": "+", "-": "−", "*": "×", "/": "÷" } as const;
const PRIORIDAD = { "+": 1, "-": 1, "*": 2, "/": 2 } as const;

export function escribir(e: Expr, valores?: Map<string, string>, padre?: "+" | "-" | "*" | "/", derecha = false): string {
  if (e.t === "var") return valores?.get(e.nombre) ?? e.nombre;
  if (e.t === "num") return e.texto;
  const texto = `${escribir(e.a, valores, e.op)} ${SIMBOLO[e.op]} ${escribir(e.b, valores, e.op, true)}`;
  if (!padre) return texto;
  const p = PRIORIDAD[e.op];
  const q = PRIORIDAD[padre];
  // Paréntesis si la operación va antes de lo que toca, o si va a la derecha
  // de una resta o una división: a − (b + c), a ÷ (b × c).
  return p < q || (derecha && p === q && (padre === "-" || padre === "/")) ? `(${texto})` : texto;
}

export function evaluar(e: Expr, valores: Map<string, number>): number {
  if (e.t === "var") return valores.get(e.nombre) ?? NaN;
  if (e.t === "num") return e.valor;
  const a = evaluar(e.a, valores);
  const b = evaluar(e.b, valores);
  return e.op === "+" ? a + b : e.op === "-" ? a - b : e.op === "*" ? a * b : a / b;
}

export function variables(e: Expr): string[] {
  if (e.t === "var") return [e.nombre];
  if (e.t === "num") return [];
  return [...new Set([...variables(e.a), ...variables(e.b)])];
}

/** "La cuota a ingresar se obtiene restando al IVA repercutido el IVA soportado deducible" */
function leerProcedimiento(frase: string): { nombre: string; expr: Expr; procedimiento: string } | null {
  const m = /^(.{3,60}?)\s+se\s+(?:obtiene|obtienen|calcula|calculan|halla|determina)\s+((restando|sumando|multiplicando|dividiendo)\s+(.+?))\.?$/i.exec(frase);
  if (!m) return null;
  const nombre = sinArticulo(m[1]);
  const operacion = m[3].toLowerCase();
  const resto = m[4];
  const v = (t: string): Expr => ({ t: "var", nombre: sinArticulo(t.replace(/^(?:a|al|de|del)\s+/i, "")) });
  let partes: [string, string] | null = null;
  let op: "+" | "-" | "*" | "/" = "+";
  if (operacion === "restando") {
    op = "-";
    const a = /^a(?:l|\s+la|\s+los|\s+las)\s+(.+?)\s+(?:el|la|los|las)\s+(.+)$/i.exec(resto);
    const b = /^(?:el|la|los|las)\s+(.+?)\s+a(?:l|\s+la|\s+los|\s+las)\s+(.+)$/i.exec(resto);
    const c = /^(.+?)\s+menos\s+(.+)$/i.exec(resto);
    if (a) partes = [a[1], a[2]];
    else if (b) partes = [b[2], b[1]];
    else if (c) partes = [c[1], c[2]];
  } else if (operacion === "sumando") {
    const a = /^(.+?)\s+(?:y|más|a)\s+(.+)$/i.exec(resto);
    if (a) partes = [a[1], a[2]];
  } else if (operacion === "multiplicando") {
    op = "*";
    const a = /^(.+?)\s+por\s+(.+)$/i.exec(resto);
    if (a) partes = [a[1], a[2]];
  } else {
    op = "/";
    const a = /^(.+?)\s+(?:entre|por)\s+(.+)$/i.exec(resto);
    if (a) partes = [a[1], a[2]];
  }
  if (!partes) return null;
  const [x, y] = partes.map((p) => p.trim());
  if (!x || !y || x.split(/\s+/).length > 7 || y.split(/\s+/).length > 7) return null;
  return { nombre, expr: { t: "op", op, a: v(x), b: v(y) }, procedimiento: sinPunto(m[2]) };
}

/* ── Lectura del resumen ──────────────────────────────────────── */

export function extraer(secciones: SeccionResumen[]): Contenido {
  const c: Contenido = { simbolos: {}, definiciones: [], listas: [], datos: [], razones: [], formulas: [], apartados: [] };
  let n = 0;
  const id = (p: string) => `${p}${++n}`;
  const vistos = new Set<string>();

  // El tema ("## …") sigue valiendo en las secciones siguientes hasta que
  // empieza otro: cada apartado del resumen se guarda como sección suelta.
  let unidadEnCurso = "";
  for (const seccion of secciones) {
    const tituloSeccion = limpiar(seccion.titulo).replace(PAGINA_RE, "");
    const empiezaTema = /^\s*##\s/.test(seccion.markdown) || !unidadEnCurso;
    let unidad = empiezaTema ? tituloSeccion : unidadEnCurso;
    let apartado = tituloSeccion;
    let pagina: number | null = seccion.paginas[0] ?? null;
    let fuera = /^visi[oó]n general$/i.test(tituloSeccion);
    let actual = null as Apartado | null;
    let lista: Lista | null = null;
    let intro: string | null = null;
    let ultimoTermino: string | null = null;
    let unidadDelApartado = "";
    const lugar = (): Lugar => ({ apartado, unidad, pagina });
    const nuevoApartado = (): Apartado => {
      const a: Apartado = { id: id("a"), titulo: apartado, frases: [], ...lugar() };
      c.apartados.push(a);
      return a;
    };
    if (!fuera) actual = nuevoApartado();

    const lineas = seccion.markdown.split("\n");
    let tabla: string[][] = [];
    const cerrarTabla = () => {
      if (tabla.length >= 2 && !fuera) {
        const [cabecera, ...filas] = tabla;
        const elementos = filas
          .filter((f) => f[0])
          .map((f) => ({ nombre: f[0], detalle: f.slice(1).filter(Boolean).map((x, j) => (cabecera[j + 1] ? `${cabecera[j + 1]}: ${x}` : x)).join("; ") }));
        if (elementos.length >= 3) {
          c.listas.push({ id: id("l"), intro: intro ?? `Tabla de «${apartado}»`, elementos, frase: elementos.map((e) => `${e.nombre}: ${e.detalle}`).join(" · "), ...lugar() });
        }
      }
      tabla = [];
    };

    const siguiente = (k: number) => lineas.slice(k + 1).find((l) => l.trim())?.trim() ?? "";

    for (let k = 0; k < lineas.length; k++) {
      const bruta = lineas[k].trim();
      if (/^\|.*\|$/.test(bruta)) {
        if (/^\|[\s:|-]+\|$/.test(bruta)) continue;
        tabla.push(bruta.slice(1, -1).split("|").map((x) => limpiar(x)));
        continue;
      }
      if (tabla.length) cerrarTabla();
      if (!bruta) {
        // Una línea en blanco cierra la lista (salvo entre la frase que la
        // presenta y su primer elemento).
        if (lista && lista.elementos.length > 0) lista = null;
        continue;
      }

      const titulo = /^(#{1,6})\s+(.*)$/.exec(bruta);
      if (titulo) {
        const nivel = titulo[1].length;
        const texto = limpiar(titulo[2]);
        const pag = PAGINA_RE.exec(texto);
        if (pag) pagina = Number(pag[1]);
        const limpio = texto.replace(PAGINA_RE, "");
        if (nivel <= 2) {
          fuera = /^visi[oó]n general$/i.test(limpio);
          unidad = limpio;
          if (!fuera) unidadEnCurso = limpio;
        } else if (/^(qu[eé] vas a estudiar|conceptos imprescindibles|f[oó]rmulas|c[oó]mo estudiar|glosario|resumen final|ideas clave)$/i.test(limpio)) {
          // Repasos del propio resumen: repiten lo que ya está en su sitio.
          fuera = true;
          continue;
        } else if (/^visi[oó]n general$/i.test(unidad)) fuera = true;
        else fuera = false;
        apartado = limpio;
        unidadDelApartado = "";
        lista = null;
        intro = null;
        if (!fuera) actual = nuevoApartado();
        continue;
      }
      if (fuera) continue;

      // Recuadros: solo los que son temario (recuerda, importante, fórmula…).
      let texto = bruta;
      let recuadro: string | null = null;
      const aviso = /^>\s*(?:\[!([\w-]+)\]\s*)?(.*)$/.exec(bruta);
      if (aviso) {
        recuadro = (aviso[1] ?? "cita").toLowerCase();
        if (RECUADRO_FUERA.test(recuadro)) continue;
        texto = aviso[2];
      }
      const vineta = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(texto);
      const esVineta = Boolean(vineta) && !aviso;
      if (vineta) texto = vineta[1];
      if (!texto.trim()) continue;

      // Qué significa cada símbolo, según el propio texto.
      const plano0 = limpiar(texto);
      const representa = /se\s+representa\s+(?:con|por|mediante)\s+(?:la\s+letra\s+|el\s+s[ií]mbolo\s+)?([A-Za-zΩρλγ]\w{0,2})\b(?:.*?\bsu\s+unidad(?:\s+en\s+el\s+[^,]*?)?\s+es\s+el\s+([a-záéíóú]+)(?:\s*\(([^)]+)\))?)?/i.exec(plano0);
      if (representa) {
        c.simbolos[representa[1]] ??= {
          nombre: tituloSinNumero(apartado).toLowerCase(),
          unidad: representa[2] ? unidadDe(representa[2], representa[3]) : "",
        };
      }
      const suUnidad = /\bsu\s+unidad(?:\s+en\s+el\s+[^,]*?)?\s+es\s+el\s+([a-záéíóú]+)(?:\s*\(([^)]+)\))?/i.exec(plano0);
      if (suUnidad && !representa) unidadDelApartado = unidadDe(suUnidad[1], suUnidad[2]);
      for (const [simbolo, significado] of simbolosDeDonde(plano0)) c.simbolos[simbolo] ??= significado;

      // Fórmulas: "Punto de pedido = stock de seguridad + …" o "P = V x I".
      if (plano0.includes("=")) {
        let alguna = false;
        for (const { izquierda, derecha } of formulasEn(plano0)) {
          if (recuadro !== "formula" && !/[+\-−×x*/÷·]/.test(derecha)) continue;
          const expr = leerExpresion(sinPunto(derecha));
          if (!expr) continue;
          alguna = true;
          const simbolo = SIMBOLO_RE.test(izquierda.trim());
          const nombre = simbolo ? izquierda.trim() : mayuscula(sinArticulo(izquierda.trim()));
          // "P" en el apartado «Potencia eléctrica»: P es la potencia.
          if (simbolo && !c.simbolos[nombre]) {
            const titulo = tituloSinNumero(apartado);
            if (titulo.charAt(0).toLowerCase() === nombre.charAt(0).toLowerCase()) {
              c.simbolos[nombre] = { nombre: titulo.toLowerCase(), unidad: unidadDelApartado };
            }
          }
          // "En trifásica: P = …", "En corriente continua se calcula como P = …".
          const antes = plano0.slice(0, plano0.indexOf(`${izquierda}`)).trim();
          const contexto = /^(en\s+[^,:;]{3,50}?)(?:\s+se\s+(?:calcula|obtiene|introduce)[^:]*)?[:,]?\s*(?:como)?\s*$/i.exec(antes)?.[1]?.toLowerCase();
          const texto = `${nombre} = ${escribir(expr)}`;
          if (!c.formulas.some((f) => f.texto === texto || (f.nombre.toLowerCase() === nombre.toLowerCase() && f.contexto === contexto))) {
            c.formulas.push({ id: id("f"), nombre, expr, texto, frase: plano0, contexto, ...lugar() });
          }
        }
        if (alguna) {
          actual?.frases.push(plano0);
          continue;
        }
      }

      // Elemento de una lista que otra frase presenta ("se clasifican en:").
      if (esVineta && lista) {
        const conEtiqueta = /^\*\*([^*]{2,80}?):?\*\*:?\s*,?\s*(.*)$/.exec(texto);
        let elemento: Elemento;
        if (conEtiqueta) {
          elemento = {
            nombre: sinPunto(limpiar(conEtiqueta[1])),
            detalle: mayuscula(sinPunto(limpiar(conEtiqueta[2]).replace(/^que\s+(?=se\s)/i, ""))),
          };
        } else {
          const plano = sinPunto(limpiar(texto));
          const dos = /^([^:]{2,60}):\s+(.+)$/.exec(plano);
          elemento = dos ? { nombre: dos[1], detalle: dos[2] } : { nombre: plano, detalle: "" };
        }
        if (elemento.nombre.split(/\s+/).length <= 12) lista.elementos.push(elemento);
        actual?.frases.push(limpiar(texto));
        continue;
      }
      lista = null;

      const limpio = limpiar(texto);
      // Frase que presenta una lista.
      if (/:\s*$/.test(limpio) && /^([-*+]|\d+[.)])\s/.test(siguiente(k))) {
        const presenta = sinPunto(frases(limpio).pop() ?? limpio);
        intro = presenta;
        lista = { id: id("l"), intro: presenta, elementos: [], frase: limpio, ...lugar() };
        c.listas.push(lista);
        actual?.frases.push(limpio);
        continue;
      }
      if (/:\s*$/.test(limpio) && /^\|/.test(siguiente(k))) {
        intro = sinPunto(limpio);
        continue;
      }

      for (const f of frases(texto)) {
        const frase = limpiar(f);
        if (frase.split(/\s+/).length < 4) continue;
        const clave = frase.toLowerCase();
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        actual?.frases.push(frase);

        // "**Término:** definición" (glosario o lista suelta).
        const etiqueta = /^\*\*([^*]{2,70}?):\*\*\s*(.+)$|^\*\*([^*]{2,70}?)\*\*:\s*(.+)$/.exec(f.trim());
        const define = new RegExp(`^(?:(?:el|la|los|las|un|una)\\s+)?\\*\\*([^*]{2,70})\\*\\*\\s+(${VERBO_DEFINE}|${VERBO_FUNCION})\\s+(.+)$`, "i").exec(f.trim());
        const razon = /se\s+(?:denomina|denominan|llama|llaman|conoce como)\s+\*\*([^*]{2,60})\*\*\s+(porque|ya que|por)\s+(.+)$/i.exec(f.trim());
        const plano = new RegExp(`^(?:el|la|los|las)\\s+([^,;:]{3,60}?)\\s+(${VERBO_DEFINE}|${VERBO_FUNCION})\\s+(.{15,})$`, "i").exec(frase);
        const procedimiento = leerProcedimiento(frase);

        const porque = /^(.{12,140}?),?\s+(porque|ya que|puesto que|debido a que|dado que)\s+(.{8,})$/i.exec(frase);
        const anota = (termino: string, definicion: string) => {
          // "El IVA repercutido es X y el IVA soportado es Y": dos definiciones.
          const doble = /^(.+?),?\s+y\s+(?:el|la|los|las)\s+([^,]{2,50}?)\s+(?:es|son)\s+(.+)$/i.exec(definicion);
          if (doble) {
            anota(termino, doble[1]);
            anota(mayuscula(doble[2]), doble[3]);
            return;
          }
          const def = sinPunto(definicion);
          if (def.split(/\s+/).length < 3 || !EMPIEZA_DEFINICION.test(def)) return;
          // "Su unidad", "Este método"…: no se entienden fuera de su frase.
          if (/^(su|sus|este|esta|estos|estas|ese|esa|esos|esas|dicho|dicha|dichos|dichas|otro|otra|ello|esto)\b/i.test(termino)) return;
          c.definiciones.push({ id: id("d"), termino, definicion: def, frase, ...lugar() });
          ultimoTermino = termino;
        };

        if (razon) {
          const de = ultimoTermino && ultimoTermino.toLowerCase() !== limpiar(razon[1]).toLowerCase() ? `${mayuscula(ultimoTermino)}: ¿por` : "¿Por";
          c.razones.push({
            id: id("r"),
            pregunta: `${de} qué se denomina «${limpiar(razon[1])}»?`,
            respuesta: `${/^por$/i.test(razon[2]) ? "Por" : "Porque"} ${sinPunto(limpiar(razon[3]))}`,
            frase,
            ...lugar(),
          });
        } else if (etiqueta) {
          anota(limpiar(etiqueta[1] ?? etiqueta[3]), limpiar(etiqueta[2] ?? etiqueta[4]));
        } else if (define) {
          const verbo = /^(es|son)$/i.test(define[2]) ? "" : `${define[2]} `;
          anota(limpiar(define[1]), limpiar(verbo + define[3]));
        } else if (procedimiento) {
          const nombre = mayuscula(procedimiento.nombre);
          if (!c.formulas.some((x) => x.nombre.toLowerCase() === nombre.toLowerCase())) {
            c.formulas.push({ id: id("f"), nombre, expr: procedimiento.expr, texto: `${nombre} = ${escribir(procedimiento.expr)}`, frase, procedimiento: procedimiento.procedimiento, ...lugar() });
          }
        } else if (plano && !/\d/.test(plano[1])) {
          const verbo = /^(es|son)$/i.test(plano[2]) ? "" : `${plano[2]} `;
          anota(mayuscula(plano[1].trim()), verbo + plano[3]);
        }
        if (porque && !razon) {
          // "El IVA es neutral para el empresario, ya que el coste lo soporta…"
          const afirmacion = sinPunto(porque[1]);
          c.razones.push({
            id: id("r"),
            pregunta: `¿Por qué ${afirmacion.charAt(0).toLowerCase()}${afirmacion.slice(1)}?`,
            respuesta: `Porque ${sinPunto(porque[3])}`,
            frase,
            ...lugar(),
          });
        }
        if (/\d|\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|veinte|treinta)\b/i.test(frase)) {
          c.datos.push({ id: id("n"), frase, ...lugar() });
        }
      }
    }
    if (tabla.length) cerrarTabla();
  }

  // Sin repetidos: el mismo término definido dos veces se queda una.
  const terminos = new Set<string>();
  c.definiciones = c.definiciones.filter((d) => {
    const clave = d.termino.toLowerCase().replace(/\s*\([^)]*\)/, "");
    if (terminos.has(clave)) return false;
    terminos.add(clave);
    return true;
  });
  c.listas = c.listas.filter((l) => l.elementos.length >= 2);
  c.apartados = c.apartados.filter((a) => a.frases.length > 0);
  return c;
}
