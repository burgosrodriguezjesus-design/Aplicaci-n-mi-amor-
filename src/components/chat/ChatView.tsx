"use client";

/**
 * «Pregúntale a alicIA»: preguntas sobre tus PDF. Responde solo con lo que
 * dice el documento elegido (y te dice la página); funciona sin activar
 * nada. La respuesta aparece mientras se escribe y cada documento guarda su
 * propia conversación en este dispositivo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { useSession } from "@/components/AppShell";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/Primitives";
import { Markdown } from "@/components/Markdown";

type Mensaje = { role: "user" | "assistant"; content: string; error?: boolean };
type DocumentoCorto = { id: string; title: string; status: string };

const clave = (doc: string) => `alicia-chat-${doc}`;

function leer(doc: string | null): Mensaje[] {
  if (!doc) return [];
  try {
    const guardado = JSON.parse(window.localStorage.getItem(clave(doc)) ?? "[]");
    return Array.isArray(guardado) ? guardado.filter((m) => m && typeof m.content === "string") : [];
  } catch {
    return [];
  }
}

function guardar(doc: string, mensajes: Mensaje[]) {
  try {
    if (mensajes.length) window.localStorage.setItem(clave(doc), JSON.stringify(mensajes.slice(-40)));
    else window.localStorage.removeItem(clave(doc));
  } catch {
    // Sin almacenamiento: la conversación dura mientras la página esté abierta.
  }
}

export function ChatView() {
  const { user } = useSession();
  const player = usePlayer();
  const params = useSearchParams();
  const desdeUrl = params.get("doc");

  const [documentos, setDocumentos] = useState<DocumentoCorto[] | null>(null);
  // El documento elegido es estado de la pantalla (y se refleja en la dirección).
  const [doc, setDoc] = useState<string | null>(desdeUrl);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const cortar = useRef<AbortController | null>(null);
  const final = useRef<HTMLDivElement | null>(null);
  const entrada = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    api
      .get<{ documents: DocumentoCorto[] }>("/api/documents?sort=recent")
      .then((r) => setDocumentos(r.documents.filter((d) => d.status === "READY")))
      .catch(() => setDocumentos([]));
  }, []);

  useEffect(() => {
    if (desdeUrl) setDoc(desdeUrl);
  }, [desdeUrl]);

  // Sin documento elegido: el más reciente.
  useEffect(() => {
    if (!doc && documentos?.length) {
      setDoc(documentos[0].id);
      window.history.replaceState(null, "", `/preguntar?doc=${documentos[0].id}`);
    }
  }, [doc, documentos]);

  // Cada documento tiene su propia conversación. Una respuesta que aún está
  // llegando sigue guardándose en la suya, pero no se pinta en la nueva.
  const docActual = useRef<string | null>(doc);
  useEffect(() => {
    docActual.current = doc;
    setMensajes(leer(doc));
    setEnviando(false);
    setIdeas([]);
    if (!doc) return;
    api
      .get<{ sugerencias: string[] }>(`/api/chat/sugerencias?doc=${doc}`)
      .then((r) => docActual.current === doc && setIdeas(r.sugerencias))
      .catch(() => undefined);
  }, [doc]);

  useEffect(() => {
    final.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [mensajes]);

  const documento = useMemo(() => documentos?.find((d) => d.id === doc) ?? null, [documentos, doc]);

  const cambiarDocumento = (valor: string) => {
    setDoc(valor);
    window.history.replaceState(null, "", `/preguntar?doc=${valor}`);
  };

  const enviar = useCallback(
    async (pregunta: string) => {
      const limpia = pregunta.trim();
      if (!limpia || enviando || !doc) return;
      const historial: Mensaje[] = [...mensajes.filter((m) => !m.error), { role: "user", content: limpia }];
      setMensajes([...historial, { role: "assistant", content: "" }]);
      setTexto("");
      setEnviando(true);
      const control = new AbortController();
      cortar.current = control;
      const tema = doc;
      const aqui = () => docActual.current === tema;
      let respuesta = "";
      let error: string | null = null;
      const pintar = () => {
        if (aqui()) setMensajes([...historial, { role: "assistant", content: respuesta || (error ?? ""), error: Boolean(error && !respuesta) }]);
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensajes: historial.map(({ role, content }) => ({ role, content })), documentId: tema }),
          signal: control.signal,
        });
        if (!res.ok || !res.body) {
          const datos = await res.json().catch(() => ({}));
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
              if (evento.t === "texto") respuesta += evento.v ?? "";
              else if (evento.t === "error") error = evento.v ?? "Ha habido un problema al responder.";
            }
            pintar();
          }
        }
      } catch {
        if (!control.signal.aborted) error = "Se ha cortado la conexión. Inténtalo de nuevo.";
      }
      if (!respuesta && !error && control.signal.aborted) error = "Respuesta detenida.";
      if (error && respuesta) respuesta += `\n\n*${error}*`;
      const terminado: Mensaje[] = [...historial, { role: "assistant", content: respuesta || error || "", error: !respuesta }];
      guardar(tema, terminado);
      if (cortar.current === control) cortar.current = null;
      if (!aqui()) return;
      setMensajes(terminado);
      setEnviando(false);
    },
    [doc, enviando, mensajes],
  );

  const nueva = () => {
    cortar.current?.abort();
    setMensajes([]);
    if (doc) guardar(doc, []);
    entrada.current?.focus();
  };

  // La barra de escribir queda por encima de la navegación (y del reproductor,
  // si suena); 1,4rem de más porque el botón «Subir» sobresale de la barra.
  const abajo = player.track ? "calc(10.8rem + env(safe-area-inset-bottom, 0px))" : "calc(5.75rem + env(safe-area-inset-bottom, 0px))";

  const cabecera = (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="eyebrow">Tus documentos</p>
        <h1 className="page-title mt-1">Pregúntale a alicIA</h1>
        <p className="mt-1 text-[0.88rem]" style={{ color: "var(--text-muted)" }}>
          Pregunta lo que quieras de tus PDF: responde con lo que dicen y te indica la página.
        </p>
      </div>
      {mensajes.length ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={nueva}>
          <Icon name="plus" size={15} />
          Nueva conversación
        </button>
      ) : null}
    </header>
  );

  if (documentos && documentos.length === 0) {
    return (
      <div className="animate-in mx-auto max-w-3xl">
        {cabecera}
        <EmptyState
          icon="sparkles"
          title="Sube un PDF para preguntarle"
          description="Cuando tengas un documento listo, podrás preguntarle cualquier cosa sobre él: qué es un concepto, qué tipos hay, cómo se calcula algo, un resumen o preguntas de repaso."
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
    <div className="animate-in mx-auto flex max-w-3xl flex-col" style={{ minHeight: "calc(100dvh - 9rem)" }}>
      {cabecera}

      <label className="mb-4 flex items-center gap-2 rounded-2xl border px-3 py-2" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}>
        <Icon name="file" size={17} className="shrink-0 text-[var(--accent)]" />
        <select
          className="min-w-0 flex-1 bg-transparent py-1 text-[0.9rem] font-semibold outline-none"
          value={doc ?? ""}
          onChange={(e) => cambiarDocumento(e.target.value)}
          aria-label="Documento"
        >
          {!documentos ? <option value={doc ?? ""}>Cargando tus documentos…</option> : null}
          {doc && documentos && !documento ? <option value={doc}>Documento seleccionado</option> : null}
          {(documentos ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
      </label>

      {/* En el móvil la caja de escribir flota sobre la barra: hueco al final para que no tape nada. */}
      <div className={`flex-1 space-y-4 md:pb-4 ${player.track ? "pb-44" : "pb-24"}`} aria-live="polite">
        {mensajes.length === 0 ? (
          <div className="py-6 text-center">
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-white"
              style={{ background: "var(--brand-grad)", boxShadow: "var(--shadow-accent)" }}
            >
              <Icon name="sparkles" size={30} />
            </div>
            <p className="mt-4 text-[1.1rem] font-bold">Hola{user.name ? `, ${user.name.split(" ")[0]}` : ""}. ¿Qué quieres saber?</p>
            <p className="mx-auto mt-1 max-w-sm text-[0.88rem]" style={{ color: "var(--text-muted)" }}>
              {documento ? `Pregúntame lo que quieras sobre «${documento.title}».` : "Pregúntame lo que quieras sobre tu documento."}
            </p>
            <div className="mx-auto mt-5 grid max-w-xl gap-2 sm:grid-cols-2">
              {ideas.map((s) => (
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
                      Buscando en el documento…
                    </p>
                  )}
                </div>
              </div>
            ),
          )
        )}
        {/* Al bajar hasta aquí, que quede por encima de la caja de escribir y de la barra. */}
        <div ref={final} className={player.track ? "scroll-mb-[21.5rem] md:scroll-mb-[9rem]" : "scroll-mb-[16rem] md:scroll-mb-[9rem]"} />
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
            maxLength={2000}
            disabled={!doc}
            placeholder="Pregunta algo sobre este documento…"
            aria-label="Tu pregunta"
            className="max-h-40 min-h-[2.6rem] flex-1 resize-none bg-transparent py-2 text-[1rem] leading-snug outline-none"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          {enviando ? (
            <button type="button" className="btn btn-secondary btn-icon !h-11 !w-11 shrink-0 !rounded-2xl" onClick={() => cortar.current?.abort()} aria-label="Parar la respuesta">
              <Icon name="stop" size={16} />
            </button>
          ) : (
            <button type="submit" className="btn btn-primary btn-icon !h-11 !w-11 shrink-0 !rounded-2xl" disabled={!texto.trim() || !doc} aria-label="Enviar pregunta">
              <Icon name="send" size={18} />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-center text-[0.72rem]" style={{ color: "var(--text-muted)" }}>
          Responde solo con lo que dice el documento.
        </p>
      </form>
    </div>
  );
}
