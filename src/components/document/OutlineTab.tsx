"use client";

/**
 * Esquema de estudio jerárquico: cada nodo se abre y se cierra, con botones
 * para expandir o contraer todo el árbol de una vez.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OutlineNodeDto } from "@/lib/client/types";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/Primitives";

const KIND_STYLE: Record<
  string,
  { color: string; weight: number; size: string; chip?: string }
> = {
  chapter: { color: "var(--text)", weight: 700, size: "1rem", chip: "Tema" },
  section: { color: "var(--text)", weight: 600, size: "0.95rem" },
  subsection: { color: "var(--text)", weight: 550, size: "0.9rem" },
  concept: { color: "var(--text-soft)", weight: 450, size: "0.875rem" },
  detail: { color: "var(--text-muted)", weight: 400, size: "0.85rem" },
  formula: { color: "var(--accent)", weight: 500, size: "0.875rem", chip: "Fórmula" },
  key: { color: "var(--text)", weight: 600, size: "0.88rem", chip: "Clave" },
};

/** Ruta estable de cada nodo, usada como identificador de apertura. */
function pathOf(indexes: number[]) {
  return indexes.join(".");
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
          <strong style={{ color: "var(--text)", fontWeight: 600 }}>{label.slice(0, corte + 1)}</strong>
          {label.slice(corte + 1)}
        </>
      );
    }
  }
  return <>{label}</>;
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

function OutlineNode({
  node,
  indexes,
  open,
  toggle,
  onPageClick,
  depth,
}: {
  node: OutlineNodeDto;
  indexes: number[];
  open: Set<string>;
  toggle: (path: string) => void;
  onPageClick?: (page: number) => void;
  depth: number;
}) {
  const path = pathOf(indexes);
  const hasChildren = Boolean(node.children?.length);
  const isOpen = open.has(path);
  const style = KIND_STYLE[node.kind ?? "concept"] ?? KIND_STYLE.concept;

  return (
    <li>
      <div
        className="group flex items-start gap-1.5 rounded-lg py-1 pr-1 transition hover:bg-[var(--surface-hover)]"
        style={{ paddingLeft: depth === 0 ? 0 : 2 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggle(path)}
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded transition"
            style={{ color: "var(--text-muted)" }}
            aria-expanded={isOpen}
            aria-label={isOpen ? `Contraer ${node.label}` : `Expandir ${node.label}`}
          >
            <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={14} strokeWidth={2.2} />
          </button>
        ) : (
          <span className="mt-2 ml-2 h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--border-strong)" }} />
        )}

        <div className="min-w-0 flex-1">
          <span
            style={{
              color: style.color,
              fontWeight: style.weight,
              fontSize: style.size,
              lineHeight: 1.5,
            }}
            className={node.kind === "formula" ? "font-mono" : undefined}
          >
            <Etiqueta label={node.label} kind={node.kind} />
          </span>
          {style.chip ? (
            <span className="chip ml-2 align-middle">{style.chip}</span>
          ) : null}
          {/* La página solo en temas y apartados: en cada hoja llenaba el
              esquema de huecos (y en el móvil, sin ratón, no se veía). */}
          {node.page && onPageClick && (node.kind === "chapter" || node.kind === "section" || node.kind === "subsection") ? (
            <button
              type="button"
              className="page-ref ml-2 align-middle opacity-60 transition group-hover:opacity-100 focus:opacity-100"
              onClick={() => onPageClick(node.page as number)}
              title={`Abrir la página ${node.page} del PDF`}
            >
              pág. {node.page}
            </button>
          ) : null}
        </div>
      </div>

      {hasChildren && isOpen ? (
        <ul
          className="ml-2.5 mt-0.5 space-y-0.5 pl-3"
          style={{ borderLeft: "1px solid var(--border)" }}
        >
          {node.children!.map((child, index) => (
            <OutlineNode
              key={`${path}.${index}`}
              node={child}
              indexes={[...indexes, index]}
              open={open}
              toggle={toggle}
              onPageClick={onPageClick}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
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
        icon="brain"
        title="Todavía no hay esquema"
        description="Se generará en cuanto termine el análisis del documento."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setOpen(new Set(allPaths))}
        >
          <Icon name="expand" size={15} />
          Expandir todo
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(new Set())}>
          <Icon name="collapse" size={15} />
          Contraer todo
        </button>
        <button
          type="button"
          className="btn btn-ghost ml-auto"
          onClick={onRegenerate}
          disabled={regenerating}
        >
          <Icon name="refresh" size={15} />
          {regenerating ? "Regenerando…" : "Regenerar"}
        </button>
      </div>

      <div className="card p-4 md:p-6">
        <h2 className="mb-4 text-lg font-semibold tracking-tight">{tree.title}</h2>
        <ul className="space-y-1">
          {tree.nodes.map((node, index) => (
            <OutlineNode
              key={index}
              node={node}
              indexes={[index]}
              open={open}
              toggle={toggle}
              onPageClick={onPageClick}
              depth={0}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
