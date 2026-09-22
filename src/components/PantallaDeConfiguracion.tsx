/**
 * Lo que se ve cuando la aplicacion esta publicada pero le falta la base de
 * datos: los pasos que quedan, en orden, y por que.
 *
 * Es preferible esto a una pantalla de error: quien acaba de publicarla no
 * tiene por que saber que un mensaje de Prisma significa "crea la base de
 * datos en Storage".
 */
const PASOS = [
  {
    titulo: "Abre el panel de tu proyecto en Vercel",
    detalle:
      "Es la página donde ves los despliegues. Arriba hay varias pestañas: Project, Deployments, Analytics, Storage, Settings.",
  },
  {
    titulo: "Entra en la pestaña «Storage»",
    detalle: "Si no la ves, despliega el menú de las pestañas: en el móvil van apretadas.",
  },
  {
    titulo: "Pulsa «Create Database» y elige «Postgres»",
    detalle:
      "Te pedirá un nombre (vale cualquiera) y una región: elige la más cercana a ti. Acepta y espera unos segundos.",
  },
  {
    titulo: "Vuelve a «Deployments» y pulsa «Redeploy»",
    detalle:
      "Está en el menú de tres puntos del último despliegue. Tarda un par de minutos. No hace falta que copies ninguna clave: Vercel conecta la base de datos sola.",
  },
];

export function PantallaDeConfiguracion({ motivo }: { motivo?: string }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <span className="chip">Falta un paso</span>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">
        Ya está publicada. Solo falta la base de datos.
      </h1>
      <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--text-soft)" }}>
        Es donde se guardan tu cuenta, tus documentos y tu progreso. Sin ella la
        aplicación no puede recordar nada. Se crea desde el propio panel de
        Vercel y no hay que copiar ninguna clave.
      </p>

      <ol className="mt-8 grid gap-3">
        {PASOS.map((paso, indice) => (
          <li key={paso.titulo} className="card flex gap-4 p-5">
            <span
              className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-sm font-bold"
              style={{ background: "var(--accent)", color: "var(--accent-text)" }}
            >
              {indice + 1}
            </span>
            <div>
              <h2 className="text-base font-semibold">{paso.titulo}</h2>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-soft)" }}>
                {paso.detalle}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-sm leading-relaxed" style={{ color: "var(--text-soft)" }}>
        Cuando termine, recarga esta página. Si quieres comprobarlo antes, abre{" "}
        <code
          className="rounded px-1.5 py-0.5 text-[0.85em]"
          style={{ background: "var(--surface-hover)" }}
        >
          /api/health
        </code>{" "}
        en esta misma dirección: te dirá si la base de datos ya responde.
      </p>

      {motivo ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm" style={{ color: "var(--text-muted)" }}>
            Detalle técnico
          </summary>
          <pre
            className="mt-2 overflow-auto rounded-xl p-3 text-xs"
            style={{ background: "var(--surface-hover)", color: "var(--text-soft)" }}
          >
            {motivo}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
