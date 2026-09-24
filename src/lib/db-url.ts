/**
 * Ajustes de la direccion de la base de datos segun el proveedor.
 *
 * Supabase y Neon dan dos tipos de direccion: una "pooler" (muchas conexiones
 * cortas, lo que necesita un alojamiento sin servidor como Vercel) y una
 * directa. Con Prisma hay dos trampas que hacen fallar el despliegue:
 *
 *  1. Por el pooler en modo transaccion (Supabase puerto 6543, Neon "-pooler")
 *     Prisma necesita `pgbouncer=true`, o falla con "prepared statement".
 *  2. Crear las tablas no funciona por ese pooler. Hay que usar el modo sesion
 *     (Supabase: mismo servidor, puerto 5432) o la directa (Neon: sin
 *     "-pooler"). La directa de Supabase (db.xxx.supabase.co) solo habla IPv6
 *     en el plan gratuito, y Vercel no siempre llega: por eso se evita.
 *
 * Asi se puede pegar la direccion que sea y funciona.
 *
 * OJO: scripts/db-url.mjs repite esta logica para el paso de construccion.
 * tests/unit/db-url.mts comprueba que las dos dicen lo mismo.
 */

function parsear(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

const esSupabasePooler = (u: URL) => u.hostname.endsWith("pooler.supabase.com");
const esNeonPooler = (u: URL) => u.hostname.includes("-pooler.") && u.hostname.endsWith("neon.tech");

/** La que usa la aplicacion mientras funciona. */
export function urlParaApp(url: string): string {
  const u = parsear(url);
  if (!u || !/^postgres(ql)?:$/.test(u.protocol)) return url;

  const transaccion = (esSupabasePooler(u) && u.port === "6543") || esNeonPooler(u);
  if (transaccion) {
    if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
    // En un alojamiento sin servidor cada peticion abre su propia conexion:
    // una por instancia basta y no agota el cupo del plan gratuito.
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "1");
  }
  return u.toString();
}

/** La que se usa para crear o actualizar las tablas. */
export function urlParaMigrar(url: string): string {
  const u = parsear(url);
  if (!u || !/^postgres(ql)?:$/.test(u.protocol)) return url;

  if (esSupabasePooler(u) && u.port === "6543") {
    u.port = "5432"; // modo sesion: mismo servidor, admite crear tablas
  } else if (esNeonPooler(u)) {
    u.hostname = u.hostname.replace("-pooler.", ".");
  } else {
    return url;
  }
  u.searchParams.delete("pgbouncer");
  u.searchParams.delete("connection_limit");
  return u.toString();
}

/** ¿Es la directa de Supabase, que desde Vercel puede no ser alcanzable? */
export function esDirectaDeSupabase(url: string): boolean {
  const u = parsear(url);
  return Boolean(u && /^db\.[a-z0-9]+\.supabase\.co$/.test(u.hostname));
}
