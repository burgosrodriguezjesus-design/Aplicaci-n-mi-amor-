"use client";

/**
 * Zona de subida: arrastrar y soltar o seleccionar desde el dispositivo.
 * Muestra nombre, tamaño, páginas, progreso real de subida y cada fase del
 * procesamiento, y permite cancelar antes de que termine de subirse.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, uploadDocument, type UploadHandle } from "@/lib/client/api";
import { borrarPdfLocal } from "@/lib/client/pdf-local";
import { empujarTrabajo } from "@/lib/client/jobs";
import {
  conservarPdfLocal,
  procesarEnDispositivo,
  recordarPdfLocal,
} from "@/lib/client/ocr-dispositivo";
import {
  DEPTH_OPTIONS,
  LEVEL_OPTIONS,
  STYLE_OPTIONS,
  formatBytes,
} from "@/lib/client/format";
import type { DocumentStatus, Subject } from "@/lib/client/types";
import { Icon } from "@/components/ui/Icon";
import { DocCover, ErrorNotice, ProgressBar, ProgressRing } from "@/components/ui/Primitives";
import { useSession } from "@/components/AppShell";
import { useToast } from "@/components/providers/ToastProvider";

type Phase = "idle" | "uploading" | "processing" | "ready" | "error";

const PHASE_STEPS = [
  { status: ["UPLOADED"], label: "Subiendo PDF" },
  { status: ["EXTRACTING"], label: "Extrayendo contenido" },
  { status: ["ANALYZING"], label: "Analizando páginas" },
  { status: ["SUMMARIZING"], label: "Creando resumen" },
  { status: ["OUTLINING"], label: "Creando esquema" },
  { status: ["NARRATING"], label: "Preparando audio" },
  { status: ["READY"], label: "Material listo" },
];

export function UploadZone() {
  const router = useRouter();
  const { user, capabilities } = useSession();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    status: DocumentStatus;
    statusMessage: string;
    progress: number;
    pageCount: number;
    textCoverage: number;
    usedOcr: boolean;
    errorMessage: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [depth, setDepth] = useState<string>(user.summaryDepth);
  const [level, setLevel] = useState<string>(user.educationLevel);
  const [style, setStyle] = useState<string>(user.explanationStyle);
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");

  const handleRef = useRef<UploadHandle | null>(null);
  /** Subida cancelada o descartada: el dispositivo deja de leer ese PDF. */
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api
      .get<{ subjects: Subject[] }>("/api/subjects")
      .then((data) => setSubjects(data.subjects))
      .catch(() => undefined);
  }, []);

  // Sondeo del estado de procesamiento.
  useEffect(() => {
    if (phase !== "processing" || !documentId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const data = await api.get<{ document: typeof status }>(
          `/api/documents/${documentId}/status`,
        );
        if (cancelled || !data.document) return;
        setStatus(data.document);
        if (data.document.status === "READY") {
          setPhase("ready");
          toast({
            title: "¡Tu material de estudio está listo!",
            variant: "success",
          });
        } else if (data.document.status === "FAILED") {
          setPhase("error");
          setError(data.document.errorMessage ?? "No hemos podido procesar el documento.");
        }
      } catch {
        /* un fallo puntual de red no interrumpe el sondeo */
      }
    };

    void tick();
    // Donde no hay servidor de verdad, el trabajo avanza porque la propia
    // aplicación va pidiendo rebanadas mientras el documento se procesa.
    void empujarTrabajo({ cancelado: () => cancelled });
    const interval = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [documentId, phase, toast]);

  const pickFile = useCallback(
    (candidate: File | null | undefined) => {
      setError(null);
      if (!candidate) return;
      if (
        candidate.type !== "application/pdf" &&
        !candidate.name.toLowerCase().endsWith(".pdf")
      ) {
        setError("Solo aceptamos archivos PDF.");
        return;
      }
      if (candidate.size > capabilities.maxUploadMb * 1024 * 1024) {
        setError(
          `El archivo pesa ${formatBytes(candidate.size)} y el límite es ${capabilities.maxUploadMb} MB.`,
        );
        return;
      }
      setFile(candidate);
    },
    [capabilities.maxUploadMb],
  );

  const start = async () => {
    if (!file) return;
    cancelledRef.current = false;
    setPhase("uploading");
    setUploadPercent(0);
    setError(null);

    // Por encima del umbral, el PDF se queda en el dispositivo.
    const grande = file.size > capabilities.maxServidorMb * 1024 * 1024;
    const handle = uploadDocument(
      file,
      {
        summaryDepth: depth,
        educationLevel: level,
        explanationStyle: style,
        subjectId,
        topicId,
      },
      setUploadPercent,
      (nuevoId, soloDispositivo) => {
        // El dispositivo empieza a sacar el texto y a leer las escaneadas
        // ya, mientras el PDF sube: la subida no hace esperar a la lectura.
        void (async () => {
          if (soloDispositivo || file.size > capabilities.conservarServidorMb * 1024 * 1024) {
            // Los grandes se quedan guardados aquí: los muy grandes no se suben,
            // y de los demás el servidor borra su copia al terminar.
            await conservarPdfLocal(nuevoId, file).catch(() => recordarPdfLocal(nuevoId, file));
          } else {
            recordarPdfLocal(nuevoId, file);
          }
          await procesarEnDispositivo(nuevoId, () => cancelledRef.current, soloDispositivo);
        })();
      },
      grande,
    );
    handleRef.current = handle;

    try {
      const result = await handle.promise;
      // Si es escaneado, este dispositivo lo leerá de memoria, sin descargarlo.
      recordarPdfLocal(result.document.id, file);
      setDocumentId(result.document.id);
      setPhase("processing");
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "ABORTED") {
        setPhase("idle");
        setUploadPercent(0);
        return;
      }
      setPhase("error");
      setError(
        caught instanceof ApiError ? caught.message : "No hemos podido subir el archivo.",
      );
    }
  };

  const cancel = () => {
    cancelledRef.current = true;
    handleRef.current?.cancel();
    handleRef.current = null;
  };

  const reset = () => {
    cancelledRef.current = true;
    setFile(null);
    setPhase("idle");
    setUploadPercent(0);
    setDocumentId(null);
    setStatus(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeDocument = async () => {
    if (!documentId) return;
    await api.delete(`/api/documents/${documentId}`).catch(() => undefined);
    await borrarPdfLocal(documentId);
    reset();
  };

  const currentStepIndex = status
    ? PHASE_STEPS.findIndex((step) => step.status.includes(status.status))
    : phase === "uploading"
      ? 0
      : -1;

  // ── Zona vacía ────────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className="space-y-4">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            pickFile(event.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className="relative flex cursor-pointer flex-col items-center gap-4 overflow-hidden rounded-[1.5rem] px-6 py-12 text-center transition sm:py-16"
          style={{
            border: `2px dashed ${dragging ? "var(--accent)" : "color-mix(in srgb, var(--accent) 35%, var(--border-strong))"}`,
            background: dragging
              ? "var(--accent-soft)"
              : "radial-gradient(60% 90% at 50% 0%, var(--accent-softer), var(--surface) 70%)",
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
          }}
        >
          {file ? (
            <DocCover title={file.name} size="lg" />
          ) : (
            <div
              className="animate-float flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.4rem] text-white"
              style={{ background: "var(--brand-grad)", boxShadow: "0 16px 30px -12px rgba(122,80,240,0.75)" }}
            >
              <Icon name="cloudUpload" size={32} />
            </div>
          )}
          <div>
            <p className="text-[1.15rem] font-extrabold tracking-tight sm:text-[1.3rem]">
              {file ? file.name : "Arrastra aquí tu PDF"}
            </p>
            <p className="mt-1.5 text-[0.9rem]" style={{ color: "var(--text-muted)" }}>
              {file
                ? `${formatBytes(file.size)} · listo para analizar`
                : `o elígelo de tu dispositivo · hasta ${capabilities.maxUploadMb} MB`}
            </p>
          </div>
          <span className={file ? "btn btn-secondary" : "btn btn-primary btn-lg"}>
            <Icon name={file ? "refresh" : "folder"} size={18} />
            {file ? "Cambiar de PDF" : "Elegir PDF"}
          </span>
          {!file ? (
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <span className="chip">
                <Icon name="scan" size={13} /> Libros escaneados
              </span>
              <span className="chip">
                <Icon name="zap" size={13} /> Lectura rápida
              </span>
              <span className="chip">
                <Icon name="phone" size={13} /> Sigue con la app cerrada
              </span>
            </div>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => pickFile(event.target.files?.[0])}
          />
        </div>

        {error ? <ErrorNotice title="No podemos usar ese archivo" description={error} /> : null}

        {file ? (
          <>
            <section className="card space-y-6 p-5 sm:p-6">
              <div>
                <h2 className="text-[1rem] font-bold">¿Cuánto detalle quieres?</h2>
                <p className="mt-0.5 text-[0.84rem]" style={{ color: "var(--text-muted)" }}>
                  Cuanto más detallado, más información del PDF se conserva.
                </p>
                <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
                  {DEPTH_OPTIONS.map((option) => {
                    const elegido = depth === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDepth(option.value)}
                        aria-pressed={elegido}
                        className="flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition"
                        style={
                          elegido
                            ? {
                                borderColor: "var(--accent)",
                                background: "var(--accent-softer)",
                                boxShadow: "0 0 0 3px var(--accent-ring)",
                              }
                            : { borderColor: "var(--border-strong)" }
                        }
                      >
                        <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition"
                          style={
                            elegido
                              ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#fff" }
                              : { borderColor: "var(--border-strong)" }
                          }
                        >
                          {elegido ? <Icon name="check" size={12} strokeWidth={3.2} /> : null}
                        </span>
                        <span>
                          <span className="block text-[0.92rem] font-bold">{option.label}</span>
                          <span className="mt-0.5 block text-[0.8rem] leading-snug" style={{ color: "var(--text-muted)" }}>
                            {option.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Nivel educativo</span>
                  <select
                    className="input"
                    value={level}
                    onChange={(event) => setLevel(event.target.value)}
                  >
                    {LEVEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Cómo explicártelo</span>
                  <select
                    className="input"
                    value={style}
                    onChange={(event) => setStyle(event.target.value)}
                  >
                    {STYLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.hint}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {subjects.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">Asignatura</span>
                    <select
                      className="input"
                      value={subjectId}
                      onChange={(event) => {
                        setSubjectId(event.target.value);
                        setTopicId("");
                      }}
                    >
                      <option value="">Sin asignatura</option>
                      {subjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.emoji} {subject.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Tema</span>
                    <select
                      className="input"
                      value={topicId}
                      onChange={(event) => setTopicId(event.target.value)}
                      disabled={!subjectId}
                    >
                      <option value="">Sin tema</option>
                      {subjects
                        .find((subject) => subject.id === subjectId)
                        ?.topics.map((topic) => (
                          <option key={topic.id} value={topic.id}>
                            {topic.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              ) : null}

              {!capabilities.aiEnabled ? (
                <p
                  className="flex items-start gap-2.5 rounded-2xl px-4 py-3 text-[0.84rem] leading-relaxed"
                  style={{ background: "var(--bg-sunken)", color: "var(--text-soft)" }}
                >
                  <Icon name="info" size={17} className="mt-0.5 shrink-0" />
                  <span>
                    El resumen se hará con las propias palabras del PDF, ordenadas como unos buenos apuntes.
                    Con IA activada, además se reescriben y se adaptan a tu nivel.
                  </span>
                </p>
              ) : null}
              {file && file.size > capabilities.maxServidorMb * 1024 * 1024 ? (
                <p
                  className="rounded-2xl px-4 py-3 text-[0.84rem] leading-relaxed"
                  style={{ background: "var(--accent-softer)", color: "var(--text-soft)" }}
                >
                  Es un PDF muy grande ({formatBytes(file.size)}): no hace falta subirlo. Se
                  guarda en este dispositivo y al servidor solo va el texto, así que
                  empieza a leerse al momento. Deja la app abierta mientras se lee: al
                  no estar en el servidor, solo este dispositivo puede leerlo.
                </p>
              ) : null}
            </section>

            <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
              <button type="button" className="btn btn-secondary btn-lg" onClick={reset}>
                <Icon name="close" size={18} />
                Quitar
              </button>
              <button type="button" className="btn btn-primary btn-lg flex-1" onClick={start}>
                <Icon name="sparkles" size={19} />
                Analizar documento
              </button>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  // ── Subiendo / procesando / listo ─────────────────────────────────────
  return (
    <div className="space-y-4">
      <section className="card p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <ProgressRing
            value={phase === "uploading" ? uploadPercent : phase === "ready" ? 100 : (status?.progress ?? 0)}
            size={64}
            stroke={5}
            tone={phase === "ready" ? "success" : "accent"}
            label={phase === "ready" ? <Icon name="check" size={22} strokeWidth={2.6} /> : undefined}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[1rem] font-bold">{file?.name}</p>
            <p className="mt-0.5 text-[0.8rem]" style={{ color: "var(--text-muted)" }}>
              {file ? formatBytes(file.size) : ""}
              {status?.pageCount
                ? ` · ${status.pageCount} ${status.pageCount === 1 ? "página" : "páginas"}`
                : ""}
              {status?.usedOcr ? " · con OCR" : ""}
            </p>
          </div>
          {phase === "uploading" ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={cancel}>
              Cancelar
            </button>
          ) : null}
          {phase === "ready" || phase === "error" ? (
            <button type="button" className="btn btn-ghost btn-icon" onClick={removeDocument} aria-label="Eliminar documento">
              <Icon name="trash" size={18} />
            </button>
          ) : null}
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between gap-3 text-[0.86rem]">
            <span className="font-semibold">
              {phase === "uploading"
                ? "Subiendo PDF…"
                : (status?.statusMessage ?? "Preparando…")}
            </span>
            <span className="font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>
              {phase === "uploading" ? `${uploadPercent} %` : `${status?.progress ?? 0} %`}
            </span>
          </div>
          <ProgressBar
            value={phase === "uploading" ? uploadPercent : (status?.progress ?? 0)}
            tone={phase === "ready" ? "success" : "accent"}
            height={6}
          />
        </div>

        <ol className="mt-6 space-y-0">
          {PHASE_STEPS.map((step, index) => {
            const done = currentStepIndex > index || phase === "ready";
            const active = currentStepIndex === index && phase !== "ready";
            const ultimo = index === PHASE_STEPS.length - 1;
            return (
              <li key={step.label} className="relative flex items-start gap-3 pb-4 text-[0.9rem] last:pb-0">
                {!ultimo ? (
                  <span
                    className="absolute left-[0.8rem] top-7 h-[calc(100%-1.75rem)] w-0.5 -translate-x-1/2 rounded-full"
                    style={{ background: done ? "var(--success)" : "var(--border)" }}
                  />
                ) : null}
                <span
                  className={`relative flex h-[1.6rem] w-[1.6rem] shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold ${
                    active ? "animate-pulse-soft" : ""
                  }`}
                  style={{
                    background: done
                      ? "var(--success)"
                      : active
                        ? "var(--accent)"
                        : "var(--bg-sunken)",
                    color: done || active ? "#fff" : "var(--text-muted)",
                  }}
                >
                  {done ? <Icon name="check" size={14} strokeWidth={3} /> : index + 1}
                </span>
                <span
                  className="pt-0.5"
                  style={{ color: done || active ? "var(--text)" : "var(--text-muted)", fontWeight: active ? 700 : 500 }}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {phase === "uploading" ? (
        <p
          className="rounded-2xl px-4 py-3 text-[0.86rem] leading-relaxed"
          style={{ background: "var(--accent-softer)", color: "var(--text-soft)" }}
        >
          No cierres la app hasta que termine de subir: a la vez ya se está leyendo.
        </p>
      ) : null}

      {phase === "processing" ? (
        <p
          className="rounded-2xl px-4 py-3 text-[0.86rem] leading-relaxed"
          style={{ background: "var(--accent-softer)", color: "var(--text-soft)" }}
        >
          {status && status.pageCount > 80
            ? `Es un documento largo (${status.pageCount} páginas): puede tardar unos minutos. `
            : ""}
          {file && file.size > capabilities.maxServidorMb * 1024 * 1024
            ? "Deja la app abierta mientras se lee: este PDF solo está en tu dispositivo."
            : "Ya puedes cerrar la app: se termina solo en el servidor. Con la app abierta va más rápido, porque tu dispositivo también lee."}
        </p>
      ) : null}

      {phase === "error" ? (
        <ErrorNotice
          title="No hemos podido procesar el documento"
          description={error}
          onRetry={reset}
          retryLabel="Probar con otro PDF"
        />
      ) : null}

      {status && status.textCoverage > 0 && status.textCoverage < 60 && phase !== "error" ? (
        <div
          className="rounded-2xl px-4 py-3 text-[0.86rem] leading-relaxed"
          style={{ background: "var(--warning-soft)", color: "var(--text-soft)" }}
        >
          Solo hemos podido leer texto en el {status.textCoverage} % de las páginas. Si el
          PDF está escaneado, el resultado puede quedar incompleto.
        </div>
      ) : null}

      {phase === "ready" && documentId ? (
        <div className="card-brand animate-in p-6 text-center sm:p-8">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
            <Icon name="checkCircle" size={30} />
          </span>
          <p className="mt-4 text-[1.35rem] font-extrabold tracking-tight">Tu material de estudio está listo</p>
          <p className="mt-1 text-[0.92rem] text-white/85">¿Por dónde quieres empezar?</p>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
            <button
              type="button"
              className="btn btn-white btn-lg"
              onClick={() => router.push(`/documento/${documentId}?tab=summary`)}
            >
              <Icon name="book" size={19} />
              Resumen
            </button>
            <button
              type="button"
              className="btn btn-lg !border-white/30 !bg-white/12 !text-white hover:!bg-white/20"
              onClick={() => router.push(`/documento/${documentId}?tab=outline`)}
            >
              <Icon name="outline" size={19} />
              Esquema
            </button>
            <button
              type="button"
              className="btn btn-lg !border-white/30 !bg-white/12 !text-white hover:!bg-white/20"
              onClick={() => router.push(`/documento/${documentId}?tab=audio`)}
            >
              <Icon name="headphones" size={19} />
              Escuchar
            </button>
          </div>
          <button type="button" className="btn btn-ghost mt-3 !text-white/85 hover:!bg-white/10" onClick={reset}>
            <Icon name="plus" size={17} />
            Subir otro PDF
          </button>
        </div>
      ) : null}
    </div>
  );
}
