"use client";

/**
 * Esquema de estudio jerárquico: cada tema es una tarjeta y dentro sus
 * apartados, conceptos, claves y fórmulas. Cada rama se abre y se cierra, con
 * botones para expandir o contraer todo el árbol de una vez.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OutlineNodeDto } from "@/lib/client/types";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/Primitives";
import { LazyBlock } from "@/components/ui/LazyBlock";
import { OutlineDiagram, type EstiloDiagrama } from "./OutlineDiagram";

type Vista = EstiloDiagrama | "lista";
const VISTAS: { value: Vista; label: string; corto: string; icon: string }[] = [
  { value: "cuadro", label: "Cuadro", corto: "Cuadro", icon: "outline" },
  { value: "mapa", label: "Mapa conceptual", corto: "Mapa", icon: "mind" },
  { value: "lista", label: "Lista", corto: "Lista", icon: "checklist" },
];
const CLAVE_VISTA = "alicia-esquema-vista";

/** Un tema dibujado como cuadro o mapa, en su tarjeta. */
function TemaDiagrama({
  node,
  index,
  numerado,
  estilo,
  orden,
  onPageClick,
}: {
  node: OutlineNodeDto;
  index: number;
  numerado: boolean;
  estilo: EstiloDiagrama;
  orden: { tipo: "abrir" | "cerrar"; n: number };
  onPageClick?: (page: number) => void;
}) {
  const diagrama = <OutlineDiagram node={node} estilo={estilo} orden={orden} onPageClick={onPageClick} />;
  return (
    <section className="card overflow-hidden">
      {numerado ? (
        <header className="flex items-center gap-3 border-b px-4 py-3 sm:px-5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[0.9rem] font-extrabold text-white"
            style={{ background: "var(--brand-grad)" }}
          >
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="eyebrow">Tema {index + 1}</span>
            <span className="block truncate text-[0.98rem] font-extrabold tracking-tight">{node.label}</span>
          </span>
        </header>
      ) : null}
      <div className="p-2 sm:p-3">
        {index < 2 ? diagrama : <LazyBlock minHeight={420}>{diagrama}</LazyBlock>}
      </div>
    </section>
  );
}

/** Ruta estable de cada nodo, usada como identificador de apertura. */
function pathOf(indexes: number[]) {
  return indexes.join(".");
}

function collectPaths(nodes: OutlineNodeDto[], prefix: number[] = []): string[] {
  const paths: string[] = [];
  nodes.forEach((node, index) => {
    const current = [...prefix, index];
    if (node.children?.length) {
      paths.push(pathOf(current));
      paths.push(...collectPaths(node.children, current));
    }
  });
  return paths;
}

/**
 * "Término: explicación" → el término en negrita, como en unos apuntes.
 * Solo si lo de antes de los dos puntos es corto (un nombre, no una frase).
 */
function Etiqueta({ label, kind }: { label: string; kind?: string }) {
  if (kind === "concept" || kind === "detail") {
    const corte = label.indexOf(": ");
    if (corte > 0 && corte <= 60) {
      return (
        <>
          <strong style={{ color: "var(--text)", fontWeight: 700 }}>{label.slice(0, corte + 1)}</strong>
          {label.slice(corte + 1)}
        </>
      );
    }
  }
  return <>{label}</>;
}

function PaginaRef({ page, onPageClick }: { page?: number; onPageClick?: (page: number) => void }) {
  if (!page || !onPageClick) return null;
  return (
    <button
      type="button"
      className="page-ref ml-2 align-middle"
      onClick={(event) => {
        event.stopPropagation();
        onPageClick(page);
      }}
      title={`Abrir la página ${page} del PDF`}
    >
      pág. {page}
    </button>
  );
}

/** Marcador a la izquierda de cada nodo, según su tipo. */
function Marcador({ kind, abierto, conHijos }: { kind?: string; abierto: boolean; conHijos: boolean }) {
  if (conHijos) {
    return (
      <span
        className="mt-[0.2rem] flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition"
        style={{ color: "var(--text-muted)", background: abierto ? "var(--bg-sunken)" : "transparent" }}
      >
        <Icon name={abierto ? "chevronDown" : "chevronRight"} size={15} strokeWidth={2.4} />
      </span>
    );
  }
  if (kind === "key") {
    return (
      <span className="mt-[0.2rem] flex h-5 w-5 shrink-0 items-center justify-center" style={{ color: "var(--warning)" }}>
        <Icon name="star" size={15} strokeWidth={2.2} />
      </span>
    );
  }
  if (kind === "formula") {
    return (
      <span className="mt-[0.2rem] flex h-5 w-5 shrink-0 items-center justify-center" style={{ color: "var(--accent)" }}>
        <Icon name="sigma" size={15} strokeWidth={2.2} />
      </span>
    );
  }
  return (
    <span className="flex h-6 w-5 shrink-0 items-center justify-center">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: kind === "detail" ? "var(--border-strong)" : "var(--accent)" }}
      />
    </span>
  );
}

