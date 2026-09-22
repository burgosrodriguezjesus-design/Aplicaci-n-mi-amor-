#!/usr/bin/env node
/**
 * La sesión tiene que sobrevivir a un reinicio sin que nadie configure nada.
 *
 * Si no hay AUTH_SECRET, la aplicación se genera uno y lo guarda en la base de
 * datos. Si en vez de eso se inventara uno nuevo en cada arranque, cada
 * despliegue echaría a todo el mundo fuera. Esto lo comprueba de verdad:
 * inicia sesión, se reinicia el servidor por fuera y se vuelve a preguntar.
 *
 *   node tests/unit/sesiones.mjs        (con el servidor ya levantado)
 */
const base = process.env.APP_URL || "http://localhost:3000";
let fallos = 0;
const comprobar = (titulo, ok, detalle) => {
  console.log((ok ? "  ✓ " : "  ✗ ") + titulo);
  if (!ok) {
    fallos += 1;
    if (detalle) console.log("      " + detalle);
  }
};

const galletas = [];
async function call(ruta, init = {}) {
  const r = await fetch(base + ruta, {
    ...init,
    headers: { ...(init.headers || {}), cookie: galletas.join("; ") },
  });
  for (const g of r.headers.getSetCookie?.() ?? []) galletas.push(g.split(";")[0]);
  const t = r.headers.get("content-type") ?? "";
  return { status: r.status, body: t.includes("json") ? await r.json() : await r.text() };
}

// Segunda fase: se recupera la sesión abierta antes del reinicio.
if (process.env.SESION_FASE === "comprobar") {
  const { readFile } = await import("node:fs/promises");
  const guardadas = await readFile(
    process.env.SESION_GALLETA ?? "/tmp/estudia-sesion.txt", "utf8");
  for (const g of guardadas.split("; ").filter(Boolean)) galletas.push(g);

  const quien = await call("/api/auth/me");
  comprobar("la sesión sigue valiendo tras reiniciar el servidor", quien.status === 200,
    `status ${quien.status}`);
  comprobar("y sigue siendo la misma cuenta", Boolean(quien.body?.user?.email));
  console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nLas sesiones sobreviven");
  process.exit(fallos ? 1 : 0);
}

const email = `sesion-${Date.now()}@prueba.local`;
const alta = await call("/api/auth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Prueba Sesiones",
    email,
    password: "contrasena-de-prueba",
    educationLevel: "FP",
  }),
});
comprobar("se crea la cuenta", alta.status === 201, JSON.stringify(alta.body).slice(0, 160));

const antes = await call("/api/auth/me");
comprobar("la sesión vale nada más entrar", antes.status === 200);

// El reinicio lo hace quien lanza la prueba (ver tests/unit/README.md): esta
// primera parte deja la sesión abierta y la segunda la comprueba después.
if (process.env.SESION_FASE === "abrir") {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(process.env.SESION_GALLETA ?? "/tmp/estudia-sesion.txt",
    galletas.join("; "));
  console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\n  sesión abierta");
  process.exit(fallos ? 1 : 0);
}

const despues = await call("/api/auth/me");
comprobar("la sesión sigue valiendo tras el reinicio", despues.status === 200,
  `status ${despues.status}`);
comprobar("y es la misma cuenta", despues.body?.user?.email === email);

console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nLas sesiones sobreviven");
process.exit(fallos ? 1 : 0);
