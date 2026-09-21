"use client";

import { Icon } from "./Icon";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/** Esqueleto de una tarjeta de documento, usado mientras carga la biblioteca. */
export function CardSkeleton() {
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="mt-4 h-1.5 w-full" />
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
    <div className="track" style={{ height }}>
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
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: "var(--bg-sunken)", color: "var(--text-muted)" }}
      >
        <Icon name={icon} size={22} />
      </div>
      <div>
        <p className="text-base font-semibold">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: "var(--text-muted)" }}>
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
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6"
      style={{ background: "rgba(10,10,12,0.45)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="card animate-sheet w-full max-w-lg overflow-hidden sm:animate-in"
        style={{ boxShadow: "var(--shadow-lg)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            className="btn btn-ghost !px-2"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex justify-end gap-2 border-t px-5 py-3.5">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}
