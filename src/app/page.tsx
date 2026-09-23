import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { publicCapabilities } from "@/lib/env";
import { loQueFalta } from "@/lib/setup";
import { PantallaDeConfiguracion } from "@/components/PantallaDeConfiguracion";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    emoji: "📚",
    title: "Resumen completo",
    text: "Convierte 50 páginas de apuntes en unos apuntes mucho más fáciles de estudiar, sin perder definiciones, fórmulas ni datos.",
  },
  {
    emoji: "🧠",
    title: "Esquema de estudio",
    text: "Un árbol jerárquico que te deja ver todo el tema de un vistazo, con conceptos clave y fórmulas destacadas.",
  },
  {
    emoji: "🎧",
    title: "Modo audiolibro",
    text: "Escucha tu temario mientras caminas o entrenas. Las fórmulas se narran en lenguaje natural, no como símbolos sueltos.",
  },
];

export default async function LandingPage() {
  // Recién publicada puede faltar la base de datos: mejor explicarlo que
  // enseñar una pantalla de error que no dice qué hacer.
  const pendiente = await loQueFalta();
  if (pendiente) {
    return (
      <PantallaDeConfiguracion
        tipo={pendiente.tipo}
        motivo={pendiente.motivo}
        variables={pendiente.variables}
        version={pendiente.version}
      />
    );
  }

  const user = await getCurrentUser();
  if (user) redirect("/inicio");
  const capabilities = publicCapabilities();

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-[0.65rem] text-sm font-bold"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            E
          </span>
          <span className="text-[0.98rem] font-semibold tracking-tight">EstudIA</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn btn-ghost">
            Entrar
          </Link>
          <Link href="/registro" className="btn btn-primary">
            Crear cuenta
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <section className="animate-in py-14 text-center md:py-24">
          <span className="chip mx-auto">Estudia con tus propios PDF</span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl">
            Tus apuntes, convertidos en material de estudio de verdad.
          </h1>
          <p
            className="mx-auto mt-5 max-w-xl text-base leading-relaxed md:text-lg"
            style={{ color: "var(--text-soft)" }}
          >
            Sube un PDF con el temario y obtén automáticamente un resumen completo,
            un esquema jerárquico y un audiolibro. Todo fiel al documento original:
            nada inventado.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/registro" className="btn btn-primary w-full sm:w-auto">
              Empezar gratis
            </Link>
            <Link href="/login" className="btn btn-secondary w-full sm:w-auto">
              Ya tengo cuenta
            </Link>
          </div>
          <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
            Hasta {capabilities.maxUploadMb} MB y {capabilities.maxPages} páginas por documento.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <article
              key={feature.title}
              className="card animate-in p-5"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <span className="text-2xl">{feature.emoji}</span>
              <h2 className="mt-3 text-base font-semibold">{feature.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--text-soft)" }}>
                {feature.text}
              </p>
            </article>
          ))}
        </section>

        <section className="card mt-4 p-6">
          <h2 className="text-base font-semibold">Fidelidad por encima de todo</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-soft)" }}>
            Cada apartado del resumen conserva la referencia a la página del PDF de la
            que procede, y puedes abrirla con un toque. Las explicaciones añadidas para
            entender mejor un concepto aparecen siempre marcadas y separadas del
            contenido original.
          </p>
        </section>
      </main>
    </div>
  );
}
