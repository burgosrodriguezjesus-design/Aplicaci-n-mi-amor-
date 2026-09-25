import Link from "next/link";
import { useId } from "react";

/** La marca: el icono (degradado, la "a" y el destello de la IA). */
export function LogoMark({ size = 34 }: { size?: number }) {
  // Un id propio por logo: si dos logos comparten id y el primero está
  // oculto (la barra lateral en el móvil), el degradado no se pinta.
  const id = `alicia-logo-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6a5cff" />
          <stop offset="0.52" stopColor="#9b5cf6" />
          <stop offset="1" stopColor="#e26ba8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      <circle cx="28" cy="36" r="9.5" fill="none" stroke="#fff" strokeWidth="6.5" />
      <rect x="37.2" y="23" width="6.6" height="23" rx="3.3" fill="#fff" />
      <path
        d="M47.5 9.5c.7 3.4 2.1 4.8 5.5 5.5-3.4.7-4.8 2.1-5.5 5.5-.7-3.4-2.1-4.8-5.5-5.5 3.4-.7 4.8-2.1 5.5-5.5z"
        fill="#fff"
      />
    </svg>
  );
}

/** El nombre, con "IA" en el degradado de la marca. */
export function LogoWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`text-[1.12rem] font-extrabold tracking-[-0.03em] ${className}`}>
      alic<span className="text-gradient">IA</span>
    </span>
  );
}

export function Logo({ href = "/inicio", size = 34 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="alicIA, ir al inicio">
      <LogoMark size={size} />
      <LogoWordmark />
    </Link>
  );
}
