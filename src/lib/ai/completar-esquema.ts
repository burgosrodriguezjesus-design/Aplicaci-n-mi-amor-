/**
 * Los esquemas antiguos guardaban frases cortadas con "…" ("responde ante
 * terceros con todos sus bienes, es decir, de…"). El resumen, en cambio,
 * tiene la frase entera: aquí se busca cada una allí y se completa. Así los
 * documentos ya creados se arreglan solos, sin tener que regenerarlos.
 */
import type { OutlineNode, OutlineTree } from "@/lib/ai/types";

const CORTADA_RE = /\s*(…|\.{3})\s*$/;
const ABREVIATURAS_RE = /\b(etc|p\.\s?ej|art|arts|núm|pág|págs|aprox|Sr|Sra|Dr|Dra|Ud|Uds|S\.\s?[AL]|S\.\s?Coop)\./gi;

/** El resumen en líneas sueltas, sin negritas ni marcas de Markdown. */
function lineasDe(markdowns: string[]) {
  return markdowns
    .join("\n")
    .split("\n")
    .map((l) =>
      l
        .replace(/\*\*/g, "")
        .replace(/^\s*(?:[-*]\s+|>\s*(?:\[![\w-]+\]\s*)?|#{1,6}\s+)/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/** Desde `inicio`, hasta el final de esa frase (sin el punto). */
function hastaFinDeFrase(linea: string, inicio: number) {
  const resto = linea.slice(inicio).replace(ABREVIATURAS_RE, (m) => m.replace(/\./g, "§"));
  const fin = /[.!?;](?=\s+[¿¡"«(]?[A-ZÁÉÍÓÚÑ0-9]|\s*$)/.exec(resto);
  const frase = fin ? resto.slice(0, fin.index) : resto;
  return frase.replace(/§/g, ".").replace(/[.;,:\s]+$/, "").trim();
}

function completarEtiqueta(label: string, lineas: string[]): string {
  if (!CORTADA_RE.test(label)) return label;
  const cuerpo = label.replace(CORTADA_RE, "").replace(/[,;:\s]+$/, "");
  const dosPuntos = cuerpo.indexOf(": ");
  const prefijo = dosPuntos > 0 && dosPuntos <= 60 ? cuerpo.slice(0, dosPuntos + 2) : "";
  const fragmento = cuerpo.slice(prefijo.length);
  if (fragmento.length >= 8) {
    const buscado = fragmento.toLowerCase();
    for (const linea of lineas) {
      const donde = linea.toLowerCase().indexOf(buscado);
      if (donde < 0) continue;
      const completa = hastaFinDeFrase(linea, donde);
      if (completa.length >= fragmento.length) return prefijo + fragmento + completa.slice(fragmento.length);
    }
  }
  // No aparece en el resumen: al menos, sin los puntos suspensivos.
  return cuerpo;
}

/** Devuelve el esquema con las frases completas y si ha cambiado algo. */
export function completarEsquema(tree: OutlineTree, markdowns: string[]): { tree: OutlineTree; cambiado: boolean } {
  let lineas: string[] | null = null;
  let cambiado = false;
  const repasar = (nodos: OutlineNode[]): OutlineNode[] =>
    nodos.map((nodo) => {
      let label = nodo.label;
      if (typeof label === "string" && CORTADA_RE.test(label)) {
        lineas ??= lineasDe(markdowns);
        label = completarEtiqueta(label, lineas);
        cambiado = true;
      }
      return nodo.children?.length ? { ...nodo, label, children: repasar(nodo.children) } : { ...nodo, label };
    });
  const nodes = repasar(tree.nodes ?? []);
  return { tree: cambiado ? { ...tree, nodes } : tree, cambiado };
}
