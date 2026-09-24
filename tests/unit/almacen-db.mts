/**
 * Comprueba el almacenamiento dentro de la propia base de datos.
 *
 * Es lo que permite publicar la aplicación creando **una sola cosa**: sin
 * almacén aparte, los PDF viven en una tabla. Aquí se prueba contra una base
 * de datos de verdad, no contra un simulacro.
 *
 *   DATABASE_URL=postgresql://… npx tsx tests/unit/almacen-db.mts
 *   (también vale con SQLite: DATABASE_URL="file:./dev.db")
 */
let fallos = 0;
function comprobar(titulo: string, condicion: boolean, detalle?: string) {
  console.log((condicion ? "  ✓ " : "  ✗ ") + titulo);
  if (!condicion) {
    fallos += 1;
    if (detalle) console.log("      " + detalle);
  }
}

process.env.STORAGE_DRIVER = "db";
process.env.DATABASE_URL ??= "file:./dev.db";

const require_ = (await import("node:module")).createRequire(import.meta.url);
require_.cache[require_.resolve("server-only")] = { exports: {} } as never;

const { storage, leerTramo } = await import("../../src/lib/storage/index");
const { prisma } = await import("../../src/lib/db");

const clave = `documents/prueba/${Date.now()}.pdf`;
// Un PDF de verdad pesa: se prueba con algo que no quepa en una fila pequeña.
const contenido = Buffer.concat([
  Buffer.from("%PDF-1.7\n"),
  Buffer.alloc(3 * 1024 * 1024, 7),
  Buffer.from("\n%%EOF\n"),
]);

await storage.put(clave, contenido, "application/pdf");
comprobar("se guarda un fichero de 3 MB", (await storage.exists(clave)) === true);
comprobar("el tamaño coincide", (await storage.size(clave)) === contenido.length);
comprobar("se lee byte a byte igual", (await storage.get(clave)).equals(contenido));

const flujo = await storage.stream(clave);
const lector = (flujo as ReadableStream<Uint8Array>).getReader();
const partes: Uint8Array[] = [];
for (;;) {
  const { done, value } = await lector.read();
  if (done) break;
  if (value) partes.push(value);
}
comprobar("se puede servir por streaming", Buffer.concat(partes).equals(contenido));

// El visor pide el PDF a tramos: cada uno tiene que ser exactamente ese trozo.
const desdeMitad = contenido.length - 5;
comprobar("un tramo del principio",
  (await leerTramo(clave, 0, 9)).equals(contenido.subarray(0, 9)));
comprobar("un tramo del medio",
  (await leerTramo(clave, 1_000_000, 1_000_100)).equals(contenido.subarray(1_000_000, 1_000_100)));
comprobar("un tramo que pasa del final se corta en el final",
  (await leerTramo(clave, desdeMitad, desdeMitad + 100)).equals(contenido.subarray(desdeMitad)));

const fila = await prisma.storedFile.findUnique({ where: { key: clave } });
comprobar("se guarda con su tipo", fila?.contentType === "application/pdf");

// Reemplazar el mismo fichero no puede duplicar filas.
await storage.put(clave, Buffer.from("%PDF-1.7\nmas corto\n"), "application/pdf");
const cuantas = await prisma.storedFile.count({ where: { key: clave } });
comprobar("reemplazarlo no duplica", cuantas === 1);
comprobar("y queda el nuevo", (await storage.size(clave)) === 19);

await storage.delete(clave);
comprobar("se borra", (await storage.exists(clave)) === false);
await storage.delete(clave);
comprobar("borrar algo que ya no está no falla", true);

let avisa = false;
try {
  await storage.get(clave);
} catch {
  avisa = true;
}
comprobar("leer algo inexistente da error claro", avisa);

// ── Fichero compuesto por trozos (así se guarda un PDF subido por partes)
const base = `documents/prueba/compuesto-${Date.now()}`;
const trozos = [Buffer.alloc(1000, 1), Buffer.alloc(1500, 2), Buffer.alloc(700, 3)];
const clavesTrozos = trozos.map((_, i) => `uploads/prueba/${Date.now()}/${i}`);
for (let i = 0; i < trozos.length; i++) await storage.put(clavesTrozos[i], trozos[i], "application/octet-stream");
await storage.componer!(base, clavesTrozos, "application/pdf");
const entero = Buffer.concat(trozos);
comprobar("compuesto: se lee entero igual", (await storage.get(base)).equals(entero));
comprobar("compuesto: el tamaño es la suma", (await storage.size(base)) === entero.length);
comprobar("compuesto: un tramo que cruza dos trozos",
  (await leerTramo(base, 900, 1100)).equals(entero.subarray(900, 1100)));
comprobar("compuesto: un tramo que cruza los tres",
  (await leerTramo(base, 999, 2600)).equals(entero.subarray(999, 2600)));
const flujoC = (await storage.stream(base)).getReader();
const partesC: Uint8Array[] = [];
for (;;) { const { done, value } = await flujoC.read(); if (done) break; if (value) partesC.push(value); }
comprobar("compuesto: se sirve por streaming igual", Buffer.concat(partesC).equals(entero));
comprobar("compuesto: los trozos ya no están con su nombre de subida",
  !(await storage.exists(clavesTrozos[0])));
await storage.delete(base);
const restos = await prisma.storedFile.count({ where: { key: { startsWith: base } } });
comprobar("compuesto: al borrarlo se van también sus trozos", restos === 0);

await prisma.$disconnect();
console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nEl almacenamiento en base de datos funciona");
process.exit(fallos ? 1 : 0);
