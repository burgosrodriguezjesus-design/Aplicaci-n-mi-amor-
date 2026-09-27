/**
 * Examen sin IA a partir del resumen, con dos documentos reales de prueba:
 * un libro de gestión comercial (IVA y existencias) y unos apuntes de
 * electricidad (fórmulas con símbolos).
 *
 *   npx tsx tests/unit/examen.mts [--ver]
 */
import { readFileSync } from "node:fs";

const { examenExtractivo } = await import("../../src/lib/examen/generar");
const { extraer } = await import("../../src/lib/examen/extraer");
const { esExamenValido, OBJETIVO } = await import("../../src/lib/examen/tipos");
const { examenAMarkdown, examenAHtml } = await import("../../src/lib/examen/texto");

const VER = process.argv.includes("--ver");
let fallos = 0;
function comprobar(titulo: string, ok: boolean, detalle = "") {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo + (!ok && detalle ? ` — ${detalle}` : ""));
  if (!ok) fallos += 1;
}

// Libro de gestión comercial: el resumen partido por temas.
const libro = readFileSync("tests/fixtures/resumen-realista.md", "utf8")
  .split(/\n(?=## )/)
  .map((bloque, i) => ({ titulo: bloque.split("\n")[0].replace(/^##\s*/, ""), markdown: bloque, paginas: [i + 1] }));
// Apuntes de electricidad: tal como se guardan (un apartado por sección).
const apuntes = JSON.parse(readFileSync("tests/fixtures/resumen-electricidad.json", "utf8")) as {
  titulo: string;
  markdown: string;
  paginas: number[];
}[];

function revisar(nombre: string, examen: ReturnType<typeof examenExtractivo>) {
  console.log(`\n${nombre}`);
  const todas = [...examen.test, ...examen.cortas, ...examen.desarrollo, ...examen.ejercicios];
  const texto = JSON.stringify(examen);
  comprobar("el examen está bien formado", esExamenValido(examen));
  comprobar("cada test con 4 opciones distintas y una correcta", examen.test.every((p) => p.opciones.length === 4 && new Set(p.opciones.map((o) => o.toLowerCase())).size === 4 && p.correcta >= 0 && p.correcta <= 3));
  const delata = (p: (typeof examen.test)[number]) =>
    new RegExp(`(^|[^\\p{L}\\d])${p.opciones[p.correcta].toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\d])`, "u").test(p.enunciado.toLowerCase());
  comprobar("el enunciado no contiene la respuesta", !examen.test.some(delata), examen.test.filter(delata).map((p) => p.enunciado).join(" | "));
  const letras = [0, 1, 2, 3].map((l) => examen.test.filter((p) => p.correcta === l).length);
  comprobar("la correcta repartida entre A, B, C y D", Math.max(...letras) - Math.min(...letras) <= 1, letras.join("/"));
  comprobar("hay preguntas fáciles, medias y difíciles", ["FACIL", "MEDIA", "DIFICIL"].every((d) => examen.test.some((p) => p.dificultad === d)));
  comprobar("ordenadas de fácil a difícil", [examen.test, examen.cortas, examen.desarrollo, examen.ejercicios].every((b) => b.every((p, i) => i === 0 || "FMD".indexOf(p.dificultad[0]) >= "FMD".indexOf(b[i - 1].dificultad[0]))));
  comprobar("todas con explicación y con la parte del PDF en que se basan", todas.every((p) => p.explicacion.length > 10 && p.fuente.cita.length > 10 && p.fuente.apartado.length > 2));
  comprobar("ningún texto cortado con «…»", !texto.includes("…"));
  comprobar("sin ejemplos, nombres inventados ni curiosidades", !/Ortega|Lucía|lámpara|Francia|1954|46 ohmios/.test(texto), (texto.match(/.{0,30}(Ortega|Lucía|lámpara|Francia|1954|46 ohmios).{0,30}/) ?? [""])[0]);
  comprobar("sin los repasos de la visión general como apartado", !todas.some((p) => /Visión general|Conceptos imprescindibles|Qué vas a estudiar/.test(p.fuente.apartado)));
  comprobar("sin preguntas repetidas", new Set(todas.map((p) => p.enunciado)).size === todas.length);
  const md = examenAMarkdown(examen);
  const soluciones = md.indexOf("## SOLUCIONES");
  comprobar("al descargar, las soluciones van aparte al final", soluciones > 0 && !md.slice(0, soluciones).includes("Respuesta correcta"));
  comprobar("y cada una con respuesta, explicación y fuente", (md.slice(soluciones).match(/Respuesta correcta:/g) ?? []).length === todas.length && (md.match(/Basado en:/g) ?? []).length === todas.length);
  comprobar("la versión para imprimir lleva las soluciones en otra página", /class="sol"/.test(examenAHtml(examen)));
  if (VER) console.log(md);
}

// ── Libro de gestión comercial ─────────────────────────────────────
const examenLibro = examenExtractivo("Proceso integral de la actividad comercial", libro, "prueba-1");
revisar("Libro de gestión comercial (IVA y existencias)", examenLibro);
comprobar(`${OBJETIVO.test} test, ${OBJETIVO.cortas} cortas, ${OBJETIVO.desarrollo} de desarrollo y ${OBJETIVO.ejercicios} ejercicios`, [examenLibro.test.length, examenLibro.cortas.length, examenLibro.desarrollo.length, examenLibro.ejercicios.length].join() === [20, 10, 5, 5].join(), [examenLibro.test.length, examenLibro.cortas.length, examenLibro.desarrollo.length, examenLibro.ejercicios.length].join());
const libroTexto = JSON.stringify(examenLibro);
comprobar("pregunta por las definiciones del temario", /define correctamente «(existencias|stock de seguridad|inventario|punto de pedido|impuesto)/i.test(libroTexto) || /Define «/.test(libroTexto));
comprobar("los distractores de los tipos de IVA son cifras cambiadas, no conceptos de otro tema", examenLibro.test.filter((p) => /tipos impositivos/.test(p.enunciado)).every((p) => p.opciones.every((o) => /^Tipo .* \d+ %$/.test(o) || /IVA/.test(o))));
const cuota = examenLibro.ejercicios.find((e) => /cuota a ingresar/.test(e.enunciado) && e.datos?.length === 2);
if (cuota) {
  const [a, b] = cuota.datos!.map((d) => Number(d.replace(/[^\d,]/g, "").replace(",", ".")));
  comprobar("el ejercicio de la cuota está bien resuelto", cuota.respuesta.includes(`${(a - b).toLocaleString("es-ES", { maximumFractionDigits: 2 })} €`), cuota.respuesta);
} else comprobar("hay un ejercicio de la cuota a ingresar", false);
const pedido = examenLibro.ejercicios.find((e) => /^Calcula «punto de pedido»/.test(e.enunciado));
if (pedido) {
  const [ss, cm, pe] = pedido.datos!.map((d) => Number(d.split(":")[1].replace(/[^\d,]/g, "").replace(",", ".")));
  comprobar("el punto de pedido respeta el orden de las operaciones", pedido.respuesta.includes(`${(ss + cm * pe).toLocaleString("es-ES")} unidades`), pedido.respuesta);
}
comprobar("el mismo examen con la misma semilla", JSON.stringify(examenExtractivo("x", libro, "s")) === JSON.stringify(examenExtractivo("x", libro, "s")));
comprobar("«Crear otro examen» da otro distinto", JSON.stringify(examenExtractivo("x", libro, "s").test) !== JSON.stringify(examenExtractivo("x", libro, "s2").test));

// ── Apuntes de electricidad ───────────────────────────────────────
const contenido = extraer(apuntes);
const examenApuntes = examenExtractivo("Fundamentos de instalaciones eléctricas", apuntes, "prueba-2");
revisar("Apuntes de electricidad (fórmulas con símbolos)", examenApuntes);
comprobar("entiende qué es cada símbolo según el texto", contenido.simbolos.V?.unidad === "V" && contenido.simbolos.I?.unidad === "A" && contenido.simbolos.P?.unidad === "W" && contenido.simbolos.t?.unidad === "s", JSON.stringify(contenido.simbolos));
comprobar("lee las fórmulas escritas dentro de una frase", ["P = V × I", "V = I × R", "I = Q ÷ t", "P = √3 × V × I × cos(fi)"].every((f) => contenido.formulas.some((x) => x.texto === f)), contenido.formulas.map((f) => f.texto).join(" | "));
comprobar("respeta los paréntesis de la fórmula", contenido.formulas.some((f) => f.texto === "e = 2 × L × I × cos(fi) ÷ (gamma × S)"));
comprobar("sabe cuándo se usa cada fórmula (continua, trifásica…)", contenido.formulas.some((f) => f.contexto === "en trifasica"));
comprobar(
  "no pregunta por conceptos sin sentido («Su unidad»)",
  ![...examenApuntes.test.flatMap((p) => [p.enunciado, ...p.opciones]), ...examenApuntes.cortas.map((p) => p.enunciado)].some((t) => /su unidad/i.test(t)),
);
comprobar("el tema no aparece como apartado de sí mismo", !examenApuntes.desarrollo.some((p) => /«(TEMA \d[^»]*)», relacionando sus apartados: «\1»/.test(p.enunciado)));
comprobar("no hace ejercicios con símbolos que el texto no explica (rho, gamma)", !examenApuntes.ejercicios.some((e) => /rho|gamma/.test(e.enunciado + (e.datos ?? []).join())));
comprobar("los ejercicios llevan unidades", examenApuntes.ejercicios.filter((e) => /^(Calcula|Sabiendo)/.test(e.enunciado)).every((e) => (e.datos ?? []).every((d) => /\d\s?(V|A|Ω|W|C|s)$|cos\(fi\): 0,\d+$/.test(d))), examenApuntes.ejercicios.flatMap((e) => e.datos ?? []).join(" | "));
const ohm = examenApuntes.ejercicios.find((e) => /^Calcula «V/.test(e.enunciado));
if (ohm) {
  const [i, r] = ohm.datos!.map((d) => Number(d.split(":")[1].replace(/[^\d,]/g, "")));
  comprobar("la ley de Ohm bien resuelta", ohm.respuesta.includes(`${(i * r).toLocaleString("es-ES")} V`), ohm.respuesta);
}
// ── Un libro enorme: el examen tiene que salir en un momento ─────────
{
  const temas = libro.filter((s) => !/Visión general/.test(s.titulo));
  const enorme = Array.from({ length: 300 }, (_, i) =>
    temas.map((s) => ({
      titulo: `Unidad ${i + 1}`,
      markdown: s.markdown
        .replace(/^## .*/, `## Unidad ${i + 1}`)
        .replace(/\*\*([^*]+)\*\*/g, (_m, t) => `**${t} ${i + 1}**`)
        .replace(/\b(\d+)\b/g, (m) => String(Number(m) + i)),
      paginas: [i + 1],
    })),
  ).flat();
  const inicio = Date.now();
  const grande = examenExtractivo("Libro enorme", enorme, "grande");
  const ms = Date.now() - inicio;
  console.log("\nLibro enorme (600 temas)");
  comprobar("el examen de un libro enorme sale en menos de 3 segundos", ms < 3000, `${ms} ms`);
  comprobar("y completo", grande.test.length === 20 && grande.cortas.length === 10 && grande.desarrollo.length === 5 && grande.ejercicios.length === 5);
  comprobar("con preguntas de todo el libro, no solo del principio", new Set(grande.test.map((p) => p.fuente.apartado.split(" › ")[0])).size >= 8);
}
comprobar("un documento sin temario no da examen", examenExtractivo("x", [{ titulo: "Vacío", markdown: "Texto.", paginas: [1] }], "s").test.length === 0);

console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nExámenes bien hechos");
process.exit(fallos ? 1 : 0);
