"use client";

/**
 * Pestaña de resumen: cada apartado se puede marcar como estudiado, escuchar
 * o regenerar por separado, y las referencias "(pág. N)" abren el PDF original.
 */

import { Markdown } from "@/components/Markdown";
import { LazyBlock } from "@/components/ui/LazyBlock";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ProgressRing } from "@/components/ui/Primitives";
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

  // En temarios largos se pinta cada apartado al acercarse a la pantalla.
  const isLong = summary.sections.length > 10;

  /** Título corto de un apartado para el índice (sin "Unidad 4 · "). */
  const tituloCorto = (title: string) => title.split(" · ").pop() ?? title;

  const indice = (
    <ol className="space-y-0.5">
      {summary.sections.map((section, index) => {
        const hecho = completed.includes(section.id);
        return (
          <li key={section.id}>
            <a
              href={`#seccion-${section.id}`}
              className="flex min-h-9 items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.84rem] transition hover:bg-[var(--surface-hover)]"
              style={{
                color: activeSectionId === section.id ? "var(--audio)" : hecho ? "var(--text-muted)" : "var(--text-soft)",
              }}
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.62rem] font-bold"
                style={
                  hecho
                    ? { background: "var(--success)", color: "#fff" }
                    : { background: "var(--bg-sunken)", color: "var(--text-muted)", border: "1px solid var(--border)" }
                }
              >
                {hecho ? <Icon name="check" size={11} strokeWidth={3.2} /> : index + 1}
              </span>
              <span className={`min-w-0 flex-1 truncate ${hecho ? "line-through decoration-1 opacity-80" : ""}`}>
                {tituloCorto(section.title)}
              </span>
            </a>
          </li>
        );
      })}
    </ol>
  );

  const acciones = (
    <div className="grid grid-cols-2 gap-2">
      <a
        className="btn btn-secondary btn-sm"
        href={`/api/documents/${detail.document.id}/export`}
        download
        title="Descargar el resumen en Markdown"
      >
        <Icon name="download" size={16} />
        Descargar
      </a>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRegenerateAll} disabled={regeneratingAll}>
        <Icon name="refresh" size={16} className={regeneratingAll ? "animate-spin" : undefined} />
        {regeneratingAll ? "Regenerando…" : "Regenerar"}
      </button>
    </div>
  );

  const progreso = (
    <div className="flex items-center gap-3.5">
      <ProgressRing value={percent} size={52} stroke={5} tone="success" />
      <div className="min-w-0">
        <p className="text-[0.92rem] font-bold">
          {completed.length} de {summary.sections.length} apartados
        </p>
        <p className="mt-0.5 text-[0.76rem]" style={{ color: "var(--text-muted)" }}>
          {depthLabel} · {summary.provider === "anthropic" ? "con IA" : "sin IA"} · v{summary.version}
        </p>
      </div>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] xl:gap-10">
      <div className="min-w-0 space-y-4">
        {/* Barra compacta (móvil y tableta) */}
        <div className="card space-y-4 p-4 lg:hidden">
          {progreso}
          {acciones}
          <details className="group rounded-xl" style={{ background: "var(--bg-sunken)" }}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-[0.88rem] font-bold">
              <span className="flex items-center gap-2">
                <Icon name="checklist" size={17} />
                Índice · {summary.sections.length} apartados
              </span>
              <Icon name="chevronDown" size={18} className="transition group-open:rotate-180" />
            </summary>
            <div className="max-h-72 overflow-y-auto px-1.5 pb-2">{indice}</div>
          </details>
        </div>

        {summary.provider !== "anthropic" ? (
          <p className="flex items-start gap-2 px-1 text-[0.8rem] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            <Icon name="shield" size={16} className="mt-0.5 shrink-0" />
            <span>
              Hecho con las mismas palabras del PDF: 100 % fiel al original. Los ejemplos y actividades
              del libro van aparte, marcados.
            </span>
          </p>
        ) : null}

        {summary.sections.map((section) => {
          const done = completed.includes(section.id);
          const isActive = activeSectionId === section.id;
          return (
            <section
              key={section.id}
              id={`seccion-${section.id}`}
              className="card scroll-mt-32 p-5 transition sm:p-7 md:p-9"
              style={
                isActive
                  ? { borderColor: "var(--audio)", boxShadow: "0 0 0 3px var(--audio-soft), var(--shadow-sm)" }
                  : undefined
              }
            >
              <div className="mb-5 flex items-center gap-2">
                {section.sourcePages.length ? (
                  <button
                    type="button"
                    className="page-ref"
                    onClick={() => onPageClick(section.sourcePages[0])}
                    title="Abrir esa página del PDF original"
                  >
                    <Icon name="file" size={12} strokeWidth={2} />
                    {section.sourcePages.length === 1
                      ? `pág. ${section.sourcePages[0]}`
                      : `págs. ${Math.min(...section.sourcePages)}-${Math.max(...section.sourcePages)}`}
                  </button>
                ) : null}
                {done ? (
                  <span className="chip chip-success">
                    <Icon name="check" size={12} strokeWidth={3} />
                    Estudiado
                  </span>
                ) : null}
                {isActive ? (
                  <span className="chip chip-audio">
                    <Icon name="volume" size={12} />
                    Sonando
                  </span>
                ) : null}

                <div className="ml-auto flex items-center gap-0.5">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    onClick={() => onListenSection(section.id)}
                    title="Escuchar este apartado"
                    aria-label={`Escuchar ${section.title}`}
                  >
                    <Icon name="headphones" size={18} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    onClick={() => onRegenerateSection(section.id, section.title)}
                    disabled={regeneratingSectionId === section.id}
                    title="Regenerar solo este apartado"
                    aria-label={`Regenerar ${section.title}`}
                  >
                    <Icon
                      name="refresh"
                      size={18}
                      className={regeneratingSectionId === section.id ? "animate-spin" : undefined}
                    />
                  </button>
                </div>
              </div>

              {isLong ? (
                <LazyBlock minHeight={Math.min(900, 120 + section.markdown.length / 6)}>
                  <Markdown markdown={section.markdown} onPageClick={onPageClick} />
                </LazyBlock>
              ) : (
                <Markdown markdown={section.markdown} onPageClick={onPageClick} />
              )}

              {section.keyConcepts.length ? (
                <div className="mt-6 rounded-2xl p-4" style={{ background: "var(--bg-sunken)" }}>
                  <p className="eyebrow mb-2.5 flex items-center gap-1.5">
                    <Icon name="star" size={13} />
                    Conceptos clave
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {section.keyConcepts.map((concept) => (
                      <span key={concept} className="chip !bg-[var(--surface)]">
                        {concept}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => onToggleComplete(section.id, !done)}
                aria-pressed={done}
                className={`btn mt-5 w-full ${done ? "" : "btn-secondary"}`}
                style={
                  done
                    ? { background: "var(--success-soft)", color: "var(--success)", borderColor: "transparent" }
                    : undefined
                }
              >
                <Icon name={done ? "checkCircle" : "check"} size={18} strokeWidth={2.2} />
                {done ? "Estudiado · toca para desmarcar" : "Marcar como estudiado"}
              </button>
            </section>
          );
        })}
      </div>

      {/* Panel lateral (escritorio): progreso, índice y acciones */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-4">
          <div className="card space-y-4 p-4">
            {progreso}
            {acciones}
          </div>
          <nav className="card p-3" aria-label="Índice del resumen">
            <p className="eyebrow mb-2 px-2 pt-1">Índice</p>
            <div className="max-h-[calc(100dvh-22rem)] overflow-y-auto">{indice}</div>
          </nav>
        </div>
      </aside>
    </div>
  );
}
