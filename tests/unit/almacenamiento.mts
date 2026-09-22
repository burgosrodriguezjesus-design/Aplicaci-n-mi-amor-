/**
 * Comprueba el almacenamiento compatible con S3, que es lo que permite
 * publicar la aplicación en un alojamiento gratuito (los gratuitos no dan
 * disco persistente).
 *
 * El servidor de prueba no se limita a aceptar lo que le llegue: **verifica la
 * firma** con una librería independiente (`aws4`) y contesta 403 si no cuadra,
 * igual que haría Cloudflare R2. Así, que la ida y vuelta funcione demuestra
 * que la firma SigV4 que calculamos a mano es correcta.
 *
 *   npx tsx tests/unit/almacenamiento.mts
 */
import { createServer } from "node:http";
import aws4 from "aws4";

const CLAVE_ACCESO = "CLAVE_DE_PRUEBA";
const SECRETO = "secreto_de_prueba";
const PUERTO = 8977;

let fallos = 0;
function comprobar(titulo: string, condicion: boolean, detalle?: string) {
  console.log((condicion ? "  ✓ " : "  ✗ ") + titulo);
  if (!condicion) {
    fallos += 1;
    if (detalle) console.log("      " + detalle);
  }
}

const guardado = new Map<string, { cuerpo: Buffer; tipo: string }>();
const recibidas: { metodo: string; ruta: string; firmaValida: boolean }[] = [];

/** Rehace la firma con `aws4` y la compara con la que ha llegado. */
function firmaCorrecta(
  metodo: string,
  ruta: string,
  cabeceras: Record<string, string | string[] | undefined>,
  cuerpo: Buffer,
) {
  const auth = String(cabeceras.authorization ?? "");
  const partes = /SignedHeaders=([^,]+), Signature=([0-9a-f]+)/.exec(auth);
  if (!partes) return false;

  // Se firman exactamente las cabeceras que dice la propia petición.
  const firmadas: Record<string, string> = {};
  for (const nombre of partes[1].split(";")) {
    if (nombre === "host") continue; // aws4 la pone a partir de `host`
    const valor = cabeceras[nombre];
    if (typeof valor === "string") firmadas[nombre] = valor;
  }

  const esperada = aws4.sign(
    {
      host: `127.0.0.1:${PUERTO}`,
      method: metodo,
      path: ruta,
      service: "s3",
      region: "auto",
      headers: firmadas,
      // Sin `body`: `aws4` añadiría Content-Length y la firmaría, y esa
      // cabecera no está entre las que firma el cliente. El hash del cuerpo
      // ya viaja en x-amz-content-sha256, que es lo que S3 comprueba.
      body: undefined,
    },
    { accessKeyId: CLAVE_ACCESO, secretAccessKey: SECRETO },
  ) as { headers: Record<string, string> };

  return esperada.headers.Authorization === auth;
}

const servidor = createServer((req, res) => {
  const trozos: Buffer[] = [];
  req.on("data", (t) => trozos.push(t));
  req.on("end", () => {
    const ruta = req.url ?? "";
    const cuerpo = Buffer.concat(trozos);
    const valida = firmaCorrecta(req.method ?? "", ruta, req.headers, cuerpo);
    recibidas.push({ metodo: req.method ?? "", ruta, firmaValida: valida });

    if (!valida) {
      res.writeHead(403).end("SignatureDoesNotMatch");
      return;
    }

    if (req.method === "PUT") {
      guardado.set(ruta, { cuerpo, tipo: String(req.headers["content-type"] ?? "") });
      res.writeHead(200).end();
      return;
    }
    if (req.method === "DELETE") {
      guardado.delete(ruta);
      res.writeHead(204).end();
      return;
    }
    const objeto = guardado.get(ruta);
    if (!objeto) {
      res.writeHead(404).end();
      return;
    }
    if (req.method === "HEAD") {
      res
        .writeHead(200, {
          "content-length": String(objeto.cuerpo.length),
          "content-type": objeto.tipo,
        })
        .end();
      return;
    }
    res.writeHead(200, { "content-type": objeto.tipo }).end(objeto.cuerpo);
  });
});

await new Promise<void>((listo) => servidor.listen(PUERTO, "127.0.0.1", listo));

process.env.STORAGE_DRIVER = "s3";
process.env.STORAGE_S3_ENDPOINT = `http://127.0.0.1:${PUERTO}`;
process.env.STORAGE_S3_BUCKET = "apuntes";
process.env.STORAGE_S3_REGION = "auto";
process.env.STORAGE_S3_ACCESS_KEY_ID = CLAVE_ACCESO;
process.env.STORAGE_S3_SECRET_ACCESS_KEY = SECRETO;
process.env.DATABASE_URL ??= "file:./dev.db";
process.env.AUTH_SECRET ??= "x".repeat(40);

const require_ = (await import("node:module")).createRequire(import.meta.url);
require_.cache[require_.resolve("server-only")] = { exports: {} } as never;
const { storage } = await import("../../src/lib/storage/index");

const clave = "documents/usuario-1/apuntes de clase.pdf";
const contenido = Buffer.from("%PDF-1.7\nunos apuntes cualesquiera\n");

await storage.put(clave, contenido, "application/pdf");
comprobar("se guarda el fichero", guardado.size === 1);
comprobar("la firma la acepta un verificador independiente",
  recibidas.every((p) => p.firmaValida),
  recibidas.filter((p) => !p.firmaValida).map((p) => p.metodo + " " + p.ruta).join(", "));
comprobar("se guarda con su tipo", [...guardado.values()][0].tipo === "application/pdf");
comprobar("la ruta incluye el bucket", recibidas[0].ruta.startsWith("/apuntes/"));
comprobar("los espacios de la clave se codifican", !recibidas[0].ruta.includes(" "),
  recibidas[0].ruta);

comprobar("se lee lo mismo que se guardó", (await storage.get(clave)).equals(contenido));
comprobar("el tamaño coincide", (await storage.size(clave)) === contenido.length);
comprobar("existe", (await storage.exists(clave)) === true);

const flujo = await storage.stream(clave);
const partes: Uint8Array[] = [];
for await (const parte of flujo as unknown as AsyncIterable<Uint8Array>) partes.push(parte);
comprobar("se puede servir por streaming", Buffer.concat(partes).equals(contenido));

await storage.delete(clave);
comprobar("se borra", (await storage.exists(clave)) === false);
await storage.delete(clave);
comprobar("borrar algo que ya no está no falla", true);

comprobar("todas las peticiones iban bien firmadas",
  recibidas.every((p) => p.firmaValida),
  recibidas.filter((p) => !p.firmaValida).map((p) => p.metodo).join(", "));

servidor.close();
console.log(fallos ? `\n${fallos} comprobación(es) con fallos` : "\nAlmacenamiento correcto");
process.exit(fallos ? 1 : 0);
