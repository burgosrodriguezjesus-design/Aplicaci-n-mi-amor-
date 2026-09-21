"use client";

/**
 * Visor del PDF original. Se sirve desde una ruta autenticada, nunca desde
 * una URL pública, y se navega a una página concreta con el fragmento #page=N
 * que entienden los visores nativos de los navegadores.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export function PdfTab({
  documentId,
  page,
  pageCount,
  onPageChange,
}: {
  documentId: string;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [loading, setLoading] = useState(true);

  // Cambiar el hash obliga al visor a saltar de página.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.src = `/api/documents/${documentId}/file#page=${page}&view=FitH`;
  }, [documentId, page]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-secondary !px-2"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            aria-label="Página anterior"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className="chip tabular-nums">
            Página {page}
            {pageCount ? ` de ${pageCount}` : ""}
          </span>
          <button
            type="button"
            className="btn btn-secondary !px-2"
            onClick={() => onPageChange(Math.min(pageCount || page + 1, page + 1))}
            disabled={pageCount > 0 && page >= pageCount}
            aria-label="Página siguiente"
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>

        <a
          href={`/api/documents/${documentId}/file`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost ml-auto"
        >
          <Icon name="file" size={15} />
          Abrir en una pestaña
        </a>
      </div>

      <div className="card relative overflow-hidden" style={{ height: "min(75vh, 900px)" }}>
        {loading ? (
          <div className="skeleton absolute inset-0" aria-hidden="true" />
        ) : null}
        <iframe
          ref={frameRef}
          title="PDF original"
          className="h-full w-full"
          onLoad={() => setLoading(false)}
        />
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Si tu navegador móvil no muestra el PDF incrustado, usa «Abrir en una pestaña».
      </p>
    </div>
  );
}
