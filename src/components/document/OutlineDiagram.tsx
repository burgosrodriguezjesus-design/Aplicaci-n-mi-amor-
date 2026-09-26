"use client";

/**
 * El esquema dibujado, como en unos apuntes:
 *
 *  - «Cuadro»: de izquierda a derecha, con llaves y flechas (el típico cuadro
 *    sinóptico: tema → apartados → conceptos → detalles).
 *  - «Mapa»: mapa conceptual de arriba abajo, con palabras de enlace entre
 *    un recuadro y sus hijos («comprende», «como», «se calcula»…).
 *
 * Cada recuadro se mide de verdad en pantalla y después se colocan todos: así
 * los textos largos no se pisan. Tocar un recuadro con ramas las abre o cierra.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OutlineNodeDto } from "@/lib/client/types";
import { Icon } from "@/components/ui/Icon";

export type EstiloDiagrama = "cuadro" | "mapa";

type Nodo = { id: string; node: OutlineNodeDto; depth: number; hijos: Nodo[]; rama: number };
type Caja = { x: number; y: number; w: number; h: number };

/** Colores de cada rama del mapa conceptual. */
const RAMAS = ["#3b82f6", "#14b8a6", "#ef4444", "#f59e0b", "#8b5cf6", "#10b981", "#ec4899", "#0ea5e9"];

const MARGEN = 18;
type Medidas = { ancho: number; gx: number; gy: number };
/** En pantallas estrechas, recuadros más estrechos: cabe mucho más. */
function medidas(estilo: EstiloDiagrama, compacto: boolean): Medidas {
  if (estilo === "cuadro") return compacto ? { ancho: 180, gx: 40, gy: 10 } : { ancho: 240, gx: 60, gy: 12 };
  return compacto ? { ancho: 150, gx: 12, gy: 70 } : { ancho: 180, gx: 18, gy: 76 };
}

function construir(node: OutlineNodeDto, id: string, depth: number, rama: number): Nodo {
  return {
    id,
    node,
    depth,
    rama,
    hijos: (node.children ?? []).map((hijo, i) => construir(hijo, `${id}.${i}`, depth + 1, depth === 0 ? i : rama)),
  };
}

