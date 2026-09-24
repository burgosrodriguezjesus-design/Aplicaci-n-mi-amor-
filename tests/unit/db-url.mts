/**
 * Las direcciones de Supabase y Neon se ajustan bien, y las dos copias de la
 * logica (la de la aplicacion y la del paso de construccion) dicen lo mismo.
 *
 *   npx tsx tests/unit/db-url.mts
 */
import * as app from "../../src/lib/db-url";
// @ts-expect-error: modulo JavaScript sin tipos, a proposito.
import * as build from "../../scripts/db-url.mjs";

let fallos = 0;
function comprobar(titulo: string, ok: boolean, detalle?: string) {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo);
  if (!ok) {
    fallos += 1;
    if (detalle) console.log("      " + detalle);
  }
}

const SUPA_TX =
  "postgresql://postgres.abcdefghij:clave@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";
const SUPA_SES =
  "postgresql://postgres.abcdefghij:clave@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";
const SUPA_DIRECTA = "postgresql://postgres:clave@db.abcdefghij.supabase.co:5432/postgres";
const NEON_POOL =
  "postgresql://usuario:clave@ep-rapido-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const NORMAL = "postgresql://estudia@127.0.0.1:5433/estudia";

// ── Supabase, modo transaccion (lo que se pega normalmente)
const appTx = new URL(app.urlParaApp(SUPA_TX));
comprobar("Supabase 6543: se añade pgbouncer=true", appTx.searchParams.get("pgbouncer") === "true");
comprobar("Supabase 6543: una conexión por instancia", appTx.searchParams.get("connection_limit") === "1");
const migTx = new URL(app.urlParaMigrar(SUPA_TX));
comprobar("Supabase 6543: para crear tablas se pasa al 5432", migTx.port === "5432");
comprobar("Supabase 6543: y sin pgbouncer", !migTx.searchParams.has("pgbouncer"));
comprobar("Supabase: se conserva usuario y clave",
  migTx.username === "postgres.abcdefghij" && migTx.password === "clave");

// ── Supabase, modo sesion: ya vale para todo
comprobar("Supabase 5432: no se toca para la app", app.urlParaApp(SUPA_SES) === SUPA_SES);
comprobar("Supabase 5432: no se toca para crear tablas", app.urlParaMigrar(SUPA_SES) === SUPA_SES);

// ── Supabase directa: se reconoce para poder avisar
comprobar("se reconoce la directa de Supabase", app.esDirectaDeSupabase(SUPA_DIRECTA));
comprobar("la de pooler no se confunde con la directa", !app.esDirectaDeSupabase(SUPA_TX));

// ── Neon con pooler
const appNeon = new URL(app.urlParaApp(NEON_POOL));
comprobar("Neon pooler: se añade pgbouncer=true", appNeon.searchParams.get("pgbouncer") === "true");
comprobar("Neon pooler: se conserva sslmode", appNeon.searchParams.get("sslmode") === "require");
const migNeon = new URL(app.urlParaMigrar(NEON_POOL));
comprobar("Neon: para crear tablas se quita «-pooler»", !migNeon.hostname.includes("-pooler"));

// ── Cualquier otra: intacta
comprobar("una PostgreSQL normal no se toca", app.urlParaApp(NORMAL) === NORMAL);
comprobar("ni para crear tablas", app.urlParaMigrar(NORMAL) === NORMAL);
comprobar("SQLite no se toca", app.urlParaApp("file:./dev.db") === "file:./dev.db");
comprobar("una dirección rota no revienta", app.urlParaApp("no es una url") === "no es una url");

// ── Variables con prefijo, como las deja Vercel al conectar la base de datos
// (este es el caso real que hacia decir "falta la base de datos"): una
// DATABASE_URL copiada del ejemplo apuntando a un fichero, y la de verdad
// con el prefijo que se elige al conectar.
const CON_PREFIJO = {
  DATABASE_URL: "file:./dev.db",
  estudia_DATABASE_URL: NEON_POOL,
  estudia_POSTGRES_PRISMA_URL: NEON_POOL + "&pgbouncer=true",
  estudia_DATABASE_URL_UNPOOLED: NORMAL,
  estudia_PGHOST: "ep-rapido-123456-pooler.eu-central-1.aws.neon.tech",
  AUTH_SECRET: "",
  OTRA_COSA: "postgresql://no-deberia-verse@x/y",
};
comprobar("con prefijo: se encuentra la de verdad", app.elegirDireccion(CON_PREFIJO) === NEON_POOL);
const vistas = app.variablesDeBaseDeDatos(CON_PREFIJO);
comprobar("con prefijo: se listan las variables de base de datos",
  vistas.includes("estudia_DATABASE_URL") && vistas.includes("estudia_POSTGRES_PRISMA_URL"),
  vistas.join(", "));
comprobar("con prefijo: no se cuelan otras variables",
  !vistas.includes("estudia_PGHOST") && !vistas.includes("OTRA_COSA") && !vistas.includes("AUTH_SECRET"),
  vistas.join(", "));
comprobar("sin nada: dirección vacía", app.elegirDireccion({}) === "");
comprobar("solo SQLite: se usa esa", app.elegirDireccion({ DATABASE_URL: "file:./dev.db" }) === "file:./dev.db");
comprobar("PostgreSQL con nombre de Vercel sin prefijo",
  app.elegirDireccion({ DATABASE_URL: "file:./dev.db", POSTGRES_URL: NORMAL }) === NORMAL);
for (const entorno of [CON_PREFIJO, {}, { POSTGRES_PRISMA_URL: SUPA_TX }]) {
  comprobar("app y construcción eligen la misma variable",
    app.elegirDireccion(entorno) === build.elegirDireccion(entorno) &&
      JSON.stringify(app.variablesDeBaseDeDatos(entorno)) ===
        JSON.stringify(build.variablesDeBaseDeDatos(entorno)));
}

// ── Las dos copias dicen exactamente lo mismo
for (const url of [SUPA_TX, SUPA_SES, SUPA_DIRECTA, NEON_POOL, NORMAL, "file:./dev.db", "basura"]) {
  const iguales =
    app.urlParaApp(url) === build.urlParaApp(url) &&
    app.urlParaMigrar(url) === build.urlParaMigrar(url) &&
    app.esDirectaDeSupabase(url) === build.esDirectaDeSupabase(url);
  comprobar(`app y construcción coinciden: ${url.slice(0, 40)}…`, iguales);
}

console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nLas direcciones se ajustan bien");
process.exit(fallos ? 1 : 0);
