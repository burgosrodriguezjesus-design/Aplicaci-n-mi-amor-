/**
 * Arma la página de estudio: un solo fichero HTML con el resumen, el esquema y
 * el audio, que se abre con doble clic o desde el móvil, sin servidor y sin
 * conexión. La voz es la del propio dispositivo.
 */

const escapar = (texto) =>
  String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Negritas, cursivas, código y referencias de página dentro de una línea. */
function enLinea(texto) {
  return escapar(texto)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\((p[áa]gs?\.\s*[\d\s-]+)\)/gi, '<span class="pag">$1</span>');
}

const CALLOUTS = {
  examen: ["examen", "Para el examen"],
  aclaracion: ["aclaracion", "Aclaración"],
  duda: ["duda", "Sin confirmar"],
};

/** Markdown sencillo: el que produce la aplicación, no uno general. */
function marcado(md) {
  const salida = [];
  let lista = null;

  const cerrarLista = () => {
    if (lista) {
      salida.push(`</${lista}>`);
      lista = null;
    }
  };

  for (const bruta of String(md ?? "").split("\n")) {
    const linea = bruta.trimEnd();

    if (!linea.trim()) {
      cerrarLista();
      continue;
    }

    if (linea.startsWith("[[chips]]")) {
      cerrarLista();
      const chips = linea
        .slice("[[chips]]".length)
        .split("|")
        .filter(Boolean)
        .map((c) => `<span class="chip">${escapar(c)}</span>`)
        .join("");
      salida.push(`<div class="chips">${chips}</div>`);
      continue;
    }

    const callout = /^>\s*\[!(\w+)\]\s*(.*)$/.exec(linea);
    if (callout) {
      cerrarLista();
      const [clase, etiqueta] = CALLOUTS[callout[1]] ?? ["aclaracion", "Nota"];
      salida.push(
        `<div class="callout ${clase}"><b>${etiqueta}</b><span>${enLinea(callout[2])}</span></div>`,
      );
      continue;
    }

    const titulo = /^(#{1,6})\s+(.*)$/.exec(linea);
    if (titulo) {
      cerrarLista();
      const nivel = Math.min(titulo[1].length + 1, 6);
      salida.push(`<h${nivel}>${enLinea(titulo[2])}</h${nivel}>`);
      continue;
    }

    const punto = /^\s*[-*]\s+(.*)$/.exec(linea);
    if (punto) {
      if (lista !== "ul") {
        cerrarLista();
        salida.push("<ul>");
        lista = "ul";
      }
      salida.push(`<li>${enLinea(punto[1])}</li>`);
      continue;
    }

    const numerado = /^\s*\d+[.)]\s+(.*)$/.exec(linea);
    if (numerado) {
      if (lista !== "ol") {
        cerrarLista();
        salida.push("<ol>");
        lista = "ol";
      }
      salida.push(`<li>${enLinea(numerado[1])}</li>`);
      continue;
    }

    cerrarLista();
    salida.push(`<p>${enLinea(linea)}</p>`);
  }
  cerrarLista();
  return salida.join("\n");
}

/** El esquema, como lista desplegable. */
function arbol(nodos, profundidad = 0) {
  if (!Array.isArray(nodos) || nodos.length === 0) return "";
  const elementos = nodos
    .map((nodo) => {
      const hijos = arbol(nodo.children, profundidad + 1);
      const pagina = nodo.page ? `<span class="pag">pág. ${nodo.page}</span>` : "";
      const etiqueta = `<span class="et">${escapar(nodo.label)}</span>${pagina}`;
      if (!hijos) return `<li class="n ${escapar(nodo.kind ?? "")}">${etiqueta}</li>`;
      return (
        `<li class="n ${escapar(nodo.kind ?? "")}">` +
        `<details${profundidad < 1 ? " open" : ""}><summary>${etiqueta}</summary>${hijos}</details>` +
        `</li>`
      );
    })
    .join("");
  return `<ul class="arbol">${elementos}</ul>`;
}

