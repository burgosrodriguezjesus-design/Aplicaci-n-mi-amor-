/**
 * Copia en JavaScript de src/lib/db-url.ts, para el paso de construccion
 * (que corre con node, sin compilar TypeScript). La explicacion esta alli.
 * tests/unit/db-url.mts comprueba que las dos dicen lo mismo.
 */

function parsear(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

const esSupabasePooler = (u) => u.hostname.endsWith("pooler.supabase.com");
const esNeonPooler = (u) => u.hostname.includes("-pooler.") && u.hostname.endsWith("neon.tech");

export function urlParaApp(url) {
  const u = parsear(url);
  if (!u || !/^postgres(ql)?:$/.test(u.protocol)) return url;
  const transaccion = (esSupabasePooler(u) && u.port === "6543") || esNeonPooler(u);
  if (transaccion) {
    if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "1");
  }
  return u.toString();
}

export function urlParaMigrar(url) {
  const u = parsear(url);
  if (!u || !/^postgres(ql)?:$/.test(u.protocol)) return url;
  if (esSupabasePooler(u) && u.port === "6543") {
    u.port = "5432";
  } else if (esNeonPooler(u)) {
    u.hostname = u.hostname.replace("-pooler.", ".");
  } else {
    return url;
  }
  u.searchParams.delete("pgbouncer");
  u.searchParams.delete("connection_limit");
  return u.toString();
}

export function esDirectaDeSupabase(url) {
  const u = parsear(url);
  return Boolean(u && /^db\.[a-z0-9]+\.supabase\.co$/.test(u.hostname));
}

/**
 * Los nombres con los que puede llegar la direccion, en orden de preferencia.
 *
 * Copia de src/lib/db-url.ts.
 */
export const NOMBRES_URL = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "NEON_DATABASE_URL",
  "POSTGRES_URL_NO_SSL",
];

/**
 * Las variables puestas que traen la direccion, con o sin prefijo.
 *
 * Al conectar la base de datos, Vercel deja elegir un prefijo y entonces la
 * variable se llama, por ejemplo, `estudia_DATABASE_URL`. Buscar solo el nombre
 * exacto hacia que la aplicacion dijera que faltaba la base de datos teniendola
 * conectada. Se devuelven solo los nombres, en orden de preferencia.
 */
export function variablesDeBaseDeDatos(entorno = process.env) {
  const puestas = Object.keys(entorno).filter((clave) => entorno[clave]);
  const vistas = [];
  for (const nombre of NOMBRES_URL) {
    if (puestas.includes(nombre)) vistas.push(nombre);
    for (const clave of puestas.sort()) {
      if (clave !== nombre && clave.endsWith("_" + nombre) && !vistas.includes(clave)) {
        vistas.push(clave);
      }
    }
  }
  return vistas;
}

/**
 * La direccion a usar: la primera que sea PostgreSQL y, si no hay ninguna, la
 * primera que haya. Una `DATABASE_URL` vieja apuntando a un fichero (la que
 * copia Vercel del ejemplo al importar) no le gana a la base de datos de verdad.
 */
export function elegirDireccion(entorno = process.env) {
  const valores = variablesDeBaseDeDatos(entorno).map((clave) => entorno[clave]);
  return valores.find((valor) => /^postgres(ql)?:\/\//i.test(valor)) ?? valores[0] ?? "";
}
