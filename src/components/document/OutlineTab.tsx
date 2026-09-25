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

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(new Set(allPaths))}>
          <Icon name="expand" size={16} />
          Expandir todo
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(new Set())}>
          <Icon name="collapse" size={16} />
          Contraer todo
        </button>
        <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={onRegenerate} disabled={regenerating}>
          <Icon name="refresh" size={16} className={regenerating ? "animate-spin" : undefined} />
          {regenerating ? "Regenerando…" : "Regenerar"}
        </button>
      </div>

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
    </div>
  );
}
