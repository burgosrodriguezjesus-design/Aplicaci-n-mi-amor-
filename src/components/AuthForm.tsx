"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { LEVEL_OPTIONS } from "@/lib/client/format";
import { Icon } from "./ui/Icon";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isRegister = mode === "register";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [level, setLevel] = useState("UNIVERSIDAD");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isRegister) {
        await api.post("/api/auth/register", {
          name,
          email,
          password,
          educationLevel: level,
        });
      } else {
        await api.post("/api/auth/login", { email, password });
      }
      router.replace("/inicio");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No hemos podido completar la operación. Inténtalo de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  };

  const [verClave, setVerClave] = useState(false);

  return (
    <div className="animate-in">
      <div className="mb-7 text-center lg:text-left">
        <h1 className="text-[1.75rem] font-extrabold tracking-[-0.03em]">
          {isRegister ? "Crea tu cuenta" : "Hola de nuevo"}
        </h1>
        <p className="mt-1.5 text-[0.95rem]" style={{ color: "var(--text-muted)" }}>
          {isRegister
            ? "Gratis. Tu progreso se guarda y se sincroniza entre dispositivos."
            : "Entra para seguir estudiando donde lo dejaste."}
        </p>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-5 sm:p-7" style={{ boxShadow: "var(--shadow-md)" }}>
        {isRegister ? (
          <label className="block">
            <span className="label">Nombre</span>
            <span className="relative block">
              <Icon name="user" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                className="input !pl-11"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Tu nombre"
                autoComplete="name"
                required
                minLength={2}
              />
            </span>
          </label>
        ) : null}

        <label className="block">
          <span className="label">Correo electrónico</span>
          <span className="relative block">
            <Icon name="mail" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              className="input !pl-11"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tucorreo@ejemplo.com"
              autoComplete="email"
              required
            />
          </span>
        </label>

        <label className="block">
          <span className="label">Contraseña</span>
          <span className="relative block">
            <Icon name="lock" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              className="input !pl-11 !pr-12"
              type={verClave ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isRegister ? "Mínimo 8 caracteres" : "Tu contraseña"}
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              minLength={isRegister ? 8 : 1}
            />
            <button
              type="button"
              className="btn btn-ghost btn-icon absolute right-1 top-1/2 !min-h-9 !min-w-9 -translate-y-1/2"
              onClick={() => setVerClave((actual) => !actual)}
              aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
              title={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              <Icon name="eye" size={18} />
            </button>
          </span>
        </label>

        {isRegister ? (
          <label className="block">
            <span className="label">Nivel educativo</span>
            <select
              className="input"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            >
              {LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? (
          <p
            className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[0.86rem] font-medium"
            style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          >
            <Icon name="warning" size={17} className="mt-px shrink-0" />
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
          {loading ? "Un momento…" : isRegister ? "Crear cuenta" : "Entrar"}
          {!loading ? <Icon name="arrowRight" size={19} /> : null}
        </button>
      </form>

      <p className="mt-6 text-center text-[0.92rem]" style={{ color: "var(--text-muted)" }}>
        {isRegister ? "¿Ya tienes cuenta? " : "¿Aún no tienes cuenta? "}
        <Link
          href={isRegister ? "/login" : "/registro"}
          className="font-bold underline-offset-4 hover:underline"
          style={{ color: "var(--accent)" }}
        >
          {isRegister ? "Entrar" : "Crea una gratis"}
        </Link>
      </p>
    </div>
  );
}
