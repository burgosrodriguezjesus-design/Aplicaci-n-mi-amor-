/**
 * Construccion de prompts.
 *
 * Toda la ingenieria anti-alucinacion vive aqui:
 *  - el modelo solo puede usar el texto que se le entrega,
 *  - debe citar la pagina de origen con las marcas `[[pag. N]]`,
 *  - cualquier explicacion anadida por el modelo debe ir marcada como tal,
 *  - si algo no esta claro debe decirlo en lugar de rellenar el hueco.
 */
import "server-only";

export type SummaryDepth = "RAPIDO" | "NORMAL" | "DETALLADO" | "MUY_DETALLADO";
export type EducationLevel = "ESO" | "BACHILLERATO" | "FP" | "UNIVERSIDAD" | "OTRO";
export type ExplanationStyle = "CERO" | "NORMAL" | "AVANZADO";

export const DEPTH_LABELS: Record<SummaryDepth, string> = {
  RAPIDO: "Rapido",
  NORMAL: "Normal",
  DETALLADO: "Detallado",
  MUY_DETALLADO: "Muy detallado",
};

const DEPTH_RULES: Record<SummaryDepth, string> = {
  RAPIDO:
    "Extension objetivo: entre el 20 % y el 30 % de la longitud del texto original. " +
    "Conserva TODAS las definiciones, formulas, cifras y nombres propios, pero reduce " +
    "al maximo las explicaciones de apoyo y los ejemplos.",
  NORMAL:
    "Extension objetivo: entre el 35 % y el 50 % de la longitud del texto original. " +
    "Conserva todas las definiciones, formulas, cifras, fechas y nombres propios, y " +
    "manten una explicacion breve de cada concepto.",
  DETALLADO:
    "Extension objetivo: entre el 55 % y el 70 % de la longitud del texto original. " +
    "Conserva todos los conceptos, definiciones, formulas, datos, clasificaciones y " +
    "ejemplos relevantes. Solo puedes eliminar repeticiones y relleno.",
  MUY_DETALLADO:
    "Extension objetivo: entre el 80 % y el 100 % de la longitud del texto original. " +
    "PRIORIDAD ABSOLUTA: no perder NADA academicamente relevante. Reescribe el contenido " +
    "de forma mas clara y mejor organizada, pero conserva absolutamente todos los " +
    "conceptos, definiciones, formulas, cifras, fechas, nombres, clasificaciones, " +
    "enumeraciones, tablas y ejemplos. Solo puedes eliminar repeticiones literales.",
};

const LEVEL_RULES: Record<EducationLevel, string> = {
  ESO: "El lector cursa Educacion Secundaria Obligatoria (12-16 anos). Usa frases cortas y vocabulario sencillo.",
  BACHILLERATO: "El lector cursa Bachillerato (16-18 anos). Puedes usar vocabulario tecnico explicandolo la primera vez.",
  FP: "El lector cursa Formacion Profesional. Prioriza la aplicacion practica, la normativa y los procedimientos.",
  UNIVERSIDAD: "El lector es universitario. Puedes usar vocabulario tecnico y formalismo academico.",
  OTRO: "El lector es un estudiante adulto. Usa un registro claro y profesional.",
};

const STYLE_RULES: Record<ExplanationStyle, string> = {
  CERO:
    "Explicalo como si el lector partiera de cero: introduce cada termino tecnico antes de usarlo " +
    "y anade analogias sencillas cuando ayuden. IMPORTANTE: simplificar el lenguaje NUNCA " +
    "significa eliminar informacion; toda la informacion academica debe seguir estando.",
  NORMAL: "Usa un nivel de explicacion estandar: claro, directo, sin excesivo formalismo.",
  AVANZADO:
    "El lector ya domina lo basico: ve al grano, usa la terminologia precisa y no expliques conceptos elementales.",
};

