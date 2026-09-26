"use client";

/**
 * Pestaña «Examen»: un examen completo del documento (test, cortas,
 * desarrollo y ejercicios), clasificado por dificultad. Las soluciones van
 * aparte, al final, y ocultas hasta que se piden: nunca junto a la pregunta.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/Primitives";
import { useToast } from "@/components/providers/ToastProvider";
import {
  type Dificultad,
  type Examen,
  DIFICULTADES,
  ETIQUETA_DIFICULTAD,
  LETRAS,
  OBJETIVO,
} from "@/lib/examen/tipos";
import { examenAHtml, examenAMarkdown, numerar, soluciones } from "@/lib/examen/texto";

type ExamDto = { id: string; version: number; provider: string; createdAt: string; examen: Examen };
type Filtro = "TODAS" | Dificultad;

const COLOR: Record<Dificultad, { fondo: string; texto: string }> = {
  FACIL: { fondo: "var(--success-soft)", texto: "var(--success)" },
  MEDIA: { fondo: "var(--warning-soft)", texto: "var(--warning)" },
  DIFICIL: { fondo: "var(--danger-soft)", texto: "var(--danger)" },
};

function ChipDificultad({ dificultad }: { dificultad: Dificultad }) {
  return (
    <span className="chip !border-transparent" style={{ background: COLOR[dificultad].fondo, color: COLOR[dificultad].texto }}>
      {ETIQUETA_DIFICULTAD[dificultad]}
    </span>
  );
}

function leerRespuestas(examId: string): Record<string, number> {
  try {
    return JSON.parse(window.localStorage.getItem(`alicia-examen-${examId}`) ?? "{}");
  } catch {
    return {};
  }
}

export function ExamTab({
  documentId,
  documentTitle,
  listo,
  onPageClick,
}: {
  documentId: string;
  documentTitle: string;
  /** ¿Tiene ya resumen? El examen se prepara a partir de él. */
  listo: boolean;
  onPageClick: (page: number) => void;
}) {
  const { toast } = useToast();
  const [dto, setDto] = useState<ExamDto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("TODAS");
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  const [verSoluciones, setVerSoluciones] = useState(false);

  useEffect(() => {
    let vivo = true;
    api
      .get<{ exam: ExamDto | null }>(`/api/documents/${documentId}/exam`)
      .then((r) => vivo && setDto(r.exam))
      .catch(() => undefined)
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [documentId]);

  // Lo marcado en el test se recuerda en este dispositivo.
  useEffect(() => {
    if (dto) setRespuestas(leerRespuestas(dto.id));
    setVerSoluciones(false);
  }, [dto]);

  const responder = useCallback(
    (preguntaId: string, opcion: number) => {
      if (!dto) return;
      setRespuestas((antes) => {
        const nuevas = { ...antes, [preguntaId]: opcion };
        try {
          window.localStorage.setItem(`alicia-examen-${dto.id}`, JSON.stringify(nuevas));
        } catch {
          // Sin almacenamiento: se recuerda solo mientras la página esté abierta.
        }
        return nuevas;
      });
    },
    [dto],
  );

  const crear = async () => {
    setCreando(true);
    try {
      const r = await api.post<{ exam: ExamDto }>(`/api/documents/${documentId}/exam`);
      setDto(r.exam);
      setFiltro("TODAS");
      toast({ title: dto ? "Nuevo examen listo" : "Examen listo", variant: "success" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast({
        title: "No hemos podido preparar el examen",
        description: error instanceof ApiError ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setCreando(false);
    }
  };

  const examen = dto?.examen ?? null;
  const numeros = useMemo(() => (examen ? numerar(examen) : new Map<string, number>()), [examen]);
  const visible = useCallback((d: Dificultad) => filtro === "TODAS" || filtro === d, [filtro]);
  const cuenta = useMemo(() => {
    const c: Record<Dificultad, number> = { FACIL: 0, MEDIA: 0, DIFICIL: 0 };
    if (examen) for (const p of [...examen.test, ...examen.cortas, ...examen.desarrollo, ...examen.ejercicios]) c[p.dificultad]++;
    return c;
  }, [examen]);

  const descargar = () => {
    if (!examen) return;
    const blob = new Blob([examenAMarkdown(examen)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${documentTitle.replace(/[\\/:*?"<>|]+/g, " ").trim() || "examen"} - examen.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const imprimir = () => {
    if (!examen) return;
    const ventana = window.open("", "_blank");
    if (!ventana) {
      toast({ title: "Tu navegador ha bloqueado la ventana de impresión", description: "Permite las ventanas emergentes o usa «Descargar».", variant: "error" });
      return;
    }
    ventana.document.write(examenAHtml(examen));
    ventana.document.close();
    ventana.focus();
    setTimeout(() => ventana.print(), 300);
  };

  if (cargando) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="skeleton h-40 rounded-[var(--radius-card)]" />
        <div className="skeleton h-28 rounded-[var(--radius-card)]" />
      </div>
    );
  }

  if (!examen) {
    return (
      <EmptyState
        icon="exam"
        title={listo ? "Ponte a prueba con un examen" : "El examen estará disponible enseguida"}
        description={
          listo
            ? `Un examen completo basado solo en este documento: ${OBJETIVO.test} preguntas tipo test, ${OBJETIVO.cortas} cortas, ${OBJETIVO.desarrollo} de desarrollo y ${OBJETIVO.ejercicios} ejercicios prácticos, por dificultad. Las soluciones van aparte, al final.`
            : "Se prepara a partir del resumen: en cuanto el documento esté listo podrás crearlo."
        }
        action={
          listo ? (
            <button type="button" className="btn btn-primary btn-lg" onClick={crear} disabled={creando}>
              <Icon name={creando ? "refresh" : "exam"} size={19} className={creando ? "animate-spin" : undefined} />
              {creando ? "Preparando el examen…" : "Crear examen"}
            </button>
          ) : null
        }
      />
    );
  }

  const respondidas = examen.test.filter((p) => respuestas[p.id] !== undefined);
  const aciertos = respondidas.filter((p) => respuestas[p.id] === p.correcta).length;
  const bloques: { clave: string; titulo: string; lista: { id: string; dificultad: Dificultad }[] }[] = [
    { clave: "test", titulo: "Preguntas tipo test", lista: examen.test },
    { clave: "cortas", titulo: "Preguntas cortas", lista: examen.cortas },
    { clave: "desarrollo", titulo: "Preguntas de desarrollo", lista: examen.desarrollo },
    { clave: "ejercicios", titulo: "Ejercicios prácticos", lista: examen.ejercicios },
  ].filter((b) => b.lista.length);
  const porId = new Map(
    [...examen.test, ...examen.cortas, ...examen.desarrollo, ...examen.ejercicios].map((p) => [p.id, p]),
  );

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div
        className="relative overflow-hidden rounded-[var(--radius-card)] p-5 text-white sm:p-6"
        style={{
          background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 60%, #db2777 100%)",
          boxShadow: "0 18px 40px -20px rgba(124,58,237,0.8)",
        }}
      >
        <div className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/15" aria-hidden="true" />
        <div className="relative flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 sm:h-16 sm:w-16">
            <Icon name="exam" size={28} />
          </span>
          <div className="min-w-0">
            <p className="text-[0.74rem] font-bold uppercase tracking-[0.08em] text-white/80">Examen de práctica</p>
            <h2 className="mt-0.5 text-[1.15rem] font-extrabold leading-snug tracking-tight">{documentTitle}</h2>
            <p className="mt-1 text-[0.8rem] text-white/85">
              {examen.test.length} test · {examen.cortas.length} cortas · {examen.desarrollo.length} desarrollo · {examen.ejercicios.length} ejercicios
            </p>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn btn-white" onClick={crear} disabled={creando}>
            <Icon name="refresh" size={17} className={creando ? "animate-spin" : undefined} />
            {creando ? "Preparando…" : "Crear otro examen"}
          </button>
          <button type="button" className="btn !border-white/30 !bg-white/15 !text-white hover:!bg-white/25" onClick={imprimir}>
            <Icon name="printer" size={17} />
            Imprimir
          </button>
          <button type="button" className="btn !border-white/30 !bg-white/15 !text-white hover:!bg-white/25" onClick={descargar}>
            <Icon name="download" size={17} />
            Descargar
          </button>
        </div>
      </div>

      {examen.avisos.length ? (
        <div
          className="flex gap-3 rounded-2xl border px-4 py-3.5 text-[0.88rem] leading-relaxed"
          style={{ background: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 25%, transparent)" }}
          role="note"
        >
          <Icon name="info" size={18} className="mt-0.5 shrink-0 text-[var(--warning)]" />
          <div className="min-w-0">
            <p className="font-bold">Ten en cuenta</p>
            <ul className="mt-0.5 space-y-0.5">
              {examen.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Dificultad */}
      <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="radiogroup" aria-label="Dificultad">
        {(["TODAS", ...DIFICULTADES.map((d) => d.value)] as Filtro[]).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filtro === f}
            data-active={filtro === f}
            className="filter-chip shrink-0"
            onClick={() => setFiltro(f)}
          >
            {f === "TODAS" ? "Todas" : ETIQUETA_DIFICULTAD[f]}
            <span className="opacity-60">{f === "TODAS" ? cuenta.FACIL + cuenta.MEDIA + cuenta.DIFICIL : cuenta[f]}</span>
          </button>
        ))}
      </div>

      {/* Preguntas */}
      {bloques.map((bloque, i) => {
        const lista = bloque.lista.filter((p) => visible(p.dificultad));
        if (!lista.length) return null;
        return (
          <section key={bloque.clave} className="space-y-3" aria-label={bloque.titulo}>
            <h3 className="flex items-center gap-2 px-1 text-[1.02rem] font-bold">
              {i + 1}. {bloque.titulo}
              <span className="chip">{bloque.lista.length}</span>
            </h3>
            {lista.map((p) => {
              const pregunta = porId.get(p.id)!;
              const n = numeros.get(p.id);
              const opciones = "opciones" in pregunta ? (pregunta.opciones as string[]) : null;
              const datos = "datos" in pregunta ? ((pregunta.datos as string[] | undefined) ?? null) : null;
              return (
                <article key={p.id} className="card p-4 sm:p-5" data-pregunta={p.id}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="eyebrow">Pregunta {n}</span>
                    <ChipDificultad dificultad={p.dificultad} />
                  </div>
                  <p className="text-[0.96rem] font-semibold leading-relaxed">{pregunta.enunciado}</p>
                  {datos?.length ? (
                    <ul className="mt-2.5 space-y-1 rounded-xl p-3 text-[0.9rem]" style={{ background: "var(--bg-sunken)" }}>
                      {datos.map((d) => (
                        <li key={d} className="flex gap-2">
                          <span aria-hidden="true" style={{ color: "var(--accent)" }}>
                            •
                          </span>
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {opciones ? (
                    <div className="mt-3 grid gap-2" role="radiogroup" aria-label={`Pregunta ${n}`}>
                      {opciones.map((o, j) => {
                        const marcada = respuestas[p.id] === j;
                        return (
                          <button
                            key={j}
                            type="button"
                            role="radio"
                            aria-checked={marcada}
                            onClick={() => responder(p.id, j)}
                            className="flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[0.92rem] leading-snug transition"
                            style={
                              marcada
                                ? { borderColor: "var(--accent)", background: "var(--accent-softer)", boxShadow: "0 0 0 3px var(--accent-ring)" }
                                : { borderColor: "var(--border-strong)" }
                            }
                          >
                            <span
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.76rem] font-bold"
                              style={
                                marcada
                                  ? { background: "var(--accent)", color: "#fff" }
                                  : { background: "var(--bg-sunken)", color: "var(--text-soft)" }
                              }
                            >
                              {LETRAS[j]}
                            </span>
                            <span className="min-w-0 flex-1 pt-0.5">{o}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        );
      })}

      {/* Soluciones, aparte */}
      <section className="card overflow-hidden" aria-label="Soluciones">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <h3 className="text-[1.05rem] font-extrabold tracking-[0.06em]">SOLUCIONES</h3>
            <p className="text-[0.82rem]" style={{ color: "var(--text-muted)" }}>
              {respondidas.length
                ? `Has respondido ${respondidas.length} de ${examen.test.length} preguntas tipo test.`
                : "Respuesta correcta, explicación y el fragmento del PDF en que se basa cada pregunta."}
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setVerSoluciones((v) => !v)} aria-expanded={verSoluciones}>
            <Icon name={verSoluciones ? "eyeOff" : "eye"} size={17} />
            {verSoluciones ? "Ocultar soluciones" : "Ver soluciones"}
          </button>
        </div>
        {verSoluciones ? (
          <div className="border-t" style={{ borderColor: "var(--border)" }}>
            {respondidas.length ? (
              <p className="m-4 rounded-xl px-4 py-3 text-[0.92rem] font-semibold sm:mx-5" style={{ background: "var(--accent-softer)" }}>
                Test: {aciertos} de {respondidas.length} {respondidas.length === 1 ? "acierto" : "aciertos"}
                {respondidas.length < examen.test.length ? ` (${examen.test.length - respondidas.length} sin responder)` : ""}.
              </p>
            ) : null}
            <ol className="divide-y" style={{ borderColor: "var(--border)" }}>
              {soluciones(examen)
                .filter((s) => visible(porId.get(s.id)!.dificultad))
                .map((s) => {
                  const test = examen.test.find((p) => p.id === s.id);
                  const mia = respuestas[s.id];
                  const acierto = test && mia !== undefined ? mia === test.correcta : null;
                  return (
                    <li key={s.id} className="space-y-2 p-4 sm:px-5" data-solucion={s.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[0.92rem] font-extrabold">{s.n}.</span>
                        <ChipDificultad dificultad={porId.get(s.id)!.dificultad} />
                        {acierto !== null ? (
                          <span
                            className="chip !border-transparent"
                            style={acierto ? { background: "var(--success-soft)", color: "var(--success)" } : { background: "var(--danger-soft)", color: "var(--danger)" }}
                          >
                            <Icon name={acierto ? "checkCircle" : "xCircle"} size={13} />
                            {acierto ? "Correcta" : `Marcaste la ${LETRAS[mia]}`}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[0.92rem]">
                        <span className="font-bold">Respuesta correcta: </span>
                        <span className="whitespace-pre-line">{s.respuesta}</span>
                      </p>
                      <p className="text-[0.88rem]" style={{ color: "var(--text-soft)" }}>
                        <span className="font-bold" style={{ color: "var(--text)" }}>
                          Explicación:{" "}
                        </span>
                        {s.explicacion}
                      </p>
                      <blockquote className="rounded-xl border-l-4 px-3.5 py-2.5 text-[0.86rem]" style={{ borderColor: "var(--accent)", background: "var(--bg-sunken)" }}>
                        <p className="italic">«{s.fuente.cita}»</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.78rem]" style={{ color: "var(--text-muted)" }}>
                          <span>{s.fuente.apartado}</span>
                          {s.fuente.pagina ? (
                            <button type="button" className="page-ref" onClick={() => onPageClick(s.fuente.pagina as number)}>
                              pág. {s.fuente.pagina}
                            </button>
                          ) : null}
                        </p>
                      </blockquote>
                    </li>
                  );
                })}
            </ol>
          </div>
        ) : null}
      </section>
    </div>
  );
}
