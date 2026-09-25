"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { empujarTrabajo } from "@/lib/client/jobs";
import type { DocumentDetail } from "@/lib/client/types";
import { STATUS_COPY, formatBytes, formatRelative } from "@/lib/client/format";
import { Icon } from "@/components/ui/Icon";
import { DocCover, ErrorNotice, ProgressRing, Skeleton } from "@/components/ui/Primitives";
import { useToast } from "@/components/providers/ToastProvider";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { SummaryTab } from "./SummaryTab";
import { OutlineTab } from "./OutlineTab";
import { AudioTab } from "./AudioTab";
import { PdfTab } from "./PdfTab";
import { RegenerateDialog } from "./RegenerateDialog";

type Tab = "pdf" | "summary" | "outline" | "audio";

const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: "summary", label: "Resumen", icon: "book" },
  { value: "outline", label: "Esquema", icon: "outline" },
  { value: "audio", label: "Audio", icon: "headphones" },
  { value: "pdf", label: "PDF", icon: "file" },
];

/** Cada cuántos segundos se envía el tiempo de estudio acumulado. */
const HEARTBEAT_SECONDS = 20;

export function DocumentView({ documentId }: { documentId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const player = usePlayer();

  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "summary");
  const [page, setPage] = useState(1);
  const [completed, setCompleted] = useState<string[]>([]);
  const [regenerateScope, setRegenerateScope] = useState<
    { scope: "summary" | "outline" | "section"; sectionId?: string; title?: string } | null
  >(null);
  const [busySection, setBusySection] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const document_ = detail?.document;
  const processing =
    document_ && document_.status !== "READY" && document_.status !== "FAILED";

  const load = useCallback(async () => {
    try {
      const data = await api.get<DocumentDetail>(`/api/documents/${documentId}`);
      setDetail(data);
      setCompleted(data.progress?.completedSections ?? []);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : "No hemos podido cargar el documento.",
      );
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sondeo mientras el documento se está procesando.
  useEffect(() => {
    if (!processing) return;
    const interval = setInterval(() => {
      void load();
    }, 2500);
    return () => clearInterval(interval);
  }, [load, processing]);

  const [releyendo, setReleyendo] = useState(false);

  /** Lee otra vez, en este dispositivo, las páginas que se quedaron sin texto. */
  const releerEscaneadas = async () => {
    setReleyendo(true);
    try {
      await api.post(`/api/documents/${documentId}/releer`, {});
      await load();
      void empujarTrabajo();
    } catch (caught) {
      toast({
        title: "No hemos podido empezar",
        description: caught instanceof ApiError ? caught.message : undefined,
        variant: "error",
      });
    } finally {
      setReleyendo(false);
    }
  };

  const changeTab = useCallback(
    (next: Tab) => {
      setTab(next);
      const search = new URLSearchParams(params.toString());
      search.set("tab", next);
      router.replace(`/documento/${documentId}?${search.toString()}`, { scroll: false });
      void api.post("/api/progress", { documentId, lastTab: next }).catch(() => undefined);
    },
    [documentId, params, router],
  );

  const openPage = useCallback(
    (target: number) => {
      setPage(Math.max(1, target));
      changeTab("pdf");
    },
    [changeTab],
  );

  // ── Tiempo de estudio ────────────────────────────────────────────────
  const readAccumulator = useRef(0);
  const listenAccumulator = useRef(0);
  const playingHere = player.queue?.documentId === documentId && player.isPlaying;

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (playingHere) listenAccumulator.current += 1;
      else readAccumulator.current += 1;

      const total = readAccumulator.current + listenAccumulator.current;
      if (total >= HEARTBEAT_SECONDS) {
        const payload = {
          documentId,
          readSeconds: readAccumulator.current,
          listenSeconds: listenAccumulator.current,
          ...(playingHere
            ? {
                lastTrackId: player.track?.id ?? null,
                lastPositionSeconds: player.currentTime,
              }
            : {}),
        };
        readAccumulator.current = 0;
        listenAccumulator.current = 0;
        void api.post("/api/progress", payload).catch(() => undefined);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [documentId, player.currentTime, player.track?.id, playingHere]);

  // ── Progreso por apartados ───────────────────────────────────────────
  const toggleComplete = async (sectionId: string, done: boolean) => {
    setCompleted((current) =>
      done ? [...new Set([...current, sectionId])] : current.filter((id) => id !== sectionId),
    );
    try {
      const response = await api.post<{ progress: { completedSections: string[] } }>(
        "/api/progress",
        {
          documentId,
          ...(done ? { completedSectionId: sectionId } : { uncompletedSectionId: sectionId }),
        },
      );
      setCompleted(response.progress.completedSections);
    } catch {
      toast({ title: "No hemos podido guardar el progreso", variant: "error" });
    }
  };

  // ── Reproducción ─────────────────────────────────────────────────────
  const playFromSection = useCallback(
    (sectionId: string) => {
      if (!detail) return;
      // El audiolibro del resumen es el que está ligado a los apartados.
      const summaryTracks = detail.tracks.filter((track) => track.source === "SUMMARY");
      const index = summaryTracks.findIndex((track) =>
        track.segments.some((segment) => segment.summarySectionId === sectionId),
      );
      if (index < 0) {
        toast({
          title: "Este apartado aún no tiene audio",
          description: "Espera a que termine la preparación del audiolibro.",
        });
        return;
      }
      player.playQueue(
        {
          documentId,
          documentTitle: detail.document.title,
          tracks: summaryTracks,
        },
        index,
      );
    },
    [detail, documentId, player, toast],
  );

  /** Apartado del resumen que se está narrando ahora mismo. */
  const activeSectionId = useMemo(() => {
    if (player.queue?.documentId !== documentId || !player.track) return null;
    const segment = player.track.segments[player.segmentIndex];
    return segment?.summarySectionId ?? player.track.segments[0]?.summarySectionId ?? null;
  }, [documentId, player.queue?.documentId, player.segmentIndex, player.track]);

  // ── Regeneración ─────────────────────────────────────────────────────
  const runRegenerate = async (options: {
    instructions: string;
    depth: string;
    explanationStyle: string;
  }) => {
    if (!regenerateScope) return;
    const { scope, sectionId, title } = regenerateScope;

    if (scope === "section" && sectionId) setBusySection(sectionId);
    else setBusyAll(true);

    try {
      await api.post(`/api/documents/${documentId}/regenerate`, {
        target: scope,
        sectionId,
        instructions: options.instructions || undefined,
        depth: scope === "outline" ? undefined : options.depth,
        explanationStyle: scope === "outline" ? undefined : options.explanationStyle,
      });
      setRegenerateScope(null);
      // Donde no hay servidor, la regeneración avanza por tandas: hay que
      // empujarla antes de recargar, o no se vería nada nuevo.
      await empujarTrabajo();
      await load();
      toast({
        title:
          scope === "section"
            ? `Apartado «${title ?? ""}» regenerado`
            : "Regeneración en marcha",
        description:
          scope === "section"
            ? undefined
            : "Verás el resultado en cuanto termine el proceso.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "No hemos podido regenerarlo",
        description: error instanceof ApiError ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setBusySection(null);
      setBusyAll(false);
    }
  };

  // ── Estados de carga y error ─────────────────────────────────────────
  if (loadError) {
    return (
      <div className="space-y-4">
        <ErrorNotice title="No hemos podido abrir el documento" description={loadError} onRetry={load} />
        <Link href="/biblioteca" className="btn btn-secondary">
          Volver a la biblioteca
        </Link>
      </div>
    );
  }

  if (!detail || !document_) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-full" />
        <div className="card space-y-3 p-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in space-y-5">
      <header className="space-y-4">
        <Link
          href="/biblioteca"
          className="btn btn-ghost btn-sm -ml-2 !gap-1 !px-2"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="chevronLeft" size={17} />
          Biblioteca
        </Link>

        <div className="flex items-start gap-4 sm:gap-5">
          <DocCover title={document_.title} size="lg" className="hidden sm:flex" />
          <DocCover title={document_.title} className="sm:hidden" />
          <div className="min-w-0 flex-1">
            {document_.subject ? (
              <p className="eyebrow !normal-case !tracking-normal">
                {document_.subject.emoji} {document_.subject.name}
                {document_.topic ? ` · ${document_.topic.name}` : ""}
              </p>
            ) : null}
            <h1 className="mt-1 line-clamp-3 text-[1.45rem] font-extrabold leading-tight tracking-[-0.03em] sm:text-[1.95rem]">
              {document_.title}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="chip">
                <Icon name="file" size={12} strokeWidth={2} />
                {document_.pageCount} {document_.pageCount === 1 ? "página" : "páginas"}
              </span>
              <span className="chip">{formatBytes(document_.sizeBytes)}</span>
              <span className="chip">
                <Icon name="clock" size={12} strokeWidth={2} />
                {formatRelative(document_.createdAt)}
              </span>
              {document_.usedOcr ? (
                <span className="chip chip-accent" title="Se ha leído con reconocimiento de texto">
                  <Icon name="scan" size={12} strokeWidth={2} />
                  Escaneado
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {processing ? (
        <div className="card flex items-center gap-4 p-4 sm:p-5">
          <ProgressRing value={document_.processingProgress} size={56} stroke={5} />
          <div className="min-w-0 flex-1">
            <p className="animate-pulse-soft text-[0.92rem] font-bold" style={{ color: "var(--accent)" }}>
              {document_.statusMessage || STATUS_COPY[document_.status]}
            </p>
            <p className="mt-1 text-[0.8rem] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {document_.pageCount > 80
                ? `Son ${document_.pageCount} páginas: puede tardar unos minutos. `
                : ""}
              {detail.document.pdfEnDispositivo
                ? "Deja la app abierta mientras se lee: este PDF solo está en tu dispositivo."
                : "Puedes cerrar la app: se termina solo en el servidor. Con la app abierta va más rápido, porque tu dispositivo también lee."}
            </p>
          </div>
        </div>
      ) : null}

      {document_.errorCode === "OCR_PARTIAL" && document_.errorMessage ? (
        <div
          className="flex items-start gap-2.5 rounded-2xl px-4 py-3 text-[0.86rem] leading-relaxed"
          style={{ background: "var(--warning-soft)", color: "var(--text-soft)" }}
        >
          <Icon name="warning" size={17} className="mt-0.5 shrink-0" />
          <span>{document_.errorMessage}</span>
        </div>
      ) : null}

      {document_.status === "FAILED" ? (
        <ErrorNotice
          title="No hemos podido procesar este documento"
          description={document_.errorMessage}
          onRetry={() => router.push("/subir")}
          retryLabel="Subir otro PDF"
        />
      ) : null}

      {document_.textCoverage > 0 && document_.textCoverage < 60 ? (
        <div
          className="rounded-2xl px-4 py-3 text-[0.86rem] leading-relaxed"
          style={{ background: "var(--warning-soft)", color: "var(--text-soft)" }}
        >
          Solo hemos podido leer texto en el {document_.textCoverage} % de las páginas. Las
          páginas escaneadas sin texto reconocible no aparecen en el resumen.
          {document_.status === "READY" || document_.status === "FAILED" ? (
            <button
              type="button"
              className="btn btn-secondary mt-3 w-full"
              onClick={releerEscaneadas}
              disabled={releyendo}
            >
              <Icon name="scan" size={17} />
              {releyendo ? "Preparando…" : "Volver a leer las páginas escaneadas"}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Pestañas: fijas arriba al desplazarse */}
      <nav
        className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 md:top-0 md:-mx-10 md:px-10"
        style={{ background: "var(--glass)", backdropFilter: "saturate(180%) blur(16px)" }}
        aria-label="Secciones del documento"
      >
        <div className="tabs no-scrollbar" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              data-active={tab === item.value}
              onClick={() => changeTab(item.value)}
              className="tab flex-1 justify-center sm:flex-none"
            >
              <Icon name={item.icon} size={18} strokeWidth={tab === item.value ? 2.2 : 1.8} />
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <div>
        {tab === "pdf" ? (
          <PdfTab
            documentId={documentId}
            enDispositivo={detail.document.pdfEnDispositivo === true}
            page={page}
            pageCount={document_.pageCount}
            onPageChange={setPage}
          />
        ) : null}

        {tab === "summary" ? (
          <SummaryTab
            detail={detail}
            completed={completed}
            activeSectionId={activeSectionId}
            onToggleComplete={toggleComplete}
            onPageClick={openPage}
            onListenSection={playFromSection}
            onRegenerateSection={(sectionId, title) =>
              setRegenerateScope({ scope: "section", sectionId, title })
            }
            onRegenerateAll={() => setRegenerateScope({ scope: "summary" })}
            regeneratingSectionId={busySection}
            regeneratingAll={busyAll}
          />
        ) : null}

        {tab === "outline" ? (
          <OutlineTab
            tree={detail.outline?.tree ?? null}
            onPageClick={openPage}
            onRegenerate={() => setRegenerateScope({ scope: "outline" })}
            regenerating={busyAll}
          />
        ) : null}

        {tab === "audio" ? (
          <AudioTab
            documentId={documentId}
            documentTitle={document_.title}
            tracks={detail.tracks}
            onReload={load}
          />
        ) : null}
      </div>

      <RegenerateDialog
        open={Boolean(regenerateScope)}
        scope={regenerateScope?.scope ?? "summary"}
        sectionTitle={regenerateScope?.title}
        defaultDepth={document_.summaryDepth}
        defaultStyle={document_.explanationStyle}
        busy={busyAll || Boolean(busySection)}
        onClose={() => setRegenerateScope(null)}
        onSubmit={runRegenerate}
      />
    </div>
  );
}