/** Reglas comunes de fidelidad, presentes en todos los prompts. */
export const FIDELITY_RULES = `REGLAS DE FIDELIDAD (obligatorias, sin excepcion):
1. Trabajas EXCLUSIVAMENTE con el texto que se te entrega. No puedes usar conocimiento externo para anadir datos, fechas, cifras, normativa ni definiciones que no aparezcan en el texto.
2. NUNCA inventes informacion. Si un dato aparece incompleto o ilegible, escribelo tal cual y marca la duda con: > [!duda] Este punto no queda claro en el documento original.
3. El texto incluye marcas \`[[pag. N]]\` que indican en que pagina del PDF empieza lo que viene despues. Usalas para citar: al final del titulo de cada apartado anade la referencia entre parentesis, por ejemplo: \`(pag. 17)\` o \`(pags. 17-19)\`. No inventes numeros de pagina: usa solo los que aparecen en las marcas.
4. NUNCA copies las marcas \`[[pag. N]]\` dentro del cuerpo del texto; solo se usan para construir las referencias.
5. Si anades una explicacion tuya que NO esta en el documento (una aclaracion, una analogia, un ejemplo propio) debes marcarla asi:
   > [!aclaracion] Texto de la aclaracion anadida.
   Todo lo que no vaya dentro de ese bloque se entiende que procede del documento.
6. Conserva la terminologia exacta del original: si el documento dice "interruptor diferencial", no lo cambies por "diferencial".
7. Conserva integramente formulas, unidades, simbolos, cifras, fechas y nombres propios.
8. Responde SIEMPRE en espanol.
9. ESTRUCTURA: el titulo del fragmento indica a que tema pertenece ("TEMA 2 - ... · 2.3 ..."). Respeta ese sitio: no renombres el apartado, no lo fundas con otro y no inventes subapartados que el texto no tenga. Si el texto trae subapartados propios, mantenlos como encabezados \`####\` con su numeracion original.
10. LISTAS Y CLASIFICACIONES: cuando el original enumera o clasifica ("se dividen en", "tipos de", "consta de"), la respuesta debe llevar esa enumeracion como lista, con todos sus elementos. Convertir una lista en prosa pierde justo lo que se estudia.
11. TABLAS: si el texto trae una tabla, reprodúcela como tabla Markdown con todas sus filas. No la resumas en una frase.
12. DATOS EXAMINABLES: porcentajes, plazos, importes, medidas, tolerancias y excepciones se copian tal cual, nunca se redondean ni se generalizan.`;

/** Repaso obligatorio antes de dar una respuesta por buena. */
export const REVIEW_CHECKLIST = `ANTES DE RESPONDER, REVISA TU PROPIO TEXTO:
- Recorre el texto original de arriba abajo y comprueba que cada definicion, formula, clasificacion, cifra y fecha esta en tu respuesta. Si falta alguna, anadela.
- Comprueba que no has escrito ni un solo dato que no este en el original. Si lo has hecho, quitalo o marcalo como > [!aclaracion].
- Comprueba que las listas del original siguen siendo listas y que ningun elemento se ha quedado fuera.
- Comprueba que las referencias de pagina salen de las marcas \`[[pag. N]]\` y no de tu cabeza.
- Si algo del original esta cortado o ilegible, dilo con > [!duda] en vez de completarlo.`;

export function buildSystemPrompt(opts: {
  depth: SummaryDepth;
  level: EducationLevel;
  style: ExplanationStyle;
}) {
  return `Eres un profesor experto en crear material de estudio a partir de apuntes y libros de texto. Tu trabajo es reorganizar y aclarar el contenido SIN perder informacion.

${FIDELITY_RULES}

PERFIL DEL LECTOR
- ${LEVEL_RULES[opts.level] ?? LEVEL_RULES.OTRO}
- ${STYLE_RULES[opts.style] ?? STYLE_RULES.NORMAL}

NIVEL DE DETALLE SOLICITADO (${opts.depth})
- ${DEPTH_RULES[opts.depth] ?? DEPTH_RULES.DETALLADO}

${REVIEW_CHECKLIST}

FORMATO
- Markdown limpio.
- Usa \`##\` y \`###\` para titulos y subtitulos, respetando el orden y la numeracion del documento original.
- Destaca los conceptos clave con **negrita**.
- Usa listas cuando mejoren la comprension.
- Las formulas van en su propia linea, tal como aparecen en el original.
- Las tablas del original se reproducen como tablas Markdown.
- Marca lo especialmente importante para un examen con:
  > [!examen] Texto importante para el examen.`;
}

