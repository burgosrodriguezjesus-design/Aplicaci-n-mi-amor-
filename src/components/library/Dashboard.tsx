"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import {
  formatRelative,
  greeting,
  STATUS_COPY,
} from "@/lib/client/format";
import type { Stats } from "@/lib/client/types";
import { Icon } from "@/components/ui/Icon";
import {
  DocCover,
  ProgressBar,
  ProgressRing,
  Skeleton,
} from "@/components/ui/Primitives";
import { useSession } from "@/components/AppShell";
import { WeekChart } from "./WeekChart";

/** Tiempo corto para las fichas: "0 min", "12 min", "1 h 5 min". */
function tiempoCorto(segundos: number) {
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

function hoy() {
  const texto = new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Ficha con una cifra: tiempo, documentos… */
function StatTile({
  icon,
  label,
  value,
  tone = "accent",
}: {
  icon: string;
  label: string;
  value: string;
  tone?: "accent" | "audio" | "success";
}) {
  const colores = {
    accent: { bg: "var(--accent-soft)", fg: "var(--accent)" },
    audio: { bg: "var(--audio-soft)", fg: "var(--audio)" },
    success: { bg: "var(--success-soft)", fg: "var(--success)" },
  }[tone];
  return (
    <div className="card flex items-center gap-3 p-3.5 sm:flex-col sm:items-start sm:p-4">
      <span className="icon-tile !h-10 !w-10 !rounded-xl" style={{ background: colores.bg, color: colores.fg }}>
        <Icon name={icon} size={19} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[1.15rem] font-extrabold leading-tight tracking-tight tabular-nums sm:text-[1.3rem]">
          {value}
        </p>
        <p className="mt-0.5 truncate text-[0.76rem] font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
        </p>
      </div>
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center justify-between">
      <h2 className="text-[1.05rem] font-bold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

/** La tarjeta grande del principio: lo siguiente que conviene hacer. */
function Hero({ stats }: { stats: Stats }) {
  const seguir = stats.continueStudying[0];
  const listo = stats.recent.find((doc) => doc.status === "READY");
  const procesando = stats.recent.find((doc) => doc.status !== "READY" && doc.status !== "FAILED");

  if (stats.totals.documentCount === 0) {
    return (
      <section className="card-brand p-6 sm:p-8">
        <div className="max-w-md">
          <span className="chip !border-white/25 !bg-white/15 !text-white">
            <Icon name="sparkles" size={13} /> Empieza aquí
          </span>
          <h2 className="mt-4 text-[1.55rem] font-extrabold leading-tight tracking-tight sm:text-[1.8rem]">
            Convierte tus apuntes en material de estudio
          </h2>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-white/85">
            Sube un PDF, aunque sea un libro escaneado, y en unos minutos tendrás resumen, esquema y audio.
          </p>
          <Link href="/subir" className="btn btn-white btn-lg mt-6">
            <Icon name="cloudUpload" size={20} />
            Subir mi primer PDF
          </Link>
        </div>
      </section>
    );
  }

  const doc = seguir
    ? { id: seguir.id, title: seguir.title, percent: seguir.percent, tab: seguir.lastTab ?? "summary", fecha: seguir.updatedAt }
    : listo
      ? { id: listo.id, title: listo.title, percent: listo.studyPercent, tab: "summary", fecha: listo.createdAt }
      : null;

  if (!doc && procesando) {
    return (
      <section className="card-brand p-6 sm:p-7">
        <div className="flex items-center gap-4">
          <ProgressRing value={procesando.processingProgress} size={64} stroke={5} tone="white" />
          <div className="min-w-0">
            <p className="text-[0.8rem] font-semibold text-white/80">Preparando tu material</p>
            <h2 className="mt-0.5 truncate text-[1.25rem] font-extrabold tracking-tight">{procesando.title}</h2>
            <p className="mt-1 text-[0.85rem] text-white/85">
              {procesando.statusMessage || STATUS_COPY[procesando.status]}
            </p>
          </div>
        </div>
        <p className="mt-4 text-[0.82rem] text-white/75">
          Puedes cerrar la app: seguirá preparándose y lo tendrás listo al volver.
        </p>
      </section>
    );
  }
  if (!doc) return null;

  return (
    <section className="card-brand p-5 sm:p-7">
      <div className="flex items-start gap-4 sm:gap-5">
        <DocCover title={doc.title} size="lg" className="!shadow-[0_14px_30px_-12px_rgba(0,0,0,0.5)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.8rem] font-semibold text-white/80">
            {seguir ? "Continúa donde lo dejaste" : "Listo para estudiar"}
          </p>
          <h2 className="mt-1 line-clamp-2 text-[1.3rem] font-extrabold leading-snug tracking-tight sm:text-[1.5rem]">
            {doc.title}
          </h2>
          <p className="mt-1 text-[0.8rem] text-white/75">{formatRelative(doc.fecha)}</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${doc.percent}%` }} />
            </div>
            <span className="text-[0.8rem] font-bold tabular-nums">{doc.percent} %</span>
          </div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_auto] gap-2.5 sm:flex">
        <Link href={`/documento/${doc.id}?tab=${doc.tab}`} className="btn btn-white btn-lg">
          <Icon name="book" size={19} />
          {seguir ? "Seguir estudiando" : "Empezar a estudiar"}
        </Link>
        <Link
          href={`/documento/${doc.id}?tab=audio`}
          className="btn btn-lg !border-white/30 !bg-white/12 !px-4 !text-white hover:!bg-white/20 sm:!px-6"
          aria-label="Escuchar"
        >
          <Icon name="headphones" size={20} />
          <span className="hidden sm:inline">Escuchar</span>
        </Link>
      </div>
    </section>
  );
}

export function Dashboard() {
  const { user } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .get<Stats>("/api/stats")
        .then((data) => {
          if (active) setStats(data);
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) setLoading(false);
        });

    void load();
    // Mientras haya documentos procesándose, refrescamos el panel.
    const interval = setInterval(load, 6000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const firstName = user.name.split(" ")[0];
  const semana = stats ? stats.week.readSeconds + stats.week.listenSeconds : 0;

  return (
    <div className="stagger space-y-8">
      <header>
        <p className="eyebrow">{hoy()}</p>
        <h1 className="page-title mt-2">
          {greeting()}, <span className="text-gradient">{firstName}</span>
        </h1>
        <p className="page-subtitle">¿Qué quieres estudiar hoy?</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          {loading && !stats ? <Skeleton className="h-52 w-full !rounded-[var(--radius-card)]" /> : null}
          {stats ? <Hero stats={stats} /> : null}

          {/* Cifras de la semana */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon="timer" label="Esta semana" value={stats ? tiempoCorto(semana) : "—"} />
            <StatTile icon="book" label="Leyendo" value={stats ? tiempoCorto(stats.week.readSeconds) : "—"} />
            <StatTile
              icon="headphones"
              label="Escuchando"
              tone="audio"
              value={stats ? tiempoCorto(stats.week.listenSeconds) : "—"}
            />
            <StatTile
              icon="checkCircle"
              label="Documentos listos"
              tone="success"
              value={stats ? `${stats.totals.readyCount}/${stats.totals.documentCount}` : "—"}
            />
          </section>

          {stats?.recent.length ? (
            <section>
              <SectionHeader
                title="Tus documentos"
                action={
                  <Link href="/biblioteca" className="btn btn-ghost btn-sm !text-[var(--accent)]">
                    Ver todos
                    <Icon name="arrowRight" size={16} />
                  </Link>
                }
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {stats.recent.map((item) => {
                  const processing = item.status !== "READY" && item.status !== "FAILED";
                  return (
                    <Link
                      key={item.id}
                      href={`/documento/${item.id}`}
                      className="card card-interactive flex items-center gap-3.5 p-3.5"
                    >
                      <DocCover title={item.title} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.95rem] font-bold">{item.title}</p>
                        <p className="mt-0.5 truncate text-[0.78rem]" style={{ color: "var(--text-muted)" }}>
                          {item.subject ? `${item.subject.emoji} ${item.subject.name} · ` : ""}
                          {item.pageCount ? `${item.pageCount} págs · ` : ""}
                          {formatRelative(item.createdAt)}
                        </p>
                        {processing ? (
                          <div className="mt-2.5 space-y-1.5">
                            <p className="animate-pulse-soft truncate text-[0.74rem] font-semibold" style={{ color: "var(--accent)" }}>
                              {item.statusMessage || STATUS_COPY[item.status]}
                            </p>
                            <ProgressBar value={item.processingProgress} />
                          </div>
                        ) : item.status === "FAILED" ? (
                          <span className="chip mt-2 !border-transparent !bg-[var(--danger-soft)] !text-[var(--danger)]">
                            No se pudo procesar
                          </span>
                        ) : (
                          <div className="mt-2.5 flex items-center gap-2.5">
                            <div className="flex-1">
                              <ProgressBar value={item.studyPercent} tone="success" />
                            </div>
                            <span className="text-[0.72rem] font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>
                              {item.studyPercent} %
                            </span>
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[0.95rem] font-bold">Tu semana</h2>
                <p className="mt-0.5 text-[0.78rem]" style={{ color: "var(--text-muted)" }}>
                  Minutos de estudio por día
                </p>
              </div>
              <span className="chip chip-accent">
                <Icon name="flame" size={13} />
                {stats ? tiempoCorto(semana) : "—"}
              </span>
            </div>
            <div className="mt-5">
              {stats ? <WeekChart data={stats.week.perDay} /> : <Skeleton className="h-28 w-full" />}
            </div>
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[0.95rem] font-bold">Asignaturas</h2>
              <Link href="/biblioteca" className="btn btn-ghost btn-sm !min-h-8 !text-[var(--accent)]">
                Gestionar
              </Link>
            </div>
            {stats?.subjects.length ? (
              <ul className="-mx-2 space-y-0.5">
                {stats.subjects.slice(0, 6).map((subject) => (
                  <li key={subject.id}>
                    <Link
                      href={`/biblioteca?subject=${subject.id}`}
                      className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-[0.88rem] font-semibold transition hover:bg-[var(--surface-hover)]"
                    >
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[0.95rem]"
                        style={{ background: `color-mix(in srgb, ${subject.color} 16%, transparent)` }}
                      >
                        {subject.emoji}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                      <span className="chip">{subject.documentCount}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: "var(--bg-sunken)" }}>
                <span style={{ color: "var(--text-muted)" }}>
                  <Icon name="folder" size={18} />
                </span>
                <p className="text-[0.84rem] leading-relaxed" style={{ color: "var(--text-soft)" }}>
                  Crea asignaturas en la biblioteca para ordenar tus documentos por materia.
                </p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
