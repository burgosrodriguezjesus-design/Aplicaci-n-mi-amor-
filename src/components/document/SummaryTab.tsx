"use client";

/**
 * Pestaña de resumen: cada apartado se puede marcar como estudiado, escuchar
 * o regenerar por separado, y las referencias "(pág. N)" abren el PDF original.
 */

import { Markdown } from "@/components/Markdown";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ProgressBar } from "@/components/ui/Primitives";
import type { DocumentDetail } from "@/lib/client/types";
import { DEPTH_OPTIONS } from "@/lib/client/format";

export function SummaryTab({
  detail,
  completed,
  activeSectionId,
  onToggleComplete,
  onPageClick,
  onListenSection,
  onRegenerateSection,
  onRegenerateAll,
  regeneratingSectionId,
  regeneratingAll,
}: {
  detail: DocumentDetail;
  completed: string[];
  activeSectionId: string | null;
  onToggleComplete: (sectionId: string, done: boolean) => void;
  onPageClick: (page: number) => void;
  onListenSection: (sectionId: string) => void;
  onRegenerateSection: (sectionId: string, title: string) => void;
  onRegenerateAll: () => void;
  regeneratingSectionId: string | null;
  regeneratingAll: boolean;
}) {
  const summary = detail.summary;

  if (!summary) {
    return (
      <EmptyState
        icon="book"
        title="Todavía no hay resumen"
        description="Se generará en cuanto termine el análisis del documento."
      />
    );
  }

  const depthLabel =
    DEPTH_OPTIONS.find((option) => option.value === summary.depth)?.label ?? summary.depth;
  const percent = summary.sections.length
    ? Math.round((completed.length / summary.sections.length) * 100)
    : 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip">Nivel: {depthLabel}</span>
            <span className="chip">
              {summary.provider === "anthropic" ? "Generado con IA" : "Modo extractivo"}
            </span>
            <span className="chip">v{summary.version}</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <ProgressBar value={percent} tone="success" />
            </div>
            <span className="shrink-0 text-[0.8rem] font-medium tabular-nums">
              {percent} % completado
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onRegenerateAll}
          disabled={regeneratingAll}
        >
          <Icon name="refresh" size={15} />
          {regeneratingAll ? "Regenerando…" : "Regenerar"}
        </button>
      </div>

      {summary.provider !== "anthropic" ? (
        <p
          className="card p-3 text-[0.8rem]"
          style={{ background: "var(--warning-soft)", borderColor: "transparent" }}
        >
          Este resumen se ha construido seleccionando frases literales del PDF (modo sin
          IA). Es 100 % fiel al original, pero no reescribe ni simplifica las explicaciones.
        </p>
      ) : null}

      {summary.sections.map((section) => {
        const done = completed.includes(section.id);
        const isActive = activeSectionId === section.id;
        return (
          <section
            key={section.id}
            id={`seccion-${section.id}`}
            className="card p-4 transition md:p-6"
            style={
              isActive
                ? { borderColor: "var(--audio)", boxShadow: "var(--shadow-sm)" }
                : undefined
            }
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleComplete(section.id, !done)}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem] font-medium transition"
                style={
                  done
                    ? {
                        background: "var(--success-soft)",
                        color: "var(--success)",
                        borderColor: "var(--success)",
                      }
                    : { borderColor: "var(--border-strong)", color: "var(--text-muted)" }
                }
              >
                <Icon name="check" size={12} strokeWidth={3} />
                {done ? "Estudiado" : "Marcar como estudiado"}
              </button>

              {section.sourcePages.length ? (
                <button
                  type="button"
                  className="page-ref"
                  onClick={() => onPageClick(section.sourcePages[0])}
                  title="Abrir esa página del PDF original"
                >
                  <Icon name="file" size={11} strokeWidth={2} />
                  {section.sourcePages.length === 1
                    ? `pág. ${section.sourcePages[0]}`
                    : `págs. ${Math.min(...section.sourcePages)}-${Math.max(...section.sourcePages)}`}
                </button>
              ) : null}

              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  className="btn btn-ghost !px-2"
                  onClick={() => onListenSection(section.id)}
                  title="Escuchar este apartado"
                  aria-label={`Escuchar ${section.title}`}
                >
                  <Icon name="headphones" size={16} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost !px-2"
                  onClick={() => onRegenerateSection(section.id, section.title)}
                  disabled={regeneratingSectionId === section.id}
                  title="Regenerar solo este apartado"
                  aria-label={`Regenerar ${section.title}`}
                >
                  <Icon
                    name="refresh"
                    size={16}
                    className={regeneratingSectionId === section.id ? "animate-pulse-soft" : undefined}
                  />
                </button>
              </div>
            </div>

            <Markdown markdown={section.markdown} onPageClick={onPageClick} />

            {section.keyConcepts.length ? (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-3">
                {section.keyConcepts.map((concept) => (
                  <span key={concept} className="chip">
                    {concept}
                  </span>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