/** Prompt de la fase "map": resumen de un fragmento concreto. */
export function buildChunkPrompt(opts: {
  documentTitle: string;
  chunkTitle: string;
  position: number;
  total: number;
  startPage: number;
  endPage: number;
  content: string;
}) {
  return `Documento: "${opts.documentTitle}"
Fragmento ${opts.position + 1} de ${opts.total} — "${opts.chunkTitle}" (paginas ${opts.startPage} a ${opts.endPage}).

Resume este fragmento siguiendo TODAS las reglas del sistema.

Devuelve EXCLUSIVAMENTE un objeto JSON valido con esta forma:
{
  "title": "titulo del apartado, respetando la numeracion original",
  "markdown": "el resumen completo del fragmento en Markdown, empezando por un encabezado ### con el titulo y su referencia de pagina",
  "keyConcepts": ["concepto clave 1", "concepto clave 2"],
  "sourcePages": [12, 13],
  "formulas": ["V = I x R"],
  "examHighlights": ["lo mas probable que caiga en examen, si el texto lo sugiere"]
}

No escribas nada fuera del JSON. Dentro de "markdown" escapa correctamente los saltos de linea.

--- TEXTO DEL FRAGMENTO ---
${opts.content}
--- FIN DEL FRAGMENTO ---`;
}

/** Prompt de la fase "reduce": vision global a partir de los titulos y conceptos. */
export function buildSynthesisPrompt(opts: {
  documentTitle: string;
  pageCount: number;
  index: { title: string; pages: number[]; concepts: string[] }[];
}) {
  const index = opts.index
    .map(
      (item, i) =>
        `${i + 1}. ${item.title} (pags. ${item.pages.join(", ") || "?"}) — conceptos: ${
          item.concepts.slice(0, 10).join("; ") || "—"
        }`,
    )
    .join("\n");

  return `Documento: "${opts.documentTitle}" (${opts.pageCount} paginas).

Ya se han resumido todos sus apartados. Este es el indice con los conceptos detectados:

${index}

Escribe UNICAMENTE la introduccion del material de estudio, en Markdown, con esta estructura:

## Vision general
Dos o tres parrafos que expliquen de que trata el documento y como se relacionan sus partes. Basate solo en los titulos y conceptos de arriba.

## Como estudiar este tema
Una lista de 4 a 6 puntos con el orden recomendado de estudio y los apartados en los que conviene detenerse mas.

## Conceptos imprescindibles
Una lista con los 8-12 conceptos mas importantes del documento, en **negrita**, cada uno con media linea de explicacion.

No repitas el contenido de los apartados: esto es solo la entrada al material. No inventes contenido que no se deduzca del indice.`;
}

