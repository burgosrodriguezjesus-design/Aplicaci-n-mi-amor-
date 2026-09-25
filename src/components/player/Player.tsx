"use client";

/**
 * Interfaz del reproductor: mini-reproductor inferior siempre accesible y
 * pantalla completa al tocarlo. Pensado primero para el móvil.
 */

import { useEffect, useRef } from "react";
import { SPEEDS, usePlayer } from "@/components/providers/PlayerProvider";
import { Icon } from "@/components/ui/Icon";
import { formatDuration } from "@/lib/client/format";

function ControlButton({
  icon,
  label,
  onClick,
  size = 20,
  variant = "ghost",
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  size?: number;
  variant?: "ghost" | "primary";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={
        variant === "primary"
          ? "flex h-16 w-16 items-center justify-center rounded-full transition hover:brightness-110 active:scale-95"
          : "flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-[var(--surface-hover)] active:scale-95"
      }
      style={
        variant === "primary"
          ? { background: "var(--brand-grad)", color: "#fff", boxShadow: "0 12px 24px -10px rgba(122,80,240,0.8)" }
          : { color: "var(--text-soft)" }
      }
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

export function MiniPlayer() {
  const player = usePlayer();
  if (!player.track || player.expanded) return null;

  const progress = player.duration ? (player.currentTime / player.duration) * 100 : 0;

  return (
    <div
      className="animate-in fixed inset-x-0 bottom-[calc(4.8rem+env(safe-area-inset-bottom,0px))] z-40 px-2 md:bottom-3 md:left-auto md:right-4 md:w-[26rem] md:px-0"
      role="region"
      aria-label="Reproductor"
    >
      <div
        className="card cursor-pointer overflow-hidden !rounded-2xl"
        style={{ boxShadow: "var(--shadow-lg)", background: "var(--glass)", backdropFilter: "saturate(180%) blur(18px)" }}
        onClick={() => player.setExpanded(true)}
      >
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: "linear-gradient(135deg, #f59e0b, #f0719b)" }}
          >
            <Icon name="headphones" size={18} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.82rem] font-semibold leading-tight">
              {player.track.title}
            </p>
            <p className="truncate text-[0.7rem]" style={{ color: "var(--text-muted)" }}>
              {formatDuration(player.currentTime)} / {formatDuration(player.duration)}
              {player.queue ? ` · ${player.queue.documentTitle}` : ""}
            </p>
          </div>

          <div className="flex items-center">
            <ControlButton icon="prev" label="Capítulo anterior" onClick={player.previous} size={16} />
            <ControlButton
              icon={player.isPlaying ? "pause" : "play"}
              label={player.isPlaying ? "Pausar" : "Reproducir"}
              onClick={player.toggle}
              size={18}
            />
            <ControlButton icon="next" label="Capítulo siguiente" onClick={player.next} size={16} />
          </div>
        </div>
        <div className="track" style={{ height: 2 }}>
          <div
            className="track-fill"
            style={{ width: `${progress}%`, background: "var(--audio)" }}
          />
        </div>
      </div>
    </div>
  );
}

