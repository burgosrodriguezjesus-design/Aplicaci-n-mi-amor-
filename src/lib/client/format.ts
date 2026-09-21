/** Formateadores de la interfaz (siempre en castellano). */

export function formatBytes(bytes: number) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function formatLongDuration(totalSeconds: number) {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

const RELATIVE = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

export function formatRelative(date: string | Date) {
  const value = typeof date === "string" ? new Date(date) : date;
  const diff = (value.getTime() - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, seconds] of units) {
    if (Math.abs(diff) >= seconds) {
      return RELATIVE.format(Math.round(diff / seconds), unit);
    }
  }
  return "ahora mismo";
}

export function formatDate(date: string | Date) {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 6) return "Buenas noches";
  if (hour < 14) return "Buenos días";
  if (hour < 21) return "Buenas tardes";
  return "Buenas noches";
}

export const DEPTH_OPTIONS = [
  { value: "RAPIDO", label: "Rápido", hint: "Lo esencial, sin perder definiciones" },
  { value: "NORMAL", label: "Normal", hint: "Equilibrio entre extensión y detalle" },
  { value: "DETALLADO", label: "Detallado", hint: "Conserva ejemplos y matices" },
  {
    value: "MUY_DETALLADO",
    label: "Muy detallado",
    hint: "Conserva prácticamente toda la información",
  },
] as const;

export const LEVEL_OPTIONS = [
  { value: "ESO", label: "ESO" },
  { value: "BACHILLERATO", label: "Bachillerato" },
  { value: "FP", label: "FP" },
  { value: "UNIVERSIDAD", label: "Universidad" },
  { value: "OTRO", label: "Otro" },
] as const;

export const STYLE_OPTIONS = [
  { value: "CERO", label: "Desde cero", hint: "Explícamelo como si empezara de cero" },
  { value: "NORMAL", label: "Nivel normal", hint: "Explicación estándar" },
  { value: "AVANZADO", label: "Nivel avanzado", hint: "Al grano y con terminología" },
] as const;

export const STATUS_COPY: Record<string, string> = {
  UPLOADED: "Subiendo PDF…",
  EXTRACTING: "Extrayendo contenido…",
  ANALYZING: "Analizando páginas…",
  SUMMARIZING: "Creando resumen…",
  OUTLINING: "Creando esquema…",
  NARRATING: "Preparando audio…",
  READY: "¡Tu material está listo!",
  FAILED: "No hemos podido procesarlo",
};
