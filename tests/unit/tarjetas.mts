/**
 * Tarjetas de memoria sacadas del resumen y el algoritmo de repaso espaciado.
 *
 *   npx tsx tests/unit/tarjetas.mts [--ver]
 */
import { readFileSync } from "node:fs";

const { extraer } = await import("../../src/lib/examen/extraer");
const { tarjetasDe } = await import("../../src/lib/tarjetas/crear");
const { siguiente, cuando, aprendida } = await import("../../src/lib/tarjetas/repaso");

let fallos = 0;
function comprobar(titulo: string, ok: boolean, detalle = "") {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo + (!ok && detalle ? ` — ${detalle.slice(0, 300)}` : ""));
  if (!ok) fallos += 1;
}

const libro = readFileSync("tests/fixtures/resumen-realista.md", "utf8")
  .split(/\n(?=## )/)
  .map((b, i) => ({ titulo: b.split("\n")[0].replace(/^##\s*/, ""), markdown: b, paginas: [i + 1] }));
const apuntes = JSON.parse(readFileSync("tests/fixtures/resumen-electricidad.json", "utf8"));

console.log("\nTarjetas del libro de gestión comercial");
const t1 = tarjetasDe(extraer(libro));
if (process.argv.includes("--ver")) for (const t of t1) console.log(`[${t.tipo}] ${t.frente} → ${t.reverso.replace(/\n/g, " | ")}`);
const tipos = new Set(t1.map((t) => t.tipo));
comprobar("se crean tarjetas de todos los tipos", ["concepto", "clasificacion", "elemento", "formula", "porque", "dato"].every((x) => tipos.has(x as never)), [...tipos].join(","));
comprobar("una por concepto del temario", t1.some((t) => t.tipo === "concepto" && t.frente === "Stock de seguridad" && /cantidad mínima de existencias/.test(t.reverso)));
comprobar("las clasificaciones, con todos sus elementos", t1.some((t) => t.frente === "¿En qué se clasifican las existencias según su función en la empresa?" && ["Mercaderías", "Materias primas", "Productos terminados", "Envases y embalajes"].every((e) => t.reverso.includes(e))));
comprobar("las fórmulas, con su artículo", t1.some((t) => t.frente === "¿Cómo se calcula el punto de pedido?" && t.reverso.includes("stock de seguridad + consumo medio diario × plazo de entrega")));
comprobar("los datos, con la cifra tapada", t1.filter((t) => t.tipo === "dato").every((t) => t.frente.includes("____") && /^\*\*.+\*\*/.test(t.reverso)));
const delata = (t: (typeof t1)[number]) => {
  const respuesta = t.reverso.split("\n")[0].replace(/\*\*/g, "").toLowerCase().replace(/\.$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\d])${respuesta}($|[^\\p{L}\\d])`, "u").test(t.frente.toLowerCase());
};
comprobar("el frente nunca contiene la respuesta", !t1.some(delata), t1.filter(delata).map((t) => t.frente).join(" | "));
comprobar("claves únicas", new Set(t1.map((t) => t.clave)).size === t1.length);
comprobar("y estables (mismo documento → mismas claves)", JSON.stringify(tarjetasDe(extraer(libro)).map((t) => t.clave)) === JSON.stringify(t1.map((t) => t.clave)));
comprobar("en el orden del temario (primero el IVA, después las existencias)", t1.findIndex((t) => /IVA/.test(t.frente)) < t1.findIndex((t) => /existencias/i.test(t.frente)));
comprobar("cada tarjeta dice su apartado y su página", t1.every((t) => t.apartado && t.pagina));
comprobar("sin ejemplos ni nombres inventados", !/Ortega|Lucía|lámpara|Francia/.test(JSON.stringify(t1)));
comprobar("ningún texto cortado con «…»", !JSON.stringify(t1).includes("…"));

console.log("\nTarjetas de los apuntes de electricidad");
const t2 = tarjetasDe(extraer(apuntes));
comprobar("fórmulas con sus símbolos y unidades", t2.some((t) => t.frente === "¿Cómo se calcula la potencia electrica en trifasica?" && /\*\*P\*\*: potencia electrica \(W\)/.test(t.reverso)));
comprobar("no pregunta «Su unidad»", !t2.some((t) => /^su unidad/i.test(t.frente)));

console.log("\nRepaso espaciado");
const ahora = new Date("2026-10-01T10:00:00Z");
const dia = 86_400_000;
let e = siguiente(null, 2, ahora);
comprobar("nueva y me la sé → vuelve en 2 días", e.intervalo === 2 && e.vence.getTime() - ahora.getTime() === 2 * dia);
e = siguiente(e, 2, ahora);
comprobar("otra vez bien → 4 días", e.intervalo === 4);
e = siguiente(e, 2, ahora);
comprobar("y cada vez más lejos (≈10 días)", e.intervalo >= 9 && e.intervalo <= 11, `${e.intervalo}`);
comprobar("a partir de una semana, aprendida", aprendida(e));
const olvidada = siguiente(e, 0, ahora);
comprobar("si se olvida, vuelve en 10 minutos y empieza de nuevo", olvidada.intervalo === 0 && olvidada.repeticiones === 0 && olvidada.vence.getTime() - ahora.getTime() === 600_000 && olvidada.fallos === 1);
comprobar("y cuesta más que vuelva a alejarse (facilidad menor)", olvidada.facilidad < e.facilidad);
comprobar("nueva y dudé → mañana", siguiente(null, 1, ahora).intervalo === 1);
comprobar("dudar no la aleja tanto como sabérsela", siguiente(e, 1, ahora).intervalo < siguiente(e, 2, ahora).intervalo);
let f = siguiente(null, 0, ahora);
for (let i = 0; i < 20; i++) f = siguiente(f, 0, ahora);
comprobar("la facilidad nunca baja de 1,3", f.facilidad >= 1.3);
let g = siguiente(null, 2, ahora);
for (let i = 0; i < 30; i++) g = siguiente(g, 2, ahora);
comprobar("ni el repaso se va más allá de un año", g.intervalo <= 365);
comprobar("los botones dicen cuándo vuelve", cuando(null, 0, ahora) === "10 min" && cuando(null, 1, ahora) === "1 día" && cuando(null, 2, ahora) === "2 días");
comprobar("y en meses cuando es lejos", /mes/.test(cuando({ ...g, intervalo: 40, repeticiones: 5 }, 2, ahora)));

console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nTarjetas y repaso espaciado correctos");
process.exit(fallos ? 1 : 0);
