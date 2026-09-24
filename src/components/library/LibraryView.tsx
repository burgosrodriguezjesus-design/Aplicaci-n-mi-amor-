"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { borrarPdfLocal } from "@/lib/client/pdf-local";
import type { DocumentListItem, Subject } from "@/lib/client/types";
import { Icon } from "@/components/ui/Icon";
import { CardSkeleton, EmptyState, Modal } from "@/components/ui/Primitives";
import { useToast } from "@/components/providers/ToastProvider";
import { DocumentCard } from "./DocumentCard";

type Sort = "recent" | "name" | "subject" | "progress";

const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Más reciente" },
  { value: "name", label: "Nombre" },
  { value: "subject", label: "Asignatura" },
  { value: "progress", label: "Progreso" },
];

const EMOJIS = ["📘", "⚡", "🧪", "🧮", "🧬", "⚙️", "🗺️", "🎨", "💻", "⚖️", "🩺", "🌍"];
const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7"];

export function LibraryView() {
  const params = useSearchParams();
  const { toast } = useToast();

  const [tab, setTab] = useState<"documents" | "subjects">("documents");
  const [documents, setDocuments] = useState<DocumentListItem[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [subjectFilter, setSubjectFilter] = useState(params.get("subject") ?? "");
  const [pendingDelete, setPendingDelete] = useState<DocumentListItem | null>(null);

  const [newSubject, setNewSubject] = useState("");
  const [newEmoji, setNewEmoji] = useState(EMOJIS[0]);
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [newTopic, setNewTopic] = useState<Record<string, string>>({});

  const loadDocuments = useCallback(async () => {
    const search = new URLSearchParams();
    if (query.trim()) search.set("q", query.trim());
    if (subjectFilter) search.set("subjectId", subjectFilter);
    search.set("sort", sort === "subject" ? "recent" : sort);
    const data = await api.get<{ documents: DocumentListItem[] }>(
      `/api/documents?${search.toString()}`,
    );
    setDocuments(data.documents);
  }, [query, sort, subjectFilter]);

  const loadSubjects = useCallback(async () => {
    const data = await api.get<{ subjects: Subject[] }>("/api/subjects");
    setSubjects(data.subjects);
  }, []);

  useEffect(() => {
    void loadSubjects().catch(() => undefined);
  }, [loadSubjects]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadDocuments().catch(() => undefined);
    }, 220);
    return () => clearTimeout(timer);
  }, [loadDocuments]);

  // Refresco periódico mientras haya documentos en proceso.
  useEffect(() => {
    if (!documents?.some((item) => item.status !== "READY" && item.status !== "FAILED")) {
      return;
    }
    const interval = setInterval(() => {
      void loadDocuments().catch(() => undefined);
    }, 4000);
    return () => clearInterval(interval);
  }, [documents, loadDocuments]);

  const sorted = useMemo(() => {
    if (!documents) return null;
    if (sort !== "subject") return documents;
    return [...documents].sort((a, b) =>
      (a.subject?.name ?? "zzz").localeCompare(b.subject?.name ?? "zzz", "es"),
    );
  }, [documents, sort]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setDocuments((current) => current?.filter((item) => item.id !== target.id) ?? null);
    try {
      await api.delete(`/api/documents/${target.id}`);
      await borrarPdfLocal(target.id);
      toast({ title: "Documento eliminado", variant: "success" });
      void loadSubjects();
    } catch {
      toast({ title: "No hemos podido eliminarlo", variant: "error" });
      void loadDocuments();
    }
  };

  const createSubject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newSubject.trim()) return;
    try {
      await api.post("/api/subjects", {
        name: newSubject.trim(),
        emoji: newEmoji,
        color: newColor,
      });
      setNewSubject("");
      await loadSubjects();
      toast({ title: "Asignatura creada", variant: "success" });
    } catch (error) {
      toast({
        title: "No hemos podido crearla",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  };

  const createTopic = async (subjectId: string) => {
    const name = (newTopic[subjectId] ?? "").trim();
    if (!name) return;
    await api.post(`/api/subjects/${subjectId}/topics`, { name }).catch(() => undefined);
    setNewTopic((current) => ({ ...current, [subjectId]: "" }));
    await loadSubjects();
  };

  const deleteSubject = async (subjectId: string) => {
    await api.delete(`/api/subjects/${subjectId}`).catch(() => undefined);
    await loadSubjects();
    void loadDocuments();
  };

  return (
    <div className="animate-in space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Biblioteca</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Todo tu material, organizado por asignaturas y temas.
          </p>
        </div>
        <Link href="/subir" className="btn btn-primary">
          <Icon name="plus" size={16} />
          Subir PDF
        </Link>
      </header>

      <div className="segmented">
        <button
          type="button"
          data-active={tab === "documents"}
          onClick={() => setTab("documents")}
        >
          Documentos
        </button>
        <button
          type="button"
          data-active={tab === "subjects"}
          onClick={() => setTab("subjects")}
        >
          Asignaturas
        </button>
      </div>

      {tab === "documents" ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              >
                <Icon name="search" size={16} />
              </span>
              <input
                className="input pl-9"
                placeholder="Buscar en tus documentos…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Buscar documentos"
              />
            </div>
            <select
              className="input sm:w-48"
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              aria-label="Ordenar por"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  Ordenar: {option.label}
                </option>
              ))}
            </select>
          </div>

          {subjects.length ? (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="chip"
                onClick={() => setSubjectFilter("")}
                style={
                  subjectFilter === ""
                    ? { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent)" }
                    : undefined
                }
              >
                Todas
              </button>
              {subjects.map((subject) => (
                <button
                  key={subject.id}
                  type="button"
                  className="chip"
                  onClick={() => setSubjectFilter(subject.id)}
                  style={
                    subjectFilter === subject.id
                      ? { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent)" }
                      : undefined
                  }
                >
                  {subject.emoji} {subject.name}
                </button>
              ))}
            </div>
          ) : null}

          {!sorted ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : sorted.length === 0 ? (
            <EmptyState
              icon="search"
              title={query ? "Sin resultados" : "Tu biblioteca está vacía"}
              description={
                query
                  ? "Prueba con otras palabras o quita el filtro de asignatura."
                  : "Sube un PDF y aparecerá aquí con su resumen, su esquema y su audio."
              }
              action={
                !query ? (
                  <Link href="/subir" className="btn btn-primary">
                    Subir PDF
                  </Link>
                ) : null
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((item) => (
                <DocumentCard key={item.id} document={item} onDelete={setPendingDelete} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <form onSubmit={createSubject} className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold">Nueva asignatura</h2>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="input sm:flex-1"
                placeholder="Electricidad, Anatomía, Historia…"
                value={newSubject}
                onChange={(event) => setNewSubject(event.target.value)}
              />
              <button type="submit" className="btn btn-primary">
                Crear
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setNewEmoji(emoji)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border transition"
                  style={
                    newEmoji === emoji
                      ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                      : { borderColor: "var(--border)" }
                  }
                  aria-label={`Icono ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewColor(color)}
                  className="h-7 w-7 rounded-full border-2 transition"
                  style={{
                    background: color,
                    borderColor: newColor === color ? "var(--text)" : "transparent",
                  }}
                  aria-label={`Color ${color}`}
                />
              ))}
            </div>
          </form>

          {subjects.length === 0 ? (
            <EmptyState
              icon="folder"
              title="Aún no hay asignaturas"
              description="Crea una asignatura y dentro los temas, como en tus apuntes de clase."
            />
          ) : (
            subjects.map((subject) => (
              <section key={subject.id} className="card p-4">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-xl"
                    style={{ background: `color-mix(in srgb, ${subject.color} 16%, transparent)` }}
                  >
                    {subject.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[0.95rem] font-semibold">{subject.name}</h3>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {subject._count.documents}{" "}
                      {subject._count.documents === 1 ? "documento" : "documentos"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost !px-2"
                    onClick={() => deleteSubject(subject.id)}
                    aria-label={`Eliminar la asignatura ${subject.name}`}
                    title="Eliminar asignatura (los documentos no se borran)"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>

                <div className="mt-3 space-y-2 pl-3" style={{ borderLeft: "2px solid var(--border)" }}>
                  {subject.topics.map((topic) => (
                    <div key={topic.id}>
                      <p className="text-[0.85rem] font-medium">{topic.name}</p>
                      <ul className="mt-1 space-y-0.5">
                        {topic.documents.map((document) => (
                          <li key={document.id}>
                            <Link
                              href={`/documento/${document.id}`}
                              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[0.82rem] transition hover:bg-[var(--surface-hover)]"
                              style={{ color: "var(--text-soft)" }}
                            >
                              <Icon name="file" size={13} />
                              <span className="min-w-0 flex-1 truncate">{document.title}</span>
                            </Link>
                          </li>
                        ))}
                        {topic.documents.length === 0 ? (
                          <li className="px-1.5 text-[0.78rem]" style={{ color: "var(--text-muted)" }}>
                            Sin documentos todavía
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ))}

                  <div className="flex gap-2 pt-1">
                    <input
                      className="input !py-1.5 text-[0.82rem]"
                      placeholder="Nuevo tema (Tema 1, Tema 2…)"
                      value={newTopic[subject.id] ?? ""}
                      onChange={(event) =>
                        setNewTopic((current) => ({
                          ...current,
                          [subject.id]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void createTopic(subject.id);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => createTopic(subject.id)}
                    >
                      <Icon name="plus" size={15} />
                    </button>
                  </div>
                </div>
              </section>
            ))
          )}
        </div>
      )}

      <Modal
        open={Boolean(pendingDelete)}
        title="Eliminar documento"
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setPendingDelete(null)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-danger" onClick={confirmDelete}>
              Eliminar
            </button>
          </>
        }
      >
        <p className="text-sm" style={{ color: "var(--text-soft)" }}>
          Se eliminarán el PDF original, el resumen, el esquema y los audios de{" "}
          <strong>{pendingDelete?.title}</strong>. Esta acción no se puede deshacer.
        </p>
      </Modal>
    </div>
  );
}
