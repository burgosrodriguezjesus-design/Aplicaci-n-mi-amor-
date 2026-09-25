"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/** Esqueleto de una tarjeta de documento, usado mientras carga la biblioteca. */
export function CardSkeleton() {
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3.5">
        <Skeleton className="h-16 w-12 rounded-xl" />
        <div className="flex-1 space-y-2.5 pt-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="mt-4 h-1.5 w-full" />
    </div>
  );
}

/* ── Portada generada de un documento ──────────────────────────── */

const PORTADAS: [string, string][] = [
  ["#6a5cff", "#9b5cf6"],
  ["#f0719b", "#f59e6b"],
  ["#14b8a6", "#3b82f6"],
  ["#8b5cf6", "#ec4899"],
  ["#f59e0b", "#ef4444"],
  ["#0ea5e9", "#6366f1"],
  ["#10b981", "#84cc16"],
  ["#6366f1", "#06b6d4"],
];

function hash(texto: string) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Iniciales de un título: "Gestión de existencias" → "GE". */
function iniciales(titulo: string) {
  const palabras = titulo
    .replace(/\.pdf$/i, "")
    .split(/[\s_\-·.]+/)
    .filter((p) => p.length > 2 || /^\d/.test(p));
  return (palabras.slice(0, 2).map((p) => p[0]).join("") || titulo.slice(0, 2)).toUpperCase();
}

/**
 * Portada de un documento: un color propio (siempre el mismo para el mismo
 * título) con sus iniciales, como la carátula de un libro.
 */
export function DocCover({
  title,
  size = "md",
  className = "",
}: {
  title: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [a, b] = PORTADAS[hash(title) % PORTADAS.length];
  const dims =
    size === "lg"
      ? { w: 88, h: 116, font: "1.6rem", radius: "1rem" }
      : size === "sm"
        ? { w: 40, h: 52, font: "0.82rem", radius: "0.6rem" }
        : { w: 52, h: 68, font: "1.05rem", radius: "0.75rem" };
  return (
    <div
      className={`relative flex shrink-0 flex-col justify-end overflow-hidden p-2 text-white ${className}`}
      style={{
        width: dims.w,
        height: dims.h,
        borderRadius: dims.radius,
        background: `linear-gradient(145deg, ${a}, ${b})`,
        boxShadow: `0 8px 18px -10px ${a}, inset 0 0 0 1px rgba(255,255,255,0.14)`,
      }}
      aria-hidden="true"
    >
      {/* Lomo del libro y un brillo, para que parezca un objeto. */}
      <span className="absolute inset-y-0 left-0 w-[5px]" style={{ background: "rgba(0,0,0,0.14)" }} />
      <span
        className="absolute -right-4 -top-6 h-16 w-16 rounded-full"
        style={{ background: "rgba(255,255,255,0.18)" }}
      />
      <span className="relative font-extrabold leading-none tracking-tight" style={{ fontSize: dims.font }}>
        {iniciales(title)}
      </span>
    </div>
  );
}

/* ── Anillo de progreso ────────────────────────────────────────── */

export function ProgressRing({
  value,
  size = 44,
  stroke = 4,
  tone = "accent",
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: "accent" | "success" | "white";
  label?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const color = tone === "white" ? "#fff" : tone === "success" ? "var(--success)" : "var(--accent)";
  const fondo = tone === "white" ? "rgba(255,255,255,0.28)" : "var(--border)";
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={fondo} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          style={{ transition: "stroke-dashoffset 500ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <span
        className="absolute text-[0.68rem] font-bold"
        style={{ color: tone === "white" ? "#fff" : "var(--text)" }}
      >
        {label ?? `${Math.round(v)}%`}
      </span>
    </div>
  );
}

export function TextSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-3.5"
          // Longitudes irregulares para que parezca texto real.
        />
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "accent",
  height = 4,
}: {
  value: number;
  tone?: "accent" | "audio" | "success";
  height?: number;
}) {
  const color =
    tone === "audio" ? "var(--audio)" : tone === "success" ? "var(--success)" : "var(--accent)";
  return (
    <div className="track" style={{ height: Math.max(height, 5) }}>
      <div
        className="track-fill"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
      />
    </div>
  );
}

export function EmptyState({
  icon = "file",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
      <div className="relative">
        <div
          className="absolute inset-0 -z-0 scale-150 rounded-full blur-2xl"
          style={{ background: "var(--accent-soft)" }}
        />
        <div className="icon-tile relative !h-14 !w-14 !rounded-2xl">
          <Icon name={icon} size={26} />
        </div>
      </div>
      <div>
        <p className="text-lg font-bold tracking-tight">{title}</p>
        {description ? (
          <p className="mx-auto mt-1.5 max-w-sm text-[0.92rem] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorNotice({
  title,
  description,
  onRetry,
  retryLabel = "Reintentar",
}: {
  title: string;
  description?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
      style={{
        background: "var(--danger-soft)",
        borderColor: "color-mix(in srgb, var(--danger) 30%, transparent)",
      }}
    >
      <div className="flex flex-1 items-start gap-3">
        <span style={{ color: "var(--danger)" }}>
          <Icon name="warning" size={20} />
        </span>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>
            {title}
          </p>
          {description ? (
            <p className="mt-0.5 text-sm" style={{ color: "var(--text-soft)" }}>
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {onRetry ? (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          <Icon name="refresh" size={16} />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // Se pinta directamente en <body>: dentro de una pantalla con animación
  // de entrada quedaría por debajo de la barra de navegación del móvil.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    if (!open) return;
    const alPulsar = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [open, onClose]);
  if (!open || !montado) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6"
      style={{ background: "rgba(12,10,24,0.42)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="card animate-sheet w-full max-w-lg overflow-hidden !rounded-b-none sm:animate-in sm:!rounded-b-[var(--radius-card)]"
        style={{ boxShadow: "var(--shadow-lg)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-bold tracking-tight">{title}</h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="max-h-[min(70vh,calc(100dvh-9rem))] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="safe-bottom flex justify-end gap-2 border-t px-5 py-3.5">{footer}</footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
