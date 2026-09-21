"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { DEPTH_OPTIONS, LEVEL_OPTIONS, STYLE_OPTIONS } from "@/lib/client/format";
import { useSession } from "@/components/AppShell";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Icon } from "@/components/ui/Icon";

export function SettingsView() {
  const { user, capabilities } = useSession();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [level, setLevel] = useState(user.educationLevel);
  const [style, setStyle] = useState(user.explanationStyle);
  const [depth, setDepth] = useState(user.summaryDepth);
  const [voice, setVoice] = useState(user.preferredVoice ?? "");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [installable, setInstallable] = useState<Event | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const read = () =>
      setVoices(window.speechSynthesis.getVoices().filter((item) => /^es/i.test(item.lang)));
    read();
    window.speechSynthesis.addEventListener("voiceschanged", read);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", read);
  }, []);

  // Permite instalar la aplicación como PWA desde los ajustes.
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallable(event);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/api/auth/me", {
        educationLevel: level,
        explanationStyle: style,
        summaryDepth: depth,
        preferredVoice: voice || null,
      });
      toast({ title: "Preferencias guardadas", variant: "success" });
    } catch {
      toast({ title: "No hemos podido guardar los cambios", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-in space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Estas preferencias se aplican por defecto a los documentos nuevos.
        </p>
      </header>

      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold">Cómo quieres estudiar</h2>

        <label className="block">
          <span className="mb-1.5 block text-[0.78rem] font-medium">Nivel educativo</span>
          <select className="input" value={level} onChange={(event) => setLevel(event.target.value)}>
            {LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="mb-1.5 block text-[0.78rem] font-medium">Estilo de explicación</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {STYLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStyle(option.value)}
                className="rounded-[0.8rem] border px-3 py-2.5 text-left transition"
                style={
                  style === option.value
                    ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                    : { borderColor: "var(--border)" }
                }
              >
                <span className="block text-[0.85rem] font-semibold">{option.label}</span>
                <span className="block text-[0.73rem]" style={{ color: "var(--text-muted)" }}>
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[0.78rem] font-medium">
            Nivel de resumen por defecto
          </span>
          <select className="input" value={depth} onChange={(event) => setDepth(event.target.value)}>
            {DEPTH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.hint}
              </option>
            ))}
          </select>
        </label>

        {voices.length ? (
          <label className="block">
            <span className="mb-1.5 block text-[0.78rem] font-medium">Voz preferida</span>
            <select className="input" value={voice} onChange={(event) => setVoice(event.target.value)}>
              <option value="">Voz por defecto</option>
              {voices.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} ({item.lang})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Guardando…" : "Guardar preferencias"}
        </button>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-sm font-semibold">Apariencia</h2>
        <div className="segmented">
          {(["light", "dark", "system"] as const).map((option) => (
            <button
              key={option}
              type="button"
              data-active={theme === option}
              onClick={() => setTheme(option)}
            >
              {option === "light" ? "Claro" : option === "dark" ? "Oscuro" : "Sistema"}
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-sm font-semibold">Aplicación</h2>
        <p className="text-[0.85rem]" style={{ color: "var(--text-soft)" }}>
          Puedes instalar EstudIA en tu móvil como una aplicación más y abrirla desde la
          pantalla de inicio.
        </p>
        {installable ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              const event = installable as Event & { prompt?: () => Promise<void> };
              await event.prompt?.();
              setInstallable(null);
            }}
          >
            <Icon name="upload" size={15} />
            Instalar aplicación
          </button>
        ) : (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            En iPhone: comparte la página y elige «Añadir a pantalla de inicio».
          </p>
        )}
      </section>

      <section className="card space-y-2 p-5">
        <h2 className="text-sm font-semibold">Estado del servidor</h2>
        <ul className="space-y-1.5 text-[0.85rem]">
          <li className="flex items-center gap-2">
            <span style={{ color: capabilities.aiEnabled ? "var(--success)" : "var(--warning)" }}>
              <Icon name={capabilities.aiEnabled ? "check" : "warning"} size={15} />
            </span>
            {capabilities.aiEnabled
              ? "Resúmenes y esquemas generados con IA"
              : "Modo extractivo (sin ANTHROPIC_API_KEY)"}
          </li>
          <li className="flex items-center gap-2">
            <span style={{ color: capabilities.serverTts ? "var(--success)" : "var(--warning)" }}>
              <Icon name={capabilities.serverTts ? "check" : "warning"} size={15} />
            </span>
            {capabilities.serverTts
              ? "Audio sintetizado en el servidor"
              : "Audio con la voz de tu dispositivo (sin TTS_PROVIDER)"}
          </li>
          <li className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
            <Icon name="file" size={15} />
            Límite: {capabilities.maxUploadMb} MB y {capabilities.maxPages} páginas por PDF
          </li>
        </ul>
      </section>

      <section className="card space-y-1 p-5">
        <h2 className="text-sm font-semibold">Tu cuenta</h2>
        <p className="text-[0.85rem]" style={{ color: "var(--text-soft)" }}>
          {user.name} · {user.email}
        </p>
      </section>
    </div>
  );
}
