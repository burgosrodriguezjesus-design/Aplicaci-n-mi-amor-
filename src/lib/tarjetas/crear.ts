/**
 * Tarjetas de memoria que salen solas del resumen de cada documento: una
 * pregunta por delante y la respuesta del propio temario por detrás.
 *
 *  - Concepto: «Stock de seguridad» → su definición.
 *  - Clasificación: «¿En qué se clasifican las existencias?» → todos sus tipos.
 *  - Elemento: «Mercaderías» → lo que las caracteriza.
 *  - Fórmula: «¿Cómo se calcula la potencia en trifásica?» → la fórmula y sus símbolos.
 *  - ¿Por qué?: «¿Por qué el IVA es neutral?» → la razón.
 *  - Dato: una frase con la cifra tapada → la cifra.
 *
 * Cada tarjeta tiene una clave estable (sale de su contenido), así el
 * repaso se conserva aunque se vuelva a abrir o se regenere el documento.
 */
import { type Contenido, mayuscula, sinPunto, tituloSinNumero, variables } from "../examen/extraer";
import { huecos } from "../examen/generar";
import { conArticulo } from "../preguntas/motor";
import type { Tarjeta } from "./tipos";

export type { Tarjeta, TipoTarjeta } from "./tipos";
export { ETIQUETA_TIPO } from "./tipos";

/** Como mucho, tantas tarjetas por documento (las primeras del temario). */
const MAXIMO = 150;

function clave(tipo: string, texto: string) {
  const t = `${tipo}|${texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < t.length; i++) {
    h1 = Math.imul(h1 ^ t.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ t.charCodeAt(i), 2246822519);
  }
  return `${tipo.slice(0, 3)}-${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

export function tarjetasDe(c: Contenido): Tarjeta[] {
  // En el orden del temario: así las nuevas se aprenden en el orden del libro.
  const orden = new Map(c.apartados.map((a, i) => [`${a.unidad}|${a.titulo}`, i]));
  const posicion = (l: { unidad: string; apartado: string }) => orden.get(`${l.unidad}|${l.apartado}`) ?? 9999;
  const salida: (Tarjeta & { orden: number })[] = [];
  const poner = (t: Omit<Tarjeta, "clave">, l: { unidad: string; apartado: string }, sub = 0) => {
    const k = clave(t.tipo, t.frente);
    if (salida.some((x) => x.clave === k)) return;
    salida.push({ ...t, clave: k, orden: posicion(l) * 100 + sub });
  };

  for (const d of c.definiciones) {
    poner(
      {
        tipo: "concepto",
        frente: mayuscula(d.termino),
        reverso: `${mayuscula(sinPunto(d.definicion))}.`,
        apartado: tituloSinNumero(d.apartado),
        pagina: d.pagina,
      },
      d,
      1,
    );
  }

  for (const l of c.listas) {
    const nombres = l.elementos.map((e) => e.nombre);
    if (nombres.length < 2) continue;
    const clasifica = /^(.+?)\s+se\s+(clasifican|dividen|agrupan|distinguen|componen)\s+en$/i.exec(sinPunto(l.intro));
    let frente = `${mayuscula(sinPunto(l.intro)).replace(/\s(en|como|son|de)$/i, "")}. ¿Cuáles son?`;
    if (clasifica) {
      // "Según su función, las existencias" → "las existencias según su función".
      const partes = clasifica[1].split(/,\s*/);
      const sujeto = partes.pop()!.replace(/^[A-ZÁÉÍÓÚ]/, (m) => m.toLowerCase());
      const complemento = partes.join(", ").replace(/^[A-ZÁÉÍÓÚ]/, (m) => m.toLowerCase());
      frente = `¿En qué se ${clasifica[2]} ${sujeto}${complemento ? ` ${complemento}` : ""}?`;
    }
    poner(
      {
        tipo: "clasificacion",
        frente,
        reverso: l.elementos.map((e) => `- **${e.nombre}**${e.detalle ? `: ${sinPunto(e.detalle)}.` : ""}`).join("\n"),
        apartado: tituloSinNumero(l.apartado),
        pagina: l.pagina,
      },
      l,
      2,
    );
    for (const e of l.elementos.filter((x) => x.detalle.split(/\s+/).length >= 3)) {
      poner(
        {
          tipo: "elemento",
          frente: e.nombre,
          reverso: `${mayuscula(sinPunto(e.detalle))}.\n\n*Es uno de los elementos de «${tituloSinNumero(l.apartado)}».*`,
          apartado: tituloSinNumero(l.apartado),
          pagina: l.pagina,
        },
        l,
        3,
      );
    }
  }

  for (const f of c.formulas) {
    const simbolo = c.simbolos[f.nombre];
    // El artículo con que el temario usa el término ("el punto de pedido").
    const definicion = c.definiciones.find((d) => d.termino.toLowerCase() === f.nombre.toLowerCase());
    const nombre = simbolo
      ? `la ${simbolo.nombre}`
      : [conArticulo(f.nombre, f.frase), definicion ? conArticulo(f.nombre, definicion.frase) : null].find((x) => x && !x.texto.startsWith("«"))?.texto ??
        conArticulo(f.nombre, f.frase).texto;
    const usados = [f.nombre, ...variables(f.expr)].filter((v, i, a) => a.indexOf(v) === i && c.simbolos[v]);
    poner(
      {
        tipo: "formula",
        frente: `¿Cómo se calcula ${nombre}${f.contexto ? ` ${f.contexto}` : ""}?`,
        reverso:
          (f.procedimiento ? `Se obtiene ${sinPunto(f.procedimiento)}:\n\n` : "") +
          `**${f.texto}**` +
          (usados.length
            ? `\n\n${usados.map((v) => `- **${v}**: ${c.simbolos[v].nombre}${c.simbolos[v].unidad ? ` (${c.simbolos[v].unidad})` : ""}`).join("\n")}`
            : ""),
        apartado: tituloSinNumero(f.apartado),
        pagina: f.pagina,
      },
      f,
      4,
    );
  }

  for (const r of c.razones) {
    poner({ tipo: "porque", frente: r.pregunta, reverso: `${r.respuesta}.`, apartado: tituloSinNumero(r.apartado), pagina: r.pagina }, r, 5);
  }

  for (const d of c.datos) {
    // La cifra más significativa de la frase (con unidad, mejor).
    const h = huecos(d.frase).sort((a, b) => Number(Boolean(b.unidad)) - Number(Boolean(a.unidad)))[0];
    if (!h || d.frase.length > 260) continue;
    poner(
      {
        tipo: "dato",
        frente: `Completa: ${sinPunto(h.hueco)}.`,
        reverso: `**${h.texto}**\n\n${sinPunto(d.frase)}.`,
        apartado: tituloSinNumero(d.apartado),
        pagina: d.pagina,
      },
      d,
      6,
    );
  }

  return salida
    .sort((a, b) => a.orden - b.orden)
    .slice(0, MAXIMO)
    .map(({ orden: _orden, ...t }) => t);
}
