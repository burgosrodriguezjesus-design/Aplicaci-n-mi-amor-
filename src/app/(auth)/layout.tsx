import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { LogoMark, LogoWordmark } from "@/components/ui/Logo";

const VENTAJAS = [
  { icon: "book", texto: "Resúmenes claros, con las definiciones y fórmulas destacadas" },
  { icon: "outline", texto: "Esquemas para ver todo el tema de un vistazo" },
  { icon: "headphones", texto: "Escucha tus apuntes mientras caminas o entrenas" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-aurora grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Panel de marca (escritorio) */}
      <aside className="relative hidden p-4 lg:block">
        <div className="card-brand flex h-full flex-col justify-between !rounded-[1.75rem] p-10 xl:p-12">
          <Link href="/" className="flex items-center gap-3" aria-label="alicIA, portada">
            <span className="rounded-[0.9rem] bg-white/15 p-1">
              <LogoMark size={36} />
            </span>
            <span className="text-[1.3rem] font-extrabold tracking-tight">alicIA</span>
          </Link>

          <div className="max-w-md">
            <h2 className="text-[2.35rem] font-extrabold leading-[1.08] tracking-[-0.035em] xl:text-[2.7rem]">
              Estudia menos rato. Entiende mucho más.
            </h2>
            <ul className="mt-8 space-y-4">
              {VENTAJAS.map((ventaja) => (
                <li key={ventaja.texto} className="flex items-center gap-3.5 text-[0.98rem] text-white/90">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                    <Icon name={ventaja.icon} size={19} />
                  </span>
                  {ventaja.texto}
                </li>
              ))}
            </ul>
          </div>

          {/* Vista previa de un resumen */}
          <div className="animate-float rounded-2xl bg-white/95 p-5 text-[#15141c] shadow-2xl">
            <p className="eyebrow !text-[#8a879b]">Unidad 4 · pág. 2</p>
            <p className="mt-1.5 text-[1rem] font-extrabold tracking-tight">1. Concepto y naturaleza del IVA</p>
            <p className="mt-2 font-serif text-[0.92rem] leading-relaxed text-[#4a4859]">
              El <strong className="text-[#15141c]">impuesto sobre el valor añadido</strong> es un tributo indirecto
              que grava el consumo de bienes y servicios.
            </p>
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#e5f6ee] px-3 py-2 text-[0.8rem] text-[#15141c]">
              <Icon name="lightbulb" size={15} className="mt-0.5 shrink-0 text-[#16865a]" />
              <span>
                <strong className="text-[#16865a]">Recuerda:</strong> el IVA repercutido es el que la empresa cobra.
              </span>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[26rem]">
          <Link href="/" className="mb-8 flex items-center justify-center gap-2.5 lg:hidden" aria-label="alicIA, portada">
            <LogoMark size={40} />
            <LogoWordmark className="!text-[1.4rem]" />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
