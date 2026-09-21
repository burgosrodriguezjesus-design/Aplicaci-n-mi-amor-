"use client";

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
        className="fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 sm:left-auto sm:right-4 sm:items-end"
        role="status"
        aria-live="polite"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className="animate-in card w-full max-w-sm px-4 py-3"
            style={{
              boxShadow: "var(--shadow-lg)",
              borderColor:
                item.variant === "error"
                  ? "color-mix(in srgb, var(--danger) 40%, transparent)"
                  : item.variant === "success"
                    ? "color-mix(in srgb, var(--success) 40%, transparent)"
                    : "var(--border-strong)",
            }}
          >
            <p
              className="text-sm font-semibold"
              style={{
                color:
                  item.variant === "error"
                    ? "var(--danger)"
                    : item.variant === "success"
                      ? "var(--success)"
                      : "var(--text)",
              }}
            >
              {item.title}
            </p>
            {item.description ? (
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {item.description}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
