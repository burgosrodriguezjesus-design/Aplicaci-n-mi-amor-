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

  return (
    <div className="animate-in">
      <div className="mb-6 text-center">
        <span
          className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-bold"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          E
        </span>
        <h1 className="text-xl font-semibold tracking-tight">
          {isRegister ? "Crea tu cuenta" : "Bienvenido de nuevo"}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {isRegister
            ? "Tu progreso se guardará y se sincronizará entre dispositivos."
            : "Entra para seguir estudiando donde lo dejaste."}
        </p>
      </div>

      <form onSubmit={submit} className="card space-y-3 p-5">
        {isRegister ? (
          <label className="block">
            <span className="mb-1.5 block text-[0.78rem] font-medium">Nombre</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Tu nombre"
              autoComplete="name"
              required
              minLength={2}
            />
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-[0.78rem] font-medium">Correo electrónico</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tucorreo@ejemplo.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[0.78rem] font-medium">Contraseña</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isRegister ? "Mínimo 8 caracteres" : "Tu contraseña"}
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
            minLength={isRegister ? 8 : 1}
          />
        </label>

        {isRegister ? (
          <label className="block">
            <span className="mb-1.5 block text-[0.78rem] font-medium">Nivel educativo</span>
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
            className="flex items-start gap-2 rounded-[0.7rem] px-3 py-2 text-[0.82rem]"
            style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          >
            <Icon name="warning" size={15} />
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary w-full" disabled={loading}>
          {loading ? "Un momento…" : isRegister ? "Crear cuenta" : "Entrar"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        {isRegister ? "¿Ya tienes cuenta? " : "¿Aún no tienes cuenta? "}
        <Link
          href={isRegister ? "/login" : "/registro"}
          className="font-medium"
          style={{ color: "var(--accent)" }}
        >
          {isRegister ? "Entrar" : "Crear una"}
        </Link>
      </p>
    </div>
  );
}
