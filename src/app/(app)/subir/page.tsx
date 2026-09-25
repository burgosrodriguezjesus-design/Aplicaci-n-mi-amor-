import type { Metadata } from "next";
import { UploadZone } from "@/components/library/UploadZone";

export const metadata: Metadata = { title: "Subir PDF" };

export default function UploadPage() {
  return (
    <div className="animate-in mx-auto max-w-3xl space-y-7">
      <header>
        <p className="eyebrow">Nuevo documento</p>
        <h1 className="page-title mt-2">Sube tu PDF</h1>
        <p className="page-subtitle">
          Apuntes, temario, un capítulo de un libro… lo analizamos y te devolvemos resumen, esquema y
          audio.
        </p>
      </header>
      <UploadZone />
    </div>
  );
}
