"use client";

import { useEffect, useState } from "react";
import { Icon } from "./ui/Icon";
import { LogoMark } from "./ui/Logo";

/**
 * Invitacion a instalar alicIA como aplicacion.
 *
 * Hay dos caminos y no se parecen en nada:
 *  - Android y escritorio avisan con `beforeinstallprompt` y basta con un boton.
 *  - iPhone y iPad no avisan de nada: hay que explicarle a la persona donde
 *    tocar (Compartir → Anadir a pantalla de inicio), porque si no, no hay
 *    forma de que lo encuentre.
 *
 * No se ensena si ya esta instalada, ni si la persona la ha descartado.
 */

const DISMISSED_KEY = "estudia-instalar-descartado";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function yaInstalada() {
  if (typeof window === "undefined") return true;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // Safari en iOS no soporta display-mode: standalone hasta versiones recientes.
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

function esIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Un iPad moderno se presenta como Mac: se distingue por el tactil.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function InstallPrompt() {
  const [evento, setEvento] = useState<InstallEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [instrucciones, setInstrucciones] = useState(false);

  useEffect(() => {
    if (yaInstalada()) return;
    try {
      if (localStorage.getItem(DISMISSED_KEY) === "1") return;
    } catch {
      /* sin almacenamiento local se ensena igual */
    }

    if (esIos()) {
      setInstrucciones(true);
      setVisible(true);
      return;
    }

    const alPoder = (event: Event) => {
      event.preventDefault();
      setEvento(event as InstallEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", alPoder);

    const alInstalar = () => setVisible(false);
    window.addEventListener("appinstalled", alInstalar);

    return () => {
      window.removeEventListener("beforeinstallprompt", alPoder);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  if (!visible) return null;

  const descartar = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* da igual: se volvera a ofrecer */
    }
  };

  const instalar = async () => {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    if (outcome === "accepted") setVisible(false);
    else descartar();
  };

  return (
    <div
      className="fixed inset-x-0 z-40 px-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 6.2rem)" }}
      role="complementary"
      aria-label="Instalar alicIA"
    >
      <div
        className="mx-auto flex max-w-xl items-start gap-3.5 rounded-[1.25rem] border p-4 shadow-lg"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <LogoMark size={44} />

        <div className="min-w-0 flex-1">
          <p className="text-[0.98rem] font-bold">Ten alicIA a mano</p>
          {instrucciones ? (
            <p className="mt-0.5 text-[0.82rem]" style={{ color: "var(--text-soft)" }}>
              Toca <strong>Compartir</strong> abajo y luego{" "}
              <strong>Añadir a pantalla de inicio</strong>. Se abrirá como una aplicación,
              a pantalla completa y sin barras del navegador.
            </p>
          ) : (
            <p className="mt-0.5 text-[0.82rem]" style={{ color: "var(--text-soft)" }}>
              Instálala en tu dispositivo: se abre a pantalla completa, arranca más rápido
              y el audio que hayas descargado suena sin conexión.
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap gap-2">
            {!instrucciones ? (
              <button
                type="button"
                onClick={instalar}
                className="btn btn-primary btn-sm"
              >
                <Icon name="download" size={16} />
                Instalar
              </button>
            ) : null}
            <button
              type="button"
              onClick={descartar}
              className="btn btn-ghost btn-sm"
            >
              Ahora no
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={descartar}
          aria-label="Cerrar"
          className="btn btn-ghost btn-icon !min-h-9 !min-w-9 flex-none"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}
