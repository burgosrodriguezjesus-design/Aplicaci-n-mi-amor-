"use client";

import Link from "next/link";
import {
  formatBytes,
  formatDate,
  formatLongDuration,
  STATUS_COPY,
} from "@/lib/client/format";
import type { DocumentListItem } from "@/lib/client/types";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/Primitives";

export function DocumentCard({
  document,
  onDelete,
}: {
  document: DocumentListItem;
  onDelete: (document: DocumentListItem) => void;
}) {
  const processing = document.status !== "READY" && document.status !== "FAILED";

  return (
    <article className="card card-interactive relative overflow-hidden">
      <Link href={`/documento/${document.id}`} className="block p-4">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base"
            style={{
              background: document.subject?.color
                ? `color-mix(in srgb, ${document.subject.color} 16%, transparent)`
                : "var(--bg-sunken)",
            }}
          >
            {document.subject?.emoji ?? "📄"}
          </span>
          <div className="min-w-0 flex-1 pr-7">
            <h3 className="truncate text-[0.95rem] font-semibold leading-snug">
              {document.title}
            </h3>
            <p className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
              {[
                document.subject?.name,
                document.topic?.name,
                formatDate(document.createdAt),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {document.pageCount ? (
            <span className="chip">
              <Icon name="file" size={11} strokeWidth={2} />
              {document.pageCount} {document.pageCount === 1 ? "página" : "páginas"}
            </span>
          ) : null}
          <span className="chip">{formatBytes(document.sizeBytes)}</span>
          {document.audioSeconds > 0 ? (
            <span className="chip">
              <Icon name="headphones" size={11} strokeWidth={2} />
              {formatLongDuration(document.audioSeconds)}
            </span>
          ) : null}
        </div>

        {processing ? (
          <div className="mt-3 space-y-1.5">
            <p className="animate-pulse-soft text-[0.75rem]" style={{ color: "var(--accent)" }}>
              {document.statusMessage || STATUS_COPY[document.status]}
            </p>
            <ProgressBar value={document.processingProgress} />
          </div>
        ) : document.status === "FAILED" ? (
          <p className="mt-3 text-[0.75rem]" style={{ color: "var(--danger)" }}>
            {document.errorMessage ?? "No hemos podido procesarlo."}
          </p>
        ) : (
          <div className="mt-3 space-y-1.5">
            <p className="text-[0.73rem]" style={{ color: "var(--text-muted)" }}>
              {document.studyPercent} % completado
            </p>
            <ProgressBar value={document.studyPercent} tone="success" />
          </div>
        )}
      </Link>

      <button
        type="button"
        className="btn btn-ghost absolute right-2 top-3 !px-1.5"
        aria-label={`Eliminar ${document.title}`}
        onClick={() => onDelete(document)}
      >
        <Icon name="trash" size={16} />
      </button>
    </article>
  );
}