function acortar(texto: string, maximo: number) {
  if (texto.length <= maximo) return texto;
  const corte = texto.slice(0, maximo);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(" "), maximo * 0.6)).replace(/[,;:.\s]+$/, "")}…`;
}

/** "Término: explicación" → el término destacado y la explicación corta. */
function partes(node: OutlineNodeDto, maximo: number) {
  const kind = node.kind ?? "concept";
  const label = node.label.trim();
  if (kind === "concept" || kind === "detail") {
    const corte = label.indexOf(": ");
    if (corte > 0 && corte <= 60) {
      return { termino: label.slice(0, corte), texto: acortar(label.slice(corte + 2), maximo) };
    }
  }
  return { termino: null, texto: acortar(label, maximo + 30) };
}

/** Palabra que une un recuadro con sus hijos en el mapa conceptual. */
function enlace(n: Nodo): string {
  if (!n.hijos.length || /:\s*$/.test(n.node.label)) return "";
  const tipos = n.hijos.map((h) => h.node.kind ?? "concept");
  if (n.depth === 0) return "comprende";
  if (tipos.every((t) => t === "formula")) return "se calcula";
  if (tipos.every((t) => t === "detail")) return "como";
  if (tipos.every((t) => t === "section" || t === "subsection")) return "se divide en";
  return "incluye";
}

/**
 * En el mapa, tres o más hijos sin ramas propias (los tipos de algo) van en
 * columna bajo su padre en vez de en fila: el mapa no se hace kilométrico.
 */
function enColumna(n: Nodo, cerrados: Set<string>) {
  const hijos = visibles(n, cerrados);
  return hijos.length >= 3 && hijos.every((h) => visibles(h, cerrados).length === 0);
}
const SANGRIA = 22;

function visibles(n: Nodo, cerrados: Set<string>) {
  return cerrados.has(n.id) ? [] : n.hijos;
}

function recorrer(n: Nodo, cerrados: Set<string>, fn: (n: Nodo) => void) {
  fn(n);
  for (const h of visibles(n, cerrados)) recorrer(h, cerrados, fn);
}

/* ── Colocación ─────────────────────────────────────────────────── */

function colocarCuadro(raiz: Nodo, tam: Map<string, { w: number; h: number }>, cerrados: Set<string>, CUADRO: Medidas) {
  const cajas = new Map<string, Caja>();
  const colW: number[] = [];
  recorrer(raiz, cerrados, (n) => {
    colW[n.depth] = Math.max(colW[n.depth] ?? 0, tam.get(n.id)!.w);
  });
  const colX: number[] = [MARGEN];
  for (let d = 1; d < colW.length; d++) colX[d] = colX[d - 1] + colW[d - 1] + CUADRO.gx;

  const mover = (n: Nodo, dy: number) =>
    recorrer(n, cerrados, (m) => {
      const c = cajas.get(m.id);
      if (c) c.y += dy;
    });

  const colocar = (n: Nodo, top: number): number => {
    const { w, h } = tam.get(n.id)!;
    const hijos = visibles(n, cerrados);
    if (!hijos.length) {
      cajas.set(n.id, { x: colX[n.depth], y: top, w, h });
      return top + h;
    }
    let y = top;
    for (const hijo of hijos) y = colocar(hijo, y) + CUADRO.gy;
    let abajo = y - CUADRO.gy;
    const a = cajas.get(hijos[0].id)!;
    const b = cajas.get(hijos[hijos.length - 1].id)!;
    let ny = (a.y + a.h / 2 + b.y + b.h / 2) / 2 - h / 2;
    if (ny < top) {
      const dy = top - ny;
      for (const hijo of hijos) mover(hijo, dy);
      abajo += dy;
      ny = top;
    }
    cajas.set(n.id, { x: colX[n.depth], y: ny, w, h });
    return Math.max(abajo, ny + h);
  };
  const alto = colocar(raiz, MARGEN) + MARGEN;
  const ancho = colX[colX.length - 1] + colW[colW.length - 1] + MARGEN;
  return { cajas, ancho, alto, colX };
}

function colocarMapa(raiz: Nodo, tam: Map<string, { w: number; h: number }>, cerrados: Set<string>, MAPA: Medidas) {
  const cajas = new Map<string, Caja>();
  const filaH: number[] = [];
  recorrer(raiz, cerrados, (n) => {
    filaH[n.depth] = Math.max(filaH[n.depth] ?? 0, tam.get(n.id)!.h);
  });
  const filaY: number[] = [MARGEN];
  for (let d = 1; d < filaH.length; d++) filaY[d] = filaY[d - 1] + filaH[d - 1] + MAPA.gy;

  const mover = (n: Nodo, dx: number) =>
    recorrer(n, cerrados, (m) => {
      const c = cajas.get(m.id);
      if (c) c.x += dx;
    });

  const colocar = (n: Nodo, left: number): number => {
    const { w, h } = tam.get(n.id)!;
    const hijos = visibles(n, cerrados);
    if (!hijos.length) {
      cajas.set(n.id, { x: left, y: filaY[n.depth], w, h });
      return left + w;
    }
    if (enColumna(n, cerrados)) {
      // Padre arriba y sus hijos apilados debajo, con una llave a la izquierda.
      const anchoHijos = Math.max(...hijos.map((hijo) => tam.get(hijo.id)!.w));
      const bloque = Math.max(w, SANGRIA + anchoHijos);
      const nx = left + (bloque - w) / 2;
      cajas.set(n.id, { x: nx, y: filaY[n.depth], w, h });
      let y = filaY[n.depth + 1];
      const xh = left + (bloque - SANGRIA - anchoHijos) / 2 + SANGRIA;
      for (const hijo of hijos) {
        const t = tam.get(hijo.id)!;
        cajas.set(hijo.id, { x: xh, y, w: t.w, h: t.h });
        y += t.h + 10;
      }
      return left + bloque;
    }
    let x = left;
    for (const hijo of hijos) x = colocar(hijo, x) + MAPA.gx;
    let derecha = x - MAPA.gx;
    const a = cajas.get(hijos[0].id)!;
    const b = cajas.get(hijos[hijos.length - 1].id)!;
    let nx = (a.x + a.w / 2 + b.x + b.w / 2) / 2 - w / 2;
    if (nx < left) {
      const dx = left - nx;
      for (const hijo of hijos) mover(hijo, dx);
      derecha += dx;
      nx = left;
    }
    cajas.set(n.id, { x: nx, y: filaY[n.depth], w, h });
    return Math.max(derecha, nx + w);
  };
  const ancho = colocar(raiz, MARGEN) + MARGEN;
  let alto = 0;
  for (const c of cajas.values()) alto = Math.max(alto, c.y + c.h);
  return { cajas, ancho, alto: alto + MARGEN, colX: [] as number[] };
}

/* ── Aspecto de cada recuadro ──────────────────────────────────── */

function estiloNodo(n: Nodo, estilo: EstiloDiagrama): React.CSSProperties {
  const kind = n.node.kind ?? "concept";
  if (kind === "key") {
    return { background: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 45%, transparent)" };
  }
  if (kind === "formula") {
    return { background: "var(--bg-sunken)", borderColor: "var(--border-strong)" };
  }
  if (estilo === "cuadro") {
    if (n.depth === 0) {
      return { background: "color-mix(in srgb, #f472b6 16%, var(--surface))", borderColor: "#f0a0bf", borderStyle: "dashed" };
    }
    if (n.depth === 1) {
      return { background: "color-mix(in srgb, #f5c542 20%, var(--surface))", borderColor: "#e3c16a", borderStyle: "dashed" };
    }
    return { background: "var(--surface)", borderColor: "var(--border-strong)", borderStyle: "dashed" };
  }
  if (n.depth === 0) {
    return { background: "color-mix(in srgb, #f472b6 22%, var(--surface))", borderColor: "#ec4899" };
  }
  const color = RAMAS[n.rama % RAMAS.length];
  return {
    background: `color-mix(in srgb, ${color} ${n.depth === 1 ? 26 : 12}%, var(--surface))`,
    borderColor: `color-mix(in srgb, ${color} ${n.depth === 1 ? 85 : 55}%, transparent)`,
  };
}

function Contenido({
  n,
  estilo,
  cerrado,
  onPageClick,
}: {
  n: Nodo;
  estilo: EstiloDiagrama;
  cerrado: boolean;
  onPageClick?: (page: number) => void;
}) {
  const kind = n.node.kind ?? "concept";
  const { termino, texto } = partes(n.node, estilo === "cuadro" ? 90 : 70);
  const titulo = n.depth === 0 || kind === "chapter" || kind === "section" || kind === "subsection";
  return (
    <>
      {kind === "key" ? (
        <span className="mr-1 inline-flex align-[-2px]" style={{ color: "var(--warning)" }}>
          <Icon name="star" size={13} strokeWidth={2.4} />
        </span>
      ) : null}
      {termino ? (
        <>
          <strong className="block text-[0.84rem] font-extrabold" style={{ color: "var(--text)" }}>
            {termino}
          </strong>
          <span className="mt-0.5 block text-[0.76rem]" style={{ color: "var(--text-soft)" }}>
            {texto}
          </span>
        </>
      ) : (
        <span
          className={kind === "formula" ? "font-mono text-[0.78rem]" : undefined}
          style={{
            fontWeight: n.depth === 0 ? 800 : titulo ? 750 : kind === "key" ? 650 : 500,
            fontSize: n.depth === 0 ? "0.98rem" : titulo ? "0.86rem" : "0.8rem",
            color: titulo || kind === "key" ? "var(--text)" : "var(--text-soft)",
            textTransform: estilo === "cuadro" && n.depth <= 1 ? "uppercase" : undefined,
            letterSpacing: estilo === "cuadro" && n.depth <= 1 ? "0.01em" : undefined,
          }}
        >
          {texto}
        </span>
      )}
      {(titulo && n.node.page && onPageClick) || (cerrado && n.hijos.length) ? (
        <span className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
          {titulo && n.node.page && onPageClick ? (
            <span
              role="button"
              tabIndex={0}
              className="page-ref !text-[0.66rem]"
              onClick={(event) => {
                event.stopPropagation();
                onPageClick(n.node.page as number);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.stopPropagation();
                  onPageClick(n.node.page as number);
                }
              }}
            >
              pág. {n.node.page}
            </span>
          ) : null}
          {cerrado && n.hijos.length ? (
            <span className="chip chip-accent !px-1.5 !py-0 !text-[0.66rem]">+{n.hijos.length}</span>
          ) : null}
        </span>
      ) : null}
    </>
  );
}

/* ── El diagrama ───────────────────────────────────────────────── */

export function OutlineDiagram({
  node,
  estilo,
  orden,
  onPageClick,
}: {
  node: OutlineNodeDto;
  estilo: EstiloDiagrama;
  /** "Expandir todo" / "Contraer todo" desde fuera: cambia `n` en cada pulsación. */
  orden: { tipo: "abrir" | "cerrar"; n: number };
  onPageClick?: (page: number) => void;
}) {
  const raiz = useMemo(() => construir(node, "r", 0, 0), [node]);
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
  const [tam, setTam] = useState<Map<string, { w: number; h: number }>>(new Map());
  const [escala, setEscala] = useState<number | null>(null);
  const [anchoVisible, setAnchoVisible] = useState(0);
  const [grande, setGrande] = useState(false);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const contenedor = useRef<HTMLDivElement | null>(null);
  const [anchoPantalla, setAnchoPantalla] = useState(1024);
  useEffect(() => {
    const leer = () => setAnchoPantalla(window.innerWidth);
    leer();
    window.addEventListener("resize", leer);
    return () => window.removeEventListener("resize", leer);
  }, []);
  const compacto = anchoPantalla < 640;
  const M = medidas(estilo, compacto);

  // "Expandir todo" abre todas las ramas; "Contraer todo" deja los apartados.
  useEffect(() => {
    if (orden.n === 0) return;
    if (orden.tipo === "abrir") setCerrados(new Set());
    else {
      const todos = new Set<string>();
      const marcar = (n: Nodo) => {
        if (n.depth >= 1 && n.hijos.length) todos.add(n.id);
        n.hijos.forEach(marcar);
      };
      marcar(raiz);
      setCerrados(todos);
    }
  }, [orden, raiz]);

  const alternar = useCallback((id: string) => {
    setCerrados((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }, []);

  const lista = useMemo(() => {
    const salida: Nodo[] = [];
    recorrer(raiz, cerrados, (n) => salida.push(n));
    return salida;
  }, [raiz, cerrados]);

  // Medir cada recuadro tal y como se pinta (con la letra ya cargada).
  const medir = useCallback(() => {
    setTam((anterior) => {
      let cambio = false;
      const nuevo = new Map(anterior);
      for (const [id, el] of refs.current) {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const previo = anterior.get(id);
        if (!previo || previo.w !== w || previo.h !== h) {
          nuevo.set(id, { w, h });
          cambio = true;
        }
      }
      return cambio ? nuevo : anterior;
    });
  }, []);

  useLayoutEffect(() => {
    medir();
  }, [medir, lista, estilo, compacto]);

  useEffect(() => {
    if (typeof document !== "undefined" && document.fonts) void document.fonts.ready.then(medir);
  }, [medir]);

  // Ancho disponible, para ajustar el zoom a la pantalla.
  useEffect(() => {
    const el = contenedor.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setAnchoVisible(el.clientWidth));
    ro.observe(el);
    setAnchoVisible(el.clientWidth);
    return () => ro.disconnect();
  }, [grande]);

  // Pantalla completa: se cierra con Escape y la página de detrás no se mueve.
  useEffect(() => {
    if (!grande) return;
    const alPulsar = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGrande(false);
    };
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", alPulsar);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", alPulsar);
    };
  }, [grande]);

  const listo = lista.every((n) => tam.has(n.id));
  const plano = useMemo(() => {
    if (!listo) return null;
    return estilo === "cuadro" ? colocarCuadro(raiz, tam, cerrados, M) : colocarMapa(raiz, tam, cerrados, M);
  }, [listo, estilo, raiz, tam, cerrados, M]);

  // Zoom inicial: que quepa a lo ancho, sin que la letra se haga ilegible
  // (en el móvil, lo que no quepa se recorre con el dedo).
  const minimo = compacto && !grande ? 0.62 : 0.5;
  const ajuste = plano && anchoVisible ? Math.max(minimo, Math.min(1, (anchoVisible - 2) / plano.ancho)) : 1;
  useEffect(() => {
    setEscala(null);
  }, [estilo, grande]);
  const zoom = escala ?? ajuste;

  // Al abrir el mapa, el tema principal a la vista (está en el centro).
  const centrado = useRef("");
  useEffect(() => {
    const el = contenedor.current;
    const c = plano?.cajas.get("r");
    if (!el || !c) return;
    const clave = `${estilo}-${grande}`;
    if (centrado.current === clave) return;
    centrado.current = clave;
    el.scrollLeft = estilo === "mapa" ? Math.max(0, (c.x + c.w / 2) * zoom - el.clientWidth / 2) : 0;
  }, [plano, estilo, grande, zoom]);

  const ancho = plano?.ancho ?? 600;
  const alto = plano?.alto ?? 200;

  const lineas: React.ReactNode[] = [];
  const enlaces: React.ReactNode[] = [];
  if (plano) {
    for (const n of lista) {
      const hijos = visibles(n, cerrados);
      if (!hijos.length) continue;
      const p = plano.cajas.get(n.id)!;
      if (estilo === "cuadro") {
        const tronco = plano.colX[n.depth + 1] - M.gx / 2;
        const cy = p.y + p.h / 2;
        const ys = hijos.map((h) => {
          const c = plano.cajas.get(h.id)!;
          return c.y + c.h / 2;
        });
        let d = `M${p.x + p.w},${cy} H${tronco} M${tronco},${Math.min(cy, ...ys)} V${Math.max(cy, ...ys)}`;
        for (const [i, h] of hijos.entries()) d += ` M${tronco},${ys[i]} H${plano.cajas.get(h.id)!.x - 3}`;
        lineas.push(<path key={n.id} d={d} fill="none" stroke="var(--text-soft)" strokeWidth={1.6} />);
        for (const [i, h] of hijos.entries()) {
          const x = plano.cajas.get(h.id)!.x - 1;
          lineas.push(
            <path key={`${n.id}-f${i}`} d={`M${x - 8},${ys[i] - 4.5} L${x},${ys[i]} L${x - 8},${ys[i] + 4.5} Z`} fill="var(--text-soft)" />,
          );
        }
      } else {
        const cx = p.x + p.w / 2;
        const base = p.y + p.h;
        const siguiente = plano.cajas.get(hijos[0].id)!.y;
        const my = (base + siguiente) / 2;
        const palabra = enlace(n);
        const arriba = palabra ? my - 10 : my;
        const abajo = palabra ? my + 10 : my;
        let d = `M${cx},${base} V${arriba}`;
        if (enColumna(n, cerrados)) {
          // Llave: un tronco a la izquierda de la columna y un trazo a cada hijo.
          const primero = plano.cajas.get(hijos[0].id)!;
          const tronco = primero.x - SANGRIA / 2 - 4;
          const ultimo = plano.cajas.get(hijos[hijos.length - 1].id)!;
          d += ` M${cx},${abajo} V${(abajo + primero.y) / 2 + 2} H${tronco} V${ultimo.y + ultimo.h / 2}`;
          for (const h of hijos) {
            const c = plano.cajas.get(h.id)!;
            d += ` M${tronco},${c.y + c.h / 2} H${c.x}`;
          }
        } else {
          for (const h of hijos) {
            const c = plano.cajas.get(h.id)!;
            d += ` M${cx},${abajo} L${c.x + c.w / 2},${c.y}`;
          }
        }
        lineas.push(<path key={n.id} d={d} fill="none" stroke="var(--text-muted)" strokeWidth={1.4} />);
        if (palabra) {
          enlaces.push(
            <span
              key={`e-${n.id}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-1.5 text-[0.76rem] font-semibold"
              style={{ left: cx, top: my, color: "var(--text-soft)", background: "var(--surface)" }}
            >
              {palabra}
            </span>,
          );
        }
      }
    }
  }

  const controles = (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        className="btn btn-ghost btn-icon !min-h-9 !min-w-9"
        onClick={() => setEscala(Math.max(0.35, +(zoom - 0.15).toFixed(2)))}
        aria-label="Alejar"
        title="Alejar"
      >
        <Icon name="zoomOut" size={18} />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm !min-h-9 !px-2 tabular-nums"
        onClick={() => setEscala(null)}
        title="Ajustar a la pantalla"
      >
        {Math.round(zoom * 100)} %
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-icon !min-h-9 !min-w-9"
        onClick={() => setEscala(Math.min(2, +(zoom + 0.15).toFixed(2)))}
        aria-label="Acercar"
        title="Acercar"
      >
        <Icon name="zoomIn" size={18} />
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm !min-h-9 ml-1"
        onClick={() => setGrande((actual) => !actual)}
        aria-label={grande ? "Salir de pantalla completa" : "Pantalla completa"}
      >
        <Icon name={grande ? "close" : "fullscreen"} size={16} />
        <span className="hidden sm:inline">{grande ? "Cerrar" : "Pantalla completa"}</span>
      </button>
    </div>
  );

  const lienzo = (
      <div
        ref={contenedor}
        className="overflow-auto rounded-2xl border"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--border-strong) 55%, transparent) 1px, transparent 1.2px) 0 0 / 18px 18px, var(--bg-elevated)",
        }}
      >
        <div style={{ width: ancho * zoom, height: alto * zoom }}>
          <div
            className="relative"
            style={{ width: ancho, height: alto, transform: `scale(${zoom})`, transformOrigin: "0 0", opacity: plano ? 1 : 0 }}
            data-diagrama={estilo}
          >
            <svg className="pointer-events-none absolute inset-0" width={ancho} height={alto} aria-hidden="true">
              {lineas}
            </svg>
            {enlaces}
            {lista.map((n) => {
              const c = plano?.cajas.get(n.id);
              const conHijos = n.hijos.length > 0;
              const cerrado = cerrados.has(n.id);
              return (
                <div
                  key={n.id}
                  ref={(el) => {
                    if (el) refs.current.set(n.id, el);
                    else refs.current.delete(n.id);
                  }}
                  data-nodo=""
                  role={conHijos ? "button" : undefined}
                  tabIndex={conHijos ? 0 : undefined}
                  aria-expanded={conHijos ? !cerrado : undefined}
                  title={n.node.label}
                  onClick={conHijos ? () => alternar(n.id) : undefined}
                  onKeyDown={
                    conHijos
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            alternar(n.id);
                          }
                        }
                      : undefined
                  }
                  className={`absolute rounded-xl border-[1.5px] px-3 py-2 text-center leading-snug transition-shadow ${
                    conHijos ? "cursor-pointer hover:shadow-md" : ""
                  }`}
                  style={{
                    left: c?.x ?? 0,
                    top: c?.y ?? 0,
                    width: "max-content",
                    maxWidth: M.ancho + (n.depth === 0 ? 40 : 0),
                    boxShadow: n.depth <= 1 ? "var(--shadow-xs)" : undefined,
                    ...estiloNodo(n, estilo),
                  }}
                >
                  <Contenido n={n} estilo={estilo} cerrado={cerrado} onPageClick={onPageClick} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
  );

  if (grande && typeof document !== "undefined") {
    return (
      <>
        <p className="py-6 text-center text-[0.85rem]" style={{ color: "var(--text-muted)" }}>
          Abierto en pantalla completa.
        </p>
        {createPortal(
          <div
            className="safe-top safe-bottom fixed inset-0 z-[95] flex flex-col gap-2 p-2 sm:p-4"
            style={{ background: "var(--bg)" }}
            role="dialog"
            aria-modal="true"
            aria-label={`Esquema: ${node.label}`}
          >
            <div className="flex items-center gap-2 px-1">
              <p className="min-w-0 flex-1 truncate text-[0.95rem] font-extrabold">{node.label}</p>
              {controles}
            </div>
            <div className="min-h-0 flex-1 [&>div]:h-full">{lienzo}</div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  return (
    <div className="space-y-2">
      {controles}
      {lienzo}
    </div>
  );
}