function OutlineNode({
  node,
  indexes,
  open,
  toggle,
  onPageClick,
}: {
  node: OutlineNodeDto;
  indexes: number[];
  open: Set<string>;
  toggle: (path: string) => void;
  onPageClick?: (page: number) => void;
}) {
  const path = pathOf(indexes);
  const hasChildren = Boolean(node.children?.length);
  const isOpen = open.has(path);
  const kind = node.kind ?? "concept";
  const esTitulo = kind === "chapter" || kind === "section" || kind === "subsection";

  const texto =
    kind === "formula" ? (
      <span
        className="inline-block rounded-lg px-2.5 py-1 font-mono text-[0.84rem]"
        style={{ background: "var(--bg-sunken)", border: "1px solid var(--border)", color: "var(--text)" }}
      >
        {node.label}
      </span>
    ) : kind === "key" ? (
      <span className="font-semibold" style={{ color: "var(--text)" }}>
        {node.label}
      </span>
    ) : (
      <span
        style={{
          color: esTitulo ? "var(--text)" : kind === "detail" ? "var(--text-soft)" : "var(--text-soft)",
          fontWeight: kind === "section" ? 750 : kind === "subsection" ? 700 : 450,
          fontSize: kind === "section" ? "0.98rem" : kind === "subsection" ? "0.93rem" : "0.9rem",
        }}
      >
        <Etiqueta label={node.label} kind={kind} />
      </span>
    );

  const fila = (
    <>
      <Marcador kind={kind} abierto={isOpen} conHijos={hasChildren} />
      <span className="min-w-0 flex-1 leading-relaxed">
        {texto}
        {esTitulo ? <PaginaRef page={node.page} onPageClick={onPageClick} /> : null}
      </span>
    </>
  );

  return (
    <li>
      {hasChildren ? (
        <button
          type="button"
          onClick={() => toggle(path)}
          aria-expanded={isOpen}
          className="flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-[var(--surface-hover)]"
        >
          {fila}
        </button>
      ) : (
        <div
          className="flex items-start gap-2 rounded-xl px-2 py-1.5"
          style={kind === "key" ? { background: "var(--warning-soft)" } : undefined}
        >
          {fila}
        </div>
      )}

      {hasChildren && isOpen ? (
        <ul className="ml-[1.1rem] mt-0.5 space-y-0.5 border-l-2 pl-3" style={{ borderColor: "var(--border)" }}>
          {node.children!.map((child, index) => (
            <OutlineNode
              key={`${path}.${index}`}
              node={child}
              indexes={[...indexes, index]}
              open={open}
              toggle={toggle}
              onPageClick={onPageClick}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Un tema (primer nivel) en su propia tarjeta, con cabecera de color. */
function TemaCard({
  node,
  index,
  open,
  toggle,
  onPageClick,
}: {
  node: OutlineNodeDto;
  index: number;
  open: Set<string>;
  toggle: (path: string) => void;
  onPageClick?: (page: number) => void;
}) {
  const path = pathOf([index]);
  const isOpen = open.has(path);
  const hijos = node.children ?? [];
  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => hijos.length && toggle(path)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3.5 px-4 py-4 text-left transition hover:bg-[var(--surface-hover)] sm:px-5"
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[1rem] font-extrabold text-white"
          style={{ background: "var(--brand-grad)" }}
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow">Tema {index + 1}</span>
          <span className="mt-0.5 block text-[1.05rem] font-extrabold leading-snug tracking-tight">{node.label}</span>
        </span>
        <span className="hidden sm:inline">
          <PaginaRef page={node.page} onPageClick={onPageClick} />
        </span>
        {hijos.length ? (
          <span style={{ color: "var(--text-muted)" }}>
            <Icon name={isOpen ? "chevronUp" : "chevronDown"} size={20} />
          </span>
        ) : null}
      </button>
      {hijos.length && isOpen ? (
        <ul className="space-y-0.5 border-t px-2 pb-4 pt-3 sm:px-4">
          {hijos.map((child, childIndex) => (
            <OutlineNode
              key={`${path}.${childIndex}`}
              node={child}
              indexes={[index, childIndex]}
              open={open}
              toggle={toggle}
              onPageClick={onPageClick}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function OutlineTab({
  tree,
  onPageClick,
  onRegenerate,
  regenerating,
}: {
  tree: { title: string; nodes: OutlineNodeDto[] } | null;
  onPageClick?: (page: number) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const allPaths = useMemo(() => (tree ? collectPaths(tree.nodes) : []), [tree]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [vista, setVista] = useState<Vista>("cuadro");
  const [orden, setOrden] = useState<{ tipo: "abrir" | "cerrar"; n: number }>({ tipo: "abrir", n: 0 });

  // La vista elegida se recuerda en este dispositivo.
  useEffect(() => {
    try {
      const guardada = localStorage.getItem(CLAVE_VISTA);
      if (guardada === "cuadro" || guardada === "mapa" || guardada === "lista") setVista(guardada);
    } catch {
      /* sin almacenamiento: se usa la vista por defecto */
    }
  }, []);
  const elegirVista = (nueva: Vista) => {
    setVista(nueva);
    try {
      localStorage.setItem(CLAVE_VISTA, nueva);
    } catch {
      /* sin almacenamiento */
    }
  };

  // Por defecto se muestran los dos primeros niveles abiertos.
  useEffect(() => {
    setOpen(new Set(allPaths.filter((path) => path.split(".").length <= 2)));
  }, [allPaths]);

  const toggle = useCallback((path: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  if (!tree || tree.nodes.length === 0) {
    return (
      <EmptyState
        icon="outline"
        title="Todavía no hay esquema"
        description="Se generará en cuanto termine el análisis del documento."
      />
    );
  }

  // Si el primer nivel son temas, cada uno va en su tarjeta; si no, un árbol.
  const porTemas = tree.nodes.every((node) => (node.kind ?? "chapter") === "chapter");

  const expandir = () => {
    setOpen(new Set(allPaths));
    setOrden((o) => ({ tipo: "abrir", n: o.n + 1 }));
  };
  const contraer = () => {
    setOpen(new Set());
    setOrden((o) => ({ tipo: "cerrar", n: o.n + 1 }));
  };

  return (
    <div className={`mx-auto space-y-4 ${vista === "lista" ? "max-w-4xl" : "max-w-6xl"}`}>
      <div className="segmented w-full sm:w-auto" role="radiogroup" aria-label="Forma del esquema">
        {VISTAS.map((opcion) => (
          <button
            key={opcion.value}
            type="button"
            role="radio"
            aria-checked={vista === opcion.value}
            aria-label={opcion.label}
            data-active={vista === opcion.value}
            onClick={() => elegirVista(opcion.value)}
            className="min-w-0 flex-1 !px-2 sm:flex-none sm:!px-[0.95rem]"
          >
            <Icon name={opcion.icon} size={16} />
            <span className="sm:hidden">{opcion.corto}</span>
            <span className="hidden sm:inline">{opcion.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={expandir}>
          <Icon name="expand" size={16} />
          Expandir todo
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={contraer}>
          <Icon name="collapse" size={16} />
          Contraer todo
        </button>
        <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={onRegenerate} disabled={regenerating}>
          <Icon name="refresh" size={16} className={regenerating ? "animate-spin" : undefined} />
          {regenerating ? "Regenerando…" : "Regenerar"}
        </button>
      </div>

      {vista !== "lista" ? (
        <p className="flex items-start gap-2 px-1 text-[0.8rem] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          <span>Toca un recuadro para abrir o cerrar sus ramas. Usa − y + para el zoom.</span>
        </p>
      ) : null}

      {vista !== "lista" ? (
        <div className="space-y-4">
          {(porTemas ? tree.nodes : [{ label: tree.title, kind: "chapter", children: tree.nodes }]).map((node, index) => (
            <TemaDiagrama
              key={`${vista}-${index}`}
              node={node}
              index={index}
              numerado={porTemas}
              estilo={vista}
              orden={orden}
              onPageClick={onPageClick}
            />
          ))}
        </div>
      ) : null}

      {vista === "lista" ? (
      <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[0.76rem]" style={{ color: "var(--text-muted)" }}>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} /> Concepto
        </span>
        <span className="flex items-center gap-1.5" style={{ color: "var(--warning)" }}>
          <Icon name="star" size={13} /> <span style={{ color: "var(--text-muted)" }}>Clave para el examen</span>
        </span>
        <span className="flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
          <Icon name="sigma" size={13} /> <span style={{ color: "var(--text-muted)" }}>Fórmula</span>
        </span>
      </div>

      {porTemas ? (
        <div className="space-y-3.5">
          {tree.nodes.map((node, index) => (
            <TemaCard key={index} node={node} index={index} open={open} toggle={toggle} onPageClick={onPageClick} />
          ))}
        </div>
      ) : (
        <div className="card p-4 md:p-6">
          <h2 className="mb-4 text-lg font-extrabold tracking-tight">{tree.title}</h2>
          <ul className="space-y-0.5">
            {tree.nodes.map((node, index) => (
              <OutlineNode
                key={index}
                node={node}
                indexes={[index]}
                open={open}
                toggle={toggle}
                onPageClick={onPageClick}
              />
            ))}
          </ul>
        </div>
      )}
      </>
      ) : null}
    </div>
  );
}
