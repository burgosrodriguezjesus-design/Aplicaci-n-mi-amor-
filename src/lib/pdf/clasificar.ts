/**
 * ¿Qué es temario y qué no?
 *
 * Un libro de texto mezcla la teoría con muchas otras cosas: ejemplos con
 * empresas y personas inventadas, actividades y tests, pies y créditos de
 * fotos, testimonios, datos de la editorial… Si todo eso entra en el resumen
 * como si fuera teoría, salen "definiciones" como «El IVA repercutido es
 * 500 × 21 % = 105 €» o nombres como «Muebles Ortega, S.L.» en el esquema.
 *
 * Estas reglas deciden qué es cada cosa. Código puro: lo usan la detección
 * de la estructura y el resumen.
 */

/** Título de una sección de práctica: "Actividades", "Test de autoevaluación"… */
const PRACTICA_TITULO_RE = new RegExp(
  "^(?:" +
    [
      "actividad(?:es)?(?:\\s+(?:finales|de\\s+(?:repaso|ampliaci[oó]n|refuerzo|evaluaci[oó]n|s[ií]ntesis)|propuestas|complementarias|resueltas))?",
      "ejercicios?(?:\\s+(?:resueltos?|propuestos?|finales|de\\s+repaso|pr[aá]cticos?))?",
      "autoevaluaci[oó]n",
      "test(?:\\s+de\\s+(?:autoevaluaci[oó]n|repaso|evaluaci[oó]n))?",
      "evaluaci[oó]n\\s+final",
      "eval[uú]a\\s+tus\\s+conocimientos",
      "comprueba\\s+(?:lo\\s+que\\s+(?:sabes|has\\s+aprendido)|tu\\s+aprendizaje|tus\\s+conocimientos)",
      "pon\\s+a\\s+prueba\\s+tus\\s+conocimientos",
      "pr[aá]cticas?",
      "repasa(?:\\s+(?:la|el)\\s+unidad)?",
      "soluciones|solucionario",
      "preguntas(?:\\s+de\\s+repaso)?|cuestiones(?:\\s+de\\s+repaso)?",
      "problemas(?:\\s+propuestos)?",
      "casos?\\s+pr[aá]cticos?",
      "trabajo\\s+(?:de\\s+investigaci[oó]n|en\\s+equipo|en\\s+grupo)",
      "aplica\\s+lo\\s+aprendido|para\\s+practicar|practica",
    ].join("|") +
    ")(?:\\s+(?:\\d{1,3}(?:[.\\-]\\d{1,3})*|[ivx]{1,4}))?\\s*[.:]?$",
  "i",
);

/** "Ejemplo 4.1.", "Ejemplo resuelto", "Caso resuelto:" al principio de algo. */
const EJEMPLO_INICIO_RE =
  /^(?:ejemplos?(?:\s+(?:resueltos?|pr[aá]cticos?))?|caso\s+(?:resuelto|real)|ejemplo\s+de\s+aplicaci[oó]n)(?:\s+\d{1,3}(?:[.\-]\d{1,3})*)?\s*(?:[.:—–-]\s*|$)/i;

/** Recuadros de curiosidades: interesantes, pero no son el temario. */
const CURIOSIDAD_INICIO_RE =
  /^(?:(?:¿\s*sab[ií]as\s+que|sab[ií]as\s+que|curiosidad(?:es)?|para\s+saber\s+m[aá]s|dato\s+curioso|no\s+te\s+lo\s+pierdas)\b\s*[:?.—–-]?|(?:en\s+la\s+red|web|enlaces?|v[ií]deos?|mira\s+el\s+v[ií]deo)\s*:)\s*/i;

/** Enunciado de un ejercicio: numerado y con un verbo de orden, o una pregunta. */
const VERBO_DE_ORDEN =
  "explica|explique|calcula|calcule|indica|indique|define|defina|describe|describa|enumera|enumere|razona|razone|responde|responda|completa|complete|contesta|conteste|justifica|justifique|busca|busque|investiga|investigue|elabora|elabore|realiza|realice|clasifica|clasifique|compara|compare|señala|señale|identifica|identifique|relaciona|relacione|resuelve|resuelva|averigua|averigüe|redacta|redacte|comenta|comente|analiza|analice|cita|cite|menciona|mencione|rellena|rellene|elige|elija|marca|marque|subraya|subraye|confecciona|confeccione|determina|determine|di|haz|haga|valora|valore|representa|represente|dibuja|dibuje|ordena|ordene|escribe|escriba|pon|ponga|contabiliza|contabilice|cumplimenta|cumplimente|registra|registre|liquida|liquide";
const EMPIEZA_ORDEN_RE = new RegExp(`^(?:${VERBO_DE_ORDEN})\\b`, "i");
const NUMERADO_RE = /^(?:\d{1,2}|[a-h])[.)]\s+/i;
/**
 * "Calcula", "Indica", "Representa"… son a la vez orden (tú) y tercera
 * persona ("Representa la diferencia entre…", con el sujeto implícito): sin
 * número delante, solo es un ejercicio si se dirige al alumno.
 */
