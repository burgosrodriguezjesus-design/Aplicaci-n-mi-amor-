"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import {
  formatLongDuration,
  formatRelative,
  greeting,
  STATUS_COPY,
} from "@/lib/client/format";
import type { Stats } from "@/lib/client/types";
import { Icon } from "@/components/ui/Icon";
import { CardSkeleton, EmptyState, ProgressBar, Skeleton } from "@/components/ui/Primitives";
import { useSession } from "@/components/AppShell";
import { WeekChart } from "./WeekChart";

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

  return (
    <div className="animate-in space-y-8">
      <header>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {greeting()} 👋
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          ¿Qué quieres estudiar hoy, {firstName}?
        </h1>
        <Link href="/subir" className="btn btn-primary mt-4">
          <Icon name="plus" size={16} />
          Subir nuevo PDF
        </Link>
      </header>

      {loading && !stats ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : null}

      {stats && stats.totals.documentCount === 0 ? (
        <EmptyState
          icon="upload"
          title="Todavía no has subido ningún PDF"
          description="Sube tus apuntes y en unos minutos tendrás resumen, esquema y audiolibro."
          action={
            <Link href="/subir" className="btn btn-primary">
              Subir mi primer PDF
            </Link>
          }
        />
      ) : null}

      {stats?.continueStudying.length ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Continuar estudiando
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {stats.continueStudying.map((item) => (
              <Link
                key={item.id}
                href={`/documento/${item.id}?tab=${item.lastTab ?? "summary"}`}
                className="card card-interactive p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.92rem] font-semibold">{item.title}</p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {item.subject ? `${item.subject.emoji} ${item.subject.name} · ` : ""}
                      {formatRelative(item.updatedAt)}
                    </p>
                  </div>
                  <span className="chip shrink-0">{item.percent} %</span>
                </div>
                <div className="mt-3">
                  <ProgressBar value={item.percent} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {stats?.recent.length ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Documentos recientes
            </h2>
            <Link href="/biblioteca" className="text-[0.8rem] font-medium" style={{ color: "var(--accent)" }}>
              Ver biblioteca
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.recent.map((item) => {
              const processing = item.status !== "READY" && item.status !== "FAILED";
              return (
                <Link key={item.id} href={`/documento/${item.id}`} className="card card-interactive p-4">
                  <div className="flex items-start gap-2.5">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[0.95rem]"
                      style={{
                        background: item.subject?.color
                          ? `color-mix(in srgb, ${item.subject.color} 16%, transparent)`
                          : "var(--bg-sunken)",
                      }}
                    >
                      {item.subject?.emoji ?? "📄"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.9rem] font-semibold">{item.title}</p>
                      <p className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
                        {item.pageCount ? `${item.pageCount} págs · ` : ""}
                        {formatRelative(item.createdAt)}
                      </p>
                    </div>
                  </div>

                  {processing ? (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-[0.74rem] animate-pulse-soft" style={{ color: "var(--accent)" }}>
                        {item.statusMessage || STATUS_COPY[item.status]}
                      </p>
                      <ProgressBar value={item.processingProgress} />
                    </div>
                  ) : item.status === "FAILED" ? (
                    <p className="mt-3 text-[0.74rem]" style={{ color: "var(--danger)" }}>
                      No se pudo procesar
                    </p>
                  ) : (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex justify-between text-[0.72rem]" style={{ color: "var(--text-muted)" }}>
                        <span>{item.studyPercent} % completado</span>
                      </div>
                      <ProgressBar value={item.studyPercent} tone="success" />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-sm font-semibold">Tiempo de estudio esta semana</h2>
          {stats ? (
            <>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatLongDuration(stats.week.readSeconds + stats.week.listenSeconds)}
              </p>
              <div className="mt-4">
                <WeekChart data={stats.week.perDay} />
              </div>
              <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Leyendo {formatLongDuration(stats.week.readSeconds)} · escuchando{" "}
                {formatLongDuration(stats.week.listenSeconds)}
              </p>
            </>
          ) : (
            <Skeleton className="mt-4 h-28 w-full" />
          )}
        </div>

        <div className="space-y-3">
          <div className="card p-5">
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--audio)" }}>
                <Icon name="headphones" size={18} />
              </span>
              <h2 className="text-sm font-semibold">Audios escuchados</h2>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {stats ? formatLongDuration(stats.week.listenSeconds) : "—"}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              en los últimos 7 días
            </p>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Asignaturas</h2>
              <Link href="/biblioteca" className="text-[0.78rem] font-medium" style={{ color: "var(--accent)" }}>
                Gestionar
              </Link>
            </div>
            {stats?.subjects.length ? (
              <ul className="space-y-1.5">
                {stats.subjects.slice(0, 5).map((subject) => (
                  <li key={subject.id}>
                    <Link
                      href={`/biblioteca?subject=${subject.id}`}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.85rem] transition hover:bg-[var(--surface-hover)]"
                    >
                      <span>{subject.emoji}</span>
                      <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                      <span className="chip">{subject.documentCount}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Crea asignaturas en la biblioteca para organizar tus documentos.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
