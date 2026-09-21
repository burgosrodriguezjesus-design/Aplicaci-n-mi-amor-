"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Primitives";
import { DEPTH_OPTIONS, STYLE_OPTIONS } from "@/lib/client/format";

const PRESETS = [
  "Hazlo más detallado.",
  "Explícalo más fácil.",
  "Pon más ejemplos.",
  "Reduce este apartado.",
  "Conserva más información del PDF.",
];

export function RegenerateDialog({
  open,
  scope,
  sectionTitle,
  defaultDepth,
  defaultStyle,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  scope: "summary" | "outline" | "section";
  sectionTitle?: string;
  defaultDepth: string;
  defaultStyle: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (options: {
    instructions: string;
    depth: string;
    explanationStyle: string;
  }) => void;
}) {
  const [instructions, setInstructions] = useState("");
  const [depth, setDepth] = useState(defaultDepth);
  const [style, setStyle] = useState(defaultStyle);

  const title =
    scope === "section"
      ? `Regenerar «${sectionTitle ?? "apartado"}»`
      : scope === "outline"
        ? "Regenerar el esquema"
        : "Regenerar el resumen completo";

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              onSubmit({ instructions: instructions.trim(), depth, explanationStyle: style })
            }
          >
            {busy ? "Regenerando…" : "Regenerar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {scope === "section" ? (
          <p className="text-[0.82rem]" style={{ color: "var(--text-muted)" }}>
            Solo se reescribe este apartado a partir del texto original de sus páginas.
            El resto del material no se vuelve a procesar.
          </p>
        ) : (
          <p className="text-[0.82rem]" style={{ color: "var(--text-muted)" }}>
            Se reutiliza el texto ya extraído del PDF: no hay que volver a subir nada.
          </p>
        )}

        <label className="block">
          <span className="mb-1.5 block text-[0.78rem] font-medium">
            ¿Qué quieres cambiar?
          </span>
          <textarea
            className="input min-h-20 resize-y"
            placeholder="Escribe una instrucción…"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            maxLength={600}
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="chip"
              onClick={() => setInstructions(preset)}
            >
              {preset}
            </button>
          ))}
        </div>

        {scope !== "outline" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[0.78rem] font-medium">Nivel de resumen</span>
              <select
                className="input"
                value={depth}
                onChange={(event) => setDepth(event.target.value)}
              >
                {DEPTH_OPTIONS.map((option) => (
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
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
