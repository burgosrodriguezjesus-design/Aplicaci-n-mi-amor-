/**
 * Resumen y esquema de un libro escaneado de verdad (con índice, cuadros,
 * tabla, gráfico, foto, cabeceras y defectos de escáner), de principio a fin:
 * lectura con el filtro de confianza, estructura, resumen y esquema.
 *
 *   npx tsx tests/unit/resumen-realista.mts [--ver]
 *   (tests/fixtures/libro-realista.pdf: python3 tests/fixtures/generar-libro-realista.py)
 */
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
require_.cache[require_.resolve("server-only")] = { exports: {} } as never;

const { abrirParaImagenes, imagenDePagina } = await import("../../src/lib/pdf/imagen-pagina");
const { textoDesdeBloques } = await import("../../src/lib/pdf/ocr-bloques");
const { limpiarTextoOcr } = await import("../../src/lib/pdf/limpiar-ocr");
const { readStructure } = await import("../../src/lib/pdf/toc");
const { buildChunks, chunkOptionsFor, detectHeadings } = await import("../../src/lib/pdf/structure");
const ext = await import("../../src/lib/ai/extractive");
const { createWorker } = await import("tesseract.js");

const VER = process.argv.includes("--ver");
const MODELO = existsSync("public/ocr/rapido/spa.traineddata.gz") ? "public/ocr/rapido" : "assets/ocr/rapido";

const doc = await abrirParaImagenes(new Uint8Array(readFileSync("tests/fixtures/libro-realista.pdf")));
const lector = await createWorker("spa", 1, { langPath: MODELO, cachePath: "/tmp/alicia-tess-prueba", gzip: true });
const paginas: { pageNumber: number; text: string }[] = [];
for (let n = 1; n <= doc.numPages; n++) {
  const img = await imagenDePagina(doc, n);
  const { data } = await lector.recognize(img!, {}, { text: true, blocks: true });
  paginas.push({ pageNumber: n, text: limpiarTextoOcr(textoDesdeBloques(data.blocks) ?? "") });
}
await lector.terminate();
await doc.destroy();

const estructura = readStructure(paginas);
const total = paginas.reduce((s, p) => s + p.text.length, 0);
const trozos = buildChunks(paginas, chunkOptionsFor(total), estructura);
const titulos = detectHeadings(paginas, estructura);
const analisis = trozos.map((t) => ext.extractiveChunkSummary(t, "DETALLADO"));
const vision = ext.extractiveSynthesis("Proceso integral de la actividad comercial", analisis, paginas.length);
const esquema = ext.outlineFromHeadings("Proceso integral de la actividad comercial", titulos, analisis)!;
const resumen = [vision, ...analisis.map((a) => a.markdown)].join("\n\n");
const lineasEsquema = (function recorrer(nodos: any[], p: number): string[] {
  return (nodos ?? []).flatMap((n) => [`${"  ".repeat(p)}- [${n.kind}] ${n.label}`, ...recorrer(n.children, p + 1)]);
})(esquema.nodes, 0);

if (VER) {
  console.log("=== TEXTO ===\n" + paginas.map((p) => `--- ${p.pageNumber}\n${p.text}`).join("\n"));
  console.log("\n=== RESUMEN ===\n" + resumen);
  console.log("\n=== ESQUEMA ===\n" + lineasEsquema.join("\n"));
}

