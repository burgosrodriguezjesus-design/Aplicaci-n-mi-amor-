"use client";

/**
 * Visor del PDF original. Se sirve desde una ruta autenticada, nunca desde
 * una URL pública, y se navega a una página concreta con el fragmento #page=N
 * que entienden los visores nativos de los navegadores.
 *
 * El PDF se descarga a trozos y se abre desde memoria: asi funciona aunque
 * pese mas de lo que el alojamiento deja mandar de una vez.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { descargarPdf } from "@/lib/client/pdf";
import { guardarPdfLocal, pdfLocal } from "@/lib/client/pdf-local";

export function PdfTab({
  documentId,
  page,
  pageCount,
  onPageChange,
  enDispositivo = false,
}: {
  documentId: string;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** El PDF no está en el servidor: solo en el dispositivo que lo subió. */
  enDispositivo?: boolean;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    let url: string | null = null;
    setPdfUrl(null);
    setError(null);
    setPercent(0);
    setLoading(true);
    // Primero el que haya en este dispositivo (al instante); si no, del servidor.
    pdfLocal(documentId)
      .then((local) => {
        if (local) return local;
        if (enDispositivo) {
          throw new Error(
            "Este PDF es grande y se guardó solo en el dispositivo desde el que lo subiste. Ábrelo allí, o elige aquí el mismo archivo para verlo.",
          );
        }
        return descargarPdf(documentId, setPercent, control.signal);
      })
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
      })
      .catch((caught) => {
        if (control.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "No hemos podido cargar el PDF.");
      });
    return () => {
      control.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [documentId, attempt, enDispositivo]);

  // Cambiar el hash obliga al visor a saltar de página.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !pdfUrl) return;
    frame.src = `${pdfUrl}#page=${page}&view=FitH`;
  }, [pdfUrl, page]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-secondary btn-icon"
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
            className="btn btn-secondary btn-icon"
            onClick={() => onPageChange(Math.min(pageCount || page + 1, page + 1))}
            disabled={pageCount > 0 && page >= pageCount}
            aria-label="Página siguiente"
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>

        <a
          href={pdfUrl ?? `/api/documents/${documentId}/file`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost ml-auto"
        >
          <Icon name="file" size={15} />
          Abrir en una pestaña
        </a>
      </div>

      <div className="card relative overflow-hidden" style={{ height: "min(78vh, 1000px)", background: "var(--bg-sunken)" }}>
        {loading && !error ? (
          <div className="skeleton absolute inset-0" aria-hidden="true" />
        ) : null}
        {!pdfUrl && !error ? (
          <div
            className="absolute inset-0 flex items-center justify-center text-sm tabular-nums"
            style={{ color: "var(--text-muted)" }}
            role="status"
          >
            Cargando el PDF… {percent}%
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm">{error}</p>
            {enDispositivo ? (
              <label className="btn btn-secondary cursor-pointer">
                Elegir el PDF
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={async (event) => {
                    const elegido = event.target.files?.[0];
                    if (!elegido) return;
                    await guardarPdfLocal(documentId, elegido).catch(() => undefined);
                    setAttempt((value) => value + 1);
                  }}
                />
              </label>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Reintentar
              </button>
            )}
          </div>
        ) : null}
        <iframe
          ref={frameRef}
          title="PDF original"
          className="h-full w-full"
          onLoad={() => {
            if (pdfUrl) setLoading(false);
          }}
        />
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Si tu navegador móvil no muestra el PDF incrustado, usa «Abrir en una pestaña».
      </p>
    </div>
  );
}
