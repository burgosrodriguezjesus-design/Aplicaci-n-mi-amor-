/**
 * Preguntas sobre un documento sin IA: responde con lo que dice el PDF (y
 * la página) y, si no está, lo dice en lugar de inventar.
 *
 *   npx tsx tests/unit/preguntas.mts [--ver]
 */
import { readFileSync } from "node:fs";

const { prepararDocumento, responderSinIa, sugerencias } = await import("../../src/lib/preguntas/motor");

const VER = process.argv.includes("--ver");
let fallos = 0;
function comprobar(titulo: string, ok: boolean, detalle = "") {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo + (!ok && detalle ? ` — ${detalle.slice(0, 300)}` : ""));
  if (!ok) fallos += 1;
}

const libro = readFileSync("tests/fixtures/resumen-realista.md", "utf8")
  .split(/\n(?=## )/)
  .map((b, i) => ({ titulo: b.split("\n")[0].replace(/^##\s*/, ""), markdown: b, paginas: [i + 1] }));
const apuntes = JSON.parse(readFileSync("tests/fixtures/resumen-electricidad.json", "utf8"));
// Una página con un detalle que el resumen no recoge: también se encuentra.
const paginas = [{ numero: 9, texto: "Los interruptores se revisarán una vez al año por un instalador autorizado.\n\nEl boletín eléctrico lo firma el instalador." }];

const comercio = prepararDocumento("Proceso integral de la actividad comercial", libro, []);
const electricidad = prepararDocumento("Fundamentos de instalaciones eléctricas", apuntes, paginas);

const casos: [string, typeof comercio, string, (r: string) => boolean][] = [
  ["«¿Qué es…?» da la definición", comercio, "¿Qué es el stock de seguridad?", (r) => /cantidad mínima de existencias/.test(r) && !/precio medio/.test(r)],
  ["reconoce la sigla (IVA)", comercio, "¿Qué es el IVA?", (r) => /^\*\*Impuesto sobre el valor añadido \(IVA\):\*\* un tributo indirecto/.test(r)],
  ["los tipos, con todos sus elementos", comercio, "¿Cuáles son los tipos de IVA?", (r) => ["21 %", "10 %", "4 %"].every((t) => r.includes(t))],
  ["una clasificación", comercio, "¿En qué se clasifican las existencias?", (r) => ["Mercaderías", "Materias primas", "Productos terminados", "Envases y embalajes"].every((t) => r.includes(t))],
  ["cómo se calcula (fórmula)", comercio, "¿Cómo se calcula el punto de pedido?", (r) => r.includes("Punto de pedido = stock de seguridad + consumo medio diario × plazo de entrega")],
  ["cómo se obtiene (procedimiento)", comercio, "¿Cómo se obtiene la cuota a ingresar?", (r) => /restando al IVA repercutido el IVA soportado deducible/.test(r)],
  ["un plazo: «¿cuándo…?»", comercio, "¿Cuándo se presenta el modelo 303?", (r) => /^Esto es lo que dice el documento sobre ese dato:\n\n- Las pequeñas y medianas empresas presentan el modelo 303 cada trimestre/.test(r)],
  ["«¿por qué…?»", comercio, "¿Por qué el IVA es neutral para el empresario?", (r) => /consumidor final/.test(r)],
  ["diferencias entre dos conceptos", comercio, "¿Qué diferencia hay entre el método FIFO y el PMP?", (r) => /FIFO/.test(r) && /precio medio ponderado/.test(r) && /mientras que/.test(r)],
  ["un elemento concreto de una clasificación", comercio, "¿Qué son las mercaderías?", (r) => /Bienes adquiridos para venderlos sin transformarlos/.test(r)],
  ["«¿a qué se aplica…?»", comercio, "¿A qué se aplica el tipo reducido?", (r) => /^\*\*Tipo reducido del 10 %\*\*: Para la hostelería/.test(r)],
  ["explicar un apartado", comercio, "Explícame el inventario", (r) => /relación detallada y valorada/.test(r) && /cierre de cada ejercicio/.test(r)],
  ["resumen del documento", comercio, "Resúmeme el documento", (r) => /El IVA en la actividad comercial/.test(r) && /Gestión de existencias/.test(r) && /Ideas clave/.test(r)],
  ["preguntas de repaso con soluciones", comercio, "Hazme preguntas de repaso", (r) => /^Aquí tienes 5 preguntas/.test(r) && /\*\*Soluciones\*\*/.test(r)],
  ["saluda y propone preguntas", comercio, "hola", (r) => /^¡Hola!/.test(r) && /¿Qué es/.test(r)],
  ["lo que no está en el documento: lo dice, sin inventar", comercio, "¿Quién ganó el mundial de 2010?", (r) => /^No encuentro nada sobre eso/.test(r)],
  ["ni aunque comparta alguna palabra", comercio, "¿Qué impuesto se paga al comprar un coche en Alemania?", (r) => /^No encuentro nada sobre eso/.test(r)],
  ["ni los ejemplos ni los nombres inventados", comercio, "¿Cuánto paga Lucía por la lámpara?", (r) => /^No encuentro nada sobre eso/.test(r)],
  ["fórmulas con símbolos, explicados", electricidad, "¿Cómo se calcula la potencia?", (r) => /P = V × I/.test(r) && /\*\*P\*\*: potencia electrica \(se mide en W\)/.test(r) && (r.match(/Donde:/g) ?? []).length === 1],
  ["la fórmula de un caso concreto", electricidad, "¿Cómo se calcula la potencia en trifásica?", (r) => /√3/.test(r) && !/corriente continua/.test(r)],
  ["definición con sus detalles", electricidad, "¿Qué es la intensidad?", (r) => /cantidad de carga electrica/.test(r) && /amperio/.test(r)],
  ["una cifra concreta", electricidad, "¿Cuál es la sensibilidad del diferencial en viviendas?", (r) => /30 mA en viviendas/.test(r)],
  ["un dato de una lista en prosa", electricidad, "¿De qué color es el neutro?", (r) => /azul para el neutro/.test(r)],
  ["también busca en el texto de las páginas", electricidad, "¿Cada cuánto se revisan los interruptores?", (r) => /una vez al año/.test(r) && /pág\. 9/.test(r)],
  ["fuera del documento", electricidad, "¿Cuál es la capital de Francia?", (r) => /^No encuentro nada sobre eso/.test(r)],
];

for (const [titulo, doc, pregunta, ok] of casos) {
  const r = responderSinIa(doc, pregunta);
  if (VER) console.log(`\n### ${pregunta}\n${r}\n`);
  comprobar(titulo, ok(r), `«${pregunta}» → ${r}`);
}

const seguida = responderSinIa(comercio, "¿Y el reducido?", ["¿Cuáles son los tipos de IVA?"]);
comprobar("sigue el hilo de la pregunta anterior («¿Y el reducido?»)", /10 %/.test(seguida), seguida);

const todas = casos.map(([, doc, p]) => responderSinIa(doc, p)).join("\n");
comprobar("cita la página en las respuestas", (todas.match(/pág\. \d+/g) ?? []).length >= 15);
comprobar("ninguna respuesta cortada con «…»", !todas.includes("…"));

const ideas = sugerencias(comercio);
comprobar("sugerencias sacadas del documento", ideas.length === 4 && ideas.some((s) => /^¿Qué es el /.test(s)), ideas.join(" | "));
comprobar("y todas se saben responder", ideas.every((s) => !/^No encuentro/.test(responderSinIa(comercio, s))), ideas.join(" | "));
comprobar("también en los apuntes de electricidad", sugerencias(electricidad).every((s) => !/^No encuentro/.test(responderSinIa(electricidad, s))), sugerencias(electricidad).join(" | "));

console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nResponde sobre el documento, y solo sobre él");
process.exit(fallos ? 1 : 0);
