/**
 * Un alojamiento gratuito se duerme cuando nadie lo usa, y un libro escaneado
 * largo puede tardar más de lo que aguanta despierto. Esto comprueba que al
 * volver a procesarlo **no se empieza de cero**: las páginas ya reconocidas se
 * conservan y solo se reconocen las que faltaban.
 *
 *   node tests/unit/s3-servidor.mjs 8978 /var/tmp/s3-local   # en otra terminal
 *   DATABASE_URL=postgresql://… npx tsx tests/unit/reanudar-ocr.mts
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let fallos = 0;
function comprobar(titulo: string, condicion: boolean, detalle?: string) {
  console.log((condicion ? "  ✓ " : "  ✗ ") + titulo);
  if (!condicion) {
    fallos += 1;
    if (detalle) console.log("      " + detalle);
  }
}

process.env.AUTH_SECRET ??= "pruebadelargoysuficientelongitudparafirmar1234";
const require_ = (await import("node:module")).createRequire(import.meta.url);
require_.cache[require_.resolve("server-only")] = { exports: {} } as never;

const { prisma } = await import("../../src/lib/db");
const { storage, buildDocumentKey } = await import("../../src/lib/storage/index");
const { enqueue } = await import("../../src/lib/jobs/index");
const { runQueue, recoverStuckJobs } = await import("../../src/lib/jobs/queue");

const pdf = await readFile(path.join(raiz, "tests/fixtures/apuntes-escaneados.pdf"));

const usuario = await prisma.user.create({
  data: {
    email: `reanudar-${Date.now()}@prueba.local`,
    name: "Prueba",
    passwordHash: "x",
  },
});

const storageKey = buildDocumentKey(usuario.id, "apuntes-escaneados.pdf");
await storage.put(storageKey, pdf, "application/pdf");

const documento = await prisma.document.create({
  data: {
    userId: usuario.id,
    title: "Apuntes escaneados",
    originalName: "apuntes-escaneados.pdf",
    storageKey,
    sizeBytes: pdf.length,
  },
});

/** Encola y espera de verdad: `enqueue` arranca la cola en segundo plano. */
async function procesar() {
  await enqueue(documento.id, "PROCESS_DOCUMENT");
  void runQueue();
  const limite = Date.now() + 5 * 60 * 1000;
  for (;;) {
    const pendientes = await prisma.processingJob.count({
      where: { documentId: documento.id, status: { in: ["QUEUED", "RUNNING"] } },
    });
    if (pendientes === 0) break;
    if (Date.now() > limite) throw new Error("el procesado no termina");
    await new Promise((r) => setTimeout(r, 400));
  }
  return prisma.document.findUniqueOrThrow({ where: { id: documento.id } });
}

console.log("\n— primera pasada —");
const t0 = Date.now();
let estado = await procesar();
const primera = Date.now() - t0;
comprobar("el documento queda listo", estado.status === "READY", estado.errorMessage ?? "");
comprobar("ha hecho falta reconocer texto", estado.usedOcr === true);

const reconocidas = await prisma.documentPage.findMany({
  where: { documentId: documento.id, source: "OCR" },
  orderBy: { pageNumber: "asc" },
});
comprobar("hay páginas reconocidas", reconocidas.length > 0);
const textoOriginal = reconocidas.map((p) => p.text).join("\n");
console.log(`    ${reconocidas.length} páginas en ${(primera / 1000).toFixed(1)} s`);

// ── Se simula el corte: el trabajo se quedó a medias y una página se perdió.
console.log("\n— se corta a mitad y se vuelve a procesar —");
await prisma.documentPage.update({
  where: {
    documentId_pageNumber: { documentId: documento.id, pageNumber: reconocidas[0].pageNumber },
  },
  data: { text: "", charCount: 0, source: "EMPTY" },
});
await prisma.processingJob.updateMany({
  where: { documentId: documento.id },
  data: { status: "RUNNING" },
});

await recoverStuckJobs();
const encolados = await prisma.processingJob.count({
  where: { documentId: documento.id, status: "QUEUED" },
});
comprobar("al arrancar se reanuda el trabajo colgado", encolados > 0);

const t1 = Date.now();
estado = await procesar();
const segunda = Date.now() - t1;
comprobar("vuelve a quedar listo", estado.status === "READY", estado.errorMessage ?? "");

const despues = await prisma.documentPage.findMany({
  where: { documentId: documento.id, source: "OCR" },
  orderBy: { pageNumber: "asc" },
});
comprobar("se recupera la página que faltaba", despues.length === reconocidas.length);
comprobar("las demás conservan su texto",
  despues.slice(1).map((p) => p.text).join("\n") ===
    reconocidas.slice(1).map((p) => p.text).join("\n"));
comprobar("el material sigue teniendo el mismo contenido",
  despues.map((p) => p.text).join("\n").length >= textoOriginal.length * 0.9);
console.log(`    segunda pasada: ${(segunda / 1000).toFixed(1)} s ` +
  `(solo ${reconocidas.length - (despues.length - 1)} página por reconocer)`);

await prisma.user.delete({ where: { id: usuario.id } });
await storage.delete(storageKey).catch(() => undefined);
await prisma.$disconnect();

console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nLa reanudación funciona");
process.exit(fallos ? 1 : 0);
