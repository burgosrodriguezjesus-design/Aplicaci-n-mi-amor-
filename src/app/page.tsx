import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { publicCapabilities } from "@/lib/env";
import { loQueFalta } from "@/lib/setup";
import { PantallaDeConfiguracion } from "@/components/PantallaDeConfiguracion";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: "book",
    tone: ["#6a5cff", "#9b5cf6"],
    title: "Resumen profesional",
    text: "Tus apuntes convertidos en unos apuntes claros: definiciones en negrita, clasificaciones como listas y fórmulas destacadas.",
  },
  {
    icon: "outline",
    tone: ["#14b8a6", "#3b82f6"],
    title: "Esquema de estudio",
    text: "Todo el tema de un vistazo: unidades, apartados, conceptos y claves para el examen, en un árbol que abres y cierras.",
  },
  {
    icon: "headphones",
    tone: ["#f59e0b", "#f0719b"],
    title: "Modo audiolibro",
    text: "Escucha el temario mientras caminas o entrenas. El texto se resalta a la vez que suena.",
  },
  {
    icon: "scan",
    tone: ["#8b5cf6", "#ec4899"],
    title: "Libros escaneados",
    text: "Lee PDF escaneados de cientos de páginas, y descarta la basura de fotos, gráficos y sellos.",
  },
  {
    icon: "layers",
    tone: ["#0ea5e9", "#6366f1"],
    title: "Teoría, ejemplos y actividades",
    text: "Distingue lo que es temario de los ejemplos, los ejercicios y los pies de foto, y los presenta por separado.",
  },
  {
    icon: "shield",
    tone: ["#10b981", "#14b8a6"],
    title: "Fiel al original",
    text: "Nada inventado: cada apartado enlaza con su página del PDF para comprobarlo con un toque.",
  },
];

const PASOS = [
  { icon: "cloudUpload", title: "Sube tu PDF", text: "Apuntes, temario o un libro entero, aunque esté escaneado." },
  { icon: "sparkles", title: "alicIA lo analiza", text: "Lo lee, lo ordena y separa la teoría de lo demás. Sigue aunque cierres la app." },
  { icon: "graduation", title: "Estudia a tu manera", text: "Lee el resumen, repasa el esquema o escúchalo como un audiolibro." },
];

