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
