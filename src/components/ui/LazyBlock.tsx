"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renderiza su contenido solo cuando se acerca a la pantalla.
 *
 * Un temario completo puede tener decenas de apartados largos; pintarlos todos
 * de golpe bloquearía el navegador durante segundos. Se reserva la altura
 * estimada para que la barra de desplazamiento no dé saltos.
 */
export function LazyBlock({
  minHeight,
  children,
}: {
  minHeight: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const element = ref.current;
    if (!element) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref} style={visible ? undefined : { minHeight }}>
      {visible ? (
        children
      ) : (
        <div className="space-y-2.5 py-2" aria-hidden="true">
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-4/5" />
        </div>
      )}
    </div>
  );
}