export function construirPagina({ titulo, paginas, usedOcr, secciones, esquema, pistas }) {
  const datos = {
    titulo,
    pistas: (pistas ?? []).map((pista) => ({
      titulo: pista.title,
      segmentos: (pista.segments ?? []).map((s) => ({
        t: s.text,
        m: s.displayText ?? s.text,
      })),
    })),
  };

  const apartados = (secciones ?? [])
    .map((seccion, indice) => {
      const paginasRef = Array.isArray(seccion.sourcePages) ? seccion.sourcePages : [];
      const etiqueta = paginasRef.length
        ? paginasRef.length === 1
          ? `pág. ${paginasRef[0]}`
          : `págs. ${Math.min(...paginasRef)}-${Math.max(...paginasRef)}`
        : "";
      return (
        `<section class="tarjeta" id="s${indice}">` +
        (etiqueta ? `<div class="cab"><span class="pag">${etiqueta}</span></div>` : "") +
        `<div class="prosa">${marcado(seccion.markdown)}</div>` +
        `</section>`
      );
    })
    .join("\n");

  // El índice se agrupa por tema: repetir «TEMA 2 - …» en cada línea lo hace
  // ilegible justo donde tiene que servir para orientarse de un vistazo.
  const indice = (() => {
    const lineas = [];
    let temaActual = null;
    (secciones ?? []).forEach((seccion, i) => {
      const partes = String(seccion.title).split(" · ");
      const tema = partes.length > 1 ? partes[0] : null;
      const hoja = partes.length > 1 ? partes.slice(1).join(" · ") : seccion.title;
      if (tema && tema !== temaActual) {
        temaActual = tema;
        lineas.push(`<li class="tema">${escapar(tema)}</li>`);
      }
      if (!tema) temaActual = null;
      lineas.push(
        `<li class="hoja${tema ? " dentro" : ""}"><a href="#s${i}">${escapar(hoja)}</a></li>`,
      );
    });
    return lineas.join("");
  })();

  return `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${escapar(titulo)}</title>
<style>
  :root {
    --papel:#faf9f7; --fondo:#fff; --hundido:#f2f0ec; --borde:#e6e3dd;
    --tinta:#191a1f; --suave:#4b4d57; --mudo:#83858f;
    --acento:#5b4bd6; --acento-suave:#eeebff; --audio:#b56a14; --audio-suave:#fdf1e0;
    --aviso:#8a6100; --aviso-suave:#fdf3dc; --peligro:#b3261e;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --papel:#0d0d10; --fondo:#16161b; --hundido:#1d1d24; --borde:#26262e;
      --tinta:#f2f1ef; --suave:#b9b8c0; --mudo:#85848e;
      --acento:#8f83f5; --acento-suave:#221e3e; --audio:#e9a24a; --audio-suave:#2b1f10;
      --aviso:#e7bd5e; --aviso-suave:#2a2211; --peligro:#f2837a;
    }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--papel);color:var(--tinta);
    font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))}
  .ancho{max-width:900px;margin:0 auto;padding:18px 16px}
  header h1{margin:0 0 2px;font-size:22px;letter-spacing:-.02em}
  header p{margin:0;color:var(--mudo);font-size:13.5px}
  .barra{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--papel) 94%,transparent);
    backdrop-filter:blur(8px);padding:10px 0;margin-bottom:6px}
  .seg{display:inline-flex;gap:2px;padding:3px;background:var(--hundido);
    border:1px solid var(--borde);border-radius:13px}
  .seg button{font:inherit;font-size:14px;border:0;background:transparent;color:var(--mudo);
    padding:7px 14px;border-radius:10px;cursor:pointer}
  .seg button[aria-selected=true]{background:var(--fondo);color:var(--tinta);font-weight:600}
  .panel{display:none} .panel.activo{display:block}
  .tarjeta{background:var(--fondo);border:1px solid var(--borde);border-radius:16px;
    padding:16px;margin-bottom:12px}
  .cab{display:flex;justify-content:space-between;margin-bottom:8px}
  .pag{font-size:11.5px;font-weight:600;color:var(--mudo);background:var(--hundido);
    border:1px solid var(--borde);border-radius:999px;padding:1px 8px;margin-left:6px}
  .prosa h3{font-size:19px;margin:0 0 12px;letter-spacing:-.015em}
  .prosa h4{font-size:15.5px;margin:22px 0 8px}
  .prosa h5{font-size:13.5px;margin:18px 0 6px;color:var(--suave);
    text-transform:uppercase;letter-spacing:.05em}
  .prosa p{margin:0 0 12px} .prosa ul,.prosa ol{margin:0 0 12px;padding-left:22px}
  .prosa li{margin-bottom:5px}
  code{font-family:ui-monospace,Menlo,monospace;font-size:.88em;background:var(--hundido);
    border:1px solid var(--borde);border-radius:6px;padding:1px 5px}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
  .chip{font-size:12.5px;background:var(--acento-suave);color:var(--acento);
    border-radius:999px;padding:3px 10px}
  .callout{display:flex;gap:10px;border-radius:12px;padding:11px 13px;margin:0 0 12px;
    font-size:14.5px;border:1px solid transparent}
  .callout b{font-size:11px;text-transform:uppercase;letter-spacing:.05em;flex:none}
  .callout.examen{background:var(--aviso-suave);border-color:color-mix(in srgb,var(--aviso) 30%,transparent)}
  .callout.aclaracion{background:var(--acento-suave);border-color:color-mix(in srgb,var(--acento) 26%,transparent)}
  .callout.duda{background:var(--aviso-suave);border-color:color-mix(in srgb,var(--peligro) 26%,transparent)}
  .arbol{list-style:none;margin:0;padding:0}
  .arbol .arbol{margin:3px 0 0 10px;padding-left:12px;border-left:1px solid var(--borde)}
  .n{padding:3px 0} .n .et{font-size:14.5px}
  .n.chapter>details>summary .et,.n.chapter .et{font-weight:700;font-size:15.5px}
  .n.section>details>summary .et,.n.section .et{font-weight:600}
  .n.concept .et,.n.detail .et{color:var(--suave);font-size:13.5px}
  .n.formula .et{font-family:ui-monospace,Menlo,monospace;color:var(--acento);font-size:13px}
  summary{cursor:pointer;list-style:none} summary::-webkit-details-marker{display:none}
  summary::before{content:"▸";color:var(--mudo);margin-right:6px;font-size:11px}
  details[open]>summary::before{content:"▾"}
  .pista{border-top:1px solid var(--borde);padding:10px 0}
  .pista:first-child{border-top:0}
  .pista button.reproducir{font:inherit;font-size:14.5px;border:0;background:transparent;
    color:var(--tinta);cursor:pointer;text-align:left;padding:4px 0;width:100%}
  .pista[data-actual=true]{color:var(--audio)}
  .frase{display:block;width:100%;text-align:left;font:inherit;font-size:15px;
    background:transparent;border:0;color:var(--suave);padding:7px 10px;border-radius:9px;cursor:pointer}
  .frase[data-activa=true]{background:var(--acento-suave);color:var(--tinta);
    box-shadow:inset 3px 0 0 var(--acento)}
  .mini{position:fixed;left:0;right:0;bottom:0;z-index:30;background:var(--fondo);
    border-top:1px solid var(--borde);padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px))}
  .mini .dentro{max-width:900px;margin:0 auto;display:flex;align-items:center;gap:10px}
  .mini .tit{flex:1;min-width:0;font-size:13.5px;font-weight:600;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ctrl{width:38px;height:38px;border:0;border-radius:999px;background:var(--hundido);
    color:var(--suave);font-size:15px;cursor:pointer;flex:none}
  .ctrl.principal{background:var(--acento);color:#fff;width:44px;height:44px}
  .vel{font:inherit;font-size:12.5px;border:1px solid var(--borde);background:var(--hundido);
    color:var(--suave);border-radius:999px;padding:4px 9px;cursor:pointer;flex:none}
  .nota{font-size:13px;color:var(--mudo);margin:10px 0 0}
  .indice h2{margin:0 0 10px;font-size:12px;text-transform:uppercase;
    letter-spacing:.06em;color:var(--mudo)}
  .indice ul{list-style:none;margin:0;padding:0;max-height:60vh;overflow:auto}
  .indice .tema{margin:12px 0 4px;font-size:13px;font-weight:700;
    text-transform:uppercase;letter-spacing:.03em;color:var(--mudo)}
  .indice .tema:first-child{margin-top:0}
  .indice .hoja{padding:3px 0}
  .indice .hoja.dentro{padding-left:12px;border-left:1px solid var(--borde)}
  .indice a{color:var(--tinta);text-decoration:none;font-size:14.5px}
  .indice a:hover{color:var(--acento)}
</style>

<div class="ancho">
  <header>
    <h1>${escapar(titulo)}</h1>
    <p>${paginas} páginas · ${(secciones ?? []).length} apartados${
      usedOcr ? " · texto reconocido de un escaneado" : ""
    }</p>
  </header>

  <div class="barra">
    <div class="seg" role="tablist">
      <button role="tab" aria-selected="true" data-panel="resumen">Resumen</button>
      <button role="tab" aria-selected="false" data-panel="esquema">Esquema</button>
      <button role="tab" aria-selected="false" data-panel="audio">Audio</button>
    </div>
  </div>

  <div class="panel activo" id="panel-resumen">
    ${
      indice
        ? `<section class="tarjeta indice"><h2>Índice</h2><ul>${indice}</ul></section>`
        : ""
    }
    ${apartados}
  </div>

  <div class="panel" id="panel-esquema">
    <section class="tarjeta">${arbol(esquema?.nodes ?? esquema?.children ?? [])}</section>
  </div>

  <div class="panel" id="panel-audio">
    <section class="tarjeta" id="pistas"></section>
    <p class="nota">Lo lee la voz de tu propio dispositivo, sin conexión. En el
      móvil, deja la pantalla encendida mientras escuchas.</p>
  </div>
</div>

<div class="mini" id="mini" hidden>
  <div class="dentro">
    <div class="tit" id="miniTitulo">—</div>
    <button class="vel" id="velocidad">1×</button>
    <button class="ctrl" id="anterior" aria-label="Anterior">⏮</button>
    <button class="ctrl principal" id="reproducir" aria-label="Reproducir o pausar">▶</button>
    <button class="ctrl" id="siguiente" aria-label="Siguiente">⏭</button>
  </div>
</div>

<script id="datos" type="application/json">${JSON.stringify(datos).replace(/</g, "\\u003c")}</script>
<script>
(function () {
  const datos = JSON.parse(document.getElementById("datos").textContent);
  const $ = (id) => document.getElementById(id);

  // ── Pestañas
  for (const boton of document.querySelectorAll(".seg button")) {
    boton.addEventListener("click", () => {
      for (const otro of document.querySelectorAll(".seg button")) {
        otro.setAttribute("aria-selected", String(otro === boton));
      }
      for (const panel of document.querySelectorAll(".panel")) {
        panel.classList.toggle("activo", panel.id === "panel-" + boton.dataset.panel);
      }
    });
  }

  // ── Audio con la voz del dispositivo
  const contenedor = $("pistas");
  const estado = { pista: 0, frase: 0, sonando: false, velocidad: 1 };
  const VELOCIDADES = [0.75, 1, 1.25, 1.5, 1.75, 2];

  datos.pistas.forEach((pista, indice) => {
    const caja = document.createElement("div");
    caja.className = "pista";
    caja.dataset.indice = String(indice);
    const boton = document.createElement("button");
    boton.className = "reproducir";
    boton.textContent = "▶  " + pista.titulo;
    boton.addEventListener("click", () => empezar(indice, 0));
    caja.appendChild(boton);

    const frases = document.createElement("div");
    frases.className = "frases";
    frases.hidden = true;
    pista.segmentos.forEach((segmento, posicion) => {
      const linea = document.createElement("button");
      linea.className = "frase";
      linea.textContent = segmento.m;
      linea.addEventListener("click", () => empezar(indice, posicion));
      frases.appendChild(linea);
    });
    caja.appendChild(frases);
    contenedor.appendChild(caja);
  });

  function pintar() {
    for (const caja of document.querySelectorAll(".pista")) {
      const actual = Number(caja.dataset.indice) === estado.pista;
      caja.dataset.actual = String(actual);
      caja.querySelector(".frases").hidden = !actual;
      const frases = caja.querySelectorAll(".frase");
      frases.forEach((linea, posicion) => {
        linea.dataset.activa = String(actual && posicion === estado.frase && estado.sonando);
      });
      if (actual && estado.sonando) {
        const activa = frases[estado.frase];
        if (activa) activa.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
    $("mini").hidden = datos.pistas.length === 0;
    $("miniTitulo").textContent = (datos.pistas[estado.pista] || {}).titulo || "—";
    $("reproducir").textContent = estado.sonando ? "⏸" : "▶";
    $("velocidad").textContent = estado.velocidad + "×";
  }

  function hablar() {
    const pista = datos.pistas[estado.pista];
    if (!pista) { parar(); return; }
    const segmento = pista.segmentos[estado.frase];
    if (!segmento) {
      if (estado.pista + 1 < datos.pistas.length) { empezar(estado.pista + 1, 0); return; }
      parar(); return;
    }
    const voz = new SpeechSynthesisUtterance(segmento.t);
    voz.lang = "es-ES";
    voz.rate = estado.velocidad;
    voz.onend = () => {
      if (!estado.sonando) return;
      estado.frase += 1;
      pintar();
      hablar();
    };
    speechSynthesis.speak(voz);
  }

  function empezar(pista, frase) {
    speechSynthesis.cancel();
    estado.pista = pista;
    estado.frase = frase;
    estado.sonando = true;
    pintar();
    hablar();
  }

  function parar() {
    speechSynthesis.cancel();
    estado.sonando = false;
    pintar();
  }

  $("reproducir").addEventListener("click", () => {
    if (estado.sonando) parar();
    else empezar(estado.pista, estado.frase);
  });
  $("anterior").addEventListener("click", () => empezar(Math.max(0, estado.pista - 1), 0));
  $("siguiente").addEventListener("click", () =>
    empezar(Math.min(datos.pistas.length - 1, estado.pista + 1), 0));
  $("velocidad").addEventListener("click", () => {
    const siguiente = VELOCIDADES[(VELOCIDADES.indexOf(estado.velocidad) + 1) % VELOCIDADES.length];
    estado.velocidad = siguiente;
    if (estado.sonando) empezar(estado.pista, estado.frase);
    else pintar();
  });

  pintar();
})();
</script>
`;
}