let fallos = 0;
function comprobar(titulo: string, ok: boolean, detalle = "") {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo + (!ok && detalle ? ` — ${detalle}` : ""));
  if (!ok) fallos += 1;
}
const todo = resumen + "\n" + lineasEsquema.join("\n");
comprobar("sin basura del escaneo", !/[=]{2,}|\.{4,}|qq|Pres rage|rosas|TACONCEP|eITES|T1 T2/.test(todo), (todo.match(/.{0,20}(?:[=]{2,}|\.{4,}|qq|Pres rage|rosas|TACONCEP|eITES|T1 T2).{0,20}/) ?? [""])[0]);
comprobar("sin pies de figura ni de foto", !/Figura 4\.1|Fotografía 5\.1/.test(todo));
comprobar("sin la cabecera del libro repetida", (resumen.match(/Proceso integral de la actividad comercial/g) ?? []).length <= 1);
comprobar("textos fijos con tildes", !/Vision general|Introduccion|Como estudiar|\bpag\.|Formulas/.test(todo));
for (const apartado of ["Concepto y naturaleza del IVA", "Tipos impositivos", "Liquidación del impuesto", "Cálculo de la cuota", "Plazos de presentación", "Las existencias en la empresa", "Clasificación de las existencias", "Métodos de valoración", "El inventario"]) {
  comprobar(`el esquema tiene «${apartado}»`, lineasEsquema.some((l) => l.includes(apartado)));
}
comprobar("el esquema tiene las dos unidades como ramas principales", esquema.nodes.filter((n) => /^Unidad [45]/.test(n.label)).length === 2, esquema.nodes.map((n) => n.label).join(" | "));
comprobar("define el IVA en el esquema", lineasEsquema.some((l) => /\[concept\].*impuesto sobre el valor añadido.*tributo indirecto/i.test(l)));
comprobar("los tipos de IVA como ramas", ["21 %", "10 %", "4 %"].every((t) => lineasEsquema.some((l) => l.includes(t))));
comprobar("la clasificación de existencias con sus tipos", ["Mercaderías", "Materias primas", "Productos terminados", "Envases y embalajes"].every((t) => lineasEsquema.some((l) => l.includes(t))));
comprobar("la fórmula del punto de pedido", /punto de pedido = stock de seguridad \+ consumo medio diario × plazo de entrega/i.test(todo));
comprobar("si anuncia «dos métodos», explica los dos", /PMP/.test(resumen) && /FIFO/.test(resumen));
comprobar("los métodos como conceptos del esquema", ["Método del precio medio ponderado (PMP):", "Método FIFO:"].every((t) => lineasEsquema.some((l) => l.includes(t))));
comprobar("cómo se calcula la cuota en el esquema", lineasEsquema.some((l) => /Cuota a ingresar: se obtiene/.test(l)));

// Lo que no es temario: separado o fuera.
const teoria = resumen.split("\n").filter((l) => !/^>\s*\[!(ejemplo|curiosidad|practica)\]/.test(l)).join("\n");
const sinEjercicios = ["Explica la diferencia", "Calcula el IVA de una factura", "presentan las pymes", "Clasifica las siguientes", "punto de pedido si el stock", "modelo 347"];
comprobar("los ejercicios no se resumen como teoría", sinEjercicios.every((t) => !todo.includes(t)), sinEjercicios.filter((t) => todo.includes(t)).join(", "));
comprobar("las actividades se señalan aparte", (resumen.match(/\[!practica\][^\n]*actividad/g) ?? []).length >= 2, (resumen.match(/.*\[!practica\].*/g) ?? []).join(" | "));
comprobar("el ejemplo va en su recuadro", /\[!ejemplo\][^\n]*Muebles Ortega/.test(resumen));
comprobar("ni el ejemplo ni sus nombres en la teoría", !/Ortega|Lucía|lámpara|605 €/.test(teoria), (teoria.match(/.*(?:Ortega|Lucía|lámpara|605 €).*/) ?? [""])[0]);
comprobar("el cálculo del ejemplo no es una fórmula ni una definición", !/\[!formula\][^\n]*500|\*\*IVA repercutido:\*\*\s*500|Fórmulas[\s\S]*500 ×/.test(resumen));
comprobar("la curiosidad no se mezcla con la teoría", !/Francia|1954/.test(teoria));
comprobar("sin testimonios, créditos ni editorial", !/Laura Gómez|Distribuciones Norte|Shutterstock|Javier Martínez|ISBN|Ediciones Didácticas|Ana Pérez|Luis Romero/.test(todo), (todo.match(/.*(?:Laura Gómez|Distribuciones Norte|Shutterstock|Javier Martínez|ISBN|Ediciones Didácticas|Ana Pérez|Luis Romero).*/) ?? [""])[0]);
comprobar("el esquema es solo temario", !lineasEsquema.some((l) => /Ortega|Lucía|Actividades|ACTIVIDADES|Explica|Calcula el|Clasifica las|Sabías|Francia|Ejemplo/i.test(l)), lineasEsquema.filter((l) => /Ortega|Lucía|Actividades|ACTIVIDADES|Explica|Calcula el|Clasifica las|Sabías|Francia|Ejemplo/i.test(l)).join(" | "));
comprobar("las actividades no son unidades ni apartados", !/^#{2,4}\s+(?:actividades|ejemplo)/im.test(resumen));
comprobar("resalta el término definido", /\*\*impuesto sobre el valor añadido \(IVA\)\*\*/i.test(resumen));
comprobar("los recuadros «Recuerda» destacados", (resumen.match(/\[!recuerda\]/g) ?? []).length >= 2);
comprobar("glosario en la visión general", /Conceptos imprescindibles[\s\S]*\*\*Existencias:\*\*/i.test(resumen), resumen.slice(0, 600));
comprobar("sin conectores de relleno", !/^- Por eso se dice que/m.test(resumen));
console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nResumen y esquema profesionales");
process.exit(fallos ? 1 : 0);
