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
import { DocCover, ProgressBar } from "@/components/ui/Primitives";

export function DocumentCard({
  document,
  onDelete,
}: {
  document: DocumentListItem;
  onDelete: (document: DocumentListItem) => void;
}) {
  const processing = document.status !== "READY" && document.status !== "FAILED";

  return (
    <article className="card card-interactive group relative overflow-hidden">
      <Link href={`/documento/${document.id}`} className="flex h-full flex-col p-4">
        <div className="flex items-start gap-3.5">
          <DocCover title={document.title} />
          <div className="min-w-0 flex-1 pr-8">
            <h3 className="line-clamp-2 text-[0.98rem] font-bold leading-snug">{document.title}</h3>
            <p className="mt-1 truncate text-[0.78rem]" style={{ color: "var(--text-muted)" }}>
              {[
                document.subject ? `${document.subject.emoji} ${document.subject.name}` : null,
                document.topic?.name,
                formatDate(document.createdAt),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          {document.pageCount ? (
            <span className="chip">
              <Icon name="file" size={12} strokeWidth={2} />
              {document.pageCount} {document.pageCount === 1 ? "página" : "págs"}
            </span>
          ) : null}
          <span className="chip">{formatBytes(document.sizeBytes)}</span>
          {document.audioSeconds > 0 ? (
            <span className="chip chip-audio">
              <Icon name="headphones" size={12} strokeWidth={2} />
              {formatLongDuration(document.audioSeconds)}
            </span>
          ) : null}
        </div>

        <div className="mt-auto pt-4">
          {processing ? (
            <div className="space-y-2">
              <p className="animate-pulse-soft truncate text-[0.76rem] font-semibold" style={{ color: "var(--accent)" }}>
                {document.statusMessage || STATUS_COPY[document.status]}
              </p>
              <ProgressBar value={document.processingProgress} />
            </div>
          ) : document.status === "FAILED" ? (
            <p
              className="flex items-start gap-1.5 rounded-xl p-2.5 text-[0.78rem] font-medium"
              style={{ color: "var(--danger)", background: "var(--danger-soft)" }}
            >
              <Icon name="warning" size={15} className="mt-px shrink-0" />
              {document.errorMessage ?? "No hemos podido procesarlo."}
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <ProgressBar value={document.studyPercent} tone="success" />
              </div>
              <span className="text-[0.74rem] font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>
                {document.studyPercent} %
              </span>
            </div>
          )}
        </div>
      </Link>

      <button
        type="button"
        className="btn btn-ghost btn-icon absolute right-2 top-2 !min-h-9 !min-w-9 opacity-70 transition hover:!text-[var(--danger)] hover:opacity-100"
        aria-label={`Eliminar ${document.title}`}
        title="Eliminar"
        onClick={() => onDelete(document)}
      >
        <Icon name="trash" size={17} />
      </button>
    </article>
  );
}
