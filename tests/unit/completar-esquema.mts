/**
 * Los esquemas antiguos, con frases cortadas por "…", se completan con la
 * frase entera del resumen.
 *
 *   npx tsx tests/unit/completar-esquema.mts
 */
const { completarEsquema } = await import("../../src/lib/ai/completar-esquema");

let fallos = 0;
function comprobar(titulo: string, ok: boolean, detalle = "") {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo + (!ok && detalle ? ` — ${detalle}` : ""));
  if (!ok) fallos += 1;
}

const resumen = [
  "## Formas jurídicas",
  "- La **empresa individual** es una persona física que responde ante terceros con todos sus bienes, es decir, de forma ilimitada. Tiene ventajas.",
  "- La **comunidad de bienes** se constituye cuando la propiedad de un bien o derecho pertenece proindiviso a varias personas.",
  "- Las **sociedades mercantiles** tienen un capital social dividido en participaciones (p. ej. la S.L. o la S.A.) y responden con él.",
  "> [!importante] En la denominación debe figurar la indicación «Sociedad de Responsabilidad Limitada» o su abreviatura.",
].join("\n");

const antiguo = {
  title: "Doc",
  nodes: [
    {
      label: "Formas jurídicas",
      kind: "chapter" as const,
      children: [
        { label: "Empresa individual: persona física que responde ante terceros con todos sus bienes, es decir, de…", kind: "concept" as const },
        { label: "Comunidad de bienes: se constituye cuando la propiedad de un bien o derecho pertenece proindiviso a…", kind: "concept" as const },
        { label: "Sociedades mercantiles: tienen un capital social…", kind: "concept" as const },
        { label: "En la denominación debe figurar la indicación «Sociedad de…", kind: "key" as const },
        { label: "Algo que ya no está en el resumen…", kind: "detail" as const },
        { label: "Frase entera", kind: "detail" as const },
      ],
    },
  ],
};

const { tree, cambiado } = completarEsquema(antiguo, [resumen]);
const hijos = tree.nodes[0].children!.map((n) => n.label);
comprobar("detecta que había frases cortadas", cambiado);
comprobar("completa la empresa individual", hijos[0] === "Empresa individual: persona física que responde ante terceros con todos sus bienes, es decir, de forma ilimitada", hijos[0]);
comprobar("completa la comunidad de bienes", hijos[1] === "Comunidad de bienes: se constituye cuando la propiedad de un bien o derecho pertenece proindiviso a varias personas", hijos[1]);
comprobar("no corta en las abreviaturas (p. ej., S.L.)", hijos[2] === "Sociedades mercantiles: tienen un capital social dividido en participaciones (p. ej. la S.L. o la S.A.) y responden con él", hijos[2]);
comprobar("completa los recuadros importantes", hijos[3].endsWith("o su abreviatura"), hijos[3]);
comprobar("si no la encuentra, al menos sin «…»", hijos[4] === "Algo que ya no está en el resumen", hijos[4]);
comprobar("lo que ya estaba bien no cambia", hijos[5] === "Frase entera");
comprobar("ninguna etiqueta con «…»", !JSON.stringify(tree).includes("…"));
comprobar("sin frases cortadas, no toca nada", completarEsquema(tree, [resumen]).cambiado === false);

console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nEsquemas antiguos completados");
process.exit(fallos ? 1 : 0);
