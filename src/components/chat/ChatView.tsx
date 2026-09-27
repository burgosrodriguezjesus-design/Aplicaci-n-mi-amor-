"use client";

/**
 * «Pregúntale a alicIA»: un chat con IA para preguntar de todo, y también
 * sobre uno de tus documentos. La respuesta aparece mientras se escribe.
 * La conversación se guarda en este dispositivo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { useSession } from "@/components/AppShell";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { Icon } from "@/components/ui/Icon";
import { Markdown } from "@/components/Markdown";

type Mensaje = { role: "user" | "assistant"; content: string; error?: boolean };
type DocumentoCorto = { id: string; title: string; status: string };

const GENERALES = [
  "Explícame la ley de Ohm con un ejemplo sencillo",
  "Hazme un plan de estudio para un examen dentro de dos semanas",
  "¿Qué técnicas de memorización funcionan mejor?",
  "Corrígeme este texto y explícame los fallos",
];
const DEL_DOCUMENTO = [
  "Resúmeme este documento en 5 ideas clave",
  "Hazme 5 preguntas de repaso y luego corrígeme",
  "¿Qué es lo más importante para el examen?",
  "Explícame la parte más difícil como si empezara de cero",
];

const clave = (doc: string | null) => `alicia-chat-${doc ?? "general"}`;

function leer(doc: string | null): Mensaje[] {
  try {
    const guardado = JSON.parse(window.localStorage.getItem(clave(doc)) ?? "[]");
    return Array.isArray(guardado) ? guardado.filter((m) => m && typeof m.content === "string") : [];
  } catch {
    return [];
  }
}

function guardar(doc: string | null, mensajes: Mensaje[]) {
  try {
    if (mensajes.length) window.localStorage.setItem(clave(doc), JSON.stringify(mensajes.slice(-40)));
    else window.localStorage.removeItem(clave(doc));
  } catch {
    // Sin almacenamiento: la conversación dura mientras la página esté abierta.
  }
}

function Activar() {
  return (
    <div className="card mx-auto max-w-xl p-6 sm:p-8" data-chat-inactivo>
      <div className="flex items-center gap-3">
        <span className="icon-tile !h-12 !w-12">
          <Icon name="sparkles" size={22} />
        </span>
        <div>
          <h2 className="text-[1.1rem] font-extrabold">El asistente está casi listo</h2>
          <p className="text-[0.86rem]" style={{ color: "var(--text-muted)" }}>
            Falta conectar la IA una sola vez. Lo hace quien administra la app.
          </p>
        </div>
      </div>
      <ol className="mt-5 space-y-3 text-[0.9rem] leading-relaxed">
        <li className="flex gap-3">
          <span className="chip chip-accent !h-6 !w-6 shrink-0 justify-center !p-0">1</span>
          <span>
            Crea una clave en <b>console.anthropic.com</b> → <b>API Keys</b> → <b>Create Key</b> (hace falta añadir un
            poco de saldo en <b>Billing</b>).
          </span>
        </li>
        <li className="flex gap-3">
          <span className="chip chip-accent !h-6 !w-6 shrink-0 justify-center !p-0">2</span>
          <span>
            En <b>Vercel</b> → tu proyecto → <b>Settings</b> → <b>Environment Variables</b>, añade{" "}
            <code className="rounded bg-[var(--bg-sunken)] px-1.5 py-0.5 text-[0.82rem]">ANTHROPIC_API_KEY</code> con esa clave.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="chip chip-accent !h-6 !w-6 shrink-0 justify-center !p-0">3</span>
          <span>
            <b>Deployments</b> → los tres puntos del último → <b>Redeploy</b>.
          </span>
        </li>
      </ol>
      <p className="mt-5 rounded-xl px-4 py-3 text-[0.82rem] leading-relaxed" style={{ background: "var(--bg-sunken)", color: "var(--text-soft)" }}>
        La clave se queda en el servidor: nunca llega al móvil ni al navegador. Con ella, los resúmenes, esquemas y
        exámenes también pasarán a hacerse con IA.
      </p>
    </div>
  );
}

export function ChatView() {
  const { user, capabilities } = useSession();
  const player = usePlayer();
  const params = useSearchParams();
  const desdeUrl = params.get("doc");
  // El tema elegido es estado de la pantalla (y se refleja en la dirección).
  const [doc, setDoc] = useState<string | null>(desdeUrl);
  useEffect(() => setDoc(desdeUrl), [desdeUrl]);

  const [documentos, setDocumentos] = useState<DocumentoCorto[]>([]);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [inactivo, setInactivo] = useState(!capabilities.aiEnabled);
  const cortar = useRef<AbortController | null>(null);
  const final = useRef<HTMLDivElement | null>(null);
  const entrada = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    api
      .get<{ documents: DocumentoCorto[] }>("/api/documents?sort=recent")
      .then((r) => setDocumentos(r.documents.filter((d) => d.status === "READY")))
      .catch(() => undefined);
  }, []);

  // Cada tema (general o un documento) tiene su propia conversación. Una
  // respuesta que aún está llegando sigue guardándose en la suya, pero ya no
  // se pinta en la del tema nuevo.
  const temaActual = useRef<string | null>(doc);
  useEffect(() => {
    temaActual.current = doc;
    setMensajes(leer(doc));
    setEnviando(false);
    setBuscando(false);
  }, [doc]);

  useEffect(() => {
    final.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [mensajes, buscando]);

  const documento = useMemo(() => documentos.find((d) => d.id === doc) ?? null, [documentos, doc]);

  const cambiarTema = (valor: string) => {
    setDoc(valor || null);
    window.history.replaceState(null, "", valor ? `/preguntar?doc=${valor}` : "/preguntar");
  };

  const enviar = useCallback(
    async (pregunta: string) => {
      const limpia = pregunta.trim();
      if (!limpia || enviando) return;
      const historial: Mensaje[] = [...mensajes.filter((m) => !m.error), { role: "user", content: limpia }];
      setMensajes([...historial, { role: "assistant", content: "" }]);
      setTexto("");
      setEnviando(true);
      setBuscando(false);
      const control = new AbortController();
      cortar.current = control;
      const tema = doc;
      const aqui = () => temaActual.current === tema;
      let respuesta = "";
      let error: string | null = null;
      const pintar = () => {
        if (aqui()) setMensajes([...historial, { role: "assistant", content: respuesta || (error ?? ""), error: Boolean(error && !respuesta) }]);
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mensajes: historial.map(({ role, content }) => ({ role, content })),
            documentId: doc,
          }),
          signal: control.signal,
        });
        if (!res.ok || !res.body) {
          const datos = await res.json().catch(() => ({}));
          if (res.status === 503 && datos?.error?.code === "AI_UNAVAILABLE") {
            setInactivo(true);
            setEnviando(false);
            if (aqui()) setMensajes(historial.slice(0, -1));
            return;
          }
          error = datos?.error?.message ?? "No se ha podido enviar la pregunta. Inténtalo de nuevo.";
        } else {
          const lector = res.body.getReader();
          const decodificador = new TextDecoder();
          let resto = "";
          for (;;) {
            const { done, value } = await lector.read();
            if (done) break;
            resto += decodificador.decode(value, { stream: true });
            const lineas = resto.split("\n");
            resto = lineas.pop() ?? "";
            for (const linea of lineas) {
              if (!linea.trim()) continue;
              let evento: { t: string; v?: string };
              try {
                evento = JSON.parse(linea);
              } catch {
                continue;
              }
              if (evento.t === "texto") {
                respuesta += evento.v ?? "";
                setBuscando(false);
              } else if (evento.t === "buscando") {
                if (aqui()) setBuscando(true);
              }
              else if (evento.t === "error") error = evento.v ?? "Ha habido un problema al responder.";
            }
            pintar();
          }
        }
      } catch {
        if (!control.signal.aborted) error = "Se ha cortado la conexión. Inténtalo de nuevo.";
      }
      if (!respuesta && !error && control.signal.aborted) error = "Respuesta detenida.";
      if (error && respuesta) respuesta += `\n\n_${error}_`;
      const terminado: Mensaje[] = [...historial, { role: "assistant", content: respuesta || error || "", error: !respuesta }];
      guardar(tema, terminado);
      if (cortar.current === control) cortar.current = null;
      if (!aqui()) return;
      setMensajes(terminado);
      setEnviando(false);
      setBuscando(false);
    },
    [doc, enviando, mensajes],
  );

  const nueva = () => {
    cortar.current?.abort();
    setMensajes([]);
    guardar(doc, []);
    entrada.current?.focus();
  };

  const sugerencias = doc ? DEL_DOCUMENTO : GENERALES;
  // La barra de escribir queda por encima de la navegación (y del reproductor, si suena).
  // (1,4rem de más: el botón «Subir» sobresale de la barra de navegación).
  const abajo = player.track ? "calc(10.8rem + env(safe-area-inset-bottom, 0px))" : "calc(5.75rem + env(safe-area-inset-bottom, 0px))";

  return (
    <div className="animate-in mx-auto flex max-w-3xl flex-col" style={{ minHeight: "calc(100dvh - 9rem)" }}>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Asistente</p>
          <h1 className="page-title mt-1">Pregúntale a alicIA</h1>
          <p className="mt-1 text-[0.88rem]" style={{ color: "var(--text-muted)" }}>
            De cualquier tema, o de tus apuntes.
          </p>
        </div>
        {mensajes.length && !inactivo ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={nueva}>
            <Icon name="plus" size={15} />
            Nueva conversación
          </button>
        ) : null}
      </header>

      {inactivo ? (
        <Activar />
      ) : (
        <>
          <label className="mb-4 flex items-center gap-2 rounded-2xl border px-3 py-2" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}>
            <Icon name={doc ? "file" : "globe"} size={17} className="shrink-0 text-[var(--accent)]" />
            <span className="sr-only">Tema de la conversación</span>
            <select
              className="min-w-0 flex-1 bg-transparent py-1 text-[0.9rem] font-semibold outline-none"
              value={doc ?? ""}
              onChange={(e) => cambiarTema(e.target.value)}
              aria-label="Tema de la conversación"
            >
              <option value="">Cualquier tema</option>
              {doc && !documento ? <option value={doc}>Documento seleccionado</option> : null}
              {documentos.map((d) => (
                <option key={d.id} value={d.id}>
                  📄 {d.title}
                </option>
              ))}
            </select>
          </label>

          <div className="flex-1 space-y-4 pb-4" aria-live="polite">
            {mensajes.length === 0 ? (
              <div className="py-6 text-center">
                <div
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-white"
                  style={{ background: "var(--brand-grad)", boxShadow: "var(--shadow-accent)" }}
                >
                  <Icon name="sparkles" size={30} />
                </div>
                <p className="mt-4 text-[1.1rem] font-bold">Hola{user.name ? `, ${user.name.split(" ")[0]}` : ""}. ¿En qué te ayudo?</p>
                <p className="mx-auto mt-1 max-w-sm text-[0.88rem]" style={{ color: "var(--text-muted)" }}>
                  {documento
                    ? `Conozco el resumen de «${documento.title}»: pregúntame lo que quieras de él o de cualquier otra cosa.`
                    : "Pregúntame lo que quieras: dudas, ejercicios, explicaciones, idiomas, redacción…"}
                </p>
                <div className="mx-auto mt-5 grid max-w-xl gap-2 sm:grid-cols-2">
                  {sugerencias.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="rounded-2xl border px-4 py-3 text-left text-[0.88rem] font-medium transition hover:shadow-sm"
                      style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}
                      onClick={() => enviar(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              mensajes.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end" data-mensaje="usuario">
                    <p
                      className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg px-4 py-2.5 text-[0.94rem] leading-relaxed text-white"
                      style={{ background: "var(--accent)" }}
                    >
                      {m.content}
                    </p>
                  </div>
                ) : (
                  <div key={i} className="flex gap-2.5" data-mensaje="asistente">
                    <span
                      className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ background: "var(--brand-grad)" }}
                      aria-hidden="true"
                    >
                      <Icon name="sparkles" size={15} />
                    </span>
                    <div
                      className="min-w-0 flex-1 rounded-3xl rounded-tl-lg border px-4 py-3"
                      style={{
                        borderColor: m.error ? "color-mix(in srgb, var(--danger) 30%, transparent)" : "var(--border)",
                        background: m.error ? "var(--danger-soft)" : "var(--surface)",
                      }}
                    >
                      {m.content ? (
                        <Markdown markdown={m.content} className="chat-respuesta" />
                      ) : (
                        <p className="flex items-center gap-2 text-[0.88rem]" style={{ color: "var(--text-muted)" }}>
                          <span className="flex gap-1" aria-hidden="true">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                          </span>
                          {buscando ? "Buscando en internet…" : "Pensando…"}
                        </p>
                      )}
                    </div>
                  </div>
                ),
              )
            )}
            <div ref={final} />
          </div>

          <form
            className="sticky z-30 -mx-4 mt-auto px-4 pb-3 pt-2 sm:-mx-6 sm:px-6 md:!bottom-0 md:-mx-10 md:px-10"
            style={{ bottom: abajo, background: "linear-gradient(to top, var(--bg) 70%, transparent)" }}
            onSubmit={(e) => {
              e.preventDefault();
              void enviar(texto);
            }}
          >
            <div
              className="flex items-end gap-2 rounded-3xl border p-2 pl-4"
              style={{ borderColor: "var(--border-strong)", background: "var(--bg-elevated)", boxShadow: "var(--shadow-md)" }}
            >
              <textarea
                ref={entrada}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                    e.preventDefault();
                    void enviar(texto);
                  }
                }}
                rows={1}
                maxLength={8000}
                placeholder={documento ? "Pregunta sobre tu documento o lo que quieras…" : "Escribe tu pregunta…"}
                aria-label="Tu pregunta"
                className="max-h-40 min-h-[2.6rem] flex-1 resize-none bg-transparent py-2 text-[1rem] leading-snug outline-none"
                style={{ fieldSizing: "content" } as React.CSSProperties}
              />
              {enviando ? (
                <button type="button" className="btn btn-secondary btn-icon !h-11 !w-11 shrink-0 !rounded-2xl" onClick={() => cortar.current?.abort()} aria-label="Parar la respuesta">
                  <Icon name="stop" size={16} />
                </button>
              ) : (
                <button type="submit" className="btn btn-primary btn-icon !h-11 !w-11 shrink-0 !rounded-2xl" disabled={!texto.trim()} aria-label="Enviar pregunta">
                  <Icon name="send" size={18} />
                </button>
              )}
            </div>
            <p className="mt-1.5 text-center text-[0.72rem]" style={{ color: "var(--text-muted)" }}>
              La IA puede equivocarse: comprueba lo importante.
            </p>
          </form>
        </>
      )}
    </div>
  );
}
