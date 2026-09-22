/**
 * Comprueba el almacenamiento en Vercel Blob.
 *
 * El servicio real no se puede levantar en local, así que aquí se sustituye el
 * cliente por uno de mentira que guarda en memoria y **apunta con qué
 * argumentos se le llama**. No demuestra que Vercel funcione —eso solo se ve
 * al desplegar—, pero sí que nosotros lo usamos como toca: rutas privadas, sin
 * sufijos aleatorios y sin tratar un borrado de algo inexistente como error.
 *
 *   npx tsx tests/unit/blob.mts
 */
let fallos = 0;
function comprobar(titulo: string, condicion: boolean, detalle?: string) {
  console.log((condicion ? "  ✓ " : "  ✗ ") + titulo);
  if (!condicion) {
    fallos += 1;
    if (detalle) console.log("      " + detalle);
  }
}

type Llamada = { metodo: string; clave: string; opciones: Record<string, unknown> };
const llamadas: Llamada[] = [];
const almacen = new Map<string, { datos: Buffer; tipo: string }>();

class BlobNotFoundError extends Error {
  constructor() {
    super("Vercel Blob: The requested blob does not exist");
    this.name = "BlobNotFoundError";
  }
}

const fake = {
  BlobNotFoundError,
  async put(clave: string, cuerpo: Buffer, opciones: Record<string, unknown>) {
    llamadas.push({ metodo: "put", clave, opciones });
    almacen.set(clave, { datos: Buffer.from(cuerpo), tipo: String(opciones.contentType ?? "") });
    return { url: `https://ejemplo.blob.vercel-storage.com/${clave}`, pathname: clave };
  },
  async get(clave: string, opciones: Record<string, unknown>) {
    llamadas.push({ metodo: "get", clave, opciones });
    const guardado = almacen.get(clave);
    if (!guardado) return null;
    return {
      statusCode: 200,
      stream: new ReadableStream<Uint8Array>({
        start(controlador) {
          controlador.enqueue(new Uint8Array(guardado.datos));
          controlador.close();
        },
      }),
    };
  },
  async head(clave: string, opciones: Record<string, unknown> = {}) {
    llamadas.push({ metodo: "head", clave, opciones });
    const guardado = almacen.get(clave);
    if (!guardado) throw new BlobNotFoundError();
    return { size: guardado.datos.length, contentType: guardado.tipo, pathname: clave };
  },
  async del(clave: string, opciones: Record<string, unknown> = {}) {
    llamadas.push({ metodo: "del", clave, opciones });
    if (!almacen.has(clave)) throw new BlobNotFoundError();
    almacen.delete(clave);
  },
};

const require_ = (await import("node:module")).createRequire(import.meta.url);
require_.cache[require_.resolve("server-only")] = { exports: {} } as never;
require_.cache[require_.resolve("@vercel/blob")] = { exports: fake } as never;

process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_prueba";
process.env.STORAGE_DRIVER = "blob";
process.env.DATABASE_URL ??= "file:./dev.db";

const { storage } = await import("../../src/lib/storage/index");
const { blobConfigurado } = await import("../../src/lib/storage/blob");

const clave = "documents/usuario-1/apuntes de clase.pdf";
const contenido = Buffer.from("%PDF-1.7\nunos apuntes cualesquiera\n");

await storage.put(clave, contenido, "application/pdf");
const puesta = llamadas.find((l) => l.metodo === "put")!;
comprobar("se guarda el fichero", almacen.size === 1);
comprobar("se guarda como privado", puesta.opciones.access === "private",
  JSON.stringify(puesta.opciones));
comprobar("no se le añade un sufijo aleatorio", puesta.opciones.addRandomSuffix === false);
comprobar("se permite reemplazarlo", puesta.opciones.allowOverwrite === true);
comprobar("se guarda con su tipo", puesta.opciones.contentType === "application/pdf");
comprobar("la clave viaja tal cual", puesta.clave === clave);

comprobar("se lee lo mismo que se guardó", (await storage.get(clave)).equals(contenido));
comprobar("se lee en modo privado",
  llamadas.filter((l) => l.metodo === "get").every((l) => l.opciones.access === "private"));
comprobar("el tamaño coincide", (await storage.size(clave)) === contenido.length);
comprobar("existe", (await storage.exists(clave)) === true);

const flujo = await storage.stream(clave);
const partes: Uint8Array[] = [];
for await (const parte of flujo as unknown as AsyncIterable<Uint8Array>) partes.push(parte);
comprobar("se puede servir por streaming", Buffer.concat(partes).equals(contenido));

await storage.delete(clave);
comprobar("se borra", almacen.size === 0);
comprobar("no existe tras borrarlo", (await storage.exists(clave)) === false);

let repetido = true;
try {
  await storage.delete(clave);
} catch {
  repetido = false;
}
comprobar("borrar algo que ya no está no falla", repetido);

let leyoLoQueNoHay = false;
try {
  await storage.get("documents/no-existe.pdf");
} catch {
  leyoLoQueNoHay = true;
}
comprobar("leer algo inexistente da error claro", leyoLoQueNoHay);

comprobar("con permiso, no se queja de configuración", blobConfigurado() === null);
delete process.env.BLOB_READ_WRITE_TOKEN;
comprobar("sin permiso, avisa de dónde sacarlo",
  (blobConfigurado() ?? "").includes("Storage"));

console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nEl almacenamiento de Vercel se usa como toca");
process.exit(fallos ? 1 : 0);
