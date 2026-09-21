"use client";

/** Conjunto de iconos en línea: sin dependencias, trazo coherente. */

const PATHS: Record<string, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M9.5 20v-6h5v6" />,
  library: (
    <>
      <path d="M4 4h5v16H4zM11 4h4v16h-4z" />
      <path d="m17.5 5.2 3 15.3" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 7.2l1.9 1.1M17.9 15.7l1.9 1.1M4.2 16.8l1.9-1.1M17.9 8.3l1.9-1.1" />
    </>
  ),
  play: <path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6.5" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.5" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  back10: (
    <>
      <path d="M12 5a7 7 0 1 1-6.8 8.6" />
      <path d="M12 5 8.5 2M12 5 8.5 8" />
    </>
  ),
  forward10: (
    <>
      <path d="M12 5a7 7 0 1 0 6.8 8.6" />
      <path d="m12 5 3.5-3M12 5l3.5 3" />
    </>
  ),
  prev: (
    <>
      <path d="M18 5v14L8 12z" fill="currentColor" stroke="none" />
      <path d="M6 5v14" />
    </>
  ),
  next: (
    <>
      <path d="M6 5v14l10-7z" fill="currentColor" stroke="none" />
      <path d="M18 5v14" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l.9 12.2a1.8 1.8 0 0 0 1.8 1.6h5.6a1.8 1.8 0 0 0 1.8-1.6L17.5 7" />
    </>
  ),
  sparkles: (
    <path d="M12 3.5 13.6 9l5.4 1.6L13.6 12l-1.6 5.4L10.4 12 5 10.6 10.4 9zM18.5 3v3M20 4.5h-3M6 17v2.5M7.2 18.2H4.8" />
  ),
  book: (
    <>
      <path d="M4.5 5.2A1.7 1.7 0 0 1 6.2 3.5H19v14.3H6.2a1.7 1.7 0 0 0-1.7 1.7z" />
      <path d="M4.5 19.5A1.7 1.7 0 0 1 6.2 17.8H19v2.7H6.2a1.7 1.7 0 0 1-1.7-1z" />
    </>
  ),
  brain: (
    <>
      <path d="M9.5 4.5A2.5 2.5 0 0 0 7 7a2.4 2.4 0 0 0-1.8 4 2.5 2.5 0 0 0 .6 4.3A2.5 2.5 0 0 0 9.5 19.5V4.5z" />
      <path d="M14.5 4.5A2.5 2.5 0 0 1 17 7a2.4 2.4 0 0 1 1.8 4 2.5 2.5 0 0 1-.6 4.3 2.5 2.5 0 0 1-3.7 4.2V4.5z" />
    </>
  ),
  headphones: (
    <>
      <path d="M4.5 14v-1.5a7.5 7.5 0 0 1 15 0V14" />
      <rect x="3" y="13.5" width="4" height="6.5" rx="1.8" />
      <rect x="17" y="13.5" width="4" height="6.5" rx="1.8" />
    </>
  ),
  file: (
    <>
      <path d="M13.5 3H7.2A1.7 1.7 0 0 0 5.5 4.7v14.6A1.7 1.7 0 0 0 7.2 21h9.6a1.7 1.7 0 0 0 1.7-1.7V8z" />
      <path d="M13.5 3v5h5" />
    </>
  ),
  chevronDown: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  chevronRight: <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />,
  chevronLeft: <path d="M14.5 6.5 9 12l5.5 5.5" />,
  chevronUp: <path d="m6.5 14.5 5.5-5.5 5.5 5.5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.5h-4.5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4.5 2.8 20h18.4z" />
      <path d="M12 10v4.5M12 17.3v.2" />
    </>
  ),
  logout: (
    <>
      <path d="M15 8V5.8A1.8 1.8 0 0 0 13.2 4H5.8A1.8 1.8 0 0 0 4 5.8v12.4A1.8 1.8 0 0 0 5.8 20h7.4a1.8 1.8 0 0 0 1.8-1.8V16" />
      <path d="M10 12h10m0 0-3.2-3.2M20 12l-3.2 3.2" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5" />,
  collapse: <path d="M9 4v5H4M15 20v-5h5M20 9h-5V4M4 15h5v5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.2 2" />
    </>
  ),
  folder: (
    <path d="M3.5 6.8A1.8 1.8 0 0 1 5.3 5h3.4l2 2.4h8A1.8 1.8 0 0 1 20.5 9.2v8A1.8 1.8 0 0 1 18.7 19H5.3a1.8 1.8 0 0 1-1.8-1.8z" />
  ),
  flame: (
    <path d="M12 3s5 4 5 8.5a5 5 0 0 1-10 0C7 9 9 7.5 9 7.5s.5 2 1.5 2.5C11 8 12 6 12 3z" />
  ),
  wand: (
    <>
      <path d="m5 19 9.5-9.5M13.2 6.3l4.5 4.5" />
      <path d="M17 3.5v2.2M20.5 5.5h-2.2M19.5 9.5h2M15.8 13.2l1.4 1.4" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  className,
  strokeWidth = 1.7,
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name] ?? null}
    </svg>
  );
}
