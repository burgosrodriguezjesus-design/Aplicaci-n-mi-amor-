import type { Metadata } from "next";
import { UploadZone } from "@/components/library/UploadZone";

export const metadata: Metadata = { title: "Subir PDF" };

export default function UploadPage() {
  return (
    <div className="animate-in space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Subir nuevo PDF</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Apuntes, temario, un capítulo de un libro… lo analizamos y te devolvemos
          resumen, esquema y audio.
        </p>
      </header>
      <UploadZone />
    </div>
  );
}