const AL_ALUMNO_RE =
  /\b(?:tu|tus|te|ti|t[uú]|vosotr[oa]s|vuestr[oa]s?|tu\s+cuaderno|compañer[oa]s?|razona\s+tu\s+respuesta|justifica\s+tu\s+respuesta)\b/i;

/** Créditos de imagen, datos de la editorial, enlaces: nunca son contenido. */
const CREDITO_RE =
  /(?:©|\(c\)\s|\bfoto(?:graf[ií]a)?s?\s*:|\bimagen(?:es)?\s*:|\bfuente\s*:|shutterstock|getty\s*images|\bistock|\b123rf\b|freepik|adobe\s*stock|wikimedia|\bcedid[ao]s?\s+por\b|\bisbn\b|dep[oó]sito\s+legal|derechos\s+reservados|reservados\s+todos|\bedita\s*:|\bimpreso\s+en\b|\bautor(?:es|a|as)?\s*:|\bcoordinaci[oó]n\s*:|\bilustraci[oó]n(?:es)?\s*:|\bdise[nñ]o\s+(?:de\s+)?(?:cubierta|interior)\s*:|\bmaquetaci[oó]n\s*:|https?:\/\/|\bwww\.)/i;

/** Nombres de pila habituales: "Lucía compra…", "el cliente Juan Pérez…". */
const NOMBRES =
  "Adrián|Alberto|Alejandro|Alicia|Álvaro|Ana|Andrea|Andrés|Ángel|Antonio|Beatriz|Carlos|Carmen|Clara|Claudia|Cristina|Daniel|David|Diego|Elena|Eva|Fernando|Francisco|Gonzalo|Hugo|Ignacio|Irene|Isabel|Javier|Jesús|Jorge|José|Juan|Julia|Laura|Lorena|Lucas|Lucía|Luis|Manuel|Marcos|María|Marina|Mario|Marta|Martín|Miguel|Natalia|Nerea|Noelia|Nuria|Óscar|Pablo|Patricia|Paula|Pedro|Raquel|Raúl|Roberto|Rocío|Rubén|Samuel|Sandra|Santiago|Sara|Sergio|Silvia|Sofía|Susana|Teresa|Tomás|Víctor";
const PERSONA_RE = new RegExp(
  `(?:^|[\\s(«"“¿¡])(?:${NOMBRES})(?:\\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?(?=[\\s,.;:)»"”]|$)`,
  "u",
);
/**
 * Un nombre de pila solo delata un ejemplo si la persona hace algo cotidiano
 * con cifras concretas ("Lucía compra una lámpara de 80 €"). "Carlos V heredó
 * los reinos…" o "Isabel la Católica unificó…" son historia, es decir, temario.
 */
const REY_RE = new RegExp(`(?:${NOMBRES})\\s+[IVXL]{1,5}\\b`, "u");
const ACCION_COTIDIANA_RE =
  /\b(?:compra|compran|compró|vende|venden|vendió|paga|pagan|pagó|cobra|cobran|cobró|trabaja|trabajan|quiere|quieren|necesita|necesitan|decide|decidió|recibe|recibió|abre|abrió|monta|contrata|contrató|gana|ganó|gasta|gastó|ahorra|pide|pidió|debe)\b/i;
const CIFRA_CONCRETA_RE =
  /\d[\d.,]*\s*(?:€|euros?\b|%|unidades\b|uds?\.|kg\b|horas?\b|días\b|meses\b)|\b\d{1,3}(?:\.\d{3})+\b/i;
const TRATAMIENTO_RE = /\b(?:Sr|Sra|Srta|Dña|Dª|D)\.\s*[A-ZÁÉÍÓÚÑ]|\b(?:don|doña)\s+[A-ZÁÉÍÓÚÑ]/u;
/** "Muebles Ortega, S.L.": la forma jurídica detrás del nombre propio de una
 * empresa. Sin nombre delante ("las sociedades limitadas (S.L.)") es teoría. */
const EMPRESA_RE =
  /[A-ZÁÉÍÓÚÑ][\p{L}]+,?\s+(?:S\.\s?L\.(?:\s?U\.)?|S\.\s?A\.(?:\s?U\.)?|S\.\s?Coop\.|S\.\s?L\.\s?L\.|C\.\s?B\.)(?=[\s,;:)]|$)/u;
