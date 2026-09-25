"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { DEPTH_OPTIONS, LEVEL_OPTIONS, STYLE_OPTIONS } from "@/lib/client/format";
import { useSession } from "@/components/AppShell";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Icon } from "@/components/ui/Icon";

function Seccion({ icon, title, hint, children }: { icon: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="icon-tile !h-10 !w-10">
          <Icon name={icon} size={19} />
        </span>
        <div>
          <h2 className="text-[1rem] font-bold">{title}</h2>
          {hint ? (
            <p className="text-[0.8rem]" style={{ color: "var(--text-muted)" }}>
              {hint}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Estado({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3.5 text-[0.88rem]">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: ok ? "var(--success-soft)" : "var(--warning-soft)", color: ok ? "var(--success)" : "var(--warning)" }}
      >
        <Icon name={ok ? "check" : "info"} size={15} strokeWidth={2.4} />
      </span>
      <span className="min-w-0 flex-1">{texto}</span>
    </li>
  );
}


export function SettingsView() {
  const { user, capabilities } = useSession();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const router = useRouter();

  const logout = async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    router.replace("/login");
    router.refresh();
  };

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
    <div className="animate-in mx-auto max-w-3xl space-y-5">
      <header className="mb-2">
        <p className="eyebrow">Tu cuenta</p>
        <h1 className="page-title mt-2">Ajustes</h1>
      </header>

      {/* Perfil */}
      <section className="card flex flex-wrap items-center gap-4 p-5 sm:p-6">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[1.4rem] font-extrabold text-white"
          style={{ background: "var(--brand-grad)" }}
          aria-hidden="true"
        >
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[1.1rem] font-extrabold tracking-tight">{user.name}</p>
          <p className="truncate text-[0.86rem]" style={{ color: "var(--text-muted)" }}>
            {user.email}
          </p>
        </div>
        <button type="button" className="btn btn-secondary w-full sm:w-auto" onClick={logout}>
          <Icon name="logout" size={17} />
          Cerrar sesión
        </button>
      </section>

      <Seccion icon="graduation" title="Cómo quieres estudiar" hint="Se aplica por defecto a los documentos nuevos.">
        <div className="space-y-5">
          <label className="block">
            <span className="label">Nivel educativo</span>
            <select className="input" value={level} onChange={(event) => setLevel(event.target.value)}>
              {LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="label">Estilo de explicación</span>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {STYLE_OPTIONS.map((option) => {
                const elegido = style === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStyle(option.value)}
                    aria-pressed={elegido}
                    className="flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition"
                    style={
                      elegido
                        ? { borderColor: "var(--accent)", background: "var(--accent-softer)", boxShadow: "0 0 0 3px var(--accent-ring)" }
                        : { borderColor: "var(--border-strong)" }
                    }
                  >
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                      style={
                        elegido
                          ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#fff" }
                          : { borderColor: "var(--border-strong)" }
                      }
                    >
                      {elegido ? <Icon name="check" size={12} strokeWidth={3.2} /> : null}
                    </span>
                    <span>
                      <span className="block text-[0.9rem] font-bold">{option.label}</span>
                      <span className="mt-0.5 block text-[0.78rem] leading-snug" style={{ color: "var(--text-muted)" }}>
                        {option.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="label">Nivel de resumen por defecto</span>
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
              <span className="label">Voz preferida</span>
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

          <button type="button" className="btn btn-primary btn-lg w-full sm:w-auto" onClick={save} disabled={saving}>
            <Icon name="check" size={18} strokeWidth={2.4} />
            {saving ? "Guardando…" : "Guardar preferencias"}
          </button>
        </div>
      </Seccion>

      <Seccion icon="palette" title="Apariencia">
        <div className="grid grid-cols-3 gap-2.5">
          {(
            [
              ["light", "Claro", "sun"],
              ["dark", "Oscuro", "moon"],
              ["system", "Automático", "phone"],
            ] as const
          ).map(([value, label, icon]) => {
            const elegido = theme === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={elegido}
                className="flex flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-[0.86rem] font-bold transition"
                style={
                  elegido
                    ? { borderColor: "var(--accent)", background: "var(--accent-softer)", color: "var(--accent)", boxShadow: "0 0 0 3px var(--accent-ring)" }
                    : { borderColor: "var(--border-strong)", color: "var(--text-soft)" }
                }
              >
                <Icon name={icon} size={22} />
                {label}
              </button>
            );
          })}
        </div>
      </Seccion>

      <Seccion icon="phone" title="Aplicación" hint="Instálala y ábrela desde la pantalla de inicio, como cualquier app.">
        {installable ? (
          <button
            type="button"
            className="btn btn-primary w-full sm:w-auto"
            onClick={async () => {
              const event = installable as Event & { prompt?: () => Promise<void> };
              await event.prompt?.();
              setInstallable(null);
            }}
          >
            <Icon name="download" size={17} />
            Instalar aplicación
          </button>
        ) : (
          <p className="rounded-xl px-4 py-3 text-[0.86rem] leading-relaxed" style={{ background: "var(--bg-sunken)", color: "var(--text-soft)" }}>
            En iPhone: pulsa <strong>Compartir</strong> y elige <strong>«Añadir a pantalla de inicio»</strong>.
          </p>
        )}
      </Seccion>

      <section>
        <h2 className="eyebrow mb-2.5 px-1">Estado</h2>
        <ul className="list-group">
          <Estado
            ok={capabilities.aiEnabled}
            texto={capabilities.aiEnabled ? "Resúmenes y esquemas con IA" : "Resúmenes sin IA (con las palabras del PDF)"}
          />
          <Estado
            ok={capabilities.serverTts}
            texto={capabilities.serverTts ? "Audio con voz del servidor" : "Audio con la voz de tu dispositivo"}
          />
          <li className="flex items-center gap-3 px-4 py-3.5 text-[0.88rem]" style={{ color: "var(--text-soft)" }}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--bg-sunken)" }}>
              <Icon name="file" size={15} />
            </span>
            Hasta {capabilities.maxUploadMb} MB y {capabilities.maxPages} páginas por PDF
          </li>
        </ul>
      </section>

      <p className="pt-2 text-center text-[0.76rem]" style={{ color: "var(--text-muted)" }}>
        alicIA · versión {process.env.NEXT_PUBLIC_APP_VERSION ?? "local"}
      </p>
    </div>
  );
}
