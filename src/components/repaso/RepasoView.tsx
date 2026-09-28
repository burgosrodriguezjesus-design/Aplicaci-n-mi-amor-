"use client";

/**
 * «Repasar»: tarjetas de memoria creadas de tus PDF, con repaso espaciado.
 * Se ve la pregunta; al tocarla se gira y aparece la respuesta del temario.
 * Tú dices si te la sabías y la app decide cuándo vuelve: justo antes de
 * que se te olvide.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, Skeleton } from "@/components/ui/Primitives";
import { Markdown } from "@/components/Markdown";
import { ETIQUETA_TIPO, type Tarjeta } from "@/lib/tarjetas/tipos";
import { type EstadoTarjeta, type Nota, cuando, siguiente } from "@/lib/tarjetas/repaso";

type Estado = Omit<EstadoTarjeta, "vence"> & { vence: string | Date };
type Elemento = { documentId: string; documento: string; tarjeta: Tarjeta; estado: Estado | null };
type Resumen = { documentId: string; documento: string; total: number; aprendidas: number; pendientes: number; nuevas: number };
type Totales = { pendientes: number; nuevas: number; aprendidas: number; total: number; proxima: string | null };
type Respuesta = { cola: Elemento[]; resumen: Resumen[]; totales: Totales };

const BOTONES: { nota: Nota; texto: string; fondo: string; color: string; tecla: string }[] = [
  { nota: 0, texto: "No me la sé", fondo: "var(--danger-soft)", color: "var(--danger)", tecla: "1" },
  { nota: 1, texto: "Dudé", fondo: "var(--warning-soft)", color: "var(--warning)", tecla: "2" },
  { nota: 2, texto: "Me la sé", fondo: "var(--success-soft)", color: "var(--success)", tecla: "3" },
];

function aEstado(e: Estado | null): EstadoTarjeta | null {
  return e ? { ...e, vence: new Date(e.vence) } : null;
}

function fechaCorta(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const hoy = new Date();
  const manana = new Date();
  manana.setDate(hoy.getDate() + 1);
  if (d.toDateString() === hoy.toDateString()) return `hoy a las ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
  if (d.toDateString() === manana.toDateString()) return "mañana";
  return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

export function RepasoView() {
  const params = useSearchParams();
  const desdeUrl = params.get("doc");
  const [doc, setDoc] = useState<string | null>(desdeUrl);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cola, setCola] = useState<Elemento[]>([]);
  const [girada, setGirada] = useState(false);
  const [hechas, setHechas] = useState<Nota[]>([]);
  const [totalSesion, setTotalSesion] = useState(0);

  const cargar = useCallback(async (documento: string | null) => {
    setCargando(true);
    try {
      const r = await api.get<Respuesta>(`/api/tarjetas${documento ? `?doc=${documento}` : ""}`);
      setDatos(r);
      setCola(r.cola);
      setTotalSesion(r.cola.length);
      setHechas([]);
      setGirada(false);
    } catch {
      setDatos({ cola: [], resumen: [], totales: { pendientes: 0, nuevas: 0, aprendidas: 0, total: 0, proxima: null } });
      setCola([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(doc);
  }, [cargar, doc]);

  const actual = cola[0] ?? null;

  const calificar = useCallback(
    (nota: Nota) => {
      if (!actual || !girada) return;
      const nuevo = siguiente(aEstado(actual.estado), nota);
      void api.post("/api/tarjetas", { documentId: actual.documentId, clave: actual.tarjeta.clave, nota }).catch(() => undefined);
      setHechas((h) => [...h, nota]);
      setGirada(false);
      setCola((c) => {
        const resto = c.slice(1);
        // La que no te sabías vuelve dentro de esta misma sesión, un poco más adelante.
        if (nota === 0) resto.splice(Math.min(3, resto.length), 0, { ...actual, estado: { ...nuevo, vence: nuevo.vence.toISOString() } });
        return resto;
      });
      if (nota === 0) setTotalSesion((t) => t + 1);
    },
    [actual, girada],
  );

  // Teclado: espacio para girar, 1-2-3 para responder.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!actual || (e.target as HTMLElement)?.closest("select, input, textarea")) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setGirada((g) => (g ? g : true));
      } else if (girada && ["1", "2", "3"].includes(e.key)) calificar((Number(e.key) - 1) as Nota);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [actual, girada, calificar]);

  const cambiarDocumento = (valor: string) => {
    const nuevo = valor || null;
    setDoc(nuevo);
    window.history.replaceState(null, "", nuevo ? `/repasar?doc=${nuevo}` : "/repasar");
  };

  const aciertos = hechas.filter((n) => n === 2).length;
  const dudas = hechas.filter((n) => n === 1).length;
  const fallos = hechas.filter((n) => n === 0).length;
  const progreso = totalSesion ? Math.round((hechas.length / totalSesion) * 100) : 0;
  const resumenDoc = useMemo(() => (doc ? datos?.resumen.find((r) => r.documentId === doc) : null), [datos, doc]);
  const t = datos?.totales;

  const cabecera = (
    <header className="mb-4">
      <p className="eyebrow">Repaso espaciado</p>
      <h1 className="page-title mt-1">Repasar</h1>
      <p className="mt-1 text-[0.88rem]" style={{ color: "var(--text-muted)" }}>
        Tarjetas creadas de tus PDF. Cada una vuelve justo antes de que se te olvide.
      </p>
    </header>
  );

  if (cargando && !datos) {
    return (
      <div className="mx-auto max-w-2xl">
        {cabecera}
        <Skeleton className="h-72 w-full !rounded-[var(--radius-card)]" />
      </div>
    );
  }

  if (datos && !datos.resumen.length && !doc) {
    return (
      <div className="animate-in mx-auto max-w-2xl">
        {cabecera}
        <EmptyState
          icon="layers"
          title="Aún no hay tarjetas"
          description="Sube un PDF: en cuanto esté listo, se crean solas las tarjetas con sus conceptos, clasificaciones, fórmulas y datos."
          action={
            <Link href="/subir" className="btn btn-primary btn-lg">
              <Icon name="upload" size={19} />
              Subir un PDF
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="animate-in mx-auto max-w-2xl pb-6">
      {cabecera}

      <label className="mb-4 flex items-center gap-2 rounded-2xl border px-3 py-2" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}>
        <Icon name="layers" size={17} className="shrink-0 text-[var(--accent)]" />
        <select
          className="min-w-0 flex-1 bg-transparent py-1 text-[0.9rem] font-semibold outline-none"
          value={doc ?? ""}
          onChange={(e) => cambiarDocumento(e.target.value)}
          aria-label="Qué repasar"
        >
          <option value="">Todos mis documentos</option>
          {(datos?.resumen ?? []).map((r) => (
            <option key={r.documentId} value={r.documentId}>
              {r.documento}
            </option>
          ))}
          {doc && !resumenDoc ? <option value={doc}>Documento</option> : null}
        </select>
      </label>

      {/* Cifras */}
      <div className="mb-5 grid grid-cols-3 gap-2.5">
        {[
          { valor: Math.max(0, totalSesion - hechas.length), texto: "Para hoy", icono: "target" },
          { valor: resumenDoc ? resumenDoc.aprendidas : t?.aprendidas ?? 0, texto: "Aprendidas", icono: "checkCircle" },
          { valor: resumenDoc ? resumenDoc.total : t?.total ?? 0, texto: "Tarjetas", icono: "layers" },
        ].map((c) => (
          <div key={c.texto} className="card flex flex-col items-center gap-0.5 px-2 py-3 text-center" data-cifra={c.texto}>
            <Icon name={c.icono} size={17} className="text-[var(--accent)]" />
            <span className="text-[1.35rem] font-extrabold leading-none tracking-tight">{c.valor}</span>
            <span className="text-[0.72rem] font-semibold" style={{ color: "var(--text-muted)" }}>
              {c.texto}
            </span>
          </div>
        ))}
      </div>

      {actual ? (
        <>
          {/* Progreso de la sesión */}
          <div className="mb-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-sunken)" }} role="progressbar" aria-valuenow={progreso} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del repaso">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progreso}%`, background: "var(--brand-grad)" }} />
            </div>
            <span className="shrink-0 text-[0.78rem] font-semibold" style={{ color: "var(--text-muted)" }}>
              {hechas.length}/{totalSesion}
            </span>
          </div>

          {/* La tarjeta: se gira al tocarla */}
          <button
            type="button"
            className="tarjeta-3d block w-full text-left"
            onClick={() => setGirada(true)}
            aria-label={girada ? "Respuesta de la tarjeta" : "Tarjeta: toca para ver la respuesta"}
            data-tarjeta={actual.tarjeta.clave}
          >
            <div className={`tarjeta-interior ${girada ? "girada" : ""}`}>
              <div className="tarjeta-cara card flex min-h-[17rem] flex-col p-5 sm:p-7" aria-hidden={girada}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="chip chip-accent">{ETIQUETA_TIPO[actual.tarjeta.tipo]}</span>
                  {!actual.estado ? <span className="chip chip-success">Nueva</span> : null}
                </div>
                <p className="my-auto py-6 text-center text-[1.3rem] font-bold leading-snug tracking-tight sm:text-[1.5rem]" data-frente>
                  {actual.tarjeta.frente}
                </p>
                <p className="text-center text-[0.78rem] font-semibold" style={{ color: "var(--text-muted)" }}>
                  <Icon name="refresh" size={13} className="mr-1 inline align-[-2px]" />
                  Toca para ver la respuesta
                </p>
              </div>
              <div className="tarjeta-cara tarjeta-atras card flex min-h-[17rem] flex-col p-5 sm:p-7" aria-hidden={!girada}>
                <p className="text-[0.82rem] font-bold" style={{ color: "var(--text-muted)" }}>
                  {actual.tarjeta.frente}
                </p>
                <div className="my-auto py-4" data-reverso>
                  <Markdown markdown={actual.tarjeta.reverso} className="chat-respuesta !text-[1rem]" />
                </div>
                <p className="text-[0.74rem] leading-snug" style={{ color: "var(--text-muted)" }}>
                  <Icon name="file" size={12} className="mr-1 inline align-[-1px]" />
                  {actual.documento}
                  {actual.tarjeta.apartado ? ` · ${actual.tarjeta.apartado}` : ""}
                  {actual.tarjeta.pagina ? ` · pág. ${actual.tarjeta.pagina}` : ""}
                </p>
              </div>
            </div>
          </button>

          {/* Respuesta: cuándo vuelve según lo que digas */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {girada ? (
              BOTONES.map((b) => (
                <button
                  key={b.nota}
                  type="button"
                  onClick={() => calificar(b.nota)}
                  className="flex flex-col items-center gap-0.5 rounded-2xl px-2 py-3 text-center font-bold transition active:scale-95"
                  style={{ background: b.fondo, color: b.color }}
                  aria-keyshortcuts={b.tecla}
                >
                  <span className="text-[0.9rem]">{b.texto}</span>
                  <span className="text-[0.72rem] font-semibold opacity-80">{cuando(aEstado(actual.estado), b.nota)}</span>
                </button>
              ))
            ) : (
              <button type="button" className="btn btn-primary btn-lg col-span-3" onClick={() => setGirada(true)}>
                <Icon name="eye" size={18} />
                Mostrar respuesta
              </button>
            )}
          </div>
          <p className="mt-3 hidden text-center text-[0.74rem] sm:block" style={{ color: "var(--text-muted)" }}>
            Atajos: espacio para girar · 1, 2, 3 para responder
          </p>
        </>
      ) : (
        <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center" data-repaso-terminado>
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl text-white" style={{ background: "var(--brand-grad)", boxShadow: "var(--shadow-accent)" }}>
            <Icon name={hechas.length ? "trophy" : "checkCircle"} size={30} />
          </span>
          <p className="text-[1.2rem] font-extrabold tracking-tight">{hechas.length ? "¡Repaso terminado!" : "¡Estás al día!"}</p>
          {hechas.length ? (
            <div className="flex flex-wrap justify-center gap-2">
              <span className="chip chip-success">{aciertos} me las sabía</span>
              <span className="chip chip-warning">{dudas} dudé</span>
              <span className="chip !border-transparent" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
                {fallos} repetidas
              </span>
            </div>
          ) : null}
          <p className="max-w-sm text-[0.88rem]" style={{ color: "var(--text-muted)" }}>
            {hechas.length
              ? "Las tarjetas volverán solas justo cuando toque repasarlas."
              : "No tienes tarjetas pendientes ahora mismo."}{" "}
            {!hechas.length && t?.proxima ? `El próximo repaso es ${fechaCorta(t.proxima)}.` : ""}
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {hechas.length ? (
              <button type="button" className="btn btn-secondary" onClick={() => void cargar(doc)}>
                <Icon name="refresh" size={16} />
                Comprobar si queda algo
              </button>
            ) : null}
            <Link href="/inicio" className="btn btn-primary">
              <Icon name="home" size={16} />
              Volver a Inicio
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
