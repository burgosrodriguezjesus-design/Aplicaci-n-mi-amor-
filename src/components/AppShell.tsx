"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext } from "react";
import { Icon } from "./ui/Icon";
import { useTheme } from "./providers/ThemeProvider";
import { PlayerProvider } from "./providers/PlayerProvider";
import { FullPlayer, MiniPlayer } from "./player/Player";
import { ServiceWorkerRegistrar } from "./ServiceWorkerRegistrar";
import { api } from "@/lib/client/api";
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
  { href: "/subir", label: "Subir PDF", icon: "upload" },
  { href: "/ajustes", label: "Ajustes", icon: "settings" },
];

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/inicio" className="flex items-center gap-2" aria-label="EstudIA, ir al inicio">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-[0.65rem] text-sm font-bold"
        style={{ background: "var(--accent)", color: "var(--accent-text)" }}
      >
        E
      </span>
      {!compact ? (
        <span className="text-[0.98rem] font-semibold tracking-tight">EstudIA</span>
      ) : null}
    </Link>
  );
}

function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="btn btn-ghost !px-2"
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
      <Icon name={resolved === "dark" ? "sun" : "moon"} size={18} />
    </button>
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
            className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r px-3 py-4 md:flex"
            style={{ background: "var(--bg-elevated)" }}
          >
            <div className="px-2">
              <Logo />
            </div>

            <nav className="mt-6 flex flex-1 flex-col gap-0.5">
              {/* En escritorio, "Subir PDF" ya tiene su propio boton destacado. */}
              {NAV.filter((item) => item.href !== "/subir").map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 rounded-[0.7rem] px-2.5 py-2 text-[0.87rem] font-medium transition"
                  style={
                    isActive(item.href)
                      ? { background: "var(--accent-soft)", color: "var(--accent)" }
                      : { color: "var(--text-soft)" }
                  }
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </Link>
              ))}

              <Link
                href="/subir"
                className="btn btn-primary mt-4 w-full"
                style={{ justifyContent: "flex-start" }}
              >
                <Icon name="plus" size={16} />
                Subir nuevo PDF
              </Link>
            </nav>

            <div className="border-t pt-3">
              <div className="flex items-center gap-2 px-1">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ background: "var(--bg-sunken)", color: "var(--text-soft)" }}
                >
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.8rem] font-medium">{user.name}</p>
                  <p className="truncate text-[0.7rem]" style={{ color: "var(--text-muted)" }}>
                    {user.email}
                  </p>
                </div>
                <ThemeToggle />
                <button
                  type="button"
                  className="btn btn-ghost !px-2"
                  onClick={logout}
                  aria-label="Cerrar sesión"
                  title="Cerrar sesión"
                >
                  <Icon name="logout" size={18} />
                </button>
              </div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Barra superior (móvil) */}
            <header
              className="sticky top-0 z-30 flex items-center justify-between border-b px-4 py-2.5 md:hidden"
              style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)", backdropFilter: "blur(10px)" }}
            >
              <Logo />
              <div className="flex items-center">
                <ThemeToggle />
                <button
                  type="button"
                  className="btn btn-ghost !px-2"
                  onClick={logout}
                  aria-label="Cerrar sesión"
                >
                  <Icon name="logout" size={18} />
                </button>
              </div>
            </header>

            <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-40 pt-5 md:px-8 md:pb-28 md:pt-8">
              {children}
            </main>
          </div>

          {/* Navegación inferior (móvil) */}
          <nav
            className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t md:hidden"
            style={{ background: "color-mix(in srgb, var(--bg-elevated) 94%, transparent)", backdropFilter: "blur(12px)" }}
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-0.5 py-2 text-[0.66rem] font-medium transition"
                style={{ color: isActive(item.href) ? "var(--accent)" : "var(--text-muted)" }}
              >
                <Icon name={item.icon} size={20} />
                {item.label}
              </Link>
            ))}
          </nav>

          <MiniPlayer />
          <FullPlayer />
          <ServiceWorkerRegistrar />
        </div>
      </PlayerProvider>
    </SessionContext.Provider>
  );
}
