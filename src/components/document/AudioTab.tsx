"use client";

/**
 * Pestaña de audio: lista de capítulos, reproducción y texto sincronizado.
 * El audio sigue sonando aunque el usuario cambie de pantalla, porque el
 * reproductor vive en el layout de la aplicación.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { usePlayer, SPEEDS } from "@/components/providers/PlayerProvider";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/Primitives";
import { formatDuration, formatLongDuration } from "@/lib/client/format";
import type { AudioTrackDto } from "@/lib/client/types";
import { useSession } from "@/components/AppShell";
import { api, ApiError } from "@/lib/client/api";
import { useToast } from "@/components/providers/ToastProvider";

export function AudioTab({
  documentId,
  documentTitle,
  tracks: allTracks,
  onReload,
}: {
  documentId: string;
  documentTitle: string;
  tracks: AudioTrackDto[];
  onReload: () => Promise<void> | void;
}) {
  const player = usePlayer();
  const { capabilities } = useSession();
  const { toast } = useToast();
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const [source, setSource] = useState<"SUMMARY" | "DOCUMENT">("SUMMARY");
  const [generating, setGenerating] = useState(false);

  const summaryTracks = useMemo(
    () => allTracks.filter((track) => track.source === "SUMMARY"),
    [allTracks],
  );
  const documentTracks = useMemo(
    () => allTracks.filter((track) => track.source === "DOCUMENT"),
    [allTracks],
  );
  const tracks = source === "SUMMARY" ? summaryTracks : documentTracks;

  const isThisDocument = player.queue?.documentId === documentId;

  useEffect(() => {
    if (isThisDocument) {
      activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [isThisDocument, player.segmentIndex]);

  const generateFullAudio = async () => {
    setGenerating(true);
    try {
      await api.post(`/api/documents/${documentId}/tracks`, { source: "DOCUMENT" });
      await onReload();
      toast({ title: "Audiolibro del PDF completo preparado", variant: "success" });
    } catch (error) {
      toast({
        title: "No hemos podido preparar ese audio",
        description: error instanceof ApiError ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setGenerating(false);
    }
  };

  if (summaryTracks.length === 0) {
    return (
      <EmptyState
        icon="headphones"
        title="Todavía no hay audio"
        description="Los guiones de audio se preparan al terminar el resumen."
      />
    );
  }

  const totalSeconds = tracks.reduce(
    (sum, track) => sum + (track.durationSeconds ?? track.estimatedSeconds),
    0,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="segmented w-full sm:w-auto">
        <button
          type="button"
          className="flex-1 sm:flex-none"
          data-active={source === "SUMMARY"}
          onClick={() => setSource("SUMMARY")}
        >
          <Icon name="book" size={16} />
          Resumen
        </button>
        <button
          type="button"
          className="flex-1 sm:flex-none"
          data-active={source === "DOCUMENT"}
          onClick={() => setSource("DOCUMENT")}
        >
          <Icon name="file" size={16} />
          PDF completo
        </button>
      </div>

      {source === "DOCUMENT" && documentTracks.length === 0 ? (
        <EmptyState
          icon="headphones"
          title="Escucha el PDF entero"
          description="Preparamos el texto completo del documento adaptado a voz, sin resumir nada. Se genera una sola vez."
          action={
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={generateFullAudio}
              disabled={generating}
            >
              <Icon name="headphones" size={19} />
              {generating ? "Preparando…" : "Preparar audio del PDF completo"}
            </button>
          }
        />
      ) : null}

      {tracks.length === 0 ? null : (
      <>
      <div
        className="relative overflow-hidden rounded-[var(--radius-card)] p-5 text-white sm:p-6"
        style={{
          background: "linear-gradient(135deg, #f59e0b 0%, #f0719b 55%, #9b5cf6 100%)",
          boxShadow: "0 18px 40px -20px rgba(240,113,155,0.8)",
        }}
      >
        <div className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/15" aria-hidden="true" />
        <div className="relative flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 sm:h-20 sm:w-20">
            <Icon name="headphones" size={32} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.78rem] font-semibold text-white/85">
              {source === "SUMMARY" ? "Audiolibro del resumen" : "Audiolibro del PDF completo"}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[1.15rem] font-extrabold leading-snug tracking-tight">
              {documentTitle}
            </p>
            <p className="mt-1 text-[0.8rem] text-white/85">
              {tracks.length} {tracks.length === 1 ? "capítulo" : "capítulos"} · {formatLongDuration(totalSeconds)} aprox.
              {capabilities.serverTts ? "" : " · voz de tu dispositivo"}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-white btn-lg relative mt-5 w-full sm:w-auto"
          onClick={() =>
            isThisDocument && player.track
              ? player.toggle()
              : player.playQueue({ documentId, documentTitle, tracks }, isThisDocument ? player.trackIndex : 0)
          }
        >
          <Icon name={isThisDocument && player.isPlaying ? "pause" : "play"} size={19} />
          {isThisDocument && player.isPlaying ? "Pausar" : isThisDocument && player.track ? "Continuar" : "Escuchar todo"}
        </button>
      </div>

      {!capabilities.serverTts ? (
        <p className="flex items-start gap-2 px-1 text-[0.8rem] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          <span>
            Se usa la voz de tu dispositivo: no necesita ninguna clave, pero se detiene si bloqueas la pantalla.
          </span>
        </p>
      ) : null}

      {isThisDocument && player.track ? (
        <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <span className="mr-1 flex shrink-0 items-center gap-1.5 text-[0.82rem] font-semibold" style={{ color: "var(--text-muted)" }}>
            <Icon name="timer" size={16} />
            Velocidad
          </span>
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className="filter-chip !min-h-9 !px-3.5"
              onClick={() => player.setRate(speed)}
              data-active={player.rate === speed}
            >
              {speed.toString().replace(".", ",")}×
            </button>
          ))}
        </div>
      ) : null}

      <h3 className="px-1 pt-2 text-[1rem] font-bold">Capítulos</h3>
      <ol className="space-y-2">
        {tracks.map((track, index) => {
          const isCurrent = isThisDocument && player.trackIndex === index;
          return (
            <li key={track.id}>
              <div
                className="card overflow-hidden transition"
                style={isCurrent ? { borderColor: "var(--audio)", boxShadow: "0 0 0 3px var(--audio-soft)" } : undefined}
              >
                <div className="flex items-center gap-3.5 p-3.5">
                  <button
                    type="button"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95"
                    style={{
                      background: isCurrent ? "var(--audio)" : "var(--accent-soft)",
                      color: isCurrent ? "#fff" : "var(--accent)",
                    }}
                    aria-label={
                      isCurrent && player.isPlaying
                        ? `Pausar ${track.title}`
                        : `Reproducir ${track.title}`
                    }
                    onClick={() => {
                      if (isCurrent) player.toggle();
                      else player.playQueue({ documentId, documentTitle, tracks }, index);
                    }}
                  >
                    <Icon name={isCurrent && player.isPlaying ? "pause" : "play"} size={17} />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.92rem] font-bold">{track.title}</p>
                    <p className="mt-0.5 text-[0.76rem]" style={{ color: "var(--text-muted)" }}>
                      Capítulo {index + 1} ·{" "}
                      {formatDuration(track.durationSeconds ?? track.estimatedSeconds)}
                      {isCurrent
                        ? ` · ${formatDuration(player.currentTime)} reproducido`
                        : ""}
                    </p>
                  </div>

                  {isCurrent ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      onClick={() => player.setExpanded(true)}
                      aria-label="Abrir reproductor completo"
                    >
                      <Icon name="expand" size={16} />
                    </button>
                  ) : null}
                </div>

                {/* Texto sincronizado del capítulo en reproducción. Los
                    segmentos los carga el reproductor bajo demanda. */}
                {isCurrent ? (
                  <div
                    className="max-h-80 overflow-y-auto border-t px-2 py-2"
                    style={{ background: "var(--bg-sunken)" }}
                  >
                    {(player.track?.segments ?? []).map((segment, segmentIndex) => (
                      <button
                        key={segment.id}
                        ref={segmentIndex === player.segmentIndex ? activeRef : null}
                        type="button"
                        className="segment"
                        data-active={segmentIndex === player.segmentIndex}
                        onClick={() => player.seekToSegment(segmentIndex)}
                        title="Reproducir desde aquí"
                      >
                        {segment.text}
                      </button>
                    ))}
                    {(player.track?.segments ?? []).length === 0 ? (
                      <p className="px-3 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                        Cargando el texto del capítulo…
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      </>
      )}
    </div>
  );
}