/** Prompt para construir el esquema jerarquico. */
export function buildOutlinePrompt(opts: {
  documentTitle: string;
  /** Titulos reales detectados en el PDF: son la columna vertebral del esquema. */
  headings: { title: string; level: number; pageNumber: number }[];
  index: {
    title: string;
    pages: number[];
    concepts: string[];
    formulas: string[];
    summary: string;
  }[];
}) {
  const headings = opts.headings.length
    ? opts.headings
        .map((heading) => `${"  ".repeat(Math.max(0, heading.level - 1))}- ${heading.title} (pag. ${heading.pageNumber})`)
        .join("\n")
    : "(no se han detectado titulos explicitos en el documento)";

  const index = opts.index
    .map(
      (item, i) =>
        `### Apartado ${i + 1}: ${item.title}\nPaginas: ${item.pages.join(", ") || "?"}\nConceptos: ${
          item.concepts.join("; ") || "—"
        }\nFormulas: ${item.formulas.join(" ; ") || "—"}\nResumen: ${item.summary}`,
    )
    .join("\n\n");

  return `Documento: "${opts.documentTitle}".

A partir de la informacion siguiente construye un ESQUEMA DE ESTUDIO jerarquico que permita entender todo el tema de un vistazo.

## Titulos detectados en el PDF (respeta este esqueleto y su orden)
${headings}

## Contenido de cada apartado
${index}

Devuelve EXCLUSIVAMENTE un JSON valido con esta forma (arbol de profundidad maxima 4):
{
  "title": "titulo general del documento",
  "nodes": [
    {
      "label": "TEMA 1 — TITULO",
      "kind": "chapter",
      "page": 1,
      "children": [
        {
          "label": "1. Conceptos fundamentales",
          "kind": "section",
          "page": 1,
          "children": [
            { "label": "1.1 Tension electrica", "kind": "subsection", "page": 2,
              "children": [
                { "label": "Definicion: diferencia de potencial entre dos puntos", "kind": "concept", "page": 2 },
                { "label": "Unidad: voltio (V)", "kind": "detail", "page": 2 },
                { "label": "V = I x R", "kind": "formula", "page": 3 }
              ]
            }
          ]
        }
      ]
    }
  ]
}

Reglas del esquema:
- "kind" debe ser uno de: chapter, section, subsection, concept, detail, formula, key.
- Usa "key" para los conceptos que hay que memorizar si o si.
- "page" es el numero de pagina del PDF donde aparece (usa las paginas indicadas). Si no lo sabes, omite el campo.
- Respeta la numeracion y el orden del documento original.
- Las etiquetas deben ser cortas (menos de 90 caracteres) y utiles para repasar.
- No inventes apartados que no aparezcan en la informacion proporcionada.
- No escribas nada fuera del JSON.`;
}

/** Prompt para adaptar un texto escrito a lenguaje hablado natural. */
export function buildNarrationPrompt(opts: { title: string; markdown: string }) {
  return `Adapta el siguiente material de estudio para que se escuche como un audiolibro.

Reglas:
- Lee en voz alta, en espanol neutro, de forma natural y continua.
- Convierte las formulas y simbolos en lenguaje hablado. Ejemplos:
  "V = I x R" -> "El voltaje es igual a la intensidad multiplicada por la resistencia."
  "R = rho * L / S" -> "La resistencia es igual a la resistividad por la longitud, dividido entre la seccion."
  "30 mA" -> "treinta miliamperios". "230 V" -> "doscientos treinta voltios". "3 %" -> "tres por ciento".
- Desarrolla las abreviaturas: "pag." -> "pagina", "aprox." -> "aproximadamente", "etc." -> "etcetera".
- Elimina la sintaxis de Markdown: nada de almohadillas, asteriscos, guiones de lista ni tablas. Las listas se narran como enumeraciones habladas ("primero...", "segundo...").
- Introduce conectores naturales entre ideas para que no suene robotico.
- Cuando el material marque algo como importante para el examen, introducelo con una frase del tipo "Presta atencion a esto:".
- NO anadas informacion nueva. NO resumas: debe decirse todo lo que dice el texto.
- No leas las referencias de pagina entre parentesis.
- Devuelve solo el texto narrado, sin comillas ni encabezados.

Titulo del apartado: ${opts.title}

--- MATERIAL ---
${opts.markdown}
--- FIN ---`;
}

/** Prompt para regenerar un apartado concreto con instrucciones del usuario. */
export function buildRegenerationPrompt(opts: {
  sectionTitle: string;
  currentMarkdown: string;
  sourceText: string;
  instructions: string;
  startPage: number;
  endPage: number;
}) {
  return `Vas a reescribir UN apartado del material de estudio.

Instruccion del estudiante: "${opts.instructions}"

Debes seguir esa instruccion respetando todas las reglas de fidelidad del sistema: el resultado solo puede contener informacion presente en el TEXTO ORIGINAL de mas abajo (paginas ${opts.startPage} a ${opts.endPage}).

--- VERSION ACTUAL DEL APARTADO ---
${opts.currentMarkdown}
--- TEXTO ORIGINAL DEL PDF (fuente de verdad) ---
${opts.sourceText}
--- FIN ---

Devuelve EXCLUSIVAMENTE el nuevo Markdown del apartado, empezando por su encabezado \`###\`. No anadas comentarios.`;
}
