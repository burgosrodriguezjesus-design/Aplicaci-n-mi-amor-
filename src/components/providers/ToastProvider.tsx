"use client";

import { Icon } from "@/components/ui/Icon";
import { createContext, useCallback, useContext, useState } from "react";

type Toast = {
  id: number;
  title: string;
  description?: string;
  variant: "info" | "success" | "error";
};

const ToastContext = createContext<{
  toast: (toast: Omit<Toast, "id" | "variant"> & { variant?: Toast["variant"] }) => void;
}>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback<
    (t: Omit<Toast, "id" | "variant"> & { variant?: Toast["variant"] }) => void
  >((input) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, variant: "info", ...input }]);
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 5200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[100] flex flex-col items-center gap-2 px-4 sm:left-auto sm:right-4 sm:items-end"
        role="status"
        aria-live="polite"
      >
        {toasts.map((item) => {
          const color =
            item.variant === "error" ? "var(--danger)" : item.variant === "success" ? "var(--success)" : "var(--accent)";
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setToasts((current) => current.filter((t) => t.id !== item.id))}
              title="Cerrar"
              className="animate-in card pointer-events-auto flex w-full max-w-sm items-start gap-3 px-4 py-3 text-left"
              style={{ boxShadow: "var(--shadow-lg)", borderColor: `color-mix(in srgb, ${color} 35%, var(--border))` }}
            >
              <span className="mt-0.5 shrink-0" style={{ color }}>
                <Icon
                  name={item.variant === "error" ? "warning" : item.variant === "success" ? "checkCircle" : "info"}
                  size={19}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9rem] font-bold" style={{ color: "var(--text)" }}>
                  {item.title}
                </span>
                {item.description ? (
                  <span className="mt-0.5 block text-[0.8rem]" style={{ color: "var(--text-muted)" }}>
                    {item.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
