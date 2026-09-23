/**
 * Lo que se ve cuando la aplicacion esta publicada pero le falta la base de
 * datos: lo que pasa, por que, y como salir de ello.
 *
 * Hay dos situaciones muy distintas y confundirlas cuesta mucho tiempo:
 *  · no se ve ninguna variable de base de datos → falta conectarla;
 *  · se ven, pero la conexion falla → ya existe, hay que volver a desplegar.
 *
 * Ensena tambien que version esta corriendo, porque la pregunta que mas
 * tiempo hace perder es "¿esto es el arreglo nuevo o el despliegue de antes?".
 */

const CONECTAR = [
  {
    titulo: "Comprueba que la base de datos está conectada a ESTE proyecto",
    detalle:
      "En Vercel, pestaña «Storage». Si ves tu base de datos ahí, ábrela y mira que en «Connected Projects» aparezca tu proyecto. Crear la base de datos y conectarla son dos cosas distintas: se puede tener creada y sin conectar.",
  },
  {
    titulo: "Si no está conectada, conéctala",
    detalle:
      "Dentro de la base de datos, pulsa «Connect Project» y elige tu proyecto. Marca los tres entornos si te los ofrece: Production, Preview y Development.",
  },
  {
    titulo: "Vuelve a desplegar",
    detalle:
      "Pestaña «Deployments» → los tres puntos (…) del primero → «Redeploy». Si te ofrece «Use existing Build Cache», DESMÁRCALO.",
  },
];

const A_MANO = [
  {
    titulo: "Copia la cadena de conexión",
    detalle:
      "En Vercel → «Storage» → tu base de datos, busca «Connection String» (o entra en console.neon.tech, tu proyecto, «Connection string»). Copia la que empieza por «postgresql://». Cópiala entera.",
  },
  {
    titulo: "Pégala como variable del proyecto",
    detalle:
      "Vercel → tu proyecto → «Settings» → «Environment Variables». Nombre: DATABASE_URL. Valor: lo que has copiado. Marca los tres entornos (Production, Preview, Development) y guarda.",
  },
  {
    titulo: "Vuelve a desplegar",
    detalle:
      "«Deployments» → tres puntos (…) → «Redeploy», sin caché. Esto funciona siempre, aunque la conexión automática falle.",
  },
];

function Pasos({ pasos, desde = 1 }: { pasos: typeof CONECTAR; desde?: number }) {
  return (
    <ol className="mt-4 grid gap-3">
      {pasos.map((paso, indice) => (
        <li key={paso.titulo} className="card flex gap-4 p-5">
          <span
            className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-sm font-bold"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            {desde + indice}
          </span>
          <div>
            <h3 className="text-base font-semibold">{paso.titulo}</h3>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-soft)" }}>
              {paso.detalle}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PantallaDeConfiguracion({
  motivo,
  tipo = "sin-base",
  variables = [],
  version = "",
}: {
  motivo?: string;
  tipo?: "sin-base" | "error";
  variables?: string[];
  version?: string;
}) {
  const hayBase = tipo === "error";

  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <span className="chip">{hayBase ? "Casi" : "Falta conectar la base de datos"}</span>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight">
        {hayBase
          ? "La base de datos está puesta, pero todavía no responde."
          : "La aplicación no ve ninguna base de datos."}
      </h1>

      {hayBase ? (
        <>
          <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--text-soft)" }}>
            Vercel ya ha conectado la base de datos ({variables.join(", ")}), así que
            no tienes que crear otra. Falta volver a construir la aplicación para que
            la use: <strong>Deployments → los tres puntos del último → Redeploy</strong>,
            y <strong>desmarca «Use existing Build Cache»</strong> si te lo ofrece.
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
        </>
      ) : (
        <>
          <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--text-soft)" }}>
            Puede que la hayas creado y que aun así no esté conectada a este proyecto:
            son dos cosas distintas. Esto es lo que hay que mirar.
          </p>

          <h2 className="mt-8 text-lg font-semibold">Lo normal</h2>
          <Pasos pasos={CONECTAR} />

          <h2 className="mt-10 text-lg font-semibold">Si eso no lo arregla</h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-soft)" }}>
            Este camino funciona siempre, porque no depende de que la conexión
            automática haya ido bien.
          </p>
          <Pasos pasos={A_MANO} desde={1} />
        </>
      )}

      <div
        className="mt-10 rounded-xl p-4 text-sm leading-relaxed"
        style={{ background: "var(--surface-hover)", color: "var(--text-soft)" }}
      >
        <p className="m-0">
          <strong>Diagnóstico.</strong> Variables de base de datos que ve la
          aplicación: <strong>{variables.length ? variables.join(", ") : "ninguna"}</strong>.
          {version ? (
            <>
              {" "}
              Versión publicada: <code>{version}</code>.
            </>
          ) : null}
        </p>
        <p className="mt-2 mb-0">
          Añade <code>/api/health</code> a esta dirección para verlo en detalle.
        </p>
      </div>
    </div>
  );
}