export function FullPlayer() {
  const player = usePlayer();
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // El texto narrado se mantiene a la vista mientras avanza el audio.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [player.segmentIndex]);

  useEffect(() => {
    if (!player.expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") player.setExpanded(false);
      if (event.key === " ") {
        event.preventDefault();
        player.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);

  if (!player.expanded || !player.track || !player.queue) return null;

  const progress = player.duration ? (player.currentTime / player.duration) * 100 : 0;
  const remaining = Math.max(0, player.duration - player.currentTime);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col"
      style={{ background: "var(--bg)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Reproductor a pantalla completa"
    >
      <header className="safe-top flex items-center justify-between px-4 py-3">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={() => player.setExpanded(false)}
          aria-label="Minimizar reproductor"
        >
          <Icon name="chevronDown" size={22} />
        </button>
        <div className="text-center">
          <p className="eyebrow">Escuchando</p>
          <p className="max-w-[60vw] truncate text-[0.88rem] font-bold">
            {player.queue.documentTitle}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={player.stop}
          aria-label="Cerrar reproductor"
        >
          <Icon name="close" size={20} />
        </button>
      </header>

      <div className="safe-bottom flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-4 md:mx-auto md:w-full md:max-w-5xl md:flex-row">
        {/* Transcripción sincronizada */}
        <section className="card order-2 flex min-h-0 flex-1 flex-col overflow-hidden md:order-1">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-[0.72rem] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Texto narrado
            </p>
            <span className="chip">
              {player.engine === "server" ? "Voz del servidor" : "Voz del dispositivo"}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            {player.track.segments.map((segment, index) => (
              <button
                key={segment.id}
                ref={index === player.segmentIndex ? activeRef : null}
                type="button"
                className="segment"
                data-active={index === player.segmentIndex}
                onClick={() => player.seekToSegment(index)}
                title="Reproducir desde aquí"
              >
                {segment.text}
              </button>
            ))}
            {player.track.segments.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                Este capítulo no tiene texto narrado.
              </p>
            ) : null}
          </div>
        </section>

        {/* Controles */}
        <section className="order-1 flex flex-col gap-4 md:order-2 md:w-80 md:shrink-0">
          <div
            className="relative flex flex-col items-center gap-2 overflow-hidden rounded-[var(--radius-card)] px-5 py-6 text-center text-white"
            style={{ background: "linear-gradient(135deg, #f59e0b 0%, #f0719b 55%, #9b5cf6 100%)" }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
              <Icon name="headphones" size={26} />
            </div>
            <h1 className="text-lg font-extrabold leading-snug tracking-tight">{player.track.title}</h1>
            <p className="text-xs text-white/85">
              Capítulo {player.trackIndex + 1} de {player.queue.tracks.length}
            </p>
          </div>

          <div>
            <input
              type="range"
              className="scrubber"
              min={0}
              max={Math.max(1, Math.round(player.duration))}
              value={Math.round(player.currentTime)}
              style={{ ["--played" as string]: `${progress}%` }}
              onChange={(event) => player.seek(Number(event.target.value))}
              aria-label="Posición de la reproducción"
            />
            <div className="flex justify-between text-[0.72rem]" style={{ color: "var(--text-muted)" }}>
              <span>{formatDuration(player.currentTime)}</span>
              <span>-{formatDuration(remaining)}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <ControlButton icon="prev" label="Capítulo anterior" onClick={player.previous} />
            <ControlButton icon="back10" label="Retroceder 10 segundos" onClick={() => player.skip(-10)} />
            <ControlButton
              icon={player.isPlaying ? "pause" : "play"}
              label={player.isPlaying ? "Pausar" : "Reproducir"}
              onClick={player.toggle}
              variant="primary"
              size={24}
            />
            <ControlButton icon="forward10" label="Avanzar 10 segundos" onClick={() => player.skip(10)} />
            <ControlButton icon="next" label="Capítulo siguiente" onClick={player.next} />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                className="filter-chip !min-h-9 !px-3"
                onClick={() => player.setRate(speed)}
                data-active={player.rate === speed}
                aria-label={`Velocidad ${speed.toString().replace(".", ",")}×`}
              >
                {speed.toString().replace(".", ",")}×
              </button>
            ))}
          </div>

          <div className="card min-h-0 overflow-hidden">
            <p
              className="border-b px-4 py-2.5 text-[0.72rem] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Capítulos
            </p>
            <div className="max-h-52 overflow-y-auto p-1.5">
              {player.queue.tracks.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.82rem] transition"
                  style={
                    index === player.trackIndex
                      ? { background: "var(--accent-soft)", color: "var(--accent)" }
                      : { color: "var(--text-soft)" }
                  }
                  onClick={() => player.playQueue(player.queue!, index)}
                >
                  <span className="w-5 shrink-0 text-center text-[0.72rem] opacity-60">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="shrink-0 text-[0.7rem] opacity-70">
                    {formatDuration(item.durationSeconds ?? item.estimatedSeconds)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
