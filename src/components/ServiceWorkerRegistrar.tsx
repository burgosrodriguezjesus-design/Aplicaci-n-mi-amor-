"use client";

import { useEffect } from "react";
import { hayTrabajoEnCurso } from "@/lib/client/ocupado";

const MI_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "local";
const CADA = 10 * 60 * 1000;

/**
 * Registra el service worker que permite instalar la aplicación (PWA) y la
 * mantiene al día.
 *
 * Una aplicación instalada en el móvil casi nunca se cierra del todo: al
 * volver a ella sigue el código de la vez anterior, aunque se haya publicado
 * un arreglo. Por eso, al volver a primer plano (y cada rato), pregunta qué
 * versión está publicada y, si no es la suya, se recarga sola.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;

    let registro: ServiceWorkerRegistration | undefined;
    const register = () => {
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          registro = reg;
        })
        .catch(() => {
          /* la aplicación funciona igual sin service worker */
        });
    };

    const comprobarVersion = async () => {
      if (MI_VERSION === "local" || document.visibilityState !== "visible") return;
      if (hayTrabajoEnCurso()) return;
      try {
        const respuesta = await fetch("/api/version", { cache: "no-store" });
        if (!respuesta.ok) return;
        const { version } = (await respuesta.json()) as { version?: string };
        if (!version || version === "local" || version === MI_VERSION) return;

        // Una sola recarga por versión: si algo impide ponerse al día, no se
        // queda recargando sin parar.
        const clave = "estudia-recarga-" + version;
        try {
          if (sessionStorage.getItem(clave)) return;
          sessionStorage.setItem(clave, "1");
        } catch {
          /* sin almacenamiento de sesión: se recarga igual, una vez */
        }
        await registro?.update().catch(() => undefined);
        if (!hayTrabajoEnCurso()) window.location.reload();
      } catch {
        /* sin conexión: ya se comprobará */
      }
    };

    const alVolver = () => {
      if (document.visibilityState === "visible") void comprobarVersion();
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    const temporizador = window.setInterval(() => void comprobarVersion(), CADA);
    void comprobarVersion();

    return () => {
      window.removeEventListener("load", register);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      window.clearInterval(temporizador);
    };
  }, []);

  return null;
}
