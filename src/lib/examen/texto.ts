/**
 * El examen como documento: en Markdown (para descargar) y en HTML (para
 * imprimir o guardar en PDF). Las preguntas primero y, en una sección
 * separada al final, las SOLUCIONES.
 */
import { type Examen, type Fuente, ETIQUETA_DIFICULTAD, LETRAS } from "./tipos";

type Bloque = { titulo: string; preguntas: { n: number; dificultad: string; enunciado: string; opciones?: string[]; datos?: string[] }[] };

/** Numeración continua de todo el examen (1…40), la misma en preguntas y soluciones. */
export function numerar(examen: Examen) {
  let n = 0;
  const numeros = new Map<string, number>();
  for (const p of [...examen.test, ...examen.cortas, ...examen.desarrollo, ...examen.ejercicios]) numeros.set(p.id, ++n);
  return numeros;
}

function bloques(examen: Examen): Bloque[] {
  const num = numerar(examen);
  const b: Bloque[] = [];
  if (examen.test.length)
    b.push({ titulo: "Preguntas tipo test", preguntas: examen.test.map((p) => ({ n: num.get(p.id)!, dificultad: ETIQUETA_DIFICULTAD[p.dificultad], enunciado: p.enunciado, opciones: p.opciones })) });
  if (examen.cortas.length)
    b.push({ titulo: "Preguntas cortas", preguntas: examen.cortas.map((p) => ({ n: num.get(p.id)!, dificultad: ETIQUETA_DIFICULTAD[p.dificultad], enunciado: p.enunciado })) });
  if (examen.desarrollo.length)
    b.push({ titulo: "Preguntas de desarrollo", preguntas: examen.desarrollo.map((p) => ({ n: num.get(p.id)!, dificultad: ETIQUETA_DIFICULTAD[p.dificultad], enunciado: p.enunciado })) });
  if (examen.ejercicios.length)
    b.push({ titulo: "Ejercicios prácticos", preguntas: examen.ejercicios.map((p) => ({ n: num.get(p.id)!, dificultad: ETIQUETA_DIFICULTAD[p.dificultad], enunciado: p.enunciado, datos: p.datos })) });
  return b;
}

export function textoFuente(f: Fuente) {
  return `«${f.cita}» — ${f.apartado}${f.pagina ? `, pág. ${f.pagina}` : ""}`;
}

/** Soluciones en orden, con la respuesta, la explicación y la fuente. */
export function soluciones(examen: Examen) {
  const num = numerar(examen);
  return [
    ...examen.test.map((p) => ({
      n: num.get(p.id)!,
      id: p.id,
      respuesta: `${LETRAS[p.correcta]}) ${p.opciones[p.correcta]}`,
      explicacion: p.explicacion,
      fuente: p.fuente,
    })),
    ...[...examen.cortas, ...examen.desarrollo, ...examen.ejercicios].map((p) => ({
      n: num.get(p.id)!,
      id: p.id,
      respuesta: p.respuesta,
      explicacion: p.explicacion,
      fuente: p.fuente,
    })),
  ];
}

export function examenAMarkdown(examen: Examen) {
  const lineas: string[] = [`# ${examen.titulo}`, ""];
  for (const [i, b] of bloques(examen).entries()) {
    lineas.push(`## ${i + 1}. ${b.titulo}`, "");
    for (const p of b.preguntas) {
      lineas.push(`**${p.n}.** (${p.dificultad}) ${p.enunciado}`);
      for (const [j, o] of (p.opciones ?? []).entries()) lineas.push(`   ${LETRAS[j]}) ${o}`);
      for (const d of p.datos ?? []) lineas.push(`   - ${d}`);
      lineas.push("");
    }
  }
  lineas.push("---", "", "## SOLUCIONES", "");
  for (const s of soluciones(examen)) {
    lineas.push(`**${s.n}.** Respuesta correcta: ${s.respuesta.includes("\n") ? `\n${s.respuesta.split("\n").map((l) => `   ${l}`).join("\n")}` : s.respuesta}`);
    lineas.push(`   Explicación: ${s.explicacion}`);
    lineas.push(`   Basado en: ${textoFuente(s.fuente)}`, "");
  }
  return lineas.join("\n");
}

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function examenAHtml(examen: Examen) {
  const partes = bloques(examen)
    .map(
      (b, i) => `<h2>${i + 1}. ${escapar(b.titulo)}</h2>` +
        b.preguntas
          .map(
            (p) => `<div class="p"><p><b>${p.n}.</b> <span class="d">${escapar(p.dificultad)}</span> ${escapar(p.enunciado)}</p>` +
              (p.opciones ? `<ol type="A">${p.opciones.map((o) => `<li>${escapar(o)}</li>`).join("")}</ol>` : "") +
              (p.datos?.length ? `<ul>${p.datos.map((d) => `<li>${escapar(d)}</li>`).join("")}</ul>` : "") +
              (p.opciones ? "" : '<div class="hueco"></div>') +
              "</div>",
          )
          .join(""),
    )
    .join("");
  const sol = soluciones(examen)
    .map(
      (s) => `<div class="s"><p><b>${s.n}.</b> <b>Respuesta:</b> ${escapar(s.respuesta).replace(/\n/g, "<br>")}</p>` +
        `<p><b>Explicación:</b> ${escapar(s.explicacion)}</p><p class="f"><b>Basado en:</b> ${escapar(textoFuente(s.fuente))}</p></div>`,
    )
    .join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(examen.titulo)}</title>
<style>
body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;max-width:760px;margin:32px auto;padding:0 20px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 10px;border-bottom:2px solid #111;padding-bottom:4px}
.p{margin:0 0 16px;break-inside:avoid}.p p{margin:0 0 6px}ol,ul{margin:4px 0 0 22px;padding:0}li{margin:2px 0}
.d{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border:1px solid #999;border-radius:99px;padding:1px 7px;margin-right:4px;color:#444}
.hueco{height:56px;border-bottom:1px dashed #bbb}.sol{break-before:page}.s{margin:0 0 14px;break-inside:avoid}.s p{margin:0 0 3px}.f{color:#555;font-size:13px}
.meta{color:#555;margin:0 0 20px}
</style></head><body>
<h1>${escapar(examen.titulo)}</h1>
<p class="meta">${examen.test.length} preguntas tipo test · ${examen.cortas.length} cortas · ${examen.desarrollo.length} de desarrollo · ${examen.ejercicios.length} ejercicios prácticos</p>
${partes}
<section class="sol"><h2>SOLUCIONES</h2>${sol}</section>
</body></html>`;
}
