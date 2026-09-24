"use client";

/**
 * Zona de subida: arrastrar y soltar o seleccionar desde el dispositivo.
 * Muestra nombre, tamaño, páginas, progreso real de subida y cada fase del
 * procesamiento, y permite cancelar antes de que termine de subirse.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, uploadDocument, type UploadHandle } from "@/lib/client/api";
import { empujarTrabajo } from "@/lib/client/jobs";
import {
  DEPTH_OPTIONS,
  LEVEL_OPTIONS,
  STYLE_OPTIONS,
  formatBytes,
} from "@/lib/client/format";
import type { DocumentStatus, Subject } from "@/lib/client/types";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar, ErrorNotice } from "@/components/ui/Primitives";
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
    setPhase("uploading");
    setUploadPercent(0);
    setError(null);

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
    );
    handleRef.current = handle;

    try {
      const result = await handle.promise;
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
    handleRef.current?.cancel();
    handleRef.current = null;
  };

  const reset = () => {
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
          className="card card-interactive flex cursor-pointer flex-col items-center gap-3 px-6 py-14 text-center"
          style={
            dragging
              ? {
                  borderColor: "var(--accent)",
                  background: "var(--accent-soft)",
                  borderStyle: "dashed",
                }
              : { borderStyle: "dashed", borderWidth: 1.5 }
          }
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
          }}
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Icon name="upload" size={24} />
          </div>
          <div>
            <p className="text-base font-semibold">
              {file ? file.name : "Arrastra aquí tu PDF"}
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {file
                ? `${formatBytes(file.size)} · listo para analizar`
                : `o toca para seleccionarlo · máximo ${capabilities.maxUploadMb} MB`}
            </p>
          </div>
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
            <section className="card space-y-4 p-5">
              <div>
                <h2 className="text-sm font-semibold">Nivel de resumen</h2>
                <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  Cuanto más detallado, más información del PDF se conserva.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {DEPTH_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDepth(option.value)}
                      className="rounded-[0.8rem] border px-3 py-2.5 text-left transition"
                      style={
                        depth === option.value
                          ? {
                              borderColor: "var(--accent)",
                              background: "var(--accent-soft)",
                            }
                          : { borderColor: "var(--border)" }
                      }
                    >
                      <span className="block text-[0.85rem] font-semibold">{option.label}</span>
                      <span className="block text-[0.74rem]" style={{ color: "var(--text-muted)" }}>
                        {option.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[0.78rem] font-medium">Nivel educativo</span>
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
                  <span className="mb-1.5 block text-[0.78rem] font-medium">Cómo explicártelo</span>
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
                    <span className="mb-1.5 block text-[0.78rem] font-medium">Asignatura</span>
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
                    <span className="mb-1.5 block text-[0.78rem] font-medium">Tema</span>
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
                  className="rounded-[0.7rem] px-3 py-2 text-[0.8rem]"
                  style={{ background: "var(--warning-soft)", color: "var(--text-soft)" }}
                >
                  Modo sin IA activo: el resumen se construirá seleccionando frases del
                  propio PDF. Añade <code>ANTHROPIC_API_KEY</code> al servidor para obtener
                  explicaciones reescritas y adaptadas a tu nivel.
                </p>
              ) : null}
            </section>

            <div className="flex gap-2">
              <button type="button" className="btn btn-primary flex-1" onClick={start}>
                <Icon name="sparkles" size={16} />
                Analizar documento
              </button>
              <button type="button" className="btn btn-secondary" onClick={reset}>
                Quitar
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
      <section className="card p-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Icon name="file" size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{file?.name}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {file ? formatBytes(file.size) : ""}
              {status?.pageCount
                ? ` · ${status.pageCount} ${status.pageCount === 1 ? "página" : "páginas"}`
                : ""}
              {status?.usedOcr ? " · con OCR" : ""}
            </p>
          </div>
          {phase === "uploading" ? (
            <button type="button" className="btn btn-ghost" onClick={cancel}>
              Cancelar
            </button>
          ) : null}
          {phase === "ready" || phase === "error" ? (
            <button type="button" className="btn btn-ghost !px-2" onClick={removeDocument} aria-label="Eliminar documento">
              <Icon name="trash" size={17} />
            </button>
          ) : null}
        </div>

        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-[0.8rem]">
            <span className="font-medium">
              {phase === "uploading"
                ? "Subiendo PDF…"
                : (status?.statusMessage ?? "Preparando…")}
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              {phase === "uploading" ? `${uploadPercent} %` : `${status?.progress ?? 0} %`}
            </span>
          </div>
          <ProgressBar
            value={phase === "uploading" ? uploadPercent : (status?.progress ?? 0)}
            tone={phase === "ready" ? "success" : "accent"}
            height={5}
          />
        </div>

        <ol className="mt-5 space-y-2">
          {PHASE_STEPS.map((step, index) => {
            const done = currentStepIndex > index || phase === "ready";
            const active = currentStepIndex === index && phase !== "ready";
            return (
              <li key={step.label} className="flex items-center gap-2.5 text-[0.82rem]">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.62rem] font-bold ${
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
                  {done ? <Icon name="check" size={12} strokeWidth={3} /> : index + 1}
                </span>
                <span style={{ color: done || active ? "var(--text)" : "var(--text-muted)" }}>
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {phase === "processing" ? (
        <p
          className="card p-3 text-[0.82rem]"
          style={{ background: "var(--accent-soft)", borderColor: "transparent" }}
        >
          {status && status.pageCount > 80
            ? `Es un documento largo (${status.pageCount} páginas): puede tardar unos minutos. `
            : ""}
          Deja la aplicación abierta mientras tanto (puedes ir a otras pantallas de
          la app). Si la cierras, se pausa y sigue donde se quedó al volver a abrirla.
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
          className="card p-4 text-[0.83rem]"
          style={{ background: "var(--warning-soft)", borderColor: "transparent" }}
        >
          Solo hemos podido leer texto en el {status.textCoverage} % de las páginas. Si el
          PDF está escaneado, el resultado puede quedar incompleto.
        </div>
      ) : null}

      {phase === "ready" && documentId ? (
        <div className="card animate-in p-5 text-center">
          <p className="text-lg font-semibold">🎉 Tu material de estudio está listo</p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            ¿Por dónde quieres empezar?
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => router.push(`/documento/${documentId}?tab=summary`)}
            >
              📚 Estudiar resumen
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => router.push(`/documento/${documentId}?tab=outline`)}
            >
              🧠 Ver esquema
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => router.push(`/documento/${documentId}?tab=audio`)}
            >
              🎧 Escuchar
            </button>
          </div>
          <button type="button" className="btn btn-ghost mt-3" onClick={reset}>
            Subir otro PDF
          </button>
        </div>
      ) : null}
    </div>
  );
}
