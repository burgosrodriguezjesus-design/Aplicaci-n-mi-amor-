"use client";

/**
 * Minutos de estudio de los últimos 7 días.
 *
 * Una sola serie (magnitud a lo largo del tiempo): barras verticales, un único
 * tono, sin leyenda (el título ya la nombra) y etiqueta directa solo en el día
 * con más tiempo. Los textos usan los colores de tipografía, nunca el color de
 * la serie. Cada barra es accesible por teclado y anuncia su valor.
 */

import { formatLongDuration } from "@/lib/client/format";

const WEEKDAYS = ["D", "L", "M", "X", "J", "V", "S"];

export function WeekChart({
  data,
}: {
  data: { day: string; readSeconds: number; listenSeconds: number }[];
}) {
  const totals = data.map((entry) => entry.readSeconds + entry.listenSeconds);
  const max = Math.max(60, ...totals);
  const peak = totals.indexOf(Math.max(...totals));
  const hasData = totals.some((value) => value > 0);

  return (
    <div className="relative">
      {!hasData ? (
        <p
          className="absolute inset-x-0 top-8 text-center text-[0.8rem]"
          style={{ color: "var(--text-muted)" }}
        >
          Aún no has estudiado esta semana.
        </p>
      ) : null}
      <div className="flex h-32 items-end gap-2" role="img" aria-label="Minutos de estudio por día en la última semana">
        {data.map((entry, index) => {
          const total = totals[index];
          const height = hasData ? Math.max(total > 0 ? 6 : 2, (total / max) * 100) : 2;
          const date = new Date(`${entry.day}T00:00:00`);
          const weekday = WEEKDAYS[date.getDay()];
          const isToday = index === data.length - 1;
          const label = `${date.toLocaleDateString("es", {
            weekday: "long",
            day: "numeric",
            month: "short",
          })}: ${total > 0 ? formatLongDuration(total) : "sin actividad"}`;

          return (
            <div key={entry.day} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              {/* Etiqueta directa solo en el día de mayor actividad. */}
              <span
                className="text-[0.65rem] font-semibold tabular-nums"
                style={{
                  color: "var(--text-muted)",
                  visibility: index === peak && total > 0 ? "visible" : "hidden",
                }}
              >
                {Math.round(total / 60)}
              </span>
              <div
                className="flex w-full flex-1 items-end"
                style={{ minHeight: 0 }}
              >
                <div
                  tabIndex={0}
                  title={label}
                  aria-label={label}
                  className="w-full rounded-[7px] transition-[height] duration-500"
                  style={{
                    height: `${height}%`,
                    background:
                      total > 0
                        ? "var(--accent)"
                        : "color-mix(in srgb, var(--border) 70%, transparent)",
                    opacity: total > 0 && !isToday ? 0.78 : 1,
                  }}
                />
              </div>
              <span
                className="text-[0.66rem]"
                style={{
                  color: isToday ? "var(--text)" : "var(--text-muted)",
                  fontWeight: isToday ? 600 : 400,
                }}
              >
                {weekday}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
