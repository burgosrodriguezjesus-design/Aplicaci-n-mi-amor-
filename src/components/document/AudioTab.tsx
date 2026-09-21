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
    <div className="space-y-4">
      <div className="segmented">
        <button
          type="button"
          data-active={source === "SUMMARY"}
          onClick={() => setSource("SUMMARY")}
        >
          Resumen
        </button>
        <button
          type="button"
          data-active={source === "DOCUMENT"}
          onClick={() => setSource("DOCUMENT")}
        >
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
              className="btn btn-primary"
              onClick={generateFullAudio}
              disabled={generating}
            >
              {generating ? "Preparando…" : "Preparar audio del PDF completo"}
            </button>
          }
        />
      ) : null}

      {tracks.length === 0 ? null : (
      <>
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: "var(--audio-soft)", color: "var(--audio)" }}
        >
          <Icon name="headphones" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.92rem] font-semibold">
            {source === "SUMMARY" ? "Audiolibro del resumen" : "Audiolibro del PDF completo"}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {tracks.length} {tracks.length === 1 ? "capítulo" : "capítulos"} ·{" "}
            {formatLongDuration(totalSeconds)} aprox.
            {capabilities.serverTts ? "" : " · voz de tu dispositivo"}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            player.playQueue({ documentId, documentTitle, tracks }, isThisDocument ? player.trackIndex : 0)
          }
        >
          <Icon name="play" size={15} />
          {isThisDocument && player.isPlaying ? "Reproduciendo" : "Escuchar todo"}
        </button>
      </div>

      {!capabilities.serverTts ? (
        <p
          className="card p-3 text-[0.8rem]"
          style={{ background: "var(--accent-soft)", borderColor: "transparent" }}
        >
          Se está usando la voz integrada en tu dispositivo, que no necesita ninguna clave
          pero se detiene si bloqueas la pantalla. Para escuchar en segundo plano configura{" "}
          <code>TTS_PROVIDER</code> en el servidor.
        </p>
      ) : null}

      {isThisDocument && player.track ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.78rem]" style={{ color: "var(--text-muted)" }}>
            Velocidad
          </span>
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className="chip"
              onClick={() => player.setRate(speed)}
              style={
                player.rate === speed
                  ? {
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      borderColor: "var(--accent)",
                    }
                  : undefined
              }
            >
              {speed.toString().replace(".", ",")}×
            </button>
          ))}
        </div>
      ) : null}

      <ol className="space-y-2">
        {tracks.map((track, index) => {
          const isCurrent = isThisDocument && player.trackIndex === index;
          return (
            <li key={track.id}>
              <div
                className="card overflow-hidden transition"
                style={isCurrent ? { borderColor: "var(--audio)" } : undefined}
              >
                <div className="flex items-center gap-3 p-3">
                  <button
                    type="button"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95"
                    style={{
                      background: isCurrent ? "var(--audio)" : "var(--bg-sunken)",
                      color: isCurrent ? "#fff" : "var(--text-soft)",
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
                    <Icon name={isCurrent && player.isPlaying ? "pause" : "play"} size={15} />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.88rem] font-medium">{track.title}</p>
                    <p className="text-[0.73rem]" style={{ color: "var(--text-muted)" }}>
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
                      className="btn btn-ghost !px-2"
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
