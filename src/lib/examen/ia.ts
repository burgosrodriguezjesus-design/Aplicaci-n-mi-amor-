/**
 * Examen con IA: el modelo lee el contenido del PDF (el texto original si
 * cabe; si no, el resumen) y devuelve el examen en JSON. Se valida entero y,
 * si algo no cuadra, se usa el examen sin IA: nunca se queda a medias.
 */
import "server-only";
import { complete, getAnthropic, parseJsonLoose } from "@/lib/ai/client";
import { FIDELITY_RULES } from "@/lib/ai/prompts";
import { examenExtractivo } from "./generar";
import type { SeccionResumen } from "./extraer";
import { type Examen, OBJETIVO, esExamenValido, porDificultad } from "./tipos";

/** Tope de texto que se manda al modelo (caracteres). */
const MAXIMO = 150_000;

function textoParaElModelo(paginas: { numero: number; texto: string }[], secciones: SeccionResumen[]) {
  const original = paginas
    .filter((p) => p.texto.trim())
    .map((p) => `[[pag. ${p.numero}]]\n${p.texto.trim()}`)
    .join("\n\n");
  if (original && original.length <= MAXIMO) return { fuente: "el texto del PDF", texto: original };
  // Documento muy largo: el resumen (fiel al PDF y con sus páginas), repartido
  // por igual entre todos los apartados para no dejar temas fuera.
  const cupo = Math.floor(MAXIMO / Math.max(1, secciones.length));
  const resumen = secciones
    .map((s) => `## ${s.titulo}${s.paginas.length ? ` (pág. ${s.paginas[0]})` : ""}\n${s.markdown.slice(0, cupo)}`)
    .join("\n\n");
  return { fuente: "el resumen fiel del PDF", texto: resumen.slice(0, MAXIMO) };
}

const FORMATO = `{
  "test": [{ "dificultad": "FACIL|MEDIA|DIFICIL", "enunciado": "...", "opciones": ["...", "...", "...", "..."], "correcta": 0, "explicacion": "...", "fuente": { "apartado": "...", "pagina": 12, "cita": "frase literal del PDF" } }],
  "cortas": [{ "dificultad": "...", "enunciado": "...", "respuesta": "...", "explicacion": "...", "fuente": { ... } }],
  "desarrollo": [{ "dificultad": "...", "enunciado": "...", "respuesta": "guion de los puntos que debe tener la respuesta", "explicacion": "...", "fuente": { ... } }],
  "ejercicios": [{ "dificultad": "...", "enunciado": "...", "datos": ["dato 1", "dato 2"], "respuesta": "solución paso a paso", "explicacion": "...", "fuente": { ... } }],
  "avisos": ["solo si falta algo, p. ej. que el contenido no permite ejercicios"]
}`;

function prompt(titulo: string, fuente: string, texto: string) {
  return `Analiza el contenido del documento «${titulo}» (te doy ${fuente}) y crea un examen completo basado EXCLUSIVAMENTE en su contenido.

${FIDELITY_RULES}

GENERA:
- ${OBJETIVO.test} preguntas tipo test.
- ${OBJETIVO.cortas} preguntas cortas.
- ${OBJETIVO.desarrollo} preguntas de desarrollo.
- ${OBJETIVO.ejercicios} ejercicios prácticos SI el contenido permite realizar ejercicios (cálculos con sus fórmulas, casos de aplicación de sus procedimientos o clasificaciones). Si no lo permite, pon menos (o ninguno) y explícalo en "avisos". No inventes fórmulas ni datos técnicos que el documento no dé.

PREGUNTAS TIPO TEST:
- Exactamente 4 opciones (A, B, C y D) y solo una correcta. "correcta" es el índice (0 = A, 1 = B, 2 = C, 3 = D).
- Las incorrectas deben ser creíbles: del mismo tema y del mismo tipo que la correcta (otra definición del temario, otra cifra con la misma unidad, otro elemento de la misma clasificación…), de longitud y estilo parecidos.
- No hagas evidente la correcta: nada de "todas las anteriores", ni la más larga siempre, ni pistas gramaticales. Reparte la correcta entre A, B, C y D.

DIFICULTAD: clasifica cada pregunta como "FACIL", "MEDIA" o "DIFICIL". Mezcla las tres en cada bloque (en el test, aproximadamente 7 fáciles, 8 medias y 5 difíciles).

SOLUCIONES (van aparte en la aplicación, nunca en el enunciado):
- "respuesta" (cortas, desarrollo y ejercicios): la respuesta correcta; en desarrollo, un guion con los puntos clave; en ejercicios, la solución paso a paso con el resultado.
- "explicacion": por qué es la respuesta correcta (en el test, también por qué fallan las otras opciones).
- "fuente": el apartado del documento, la página (número de las marcas [[pag. N]]; null si no la sabes) y la frase literal del documento en la que se basa.

Solo temario: nada de ejemplos con nombres inventados, actividades del libro, créditos, portada ni presentación.
El enunciado nunca debe contener la respuesta.

Responde SOLO con JSON válido con este formato:
${FORMATO}

CONTENIDO:
${texto}`;
}

/** Reparte la letra correcta por igual entre A, B, C y D (sin tocar el contenido). */
function repartirLetras(examen: Examen): Examen {
  const test = porDificultad(examen.test).map((p, i) => {
    const destino = [0, 1, 2, 3][(i * 3 + Math.floor(i / 4)) % 4];
    const opciones = [...p.opciones];
    const [correcta] = opciones.splice(p.correcta, 1);
    opciones.splice(destino, 0, correcta);
    return { ...p, opciones, correcta: destino };
  });
  return { ...examen, test };
}

export async function crearExamen(opts: {
  titulo: string;
  secciones: SeccionResumen[];
  paginas: { numero: number; texto: string }[];
  semilla: string;
}): Promise<{ examen: Examen; proveedor: "anthropic" | "extractive" }> {
  const sinIa = () => ({ examen: examenExtractivo(opts.titulo, opts.secciones, opts.semilla), proveedor: "extractive" as const });
  if (!getAnthropic()) return sinIa();
  try {
    const { fuente, texto } = textoParaElModelo(opts.paginas, opts.secciones);
    const raw = await complete({
      system:
        "Eres un profesor experto en preparar exámenes en español. Solo usas el contenido que se te da y respondes siempre con JSON válido.",
      user: prompt(opts.titulo, fuente, texto),
      maxTokens: 24000,
      effort: "medium",
    });
    const parsed = parseJsonLoose<Partial<Examen>>(raw);
    const candidato = {
      titulo: opts.titulo,
      test: parsed?.test ?? [],
      cortas: parsed?.cortas ?? [],
      desarrollo: parsed?.desarrollo ?? [],
      ejercicios: parsed?.ejercicios ?? [],
      avisos: Array.isArray(parsed?.avisos) ? parsed!.avisos.filter((a) => typeof a === "string") : [],
    };
    if (!esExamenValido(candidato) || candidato.test.length < 5) throw new Error("Examen incompleto");
    const conIds = <T extends object>(lista: T[], prefijo: string) =>
      porDificultad(lista as (T & { dificultad: Examen["test"][number]["dificultad"] })[]).map((p, i) => ({ ...p, id: `${prefijo}${i + 1}` }));
    const examen: Examen = repartirLetras({
      ...candidato,
      test: conIds(candidato.test, "t"),
      cortas: conIds(candidato.cortas, "c"),
      desarrollo: conIds(candidato.desarrollo, "d"),
      ejercicios: conIds(candidato.ejercicios, "e"),
    });
    return { examen, proveedor: "anthropic" };
  } catch {
    return sinIa();
  }
}