/** Vista previa de la app, hecha con la propia interfaz (sin imágenes). */
function VistaPrevia() {
  return (
    <div className="relative isolate mx-auto mt-14 max-w-4xl md:mt-20">
      <div
        className="absolute -inset-x-6 -inset-y-8 -z-10 rounded-[3rem] opacity-40 blur-3xl"
        style={{ background: "var(--brand-grad)" }}
        aria-hidden="true"
      />
      <div className="card overflow-hidden !rounded-[1.6rem] text-left" style={{ boxShadow: "var(--shadow-lg)" }}>
        <div className="flex items-center gap-1.5 border-b px-4 py-3" style={{ background: "var(--bg-sunken)" }}>
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-[0.78rem] font-semibold" style={{ color: "var(--text-muted)" }}>
            Unidad 4 · El IVA en la actividad comercial
          </span>
        </div>
        <div className="grid md:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="p-6 sm:p-8">
            <div className="flex gap-5 border-b pb-3 text-[0.86rem] font-bold" style={{ color: "var(--text-muted)" }}>
              <span className="relative" style={{ color: "var(--text)" }}>
                Resumen
                <span className="absolute -bottom-[0.8rem] left-0 right-0 h-[2.5px] rounded-full" style={{ background: "var(--accent)" }} />
              </span>
              <span>Esquema</span>
              <span>Audio</span>
            </div>
            <h3 className="mt-6 text-[1.15rem] font-extrabold tracking-tight">1. Concepto y naturaleza del IVA</h3>
            <p className="mt-3 font-serif text-[1rem] leading-relaxed" style={{ color: "var(--text-soft)" }}>
              El <strong style={{ color: "var(--text)" }}>impuesto sobre el valor añadido (IVA)</strong> es un tributo
              indirecto que grava el consumo de bienes y servicios.
            </p>
            <div className="callout callout-recuerda mt-4 !mb-3">
              <span className="callout-icon mt-0.5">
                <Icon name="lightbulb" size={17} />
              </span>
              <span>
                <span className="callout-label">Recuerda</span>
                El IVA repercutido es el que la empresa cobra en sus ventas.
              </span>
            </div>
            <div className="callout callout-formula !mb-0">
              <span className="callout-icon mt-0.5">
                <Icon name="sigma" size={17} />
              </span>
              <span>
                <span className="callout-label">Fórmula</span>
                <span className="callout-body">Cuota = IVA repercutido − IVA soportado</span>
              </span>
            </div>
          </div>
          <div className="hidden border-l p-5 md:block" style={{ background: "var(--bg-sunken)" }}>
            <p className="eyebrow">Esquema</p>
            <ul className="mt-3 space-y-2.5 text-[0.84rem]">
              {["Concepto y naturaleza", "Tipos impositivos", "Liquidación del impuesto"].map((t, i) => (
                <li key={t} className="flex items-center gap-2.5 font-semibold">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-[0.7rem] font-extrabold text-white"
                    style={{ background: "var(--brand-grad)" }}
                  >
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-5 space-y-2 border-l-2 pl-3 text-[0.8rem]" style={{ color: "var(--text-soft)" }}>
              <p>
                <strong style={{ color: "var(--text)" }}>General:</strong> 21 %
              </p>
              <p>
                <strong style={{ color: "var(--text)" }}>Reducido:</strong> 10 %
              </p>
              <p>
                <strong style={{ color: "var(--text)" }}>Superreducido:</strong> 4 %
              </p>
            </div>
            <div className="mt-5 flex items-center gap-2.5 rounded-xl p-2.5" style={{ background: "var(--surface)" }}>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
                style={{ background: "linear-gradient(135deg,#f59e0b,#f0719b)" }}
              >
                <Icon name="play" size={14} />
              </span>
              <span className="text-[0.76rem] font-semibold">Escuchar · 6 min</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      <header
        className="safe-top sticky top-0 z-30 border-b"
        style={{ background: "var(--glass)", backdropFilter: "saturate(180%) blur(16px)" }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo href="/" />
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link href="/login" className="btn btn-ghost">
              Entrar
            </Link>
            <Link href="/registro" className="btn btn-primary">
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="bg-aurora relative overflow-hidden">
          <div className="bg-grid absolute inset-0" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-14 text-center md:pb-28 md:pt-24">
            <span className="chip chip-accent animate-in mx-auto !px-3 !py-1.5 !text-[0.78rem]">
              <Icon name="sparkles" size={14} />
              Ahora también lee libros escaneados
            </span>
            <h1 className="animate-in mx-auto mt-6 max-w-4xl text-[2.6rem] font-extrabold leading-[1.04] tracking-[-0.045em] sm:text-6xl md:text-7xl">
              Tus apuntes, convertidos en material de estudio{" "}
              <span className="text-gradient">de verdad</span>
            </h1>
            <p
              className="animate-in mx-auto mt-6 max-w-2xl text-[1.05rem] leading-relaxed md:text-[1.2rem]"
              style={{ color: "var(--text-soft)" }}
            >
              Sube un PDF y consigue al momento un resumen claro, un esquema para repasar y un
              audiolibro. Todo fiel al documento original: nada inventado.
            </p>
            <div className="animate-in mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link href="/registro" className="btn btn-brand btn-lg sm:!px-8">
                Empezar gratis
                <Icon name="arrowRight" size={19} />
              </Link>
              <Link href="/login" className="btn btn-secondary btn-lg sm:!px-8">
                Ya tengo cuenta
              </Link>
            </div>
            <div
              className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[0.84rem] font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {["Gratis", `Hasta ${capabilities.maxUploadMb} MB por PDF`, "Funciona en móvil y ordenador"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <Icon name="checkCircle" size={16} className="text-[var(--success)]" />
                  {t}
                </span>
              ))}
            </div>

            <VistaPrevia />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow !text-[var(--accent)]">Cómo funciona</p>
            <h2 className="mt-3 text-[2rem] font-extrabold leading-tight tracking-[-0.035em] md:text-[2.6rem]">
              De PDF a apuntes en tres pasos
            </h2>
          </div>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {PASOS.map((paso, index) => (
              <li key={paso.title} className="card relative p-6">
                <span
                  className="absolute right-5 top-4 text-[3.2rem] font-extrabold leading-none tracking-tighter"
                  style={{ color: "var(--bg-sunken)" }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="icon-tile relative !h-12 !w-12 !rounded-2xl">
                  <Icon name={paso.icon} size={23} />
                </span>
                <h3 className="relative mt-5 text-[1.1rem] font-bold">{paso.title}</h3>
                <p className="relative mt-1.5 text-[0.93rem] leading-relaxed" style={{ color: "var(--text-soft)" }}>
                  {paso.text}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section style={{ background: "var(--bg-elevated)" }} className="border-y">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow !text-[var(--accent)]">Todo lo que necesitas</p>
              <h2 className="mt-3 text-[2rem] font-extrabold leading-tight tracking-[-0.035em] md:text-[2.6rem]">
                Hecho para estudiar de verdad
              </h2>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <article key={feature.title} className="card card-interactive p-6">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-2xl text-white"
                    style={{
                      background: `linear-gradient(135deg, ${feature.tone[0]}, ${feature.tone[1]})`,
                      boxShadow: `0 10px 22px -12px ${feature.tone[0]}`,
                    }}
                  >
                    <Icon name={feature.icon} size={23} />
                  </span>
                  <h3 className="mt-5 text-[1.08rem] font-bold">{feature.title}</h3>
                  <p className="mt-1.5 text-[0.93rem] leading-relaxed" style={{ color: "var(--text-soft)" }}>
                    {feature.text}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <div className="card-brand px-6 py-12 text-center sm:px-12 md:py-16">
            <h2 className="mx-auto max-w-2xl text-[2rem] font-extrabold leading-tight tracking-[-0.035em] md:text-[2.6rem]">
              Tu próximo examen, mucho más fácil
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[1.02rem] leading-relaxed text-white/85">
              Crea tu cuenta gratis y sube tu primer PDF. En unos minutos tendrás tu resumen, tu esquema y tu audio.
            </p>
            <Link href="/registro" className="btn btn-white btn-lg mt-8 sm:!px-8">
              Empezar gratis
              <Icon name="arrowRight" size={19} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div
          className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-[0.84rem] sm:flex-row"
          style={{ color: "var(--text-muted)" }}
        >
          <Logo href="/" size={28} />
          <p>Hecho con cariño para estudiar mejor.</p>
        </div>
      </footer>
    </div>
  );
}