/** Un cálculo con cifras concretas: "500 × 21 % = 105 €". */
const CALCULO_RE = /\d[\d.,]*\s*(?:€|%|euros?|uds?\.?|unidades)?\s*[×x·*+\-−/:]\s*\d[\d.,]*\s*(?:€|%|euros?)?\s*=\s*-?\d/;
const ESCENARIO_RE =
  /^(?:por\s+ejemplo|supongamos|imaginemos|imagina|pongamos\s+(?:por\s+caso|que)|veamos\s+un\s+ejemplo|un\s+ejemplo|as[ií],?\s+por\s+ejemplo|en\s+el\s+caso\s+de\s+(?:la|una)\s+empresa\s+[A-ZÁÉÍÓÚÑ])/i;
/** Testimonio o entrevista: «…», dijo Fulano, jefe de… */
const TESTIMONIO_RE =
  /[«"“][^»"”]{10,}[»"”]\s*[,.—–-]?\s*(?:[—–-]\s*)?(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+[\s,]+){1,3}\(?\s*(?:jef[ae]|director|directora|gerente|responsable|t[eé]cnic[oa]|emprendedor|emprendedora|fundador|fundadora|propietari[oa]|trabajador|trabajadora|alumn[oa]|estudiante|experto|experta)/;

function limpiar(texto: string) {
  return texto.replace(/\s+/g, " ").trim();
}

/** "Actividades", "Test de autoevaluación", "Caso práctico 2"… */
export function esTituloDePractica(linea: string) {
  const t = limpiar(linea).replace(/^#+\s*/, "");
  return t.length <= 60 && PRACTICA_TITULO_RE.test(t);
}

/** ¿Empieza aquí un ejemplo? ("Ejemplo 4.1. La empresa…", "Caso resuelto") */
export function empiezaEjemplo(texto: string) {
  return EJEMPLO_INICIO_RE.test(limpiar(texto));
}

/** Quita la marca "Ejemplo 4.1." del principio. */
export function sinMarcaDeEjemplo(texto: string) {
  return limpiar(texto).replace(EJEMPLO_INICIO_RE, "").trim();
}

/** ¿Empieza aquí un recuadro de curiosidad? ("¿Sabías que…?", "Para saber más") */
export function empiezaCuriosidad(texto: string) {
  return CURIOSIDAD_INICIO_RE.test(limpiar(texto));
}

export function sinMarcaDeCuriosidad(texto: string) {
  const t = limpiar(texto);
  const resto = t.replace(CURIOSIDAD_INICIO_RE, "").trim();
  // "¿Sabías que el IVA…?" → "El IVA…."
  return /^¿?\s*sab[ií]as\s+que/i.test(t) ? resto.replace(/\?\s*$/, ".") : resto;
}

/** Enunciado de un ejercicio: "3. Calcula…", "Explica…", "¿Qué modelo…?" */
export function esEnunciado(texto: string) {
  const t = limpiar(texto);
  if (!t) return false;
  // Una pregunta: "¿Qué modelo…?", "4. ¿Qué es…?"
  if (/^(?:(?:\d{1,2}|[a-h])[.)]\s*)?¿/.test(t) && /\?\s*$/.test(t)) return true;
  if (NUMERADO_RE.test(t)) {
    const resto = t.replace(NUMERADO_RE, "");
    return EMPIEZA_ORDEN_RE.test(resto) || /\?\s*$/.test(resto);
  }
  return EMPIEZA_ORDEN_RE.test(t) && AL_ALUMNO_RE.test(t);
}

/** Enunciado numerado: el típico de una lista de actividades. */
export function esEnunciadoNumerado(texto: string) {
  const t = limpiar(texto);
  return NUMERADO_RE.test(t) && esEnunciado(t);
}

/** Crédito de foto, dato de la editorial o enlace. */
export function esCredito(linea: string) {
  const t = limpiar(linea);
  return t.length <= 220 && CREDITO_RE.test(t);
}

/** Testimonio de una persona (entrevista, cita de un profesional…). */
export function esTestimonio(texto: string) {
  return TESTIMONIO_RE.test(limpiar(texto));
}

/**
 * ¿Es esta frase parte de un ejemplo y no de la teoría? Personas o empresas
 * concretas, cálculos con cifras o un "supongamos que…".
 */
export function esFraseDeEjemplo(frase: string) {
  const t = limpiar(frase);
  return (
    ESCENARIO_RE.test(t) ||
    EMPRESA_RE.test(t) ||
    TRATAMIENTO_RE.test(t) ||
    CALCULO_RE.test(t) ||
    (PERSONA_RE.test(t) && !REY_RE.test(t) && (ACCION_COTIDIANA_RE.test(t) || CIFRA_CONCRETA_RE.test(t)))
  );
}

/**
 * Una fórmula de verdad lleva nombres ("Cuota = IVA repercutido − IVA
 * soportado"); "500 × 21 % = 105 €" es un cálculo de un ejemplo.
 */
export function esCalculoConCifras(texto: string) {
  const t = limpiar(texto);
  if (CALCULO_RE.test(t)) return true;
  const izquierda = t.split("=")[0] ?? "";
  return /\d/.test(izquierda) && !/\p{L}{3,}/u.test(izquierda);
}
