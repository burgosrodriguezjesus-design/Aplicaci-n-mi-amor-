"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect } from "react";
import { Icon } from "./ui/Icon";
import { Logo } from "./ui/Logo";
import { useTheme } from "./providers/ThemeProvider";
import { PlayerProvider } from "./providers/PlayerProvider";
import { FullPlayer, MiniPlayer } from "./player/Player";
import { InstallPrompt } from "./InstallPrompt";
import { api } from "@/lib/client/api";
import { empujarTrabajo } from "@/lib/client/jobs";
import type { Capabilities, SessionUser } from "@/lib/client/types";

const SessionContext = createContext<{
  user: SessionUser;
  capabilities: Capabilities;
} | null>(null);

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession debe usarse dentro de <AppShell>");
  return context;
}

const NAV = [
  { href: "/inicio", label: "Inicio", icon: "home" },
  { href: "/biblioteca", label: "Biblioteca", icon: "library" },
  { href: "/ajustes", label: "Ajustes", icon: "settings" },
];

function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, resolved, setTheme } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-icon ${className}`}
      onClick={() => setTheme(next)}
      aria-label={next === "dark" ? "Activar modo oscuro" : "Activar modo claro"}
      title={
        theme === "system"
          ? "Siguiendo el sistema"
          : theme === "dark"
            ? "Modo oscuro"
            : "Modo claro"
      }
    >
      <Icon name={resolved === "dark" ? "sun" : "moon"} size={19} />
    </button>
  );
}

/** Círculo con la inicial, en el degradado de la marca. */
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: "var(--brand-grad)", fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AppShell({
  user,
  capabilities,
  children,
}: {
  user: SessionUser;
  capabilities: Capabilities;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // En Vercel no hay nada trabajando entre peticiones: el procesado avanza
  // porque la aplicacion lo va pidiendo. Asi sigue avanzando en cualquier
  // pantalla, no solo en la de subida, y se retoma al volver a la app.
  useEffect(() => {
    const empujar = () => {
      if (document.visibilityState === "visible") void empujarTrabajo();
    };
    empujar();
    const intervalo = window.setInterval(empujar, 15_000);
    document.addEventListener("visibilitychange", empujar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", empujar);
    };
  }, []);

  const isActive = (href: string) =>
    href === "/inicio" ? pathname === href : pathname.startsWith(href);

  const logout = async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    router.replace("/login");
    router.refresh();
  };

  return (
    <SessionContext.Provider value={{ user, capabilities }}>
      <PlayerProvider serverTts={capabilities.serverTts}>
        <div className="flex min-h-dvh">
          {/* Navegación lateral (escritorio) */}
          <aside
            className="sticky top-0 hidden h-dvh w-[17rem] shrink-0 flex-col border-r px-4 pb-4 pt-5 md:flex"
            style={{ background: "var(--bg-elevated)" }}
          >
            <div className="px-2">
              <Logo />
            </div>

            <Link href="/subir" className="btn btn-primary btn-lg mt-7 w-full">
              <Icon name="plus" size={19} strokeWidth={2.4} />
              Subir PDF
            </Link>

            <nav className="mt-7 flex flex-1 flex-col gap-1" aria-label="Principal">
              <p className="eyebrow mb-1.5 px-3">Tu estudio</p>
              {NAV.map((item) => {
                const activo = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={activo ? "page" : undefined}
                    className="group flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.92rem] font-semibold transition"
                    style={
                      activo
                        ? { background: "var(--accent-soft)", color: "var(--accent)" }
                        : { color: "var(--text-soft)" }
                    }
                  >
                    <Icon name={item.icon} size={20} strokeWidth={activo ? 2.1 : 1.8} />
                    <span className={activo ? "" : "group-hover:text-[var(--text)]"}>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="card-soft flex items-center gap-2.5 p-2.5">
              <Avatar name={user.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.86rem] font-bold">{user.name}</p>
                <p className="truncate text-[0.72rem]" style={{ color: "var(--text-muted)" }}>
                  {user.email}
                </p>
              </div>
              <ThemeToggle className="!min-h-9 !min-w-9" />
              <button
                type="button"
                className="btn btn-ghost btn-icon !min-h-9 !min-w-9"
                onClick={logout}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
              >
                <Icon name="logout" size={18} />
              </button>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Barra superior (móvil) */}
            <header
              className="safe-top sticky top-0 z-30 border-b md:hidden"
              style={{ background: "var(--glass)", backdropFilter: "saturate(180%) blur(16px)" }}
            >
              <div className="flex h-14 items-center justify-between px-4">
                <Logo size={30} />
                <div className="flex items-center gap-0.5">
                  <ThemeToggle />
                  <Link
                    href="/ajustes"
                    className="btn btn-ghost btn-icon"
                    aria-label="Ajustes"
                    style={isActive("/ajustes") ? { color: "var(--accent)", background: "var(--accent-soft)" } : undefined}
                  >
                    <Icon name="settings" size={20} />
                  </Link>
                </div>
              </div>
            </header>

            <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-56 pt-6 sm:px-6 md:px-10 md:pb-28 md:pt-10">
              {children}
            </main>
          </div>

          {/* Navegación inferior (móvil): Inicio · Subir · Biblioteca */}
          <nav
            className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t md:hidden"
            style={{ background: "var(--glass)", backdropFilter: "saturate(180%) blur(18px)" }}
            aria-label="Principal"
          >
            <div className="mx-auto grid h-[4.35rem] max-w-md grid-cols-3 items-center px-6">
              {[NAV[0], null, NAV[1]].map((item) =>
                item ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className="flex flex-col items-center gap-1 py-1 text-[0.7rem] font-semibold transition"
                    style={{ color: isActive(item.href) ? "var(--accent)" : "var(--text-muted)" }}
                  >
                    <Icon name={item.icon} size={23} strokeWidth={isActive(item.href) ? 2.2 : 1.8} />
                    {item.label}
                  </Link>
                ) : (
                  <Link
                    key="subir"
                    href="/subir"
                    className="mx-auto -mt-7 flex flex-col items-center gap-1 text-[0.7rem] font-bold"
                    style={{ color: isActive("/subir") ? "var(--accent)" : "var(--text-soft)" }}
                    aria-label="Subir PDF"
                  >
                    <span
                      className="flex h-[3.6rem] w-[3.6rem] items-center justify-center rounded-[1.25rem] text-white transition active:scale-95"
                      style={{
                        background: "var(--brand-grad)",
                        boxShadow: "0 12px 24px -10px rgba(122,80,240,0.85), 0 0 0 5px var(--bg-elevated)",
                      }}
                    >
                      <Icon name="plus" size={28} strokeWidth={2.4} />
                    </span>
                    Subir
                  </Link>
                ),
              )}
            </div>
          </nav>

          <MiniPlayer />
          <FullPlayer />
          <InstallPrompt />
        </div>
      </PlayerProvider>
    </SessionContext.Provider>
  );
}
